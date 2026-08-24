# expo-go

Download Expo Go binaries, or print the resolved download URL, from a tiny standalone CLI (smaller than 45 KB, with no runtime dependencies).

## Usage

```bash
npx expo-go url <ios|android> [sdkVersion|latest] [--json]
npx expo-go download <ios|android> [sdkVersion|latest] [--json]
```

Examples:

```bash
npx expo-go url android 55
npx expo-go url ios latest
npx expo-go url android 55 --json
npx expo-go download android 55
npx expo-go download ios latest
```

When no SDK version is provided, the CLI uses the latest Expo Go version. Downloads are saved in the current directory with their resolved Expo Go filename.

Downloaded binaries are cached under the Expo home directory:

- Android APKs: `~/.expo/android-apk-cache`
- iOS simulator apps: `~/.expo/ios-simulator-app-cache`

## Commands

### `expo-go url`

Prints the Expo Go download URL for a platform and optional SDK version.

```bash
npx expo-go url android 55
```

Pass `--json` for stable, machine-readable output with exactly one `url` field:

```bash
npx expo-go url android 55 --json
# {"url":"https://.../Exponent-55.apk"}

npx expo-go url ios latest --json | jq -r .url
```

When a JSON-mode command fails, it exits with a nonzero status and prints an object with exactly one `error` field.

### `expo-go download`

Downloads Expo Go for a platform and optional SDK version into the current directory.

```bash
npx expo-go download android latest
```

Pass `--json` to print the absolute output path with exactly one `path` field. Human-readable status and progress output is suppressed.

```bash
npx expo-go download android latest --json
# {"path":"/absolute/path/to/Exponent.apk"}
```

## TypeScript SDK

The package exports a typed `getExpoGoDownloadURL` function. It accepts an Expo SDK major version or `latest`, which is also the default.

```ts
import { getExpoGoDownloadURL } from 'expo-go';

const url = await getExpoGoDownloadURL({
  platform: 'android',
  sdkVersion: 55,
});

const latestIosUrl = await getExpoGoDownloadURL({ platform: 'ios' });
```

## Development

Install dependencies:

```bash
bun install
```

Run the CLI locally:

```bash
bun ./cli.ts url android latest
```

Run tests:

```bash
bun test
```

Build the distributable CLI bundle:

```bash
bun run build
```
