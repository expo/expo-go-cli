import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { runCliAsync } from '../cli';
import Log from '../log';
import * as expoGo from '../utils/expoGo';
import * as expoGoVersions from '../utils/expoGoVersions';

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  spyOn(Log, 'log').mockImplementation(message => {
    calls.push(`log:${message}`);
  });
  spyOn(Log, 'rawLog').mockImplementation(message => {
    calls.push(`raw:${message}`);
  });
  spyOn(Log, 'out').mockImplementation(message => {
    calls.push(`out:${message}`);
  });
});

afterEach(() => {
  mock.restore();
});

describe('url', () => {
  it('prints the resolved Expo Go URL for the platform and SDK version', async () => {
    const getUrlSpy = spyOn(expoGo, 'getExpoGoDownloadUrlAsync').mockImplementation(async () => {
      calls.push('get-url');
      return 'https://example.com/Exponent-55.apk';
    });

    await runCliAsync(['url', 'android', '55']);

    expect(calls).toEqual([
      'log:Resolving the correct Expo Go version...',
      'get-url',
      'raw:Download Expo Go from ',
      'out:https://example.com/Exponent-55.apk',
    ]);
    expect(getUrlSpy).toHaveBeenCalledWith('android', 55);
    expect(Log.out).toHaveBeenCalledWith('https://example.com/Exponent-55.apk');
  });

  it('accepts the SDK version before the platform', async () => {
    const getUrlSpy = spyOn(expoGo, 'getExpoGoDownloadUrlAsync').mockResolvedValue(
      'https://example.com/Exponent-55.apk'
    );

    await runCliAsync(['url', '55', 'android']);

    expect(getUrlSpy).toHaveBeenCalledWith('android', 55);
  });

  it('prints stable JSON without human-readable output', async () => {
    spyOn(expoGo, 'getExpoGoDownloadUrlAsync').mockImplementation(async () => {
      calls.push('get-url');
      return 'https://example.com/Exponent-55.apk';
    });

    await runCliAsync(['url', 'android', '55', '--json']);

    expect(calls).toEqual(['get-url', 'out:{"url":"https://example.com/Exponent-55.apk"}']);
  });

  it('accepts --json before the command', async () => {
    spyOn(expoGo, 'getExpoGoDownloadUrlAsync').mockResolvedValue(
      'https://example.com/Exponent-55.apk'
    );

    await runCliAsync(['--json', 'url', 'android', '55']);

    expect(Log.out).toHaveBeenCalledWith('{"url":"https://example.com/Exponent-55.apk"}');
  });

  it('rejects an SDK version that is not parsable by parseInt or exact "latest"', async () => {
    expect(runCliAsync(['url', 'ios', 'LATEST'])).rejects.toThrow(
      'Expected "LATEST" to be an Expo SDK version or "latest".'
    );

    expect(calls).toEqual([]);
  });
});

describe('download', () => {
  it('downloads an explicit SDK version to the current directory', async () => {
    const downloadSpy = mockDownloadExpoGoAsync();

    await runCliAsync(['download', 'android', '55']);

    expect(calls).toEqual([
      'log:Resolving the correct Expo Go version...',
      'download',
      'raw:Expo Go downloaded to ',
      'out:/output/Exponent-55.apk',
    ]);
    expect(downloadSpy).toHaveBeenCalledWith('android', 55);
    expect(Log.out).toHaveBeenCalledWith('/output/Exponent-55.apk');
  });

  it('downloads the latest Expo Go when "latest" is passed', async () => {
    const downloadSpy = mockDownloadExpoGoAsync();

    await runCliAsync(['download', 'ios', 'latest']);

    expect(downloadSpy).toHaveBeenCalledWith('ios', 'latest');
  });

  it('accepts the SDK version before the platform', async () => {
    const downloadSpy = mockDownloadExpoGoAsync();

    await runCliAsync(['download', 'latest', 'ios']);

    expect(downloadSpy).toHaveBeenCalledWith('ios', 'latest');
  });

  it('prints a stable absolute path as JSON and silences download progress', async () => {
    const downloadSpy = mockDownloadExpoGoAsync();

    await runCliAsync(['download', 'android', '55', '--json']);

    expect(calls).toEqual(['download', 'out:{"path":"/output/Exponent-55.apk"}']);
    expect(downloadSpy).toHaveBeenCalledWith('android', 55, { silent: true });
  });

  it('rejects a second argument that is not an SDK version', async () => {
    expect(runCliAsync(['download', 'ios', '/output'])).rejects.toThrow(
      'Expected "/output" to be an Expo SDK version or "latest"'
    );
  });

  it('rejects duplicate --json options', async () => {
    expect(runCliAsync(['url', 'android', '--json', '--json'])).rejects.toThrow(
      'Option "--json" can only be specified once.'
    );
  });
});

function mockDownloadExpoGoAsync(): ReturnType<typeof mock<typeof expoGo.downloadExpoGoAsync>> {
  return spyOn(expoGo, 'downloadExpoGoAsync').mockImplementation(async () => {
    calls.push('download');
    return '/output/Exponent-55.apk';
  });
}

describe('versions', () => {
  const versions = [
    { sdkVersion: 57, version: '57.0.9', url: 'https://example.com/Expo-Go-57.0.9.tar.gz' },
    { sdkVersion: 56, version: '56.0.4', url: 'https://example.com/Expo-Go-56.0.4.tar.gz' },
  ];

  it('prints only the stable JSON contract and forwards selection options', async () => {
    const list = spyOn(expoGoVersions, 'getExpoGoVersionsAsync').mockResolvedValue(versions);
    await runCliAsync(['versions', 'ios', '--stable', '--limit', '3', '--json']);
    expect(list).toHaveBeenCalledWith({ platform: 'ios', stable: true, limit: 3 });
    expect(calls).toEqual([`out:${JSON.stringify({ versions })}`]);
  });

  it('supports JSON before the command and flags before the platform', async () => {
    const list = spyOn(expoGoVersions, 'getExpoGoVersionsAsync').mockResolvedValue(versions);
    await runCliAsync(['--json', 'versions', '--limit=3', '--stable', 'android']);
    expect(list).toHaveBeenCalledWith({ platform: 'android', stable: true, limit: 3 });
  });

  it('prints readable SDK, app version, and URL rows', async () => {
    const list = spyOn(expoGoVersions, 'getExpoGoVersionsAsync').mockResolvedValue(versions);
    await runCliAsync(['versions', 'ios']);
    expect(list).toHaveBeenCalledWith({ platform: 'ios', stable: false, limit: undefined });
    expect(calls).toEqual(
      versions.map(entry => `out:SDK ${entry.sdkVersion}\tExpo Go ${entry.version}\t${entry.url}`)
    );
  });

  it('prints command-specific help without network access', async () => {
    const list = spyOn(expoGoVersions, 'getExpoGoVersionsAsync');
    await runCliAsync(['versions', '--help']);
    expect(Log.out).toHaveBeenCalledWith(expect.stringContaining('--stable'));
    expect(list).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.5', '1e2', '3junk', 'NaN', 'Infinity', '9007199254740992', ''])(
    'rejects invalid limits: %s',
    async limit => {
      await expect(runCliAsync(['versions', 'ios', '--limit', limit])).rejects.toThrow(
        'positive safe integer'
      );
      expect(calls).toEqual([]);
    }
  );

  it.each(
    [
      ['versions', 'ios', '--limit'],
      ['versions', 'ios', '--limit', '--stable'],
      ['versions', 'ios', '--limit', '3', '--limit=2'],
      ['versions', 'ios', '--stable', '--stable'],
      ['versions', 'ios', '--stable=false'],
      ['versions', 'ios', '--unknown'],
      ['versions', 'ios', '57'],
      ['versions', 'web'],
      ['versions', '--stable'],
      ['versions', 'ios', '--json', '--json'],
    ].map(args => ({ args }))
  )('rejects invalid arguments: %j', async ({ args }) => {
    await expect(runCliAsync(args)).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('does not print partial results on failed discovery', async () => {
    spyOn(expoGoVersions, 'getExpoGoVersionsAsync').mockRejectedValue(
      new Error('metadata unavailable')
    );
    await expect(runCliAsync(['versions', 'ios', '--stable', '--json'])).rejects.toThrow(
      'metadata unavailable'
    );
    expect(calls).toEqual([]);
  });
});
