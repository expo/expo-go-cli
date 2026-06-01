import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Log from '../../log';
import * as downloadUtils from '../download';
import * as tarUtils from '../tar';
import {
  type ExpoVersions,
  downloadExpoGoAsync,
  getExpoGoDownloadUrlAsync,
  getLatestSdkVersion,
} from '../expoGo';

const versions: ExpoVersions = {
  sdkVersions: {
    '54.0.0': {
      androidClientUrl: 'https://example.com/Exponent-54.apk',
      iosClientUrl: 'https://example.com/Exponent-54.tar.gz',
    },
    '55.0.0': {
      androidClientUrl: 'https://example.com/Exponent-55.apk',
      iosClientUrl: 'https://example.com/Exponent-55.tar.gz',
    },
  },
};

let tempHome: string;
let originalFetch: typeof fetch;
let originalExpoHomeDirectory: string | undefined;
let originalHome: string | undefined;
let originalCwd: string;

describe('expoGo utils', () => {
  beforeEach(async () => {
    tempHome = await mkTempDirAsync();
    originalFetch = globalThis.fetch;
    originalExpoHomeDirectory = process.env.__UNSAFE_EXPO_HOME_DIRECTORY;
    originalHome = process.env.HOME;
    originalCwd = process.cwd();
    process.env.__UNSAFE_EXPO_HOME_DIRECTORY = path.join(tempHome, '.expo');
    process.env.HOME = tempHome;
    process.chdir(tempHome);
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ data: versions }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as unknown as typeof fetch;
    spyOn(Log, 'debug').mockImplementation(() => {});
    spyOn(Log, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalExpoHomeDirectory === undefined) {
      delete process.env.__UNSAFE_EXPO_HOME_DIRECTORY;
    } else {
      process.env.__UNSAFE_EXPO_HOME_DIRECTORY = originalExpoHomeDirectory;
    }
    mock.restore();
    await rm(tempHome, { force: true, recursive: true });
  });

  describe(getLatestSdkVersion, () => {
    it('returns the highest SDK major version', () => {
      expect(getLatestSdkVersion(versions.sdkVersions)).toBe('55.0.0');
    });
  });

  describe(getExpoGoDownloadUrlAsync, () => {
    it('resolves the platform URL for an explicit SDK major version', async () => {
      await expect(getExpoGoDownloadUrlAsync('ios', 55)).resolves.toBe(
        'https://example.com/Exponent-55.tar.gz'
      );
    });

    it('resolves the latest SDK version when "latest" is provided', async () => {
      await expect(getExpoGoDownloadUrlAsync('android', 'latest')).resolves.toBe(
        'https://example.com/Exponent-55.apk'
      );
    });

    it('throws when the SDK version is missing', async () => {
      await expect(getExpoGoDownloadUrlAsync('ios', 53)).rejects.toThrow(
        'Unable to find a version of Expo Go for SDK 53.0.0'
      );
    });

    it('caches version responses in the Expo home directory', async () => {
      await expect(getExpoGoDownloadUrlAsync('android', 55)).resolves.toBe(
        'https://example.com/Exponent-55.apk'
      );
      await expect(getExpoGoDownloadUrlAsync('ios', 54)).resolves.toBe(
        'https://example.com/Exponent-54.tar.gz'
      );

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe(downloadExpoGoAsync, () => {
    it('extracts iOS tarballs directly into the app cache directory', async () => {
      spyOn(downloadUtils, 'downloadFileWithProgressTrackerAsync').mockResolvedValue();
      const extractAsyncSpy = spyOn(tarUtils, 'extractAsync').mockImplementation(
        async (_input, output) => {
          await mkdir(output, { recursive: true });
          await writeFile(path.join(output, 'Info.plist'), 'plist');
        }
      );

      await expect(downloadExpoGoAsync('ios', 55)).resolves.toBe(
        path.join(process.cwd(), 'Exponent-55.tar.app')
      );

      expect(extractAsyncSpy).toHaveBeenCalledWith(
        expect.stringContaining('Exponent-55.tar.gz'),
        expect.stringContaining('Exponent-55.tar.app')
      );
    });

    it('logs the cache directory instead of the cached app path', async () => {
      await mkdir(
        path.join(tempHome, '.expo', 'ios-simulator-app-cache', 'Exponent-55.tar.app'),
        { recursive: true }
      );

      await expect(downloadExpoGoAsync('ios', 55)).resolves.toBe(
        path.join(process.cwd(), 'Exponent-55.tar.app')
      );

      expect(Log.log).toHaveBeenCalledWith(
        expect.stringMatching(/^Using cached version from .*ios-simulator-app-cache/)
      );
      expect(Log.log).not.toHaveBeenCalledWith(expect.stringContaining('Exponent-55.tar.app'));
    });

    it('writes the Android apk straight to the platform cache without an intermediate copy', async () => {
      const downloadSpy = spyOn(
        downloadUtils,
        'downloadFileWithProgressTrackerAsync'
      ).mockImplementation(async (_url, outputPath) => {
        await writeFile(outputPath, 'apk contents');
      });
      const extractAsyncSpy = spyOn(tarUtils, 'extractAsync').mockResolvedValue();

      await expect(downloadExpoGoAsync('android', 55)).resolves.toBe(
        path.join(process.cwd(), 'Exponent-55.apk')
      );

      expect(downloadSpy).toHaveBeenCalledWith(
        'https://example.com/Exponent-55.apk',
        expect.stringMatching(/android-apk-cache.*Exponent-55\.apk$/),
        expect.any(Function),
        'Successfully downloaded Expo Go',
        expect.objectContaining({ fetch: expect.any(Function) })
      );
      expect(extractAsyncSpy).not.toHaveBeenCalled();
    });

    it('restores Android apk downloads from the response cache without refetching', async () => {
      let apkFetchCalls = 0;
      globalThis.fetch = mock(async input => {
        const url = String(input);
        if (url.includes('/v2/versions/latest')) {
          return new Response(JSON.stringify({ data: versions }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          });
        }
        if (url !== 'https://example.com/Exponent-55.apk') {
          throw new Error(`Unexpected request: ${url}`);
        }

        apkFetchCalls++;
        if (apkFetchCalls > 1) {
          throw new Error('Network should not be used after the response is cached.');
        }
        return new Response('apk contents', {
          headers: { 'content-length': '12' },
          status: 200,
        });
      }) as unknown as typeof fetch;

      const firstDownload = await downloadExpoGoAsync('android', 55);
      expect(await readFile(firstDownload, 'utf8')).toBe('apk contents');

      await rm(firstDownload, { force: true, recursive: true });
      await rm(path.join(tempHome, '.expo', 'android-apk-cache', 'Exponent-55.apk'), {
        force: true,
        recursive: true,
      });

      const secondDownload = await downloadExpoGoAsync('android', 55);

      expect(secondDownload).toBe(firstDownload);
      expect(await readFile(secondDownload, 'utf8')).toBe('apk contents');
      expect(apkFetchCalls).toBe(1);
    });
  });
});

async function mkTempDirAsync(): Promise<string> {
  const prefix = path.join(tmpdir(), 'expo-go-test-');
  return await mkdtemp(prefix);
}
