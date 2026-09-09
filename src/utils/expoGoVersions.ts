import { setTimeout as delayAsync } from 'node:timers/promises';

import { type ExpoGoPlatform, getVersionsAsync } from './expoGo';
import { createFetch, type FetchLike } from './fetch';

export type ExpoGoVersion = {
  /** Expo SDK major version, suitable for the url/download commands. */
  sdkVersion: number;
  /** Platform-specific Expo Go application version, not the npm CLI version. */
  version: string;
  url: string;
};

export type GetExpoGoVersionsOptions = {
  platform: ExpoGoPlatform;
  /** Exclude prereleases and verify GitHub-hosted releases. Defaults to false. */
  stable?: boolean;
  /** Maximum number of SDKs to return, newest first. Must be a positive integer. */
  limit?: number;
};

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const STABLE_EXPO_RANGE = /^[~^]?(0|[1-9]\d*)\.\d+\.\d+$/;
const METADATA_TIMEOUT_MS = 30_000;
const METADATA_TTL_MS = 5 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Retry only transient failures, never substitute older versions after a failed request. */
function createVersionMetadataFetch(): FetchLike {
  const fetchAsync = createFetch({ cacheDirectory: 'versions-cache', ttl: METADATA_TTL_MS });
  return async (url, init) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetchAsync(url, {
          ...init,
          // Keep credentials on the original GitHub API host.
          redirect: 'error',
          signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
        });
        if (response.status !== 429 && response.status < 500) {
          return response;
        }
        await response.body?.cancel();
        throw new Error(`Version metadata request failed with status ${response.status}`);
      } catch (error) {
        if (attempt === 2) {
          throw new Error('Unable to fetch version metadata after 3 attempts.', { cause: error });
        }
        await delayAsync(2 ** attempt * 1000);
      }
    }
  };
}

async function isStableGitHubReleaseAsync(
  entry: ExpoGoVersion,
  platform: ExpoGoPlatform,
  fetchAsync: FetchLike
): Promise<boolean> {
  const tag = `Expo-Go-${entry.version}`;
  const filename = `${tag}.${platform === 'ios' ? 'tar.gz' : 'apk'}`;
  const expectedUrl = `https://github.com/expo/expo-go-releases/releases/download/${tag}/${filename}`;
  if (entry.url !== expectedUrl) {
    throw new Error(`Unexpected GitHub download URL for Expo Go ${entry.version}.`);
  }
  const token = process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN'];
  const response = await fetchAsync(
    `https://api.github.com/repos/expo/expo-go-releases/releases/tags/${tag}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'expo-go',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Could not verify release ${tag}: GitHub returned ${response.status}.`);
  }
  const release: unknown = await response.json();
  if (
    !isRecord(release) ||
    release['tag_name'] !== tag ||
    typeof release['draft'] !== 'boolean' ||
    typeof release['prerelease'] !== 'boolean'
  ) {
    throw new Error(`Invalid GitHub release metadata for ${tag}.`);
  }
  if (release['draft'] || release['prerelease']) {
    return false;
  }
  const asset = Array.isArray(release['assets'])
    ? release['assets'].find(item => isRecord(item) && item['browser_download_url'] === entry.url)
    : undefined;
  if (
    !asset ||
    asset['state'] !== 'uploaded' ||
    !Number.isSafeInteger(asset['size']) ||
    asset['size'] <= 0
  ) {
    throw new Error(`Release ${tag} has no complete ${platform} download asset.`);
  }
  return true;
}

/** List available platform builds; this does not download app binaries. */
export async function getExpoGoVersionsAsync({
  platform,
  stable = false,
  limit,
}: GetExpoGoVersionsOptions): Promise<ExpoGoVersion[]> {
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('Expected platform to be "ios" or "android".');
  }
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
    throw new Error('Expected limit to be a positive safe integer.');
  }
  if (typeof stable !== 'boolean') {
    throw new Error('Expected stable to be a boolean.');
  }
  const fetchAsync = createVersionMetadataFetch();
  const { sdkVersions } = await getVersionsAsync(fetchAsync);
  const versions: ExpoGoVersion[] = [];
  const sdkEntries = Object.entries(sdkVersions)
    .filter(([sdk]) => /^[1-9]\d*\.0\.0$/.test(sdk))
    .sort(([a], [b]) => Number(b.split('.')[0]) - Number(a.split('.')[0]));
  for (const [sdk, info] of sdkEntries) {
    // Only include keys that the existing SDK-major url/download API can address.
    if (!isRecord(info)) {
      continue;
    }
    const sdkVersion = Number(sdk.split('.')[0]);
    const version = info[`${platform}ClientVersion`];
    const url = info[`${platform}ClientUrl`];
    if (!Number.isSafeInteger(sdkVersion) || !url || !version) {
      continue;
    }
    if (typeof version !== 'string' || !VERSION.test(version)) {
      throw new Error(`Invalid Expo Go ${platform} version metadata for SDK ${sdkVersion}.`);
    }
    if (stable) {
      if (
        !STABLE_VERSION.test(version) ||
        ['isBeta', 'beta', 'prerelease', 'isPrerelease'].some(flag => info[flag])
      ) {
        continue;
      }
      // Historical SDK entries may predate expoVersion. When present, a stable
      // client alone must not make a beta SDK eligible.
      const expoVersion = info['expoVersion'];
      if (
        expoVersion !== undefined &&
        (typeof expoVersion !== 'string' ||
          !STABLE_EXPO_RANGE.test(expoVersion) ||
          Number(expoVersion.replace(/^[~^]/, '').split('.')[0]) !== sdkVersion)
      ) {
        continue;
      }
    }
    if (typeof url !== 'string' || !URL.canParse(url) || new URL(url).protocol !== 'https:') {
      throw new Error(`Invalid Expo Go ${platform} download URL for SDK ${sdkVersion}.`);
    }
    const entry = { sdkVersion, version, url };
    // Legacy CDN builds have no GitHub release record; their stability is based
    // on Expo metadata. GitHub-hosted builds must also pass release/asset checks.
    if (
      stable &&
      new URL(entry.url).hostname === 'github.com' &&
      !(await isStableGitHubReleaseAsync(entry, platform, fetchAsync))
    ) {
      continue;
    }
    versions.push(entry);
    if (limit !== undefined && versions.length === limit) {
      break;
    }
  }
  if (!versions.length) {
    throw new Error(`No ${stable ? 'stable ' : ''}Expo Go ${platform} versions are available.`);
  }
  return versions;
}
