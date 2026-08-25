import Log from './log';
import {
  downloadExpoGoAsync,
  getExpoGoDownloadUrlAsync,
} from './utils/expoGo';
import { formatHomePath } from './utils/paths';

const COMMAND_HELP = {
  help: `Usage: expo-go [command] [options]

Get Expo Go download URLs and binaries

Commands:
  url <platform> [sdkVersion]       print the Expo Go download URL for a platform
  download <platform> [sdkVersion]  download Expo Go into the current directory

Options:
  --json  print stable, machine-readable JSON only`,
  url: `Usage: expo-go url <platform> [sdkVersion] [--json]

Print the Expo Go download URL for a platform.

Arguments:
  platform    ios or android
  sdkVersion  Expo SDK version, or "latest". Defaults to latest.

Options:
  --json  print a JSON object with a stable "url" field`,
  download: `Usage: expo-go download <platform> [sdkVersion] [--json]

Download Expo Go into the current directory.

Arguments:
  platform    ios or android
  sdkVersion  Expo SDK version, or "latest". Defaults to latest.

Options:
  --json  print a JSON object with a stable "path" field`,
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

function parseOptions(args: string[]): {
  json: boolean;
  positionalArgs: string[];
} {
  let json = false;
  const positionalArgs: string[] = [];

  for (const arg of args) {
    if (arg === '--json') {
      if (json) {
        throw new Error('Option "--json" can only be specified once.');
      }
      json = true;
    } else {
      positionalArgs.push(arg);
    }
  }

  return { json, positionalArgs };
}

function assertPlatformInput(value: string | undefined): 'ios' | 'android' {
  if (value === 'ios' || value === 'android') {
    return value;
  }
  throw new Error('Expected platform to be "ios" or "android".');
}

function getPlatformInput(value: string | undefined): 'ios' | 'android' | undefined {
  if (value === 'ios' || value === 'android') {
    return value;
  }
  return undefined;
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

function parsePlatformAndSdkVersionArgs(args: string[]): {
  platform: 'ios' | 'android';
  sdkVersion: 'latest' | number;
} {
  const [firstArg, secondArg] = args;
  const firstPlatform = getPlatformInput(firstArg);
  const secondPlatform = getPlatformInput(secondArg);

  if (firstPlatform) {
    return {
      platform: firstPlatform,
      sdkVersion: assertSdkVersionInput(secondArg),
    };
  }

  if (secondPlatform) {
    return {
      platform: secondPlatform,
      sdkVersion: assertSdkVersionInput(firstArg),
    };
  }

  return {
    platform: assertPlatformInput(firstArg),
    sdkVersion: assertSdkVersionInput(secondArg),
  };
}

export async function runCliAsync(args: string[]): Promise<void> {
  const { json, positionalArgs } = parseOptions(args);
  const [command, ...commandArgs] = positionalArgs;
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
    const { platform, sdkVersion } = parsePlatformAndSdkVersionArgs(commandArgs);

    if (!json) {
      Log.log(RESOLVING_EXPO_GO_VERSION_MESSAGE);
    }
    const url = await getExpoGoDownloadUrlAsync(platform, sdkVersion);
    if (json) {
      Log.out(JSON.stringify({ url }));
    } else {
      Log.rawLog(`Download Expo Go from `);
      Log.out(url);
    }
    return;
  }

  if (command === 'download') {
    if (commandArgs.some(isHelpToken)) {
      Log.out(COMMAND_HELP.download);
      return;
    }
    assertNoExtraArgs(command, commandArgs, 2);
    const { platform, sdkVersion } = parsePlatformAndSdkVersionArgs(commandArgs);
    if (!json) {
      Log.log(RESOLVING_EXPO_GO_VERSION_MESSAGE);
    }
    const outputPath = json
      ? await downloadExpoGoAsync(platform, sdkVersion, { silent: true })
      : await downloadExpoGoAsync(platform, sdkVersion);
    if (json) {
      Log.out(JSON.stringify({ path: outputPath }));
    } else {
      Log.rawLog(`Expo Go downloaded to `);
      Log.out(formatHomePath(outputPath));
    }
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}
