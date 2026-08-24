import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { getExpoGoDownloadURL } from '../../index';
import * as expoGo from '../utils/expoGo';

afterEach(() => {
  mock.restore();
});

describe(getExpoGoDownloadURL, () => {
  it('resolves a URL from object parameters', async () => {
    const getUrlSpy = spyOn(expoGo, 'getExpoGoDownloadUrlAsync').mockResolvedValue(
      'https://example.com/Exponent-55.apk'
    );

    await expect(
      getExpoGoDownloadURL({ platform: 'android', sdkVersion: 55 })
    ).resolves.toBe('https://example.com/Exponent-55.apk');
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
