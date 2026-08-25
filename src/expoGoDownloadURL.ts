export type ExpoGoPlatform = 'ios' | 'android';
export type ExpoGoSdkVersion = 'latest' | number;

export type SDKVersion = {
  iosClientUrl?: string;
  androidClientUrl?: string;
  [key: string]: unknown;
};

export type ExpoVersions = {
  sdkVersions: Record<string, SDKVersion>;
};

export type ExpoGoFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const EXPO_API_BASE_URL = 'https://api.expo.dev';

const clientUrlKeyByPlatform = {
  ios: 'iosClientUrl',
  android: 'androidClientUrl',
} as const;

export function getLatestSdkVersion(sdkVersions: Record<string, SDKVersion>): string {
  const intVersions = Object.keys(sdkVersions)
    .map((version) => parseInt(version, 10))
    .filter(isFinite);
  const latestVersion = Math.max(...intVersions);

  if (!isFinite(latestVersion)) {
    throw new Error('Unable to find a version of Expo Go.');
  }

  return `${latestVersion}.0.0`;
}

export async function resolveExpoGoDownloadURLAsync(
  {
    platform,
    sdkVersion,
  }: {
    platform: ExpoGoPlatform;
    sdkVersion: ExpoGoSdkVersion;
  },
  {
    apiBaseUrl = EXPO_API_BASE_URL,
    fetch: fetchAsync,
  }: {
    apiBaseUrl?: string;
    fetch: ExpoGoFetch;
  }
): Promise<string> {
  const response = await fetchAsync(`${apiBaseUrl}/v2/versions/latest`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request to Expo API failed with status ${response.status}`);
  }

  const result: unknown = await response.json();
  const data = result && typeof result === 'object' && 'data' in result ? result.data : result;
  if (
    !data ||
    typeof data !== 'object' ||
    !('sdkVersions' in data) ||
    typeof data.sdkVersions !== 'object' ||
    !data.sdkVersions
  ) {
    throw new Error('Unexpected response when fetching version info from Expo servers.');
  }

  const { sdkVersions } = data as ExpoVersions;
  const normalizedSdkVersion = sdkVersion === 'latest'
    ? getLatestSdkVersion(sdkVersions)
    : `${sdkVersion}.0.0`;

  const versionMetadata = sdkVersions[normalizedSdkVersion];
  if (!versionMetadata) {
    throw new Error(`Unable to find a version of Expo Go for SDK ${normalizedSdkVersion}`);
  }

  const url = versionMetadata[clientUrlKeyByPlatform[platform]];
  if (typeof url !== 'string' || !url) {
    throw new Error(
      `Unable to find an Expo Go ${platform} download URL for SDK ${normalizedSdkVersion}`
    );
  }

  return url;
}
