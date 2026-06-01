import type { FetchLike } from './utils/fetch';
import { env } from './utils/env';

function getExpoApiBaseUrl(): string {
  if (env.EXPO_STAGING) {
    return 'https://staging-api.expo.dev';
  } else if (env.EXPO_LOCAL) {
    return 'http://127.0.0.1:3000';
  }
  return 'https://api.expo.dev';
}

export async function apiGetAsync(
  path: string,
  { fetch: fetchAsync }: { fetch: FetchLike }
): Promise<unknown> {
  const response = await fetchAsync(`${getExpoApiBaseUrl()}/v2/${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request to Expo API failed with status ${response.status}`);
  }

  return await response.json();
}
