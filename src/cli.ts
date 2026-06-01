import Log from './log';
import {
  downloadExpoGoAsync,
  getExpoGoDownloadUrlAsync,
} from './utils/expoGo';
import { formatHomePath } from './utils/paths';

const COMMAND_HELP = {
  help: `Usage: expo-go [command]

Get Expo Go download URLs and binaries

Commands:
  url <platform> [sdkVersion]       print the Expo Go download URL for a platform
  download <platform> [sdkVersion]  download Expo Go into the current directory`,
  url: `Usage: expo-go url <platform> [sdkVersion]

Print the Expo Go download URL for a platform.

Arguments:
  platform    ios or android
  sdkVersion  Expo SDK version, or "latest". Defaults to latest.`,
  download: `Usage: expo-go download <platform> [sdkVersion]

Download Expo Go into the current directory.

Arguments:
  platform    ios or android
  sdkVersion  Expo SDK version, or "latest". Defaults to latest.`,
} as const;

const RESOLVING_EXPO_GO_VERSION_MESSAGE = 'Resolving the correct Expo Go version...';

function isHelpToken(value: string | undefined): boolean {
  return value === '-h' || value === '--help';
}

function assertNoExtraArgs(command: string, args: string[], max: number): void {
  if (args.length > max) {
    throw new Error(`Too many arguments for "${command}".`);
  }
}

function assertPlatformInput(value: string | undefined): 'ios' | 'android' {
  if (value === 'ios' || value === 'android') {
    return value;
  }
  throw new Error('Expected platform to be "ios" or "android".');
}

function assertSdkVersionInput(
  sdkVersion: string | undefined
): 'latest' | number {
  if (!sdkVersion || sdkVersion === 'latest') {
    return 'latest';
  }

  const sdkNumber = parseInt(sdkVersion, 10);
  if (Number.isNaN(sdkNumber)) {
    throw new Error(
      `Expected "${sdkVersion}" to be an Expo SDK version or "latest".`
    );
  }

  return sdkNumber;
}

export async function runCliAsync(args: string[]): Promise<void> {
  const [command, ...commandArgs] = args;
  if (!command || isHelpToken(command)) {
    Log.out(COMMAND_HELP.help);
    return;
  }

  if (command === 'url') {
    if (commandArgs.some(isHelpToken)) {
      Log.out(COMMAND_HELP.url);
      return;
    }
    assertNoExtraArgs(command, commandArgs, 2);
    const platform = assertPlatformInput(commandArgs[0]);
    const sdkVersion = assertSdkVersionInput(commandArgs[1]);

    Log.log(RESOLVING_EXPO_GO_VERSION_MESSAGE);
    const url = await getExpoGoDownloadUrlAsync(platform, sdkVersion);
    Log.rawLog(`Download Expo Go from `);
    Log.out(url);
    return;
  }

  if (command === 'download') {
    if (commandArgs.some(isHelpToken)) {
      Log.out(COMMAND_HELP.download);
      return;
    }
    assertNoExtraArgs(command, commandArgs, 2);
    const platform = assertPlatformInput(commandArgs[0]);
    const sdkVersion = assertSdkVersionInput(commandArgs[1]);
    Log.log(RESOLVING_EXPO_GO_VERSION_MESSAGE);
    const outputPath = await downloadExpoGoAsync(platform, sdkVersion);
    Log.rawLog(`Expo Go downloaded to `);
    Log.out(formatHomePath(outputPath));
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}
