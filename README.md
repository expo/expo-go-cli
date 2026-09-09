# expo-go

Download Expo Go binaries, resolve download URLs, or list available versions from a small standalone CLI with no runtime dependencies.

## Usage

```bash
npx expo-go url <ios|android> [sdkVersion|latest] [--json]
npx expo-go download <ios|android> [sdkVersion|latest] [--json]
npx expo-go versions <ios|android> [--stable] [--limit <count>] [--json]
```

Examples:

```bash
npx expo-go url android 55
npx expo-go url ios latest
npx expo-go url android 55 --json
npx expo-go download android 55
npx expo-go download ios latest
npx expo-go versions ios --stable --limit 3 --json
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

### `expo-go versions`

List platform-specific Expo Go builds in descending SDK-major order. Each entry contains
`sdkVersion` (a number accepted by `url` and `download`), `version` (the Expo Go app
version, not the CLI's npm version), and `url`. This command fetches metadata only;
it does not download app binaries.

```bash
npx expo-go versions ios --stable --limit 3 --json
# {"versions":[{"sdkVersion":57,"version":"57.0.9","url":"https://...tar.gz"},...]}

npx expo-go versions android --stable --limit 3
```

- Without `--stable`, prerelease client builds can appear. Only SDK-major metadata
  entries addressable by the existing `url`/`download` commands are listed. SDKs
  missing a client version or download URL for the selected platform are omitted.
- `--stable` requires numeric stable app versions and rejects prerelease SDK package
  versions and metadata flags. GitHub-hosted builds additionally require a matching,
  non-draft/non-prerelease release and a fully uploaded platform asset. Historical
  CDN-hosted builds rely on Expo's version metadata because they have no GitHub
  release record. This does not verify binary checksums or runtime compatibility.
- `--limit` is a maximum, applied after filtering. For image builds requiring
  **exactly three** builds, validate the returned count as well:

  ```bash
  set -o pipefail
  npx expo-go versions ios --stable --limit 3 --json |
    jq -e '.versions | select(length == 3)'
  ```

- Discovery errors, malformed metadata, unverifiable GitHub releases, and an empty
  result fail with a nonzero exit code. JSON failures produce only `{"error":"..."}`;
  no partial version list is returned. Transient network/429/5xx errors get up to
  three attempts, with 30-second request timeouts and bounded backoff.
- Metadata uses the existing five-minute Expo cache. Set `EXPO_NO_CACHE=1` to force
  fresh discovery. Optional `GH_TOKEN` or `GITHUB_TOKEN` authentication avoids the
  low unauthenticated GitHub API rate limit; tokens are sent only to the GitHub API,
  and metadata requests do not follow redirects.

`url ... latest` and `download ... latest` retain their existing behavior; they do
not implicitly apply the new stable filter. Select an SDK from `versions --stable`
and pass its `sdkVersion` to those commands when stable selection is required.

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

The same version discovery is available as a typed API:

```ts
import { getExpoGoVersions } from 'expo-go';

const versions = await getExpoGoVersions({ platform: 'ios', stable: true, limit: 3 });
// Array<{ sdkVersion: number; version: string; url: string }>
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
