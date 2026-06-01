# expo-go

Download Expo Go binaries, or print the resolved download URL, from a tiny standalone CLI.

## Usage

```bash
npx expo-go url <ios|android> [sdkVersion|latest]
npx expo-go download <ios|android> [sdkVersion|latest]
```

Examples:

```bash
npx expo-go url android 55
npx expo-go url ios latest
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

### `expo-go download`

Downloads Expo Go for a platform and optional SDK version into the current directory.

```bash
npx expo-go download android latest
```

## Development

Install dependencies:

```bash
bun install
```

Run the CLI locally:

```bash
bun ./index.ts url android latest
```

Run tests:

```bash
bun test
```

Build the distributable CLI bundle:

```bash
bun run build
```
