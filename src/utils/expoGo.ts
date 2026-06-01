import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path, { basename, join } from 'node:path';

import { apiGetAsync } from '../api';
import Log from '../log';
import { createFetch } from './fetch';
import * as downloadUtils from './download';
import { formatBytes } from './files';
import { formatHomePath, getExpoHomeDirectory, getTmpDirectory } from './paths';
import { cwd } from 'node:process';
import { extractAsync } from './tar';

export type ExpoGoPlatform = 'ios' | 'android';

export type SDKVersion = {
  iosClientUrl?: string;
  androidClientUrl?: string;
  [key: string]: unknown;
};

export type ExpoVersions = {
  sdkVersions: Record<string, SDKVersion>;
};

const SIX_MONTHS_IN_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const VERSIONS_CACHE_TTL_MS = 1000 * 60 * 5;
const ONE_WEEK_IN_MS = 1000 * 60 * 60 * 24 * 7;

// Mirrors @expo/cli's platform settings for Expo Go downloads, with the
// standalone CLI addition of an output extension for copy/download commands.
const platformSettings = {
  ios: {
    versionsKey: 'iosClientUrl',
    extension: 'app',
    shouldExtractResults: true,
    getFilePath: (filename: string) =>
      path.join(getExpoHomeDirectory(), 'ios-simulator-app-cache', `${filename}.app`),
  },
  android: {
    versionsKey: 'androidClientUrl',
    extension: 'apk',
    shouldExtractResults: false,
    getFilePath: (filename: string) =>
      path.join(getExpoHomeDirectory(), 'android-apk-cache', `${filename}.apk`),
  },
} as const;

function getUrlBasename(url: string): string {
  try {
    return path.basename(new URL(url).pathname);
  } catch {
    return path.basename(url.split('?')[0] ?? url);
  }
}

async function pathExistsAsync(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getVersionsAsync(): Promise<ExpoVersions> {
  const response = await apiGetAsync('versions/latest', {
    fetch: createFetch({
      cacheDirectory: 'versions-cache',
      ttl: VERSIONS_CACHE_TTL_MS,
    }),
  });
  const data = response && typeof response === 'object' && 'data' in response ? response.data : response;
  if (
    !data ||
    typeof data !== 'object' ||
    !('sdkVersions' in data) ||
    typeof data.sdkVersions !== 'object' ||
    !data.sdkVersions
  ) {
    throw new Error('Unexpected response when fetching version info from Expo servers.');
  }
  return data as ExpoVersions;
}

export function getLatestSdkVersion(sdkVersions: Record<string, SDKVersion>): string {
  const intVersions = Object.keys(sdkVersions).map((v) => parseInt(v, 10)).filter(isFinite);
  const latestVersion = Math.max(...intVersions);

  if (!isFinite(latestVersion)) {
    throw new Error('Unable to find a version of Expo Go.');
  }

  return `${latestVersion}.0.0`;
}

export async function getExpoGoDownloadUrlAsync(
  platform: ExpoGoPlatform,
  sdkVersion: 'latest' | number,
): Promise<string> {
  const { sdkVersions } = await getVersionsAsync();
  const normalizedSdkVersion = sdkVersion === 'latest'
    ? getLatestSdkVersion(sdkVersions)
    : `${sdkVersion}.0.0`;

  const versionMetadata = sdkVersions[normalizedSdkVersion];
  if (!versionMetadata) {
    throw new Error(`Unable to find a version of Expo Go for SDK ${normalizedSdkVersion}`);
  }

  const url = versionMetadata[platformSettings[platform].versionsKey];
  if (typeof url !== 'string' || !url) {
    throw new Error(
      `Unable to find an Expo Go ${platform} download URL for SDK ${normalizedSdkVersion}`
    );
  }

  return url;
}

async function cleanupOldExpoGoCacheEntriesAsync(cacheDirectory: string): Promise<void> {
  let cacheEntries: string[];
  try {
    cacheEntries = await readdir(cacheDirectory);
  } catch {
    return;
  }

  const now = Date.now();
  for (const entry of cacheEntries) {
    const filePath = path.join(cacheDirectory, entry);
    try {
      const fileStat = await lstat(filePath);
      if (now - fileStat.mtimeMs > SIX_MONTHS_IN_MS) {
        Log.debug(`Removing old Expo Go cache entry: ${filePath}`);
        await rm(filePath, { force: true, recursive: true });
      }
    } catch {
      // Keep cleanup best-effort so a stale entry never blocks a download.
    }
  }
}

export async function downloadExpoGoAsync(
  platform: ExpoGoPlatform,
  sdkVersion: 'latest' | number,
): Promise<string> {
  const url = await getExpoGoDownloadUrlAsync(platform, sdkVersion);

  const { getFilePath, shouldExtractResults } = platformSettings[platform];
  const filename = path.parse(getUrlBasename(url)).name;
  const cachedPath = getFilePath(filename);
  const outputPath = join(cwd(), basename(cachedPath));

  await cleanupOldExpoGoCacheEntriesAsync(path.dirname(cachedPath));
  if (await pathExistsAsync(cachedPath)) {
    Log.log(`Using cached version from ${formatHomePath(path.dirname(cachedPath))}`);
    return forceCopyAsync({ sourcePath: cachedPath, outputPath });
  }

  await downloadAppAsync({
    extract: shouldExtractResults,
    outputPath: cachedPath,
    url,
  });

  return forceCopyAsync({ sourcePath: cachedPath, outputPath });
}

async function downloadAppAsync({
  url,
  outputPath,
  extract,
}: {
  url: string;
  outputPath: string;
  extract: boolean;
}): Promise<void> {
  const fetchInstance = createFetch({
    cacheDirectory: 'expo-go',
    ttl: ONE_WEEK_IN_MS,
  });
  const progressMessage = (ratio: number, total: number): string =>
    `Downloading Expo Go (${formatBytes(total * ratio)} / ${formatBytes(total)})`;

  if (extract) {
    const tmpDir = path.join(getTmpDirectory(), randomUUID());
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, getUrlBasename(url));
    await downloadUtils.downloadFileWithProgressTrackerAsync(
      url,
      tmpPath,
      progressMessage,
      'Successfully downloaded Expo Go',
      { fetch: fetchInstance }
    );

    await rm(outputPath, { force: true, recursive: true });
    await mkdir(outputPath, { recursive: true });
    await extractAsync(tmpPath, outputPath);
    await rm(tmpDir, { force: true, recursive: true });
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await downloadUtils.downloadFileWithProgressTrackerAsync(
      url,
      outputPath,
      progressMessage,
      'Successfully downloaded Expo Go',
      { fetch: fetchInstance }
    );
  }
}

async function forceCopyAsync({
  outputPath,
  sourcePath,
}: {
  outputPath: string;
  sourcePath: string;
}): Promise<string> {
  if (path.resolve(sourcePath) === path.resolve(outputPath)) {
    return outputPath;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true, recursive: true });
  await cp(sourcePath, outputPath, { recursive: true });
  return outputPath;
}
