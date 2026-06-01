import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import { env } from './env';

export function getExpoHomeDirectory(): string {
  if (env.__UNSAFE_EXPO_HOME_DIRECTORY) {
    return env.__UNSAFE_EXPO_HOME_DIRECTORY;
  }

  const home = homedir();
  if (!home) {
    throw new Error(
      "Can't determine your home directory; make sure your $HOME environment variable is set."
    );
  }

  if (env.EXPO_STAGING) {
    return path.join(home, '.expo-staging');
  } else if (env.EXPO_LOCAL) {
    return path.join(home, '.expo-local');
  }
  return path.join(home, '.expo');
}

export function getTmpDirectory(): string {
  return path.join(tmpdir(), 'expo-go');
}

export function formatHomePath(filePath: string): string {
  const homeDirectory = homedir();
  if (!homeDirectory || !filePath.startsWith(homeDirectory)) {
    return filePath;
  }
  return path.join('~', path.relative(homeDirectory, filePath));
}
