import {
  type ExpoGoPlatform,
  type ExpoGoSdkVersion,
  getExpoGoDownloadUrlAsync,
} from './utils/expoGo.js';
import {
  getExpoGoVersionsAsync,
  type ExpoGoVersion,
  type GetExpoGoVersionsOptions,
} from './utils/expoGoVersions.js';

export type { ExpoGoPlatform, ExpoGoSdkVersion, ExpoGoVersion, GetExpoGoVersionsOptions };

/** List platform-specific Expo Go releases in descending SDK order. */
export async function getExpoGoVersions(
  options: GetExpoGoVersionsOptions
): Promise<ExpoGoVersion[]> {
  return await getExpoGoVersionsAsync(options);
}

export type GetExpoGoDownloadURLOptions = {
  /** Platform to download Expo Go for. */
  platform: ExpoGoPlatform;
  /** Expo SDK major version, or the latest available version. Defaults to latest. */
  sdkVersion?: ExpoGoSdkVersion;
};

/** Resolve the Expo Go download URL for a platform and Expo SDK version. */
export async function getExpoGoDownloadURL({
  platform,
  sdkVersion = 'latest',
}: GetExpoGoDownloadURLOptions): Promise<string> {
  return await getExpoGoDownloadUrlAsync(platform, sdkVersion);
}
