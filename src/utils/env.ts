export function boolish(name: string, fallback: boolean): boolean {
  const value = process.env[name];

  if (value === undefined) {
    return fallback;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }

  throw new Error(`GetEnv.NoBoolean: ${value} is not a boolean.`);
}

function string(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get EXPO_GO_DEBUG(): boolean {
    return boolish('EXPO_GO_DEBUG', false);
  },
  get __UNSAFE_EXPO_HOME_DIRECTORY(): string {
    return string('__UNSAFE_EXPO_HOME_DIRECTORY', '');
  },
  get EXPO_BETA(): boolean {
    return boolish('EXPO_BETA', false);
  },
  get EXPO_NO_CACHE(): boolean {
    return boolish('EXPO_NO_CACHE', false);
  },
  get EXPO_STAGING(): boolean {
    return boolish('EXPO_STAGING', false);
  },
  get EXPO_LOCAL(): boolean {
    return boolish('EXPO_LOCAL', false);
  },
};
