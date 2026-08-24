import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createFetch } from '../fetch';
import { downloadFileWithProgressTrackerAsync } from '../download';

let tempHome: string;
let originalExpoHomeDirectory: string | undefined;
let originalFetch: typeof fetch;
let originalExpoNoCache: string | undefined;

describe(downloadFileWithProgressTrackerAsync, () => {
  beforeEach(async () => {
    tempHome = await mkTempDirAsync();
    originalExpoHomeDirectory = process.env['__UNSAFE_EXPO_HOME_DIRECTORY'];
    originalExpoNoCache = process.env['EXPO_NO_CACHE'];
    originalFetch = globalThis.fetch;
    process.env['__UNSAFE_EXPO_HOME_DIRECTORY'] = path.join(tempHome, '.expo');
  });

  afterEach(async () => {
    if (originalExpoHomeDirectory === undefined) {
      delete process.env['__UNSAFE_EXPO_HOME_DIRECTORY'];
    } else {
      process.env['__UNSAFE_EXPO_HOME_DIRECTORY'] = originalExpoHomeDirectory;
    }
    if (originalExpoNoCache === undefined) {
      delete process.env['EXPO_NO_CACHE'];
    } else {
      process.env['EXPO_NO_CACHE'] = originalExpoNoCache;
    }
    globalThis.fetch = originalFetch;
    mock.restore();
    await rm(tempHome, { force: true, recursive: true });
  });

  it('renders progress while a cached fetch is filling the response cache', async () => {
    const originalIsTTY = process.stderr.isTTY;
    const writes: string[] = [];
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true });
    spyOn(process.stderr, 'write').mockImplementation(
      (chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) => {
        writes.push(String(chunk));
        const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
        done?.();
        return true;
      }
    );

    try {
      globalThis.fetch = mock(async () => {
        return new Response('downloaded', {
          headers: { 'content-length': '10' },
          status: 200,
        });
      }) as unknown as typeof fetch;
      const fetchInstance = createFetch({
        cacheDirectory: 'download-cache-test',
      });
      const outputPath = path.join(tempHome, 'Exponent.apk');

      await downloadFileWithProgressTrackerAsync(
        'https://example.com/Exponent.apk',
        outputPath,
        (ratio, total) => `Downloading Expo Go (${Math.round(ratio * total)} / ${total})`,
        'Successfully downloaded Expo Go',
        { fetch: fetchInstance }
      );

      expect(await readFile(outputPath, 'utf8')).toBe('downloaded');
      expect(
        writes.filter(message => message === 'Downloading Expo Go (10 / 10)')
      ).toHaveLength(1);
      expect(writes).toContain('Successfully downloaded Expo Go\n');
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', {
        configurable: true,
        value: originalIsTTY,
      });
    }
  });

  it('renders progress when the response cache is disabled', async () => {
    const originalIsTTY = process.stderr.isTTY;
    const writes: string[] = [];
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true });
    spyOn(process.stderr, 'write').mockImplementation(
      (chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) => {
        writes.push(String(chunk));
        const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
        done?.();
        return true;
      }
    );

    try {
      process.env['EXPO_NO_CACHE'] = '1';
      globalThis.fetch = mock(async () => {
        return new Response('downloaded', {
          headers: { 'content-length': '10' },
          status: 200,
        });
      }) as unknown as typeof fetch;
      const fetchInstance = createFetch({
        cacheDirectory: 'download-cache-test',
      });
      const outputPath = path.join(tempHome, 'Exponent-no-cache.apk');

      await downloadFileWithProgressTrackerAsync(
        'https://example.com/Exponent.apk',
        outputPath,
        (ratio, total) => `Downloading Expo Go (${Math.round(ratio * total)} / ${total})`,
        'Successfully downloaded Expo Go',
        { fetch: fetchInstance }
      );

      expect(await readFile(outputPath, 'utf8')).toBe('downloaded');
      expect(
        writes.filter(message => message === 'Downloading Expo Go (10 / 10)')
      ).toHaveLength(1);
      expect(writes).toContain('Successfully downloaded Expo Go\n');
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', {
        configurable: true,
        value: originalIsTTY,
      });
    }
  });

  it('does not render progress in silent mode', async () => {
    const originalIsTTY = process.stderr.isTTY;
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true });
    const writeSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      globalThis.fetch = mock(async () => {
        return new Response('downloaded', {
          headers: { 'content-length': '10' },
          status: 200,
        });
      }) as unknown as typeof fetch;

      await downloadFileWithProgressTrackerAsync(
        'https://example.com/Exponent.apk',
        path.join(tempHome, 'Exponent-silent.apk'),
        (ratio, total) => `Downloading Expo Go (${Math.round(ratio * total)} / ${total})`,
        'Successfully downloaded Expo Go',
        { fetch: createFetch({ cacheDirectory: 'silent-download-cache-test' }), silent: true }
      );

      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', {
        configurable: true,
        value: originalIsTTY,
      });
    }
  });
});

async function mkTempDirAsync(): Promise<string> {
  const prefix = path.join(tmpdir(), 'expo-go-download-test-');
  return await mkdtemp(prefix);
}
