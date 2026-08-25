import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path, { basename, join } from 'node:path';

import Log from '../log';
import {
  type ExpoGoPlatform,
  type ExpoGoSdkVersion,
  type ExpoVersions,
  type SDKVersion,
  getLatestSdkVersion,
  resolveExpoGoDownloadURLAsync,
} from '../expoGoDownloadURL';
import { createFetch } from './fetch';
import { env } from './env';
import * as downloadUtils from './download';
import { formatBytes } from './files';
import { formatHomePath, getExpoHomeDirectory, getTmpDirectory } from './paths';
import { cwd } from 'node:process';
import { extractAsync } from './tar';

export type { ExpoGoPlatform, ExpoGoSdkVersion, ExpoVersions, SDKVersion };
export { getLatestSdkVersion };

const SIX_MONTHS_IN_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const VERSIONS_CACHE_TTL_MS = 1000 * 60 * 5;
const ONE_WEEK_IN_MS = 1000 * 60 * 60 * 24 * 7;

// Mirrors @expo/cli's platform settings for Expo Go downloads, with the
// standalone CLI addition of an output extension for copy/download commands.
const platformSettings = {
  ios: {
    extension: 'app',
    shouldExtractResults: true,
    getFilePath: (filename: string) =>
      path.join(getExpoHomeDirectory(), 'ios-simulator-app-cache', `${filename}.app`),
  },
  android: {
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

function getExpoApiBaseUrl(): string {
  if (env.EXPO_STAGING) {
    return 'https://staging-api.expo.dev';
  } else if (env.EXPO_LOCAL) {
    return 'http://127.0.0.1:3000';
  }
  return 'https://api.expo.dev';
}

export async function getExpoGoDownloadUrlAsync(
  platform: ExpoGoPlatform,
  sdkVersion: ExpoGoSdkVersion,
): Promise<string> {
  return await resolveExpoGoDownloadURLAsync(
    { platform, sdkVersion },
    {
      apiBaseUrl: getExpoApiBaseUrl(),
      fetch: createFetch({
        cacheDirectory: 'versions-cache',
        ttl: VERSIONS_CACHE_TTL_MS,
      }),
    }
  );
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
  sdkVersion: ExpoGoSdkVersion,
  { silent = false }: { silent?: boolean } = {},
): Promise<string> {
  const url = await getExpoGoDownloadUrlAsync(platform, sdkVersion);

  const { getFilePath, shouldExtractResults } = platformSettings[platform];
  const filename = path.parse(getUrlBasename(url)).name;
  const cachedPath = getFilePath(filename);
  const outputPath = join(cwd(), basename(cachedPath));

  await cleanupOldExpoGoCacheEntriesAsync(path.dirname(cachedPath));
  if (await pathExistsAsync(cachedPath)) {
    if (!silent) {
      Log.log(`Using cached version from ${formatHomePath(path.dirname(cachedPath))}`);
    }
    return forceCopyAsync({ sourcePath: cachedPath, outputPath });
  }

  await downloadAppAsync({
    extract: shouldExtractResults,
    outputPath: cachedPath,
    silent,
    url,
  });

  return forceCopyAsync({ sourcePath: cachedPath, outputPath });
}

async function downloadAppAsync({
  url,
  outputPath,
  extract,
  silent,
}: {
  url: string;
  outputPath: string;
  extract: boolean;
  silent: boolean;
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
      { fetch: fetchInstance, silent }
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
      { fetch: fetchInstance, silent }
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
