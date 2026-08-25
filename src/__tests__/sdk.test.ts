import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { getExpoGoDownloadURL } from '../../index';

const versions = {
  sdkVersions: {
    '54.0.0': {
      iosClientUrl: 'https://example.com/Exponent-54.tar.gz',
    },
    '55.0.0': {
      androidClientUrl: 'https://example.com/Exponent-55.apk',
      iosClientUrl: 'https://example.com/Exponent-55.tar.gz',
    },
  },
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = mock(async () => {
    return new Response(JSON.stringify({ data: versions }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe(getExpoGoDownloadURL, () => {
  it('resolves a URL from object parameters', async () => {
    await expect(
      getExpoGoDownloadURL({ platform: 'android', sdkVersion: 55 })
    ).resolves.toBe('https://example.com/Exponent-55.apk');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.expo.dev/v2/versions/latest',
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('defaults to the latest SDK version', async () => {
    await expect(getExpoGoDownloadURL({ platform: 'ios' })).resolves.toBe(
      'https://example.com/Exponent-55.tar.gz'
    );
  });
});
