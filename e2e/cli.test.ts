import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_PATH = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const DOWNLOAD_TIMEOUT_MS = 45 * 60 * 1000;
const PLATFORMS = ['android', 'ios'] as const;
const SDK_VERSIONS = [44, 56] as const;
const ARG_ORDERS = ['platform-first', 'sdk-first'] as const;

type Platform = (typeof PLATFORMS)[number];
type SdkVersion = (typeof SDK_VERSIONS)[number];
type ArgOrder = (typeof ARG_ORDERS)[number];

let tempHome: string;
let tempWorkDir: string;

describe('built CLI', () => {
  beforeAll(async () => {
    tempHome = await mkdtemp(path.join(tmpdir(), 'expo-go-e2e-home-'));
    tempWorkDir = await mkdtemp(path.join(tmpdir(), 'expo-go-e2e-work-'));
  });

  afterAll(async () => {
    await rm(tempHome, { force: true, recursive: true });
    await rm(tempWorkDir, { force: true, recursive: true });
  });

  it('prints help output', async () => {
    await expectCli(['--help'], {
      stdout: 'Usage: expo-go [command]',
    });
    await expectCli(['url', '--help'], {
      stdout: 'Usage: expo-go url <platform> [sdkVersion]',
    });
    await expectCli(['download', '--help'], {
      stdout: 'Usage: expo-go download <platform> [sdkVersion]',
    });
  });

  it('rejects invalid SDK versions', async () => {
    await expectCli(['url', 'ios', 'LATEST'], {
      exitCode: 1,
      stderr: 'Expected "LATEST" to be an Expo SDK version or "latest".',
    });
  });

  describe('url', () => {
    for (const platform of PLATFORMS) {
      for (const sdkVersion of SDK_VERSIONS) {
        for (const argOrder of ARG_ORDERS) {
          it(`resolves ${platform} SDK ${sdkVersion} with ${argOrder} args`, async () => {
            const args = getPlatformAndSdkArgs(platform, sdkVersion, argOrder);
            const result = await expectCli(['url', ...args]);
            const url = result.stdout.trim();

            expect(url.startsWith('https://')).toBe(true);
            expect(url).toContain(platform === 'android' ? '.apk' : '.tar.gz');
          });
        }
      }
    }
  });

  describe('download', () => {
    for (const platform of PLATFORMS) {
      for (const sdkVersion of SDK_VERSIONS) {
        for (const argOrder of ARG_ORDERS) {
          it(
            `downloads ${platform} SDK ${sdkVersion} with ${argOrder} args`,
            async () => {
              const args = getPlatformAndSdkArgs(platform, sdkVersion, argOrder);
              const result = await expectCli(['download', ...args]);
              const outputPath = result.stdout.trim();
              const outputStat = await stat(outputPath);

              if (platform === 'ios') {
                expect(outputStat.isDirectory()).toBe(true);
              } else {
                expect(outputStat.isFile()).toBe(true);
              }
            },
            DOWNLOAD_TIMEOUT_MS
          );
        }
      }
    }
  });
});

async function expectCli(
  args: string[],
  {
    exitCode = 0,
    stderr,
    stdout,
  }: {
    exitCode?: number;
    stderr?: string;
    stdout?: string;
  } = {}
): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  const result = await runCliAsync(args);

  expect(result.exitCode).toBe(exitCode);
  if (stdout) {
    expect(result.stdout).toContain(stdout);
  }
  if (stderr) {
    expect(result.stderr).toContain(stderr);
  }

  return result;
}

async function runCliAsync(args: string[]): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  const subprocess = Bun.spawn([process.execPath, CLI_PATH, ...args], {
    cwd: tempWorkDir,
    env: {
      ...process.env,
      __UNSAFE_EXPO_HOME_DIRECTORY: path.join(tempHome, '.expo'),
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);

  return {
    exitCode,
    stderr,
    stdout,
  };
}

function getPlatformAndSdkArgs(
  platform: Platform,
  sdkVersion: SdkVersion,
  argOrder: ArgOrder
): string[] {
  const sdkVersionArg = String(sdkVersion);
  return argOrder === 'platform-first' ? [platform, sdkVersionArg] : [sdkVersionArg, platform];
}
