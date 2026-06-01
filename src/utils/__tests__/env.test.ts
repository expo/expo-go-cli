import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { boolish } from '../env';

const ENV_NAME = '__EXPO_GO_BOOLISH_TEST';

let originalValue: string | undefined;

describe(boolish, () => {
  beforeEach(() => {
    originalValue = process.env[ENV_NAME];
    delete process.env[ENV_NAME];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_NAME];
    } else {
      process.env[ENV_NAME] = originalValue;
    }
  });

  it('returns the fallback when the env var is unset', () => {
    expect(boolish(ENV_NAME, false)).toBe(false);
    expect(boolish(ENV_NAME, true)).toBe(true);
  });

  it('parses true values', () => {
    for (const value of ['true', '1']) {
      process.env[ENV_NAME] = value;

      expect(boolish(ENV_NAME, false)).toBe(true);
    }
  });

  it('parses false values', () => {
    for (const value of ['false', '0']) {
      process.env[ENV_NAME] = value;

      expect(boolish(ENV_NAME, true)).toBe(false);
    }
  });

  it('throws for non-boolish values', () => {
    process.env[ENV_NAME] = 'yes';

    expect(() => boolish(ENV_NAME, false)).toThrow('GetEnv.NoBoolean: yes is not a boolean.');
  });
});
