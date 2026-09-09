import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { getExpoGoDownloadURL, getExpoGoVersions } from '../../index';
import * as expoGo from '../utils/expoGo';
import * as expoGoVersions from '../utils/expoGoVersions';

afterEach(() => {
  mock.restore();
});

describe(getExpoGoVersions, () => {
  it('exports the version listing API with the same options as the CLI', async () => {
    const versions = [
      { sdkVersion: 57, version: '57.0.9', url: 'https://example.com/Expo.tar.gz' },
    ];
    const list = spyOn(expoGoVersions, 'getExpoGoVersionsAsync').mockResolvedValue(versions);
    const options = { platform: 'ios' as const, stable: true, limit: 3 };
    await expect(getExpoGoVersions(options)).resolves.toEqual(versions);
    expect(list).toHaveBeenCalledWith(options);
  });
});

describe(getExpoGoDownloadURL, () => {
  it('resolves a URL from object parameters', async () => {
    const getUrlSpy = spyOn(expoGo, 'getExpoGoDownloadUrlAsync').mockResolvedValue(
      'https://example.com/Exponent-55.apk'
    );

    await expect(getExpoGoDownloadURL({ platform: 'android', sdkVersion: 55 })).resolves.toBe(
      'https://example.com/Exponent-55.apk'
    );
    expect(getUrlSpy).toHaveBeenCalledWith('android', 55);
  });

  it('defaults to the latest SDK version', async () => {
    const getUrlSpy = spyOn(expoGo, 'getExpoGoDownloadUrlAsync').mockResolvedValue(
      'https://example.com/Exponent-latest.tar.gz'
    );

    await getExpoGoDownloadURL({ platform: 'ios' });

    expect(getUrlSpy).toHaveBeenCalledWith('ios', 'latest');
  });
});
