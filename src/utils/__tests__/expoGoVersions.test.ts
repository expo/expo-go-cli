import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as timers from 'node:timers/promises';

import { getExpoGoVersionsAsync } from '../expoGoVersions';

function sdkEntry(sdk: number, version = `${sdk}.0.1`) {
  return {
    expoVersion: `~${sdk}.0.2`,
    iosClientVersion: version,
    androidClientVersion: version,
    iosClientUrl: `https://github.com/expo/expo-go-releases/releases/download/Expo-Go-${version}/Expo-Go-${version}.tar.gz`,
    androidClientUrl: `https://github.com/expo/expo-go-releases/releases/download/Expo-Go-${version}/Expo-Go-${version}.apk`,
  };
}

function releaseMetadata(tag: string) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: ['tar.gz', 'apk'].map(extension => ({
      browser_download_url: `https://github.com/expo/expo-go-releases/releases/download/${tag}/${tag}.${extension}`,
      state: 'uploaded',
      size: 100,
    })),
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let tempDirectory: string;
let originalFetch: typeof fetch;
let originalEnv: Record<string, string | undefined>;
let entries: Record<string, Record<string, unknown>>;
let releaseChanges: Record<string, Record<string, unknown>>;
let wrapMetadata: boolean;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(tmpdir(), 'expo-go-versions-test-'));
  originalFetch = globalThis.fetch;
  originalEnv = Object.fromEntries(
    [
      '__UNSAFE_EXPO_HOME_DIRECTORY',
      'EXPO_NO_CACHE',
      'EXPO_LOCAL',
      'EXPO_STAGING',
      'EXPO_BETA',
      'GH_TOKEN',
      'GITHUB_TOKEN',
    ].map(key => [key, process.env[key]])
  );
  process.env['__UNSAFE_EXPO_HOME_DIRECTORY'] = tempDirectory;
  process.env['EXPO_NO_CACHE'] = '0';
  process.env['EXPO_LOCAL'] = '0';
  process.env['EXPO_STAGING'] = '0';
  process.env['EXPO_BETA'] = '0';
  delete process.env['GH_TOKEN'];
  delete process.env['GITHUB_TOKEN'];
  entries = Object.fromEntries([55, 56, 57, 58, 59].map(sdk => [`${sdk}.0.0`, sdkEntry(sdk)]));
  releaseChanges = {};
  wrapMetadata = true;
  spyOn(timers, 'setTimeout').mockResolvedValue(undefined);
  globalThis.fetch = mock(async input => {
    const url = String(input);
    if (url === 'https://api.expo.dev/v2/versions/latest') {
      const metadata = { sdkVersions: entries };
      return jsonResponse(wrapMetadata ? { data: metadata } : metadata);
    }
    if (url.startsWith('https://api.github.com/repos/expo/expo-go-releases/releases/tags/')) {
      const tag = url.split('/').at(-1)!;
      return jsonResponse({ ...releaseMetadata(tag), ...releaseChanges[tag] });
    }
    throw new Error(`Unexpected network request: ${url}`);
  }) as unknown as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  mock.restore();
  await rm(tempDirectory, { recursive: true, force: true });
});

describe(getExpoGoVersionsAsync, () => {
  it('sorts SDK numbers numerically, without hardcoded SDKs or an off-by-one range', async () => {
    entries['100.0.0'] = sdkEntry(100);
    const versions = await getExpoGoVersionsAsync({ platform: 'ios', limit: 3 });
    expect(versions.map(entry => entry.sdkVersion)).toEqual([100, 59, 58]);
    expect(versions[0]).toEqual({
      sdkVersion: 100,
      version: '100.0.1',
      url: sdkEntry(100).iosClientUrl,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('handles unwrapped metadata and platform-specific client versions', async () => {
    wrapMetadata = false;
    entries['59.0.0'] = {
      ...sdkEntry(59),
      androidClientVersion: '59.0.2',
      androidClientUrl: sdkEntry(59, '59.0.2').androidClientUrl,
    };
    const [version] = await getExpoGoVersionsAsync({ platform: 'android', stable: true, limit: 1 });
    expect(version).toEqual({
      sdkVersion: 59,
      version: '59.0.2',
      url: sdkEntry(59, '59.0.2').androidClientUrl,
    });
  });

  it('ignores SDK keys the url/download commands cannot address and missing platform binaries', async () => {
    entries['62.0.0-beta.1'] = sdkEntry(62);
    entries['61.1.0'] = sdkEntry(61);
    entries['60.0.0'] = { ...sdkEntry(60), iosClientUrl: undefined };
    expect((await getExpoGoVersionsAsync({ platform: 'ios', limit: 1 }))[0]?.sdkVersion).toBe(59);
  });

  it('lists prerelease clients unless --stable was requested', async () => {
    entries['60.0.0'] = sdkEntry(60, '60.0.0-beta.1');
    expect((await getExpoGoVersionsAsync({ platform: 'ios', limit: 1 }))[0]?.version).toBe(
      '60.0.0-beta.1'
    );
    expect(
      (await getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 1 }))[0]?.sdkVersion
    ).toBe(59);
  });

  it('excludes beta SDK packages and flags even if the client has a stable-looking number', async () => {
    entries['61.0.0'] = { ...sdkEntry(61), expoVersion: '~61.0.0-canary.1' };
    entries['60.0.0'] = { ...sdkEntry(60), isBeta: true };
    entries['59.0.0']!['prerelease'] = true;
    expect(
      (await getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 3 })).map(
        entry => entry.sdkVersion
      )
    ).toEqual([58, 57, 56]);
  });

  it('excludes GitHub drafts and prereleases before applying the limit', async () => {
    releaseChanges['Expo-Go-59.0.1'] = { draft: true };
    releaseChanges['Expo-Go-58.0.1'] = { prerelease: true };
    expect(
      (await getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 3 })).map(
        entry => entry.sdkVersion
      )
    ).toEqual([57, 56, 55]);
  });

  it('retains legacy CDN releases that predate expoVersion metadata', async () => {
    entries = {
      '48.0.0': {
        iosClientVersion: '2.28.9',
        iosClientUrl: 'https://dpq5q02fu5f55.cloudfront.net/Exponent-2.28.9.tar.gz',
      },
    };
    expect((await getExpoGoVersionsAsync({ platform: 'ios', stable: true }))[0]?.sdkVersion).toBe(
      48
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { tag_name: 'wrong' },
    { draft: undefined },
    { prerelease: undefined },
    { assets: [] },
    { assets: [{ ...releaseMetadata('Expo-Go-59.0.1').assets[0], size: 0 }] },
  ])('fails closed for unverifiable release metadata: %j', async change => {
    releaseChanges['Expo-Go-59.0.1'] = change;
    await expect(
      getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 3 })
    ).rejects.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not inspect older release metadata after the requested limit', async () => {
    entries['55.0.0']!['iosClientVersion'] = 'invalid';
    expect(await getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 3 })).toHaveLength(
      3
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('returns at most the limit; an image consumer can require an exact count', async () => {
    entries = { '59.0.0': sdkEntry(59) };
    expect(await getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 3 })).toHaveLength(
      1
    );
  });

  it('fails instead of returning an empty success for unavailable versions', async () => {
    entries = {};
    await expect(
      getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 3 })
    ).rejects.toThrow('No stable Expo Go ios versions');
  });

  it.each([{}, { sdkVersions: [] }, { data: null }, { sdkVersions: null }])(
    'rejects malformed metadata: %j',
    async metadata => {
      globalThis.fetch = mock(async () => jsonResponse(metadata)) as unknown as typeof fetch;
      await expect(getExpoGoVersionsAsync({ platform: 'ios' })).rejects.toThrow(
        'Unexpected response'
      );
    }
  );

  it.each(['https://github.com/other/repo/file.tar.gz', 'file:///tmp/Expo.app', 'invalid'])(
    'rejects unexpected asset URLs: %s',
    async url => {
      entries['59.0.0']!['iosClientUrl'] = url;
      await expect(
        getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 1 })
      ).rejects.toThrow();
    }
  );

  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid SDK API limits before fetching: %s',
    async limit => {
      await expect(getExpoGoVersionsAsync({ platform: 'ios', limit })).rejects.toThrow(
        'positive safe integer'
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    }
  );

  it('caches repeated Expo and GitHub metadata requests', async () => {
    const options = { platform: 'ios' as const, stable: true, limit: 3 };
    expect(await getExpoGoVersionsAsync(options)).toEqual(await getExpoGoVersionsAsync(options));
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('only sends GitHub credentials to GitHub and disables redirects', async () => {
    process.env['GH_TOKEN'] = 'test-token';
    await getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 1 });
    const calls = (globalThis.fetch as unknown as ReturnType<typeof mock<typeof fetch>>).mock.calls;
    expect(calls[0]?.[1]?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(calls[1]?.[1]?.headers).toHaveProperty('Authorization', 'Bearer test-token');
    for (const [, init] of calls) {
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each([429, 503])(
    'retries transient HTTP %s failures a bounded number of times',
    async status => {
      globalThis.fetch = mock(async () => jsonResponse({}, status)) as unknown as typeof fetch;
      await expect(getExpoGoVersionsAsync({ platform: 'ios' })).rejects.toThrow('after 3 attempts');
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      expect(timers.setTimeout).toHaveBeenNthCalledWith(1, 1000);
      expect(timers.setTimeout).toHaveBeenNthCalledWith(2, 2000);
    }
  );

  it('retries network failures without silently substituting older releases', async () => {
    const metadataFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input, init) => {
      if (String(input).includes('api.github.com')) throw new Error('offline');
      return await metadataFetch(input, init);
    }) as unknown as typeof fetch;
    await expect(
      getExpoGoVersionsAsync({ platform: 'ios', stable: true, limit: 3 })
    ).rejects.toThrow('after 3 attempts');
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('does not retry permanent API errors', async () => {
    globalThis.fetch = mock(async () => jsonResponse({}, 404)) as unknown as typeof fetch;
    await expect(getExpoGoVersionsAsync({ platform: 'ios' })).rejects.toThrow('status 404');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('can recover from a transient failure and returns no partial fallback', async () => {
    const metadataFetch = globalThis.fetch;
    let first = true;
    globalThis.fetch = mock(async (input, init) => {
      if (first) {
        first = false;
        throw new Error('temporary network failure');
      }
      return await metadataFetch(input, init);
    }) as unknown as typeof fetch;
    expect(await getExpoGoVersionsAsync({ platform: 'ios', limit: 3 })).toHaveLength(3);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(timers.setTimeout).toHaveBeenCalledWith(1000);
  });

  it('bounds attempts when metadata requests time out', async () => {
    const timeout = spyOn(AbortSignal, 'timeout').mockImplementation(() =>
      AbortSignal.abort(new DOMException('timed out', 'TimeoutError'))
    );
    globalThis.fetch = mock(async (_input, init) => {
      init?.signal?.throwIfAborted();
      throw new Error('Expected the request to carry a timeout signal');
    }) as unknown as typeof fetch;
    await expect(getExpoGoVersionsAsync({ platform: 'ios' })).rejects.toThrow('after 3 attempts');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(timeout).toHaveBeenCalledWith(30_000);
  });

  it('honors EXPO_NO_CACHE for fresh image-build discovery', async () => {
    process.env['EXPO_NO_CACHE'] = '1';
    const options = { platform: 'ios' as const, stable: true, limit: 1 };
    await getExpoGoVersionsAsync(options);
    await getExpoGoVersionsAsync(options);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });
});
