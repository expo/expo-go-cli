// Adapted from @expo/cli's tar utility tests:
// https://github.com/expo/expo/blob/2c21e2f96ce6aede3d6bb5c780f0964d2116d37b/packages/@expo/cli/src/utils/__tests__/tar-test.ts#L1-L31

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { tar, TarChunk, TarFile, TarTypeFlag } from 'multitars';
import * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';

import { extractAsync, extractStream } from '../tar';

let tempHome: string;

describe(extractAsync, () => {
  beforeEach(async () => {
    tempHome = await mkTempDirAsync();
  });

  afterEach(async () => {
    mock.restore();
    await rm(tempHome, { force: true, recursive: true });
  });

  it('extracts gzip-compressed tar archives without native tar', async () => {
    const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation((() => {
      throw new Error('Native tar should not be spawned');
    }) as typeof childProcess.spawn);
    const archivePath = path.join(tempHome, 'archive.tar.gz');
    const outputPath = path.join(tempHome, 'output');
    await writeTarGzipAsync(archivePath, [
      { type: 'file', name: 'Expo.app/Info.plist', contents: 'plist' },
    ]);

    await extractAsync(archivePath, outputPath);

    expect(spawnSpy).not.toHaveBeenCalled();
    expect(await readFile(path.join(outputPath, 'Expo.app', 'Info.plist'), 'utf8')).toBe('plist');
  });

  it('skips entries that resolve outside the output directory', async () => {
    const archivePath = path.join(tempHome, 'archive.tar.gz');
    const outputPath = path.join(tempHome, 'output');
    const outsidePath = path.join(tempHome, 'outside.txt');
    await writeTarGzipAsync(archivePath, [
      { type: 'file', name: 'safe.txt', contents: 'safe' },
      { type: 'file', name: '../outside.txt', contents: 'traversed' },
      { type: 'file', name: outsidePath, contents: 'absolute' },
    ]);

    await extractAsync(archivePath, outputPath);

    expect(await readFile(path.join(outputPath, 'safe.txt'), 'utf8')).toBe('safe');
    expect(await pathExistsAsync(outsidePath)).toBe(false);
  });

  it('skips links that resolve outside the output directory', async () => {
    const archivePath = path.join(tempHome, 'archive.tar.gz');
    const outputPath = path.join(tempHome, 'output');
    const outsidePath = path.join(tempHome, 'outside.txt');
    await writeFile(outsidePath, 'outside');
    await writeTarGzipAsync(archivePath, [
      { type: 'symlink', name: 'escape-symlink', linkname: '../outside.txt' },
      { type: 'hardlink', name: 'escape-hardlink', linkname: '../outside.txt' },
    ]);

    await extractAsync(archivePath, outputPath);

    expect(await pathExistsAsync(path.join(outputPath, 'escape-symlink'))).toBe(false);
    expect(await pathExistsAsync(path.join(outputPath, 'escape-hardlink'))).toBe(false);
    expect(await readFile(outsidePath, 'utf8')).toBe('outside');
  });

  it('does not write files through pre-existing symlinked parents', async () => {
    const archivePath = path.join(tempHome, 'archive.tar.gz');
    const outputPath = path.join(tempHome, 'output');
    const outsidePath = path.join(tempHome, 'outside');
    await mkdir(outputPath, { recursive: true });
    await mkdir(outsidePath, { recursive: true });
    await symlink(outsidePath, path.join(outputPath, 'linked-parent'), 'dir');
    await writeTarGzipAsync(archivePath, [
      { type: 'file', name: 'linked-parent/pwned.txt', contents: 'pwned' },
    ]);

    await extractAsync(archivePath, outputPath);

    expect(await pathExistsAsync(path.join(outsidePath, 'pwned.txt'))).toBe(false);
    expect(await pathExistsAsync(path.join(outputPath, 'linked-parent', 'pwned.txt'))).toBe(false);
  });
});

describe(extractStream, () => {
  beforeEach(async () => {
    tempHome = await mkTempDirAsync();
  });

  afterEach(async () => {
    await rm(tempHome, { force: true, recursive: true });
  });

  it('supports checksum, strip, filter, and rename options', async () => {
    const outputPath = path.join(tempHome, 'output');
    const archive = await createTarGzipBufferAsync([
      { type: 'file', name: 'package/app.json', contents: '{}' },
      { type: 'file', name: 'package/gitignore', contents: 'node_modules' },
      { type: 'file', name: 'package/skip.txt', contents: 'skip' },
    ]);

    const checksum = await extractStream(
      Readable.toWeb(Readable.from(archive)) as ReadableStream,
      outputPath,
      {
        checksumAlgorithm: 'sha256',
        filter: name => !name.endsWith('skip.txt'),
        rename: name => name.replace('/gitignore', '/.gitignore'),
        strip: 1,
      }
    );

    expect(checksum).toBe(createHash('sha256').update(archive).digest('hex'));
    expect(await readFile(path.join(outputPath, 'app.json'), 'utf8')).toBe('{}');
    expect(await readFile(path.join(outputPath, '.gitignore'), 'utf8')).toBe('node_modules');
    expect(await pathExistsAsync(path.join(outputPath, 'skip.txt'))).toBe(false);
  });
});

async function mkTempDirAsync(): Promise<string> {
  const prefix = path.join(tmpdir(), 'expo-go-tar-test-');
  return await mkdtemp(prefix);
}

async function pathExistsAsync(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

type TestTarEntry =
  | { type: 'file'; name: string; contents: string }
  | { type: 'symlink' | 'hardlink'; name: string; linkname: string };

async function writeTarGzipAsync(filePath: string, entries: TestTarEntry[]): Promise<void> {
  await writeFile(filePath, await createTarGzipBufferAsync(entries));
}

async function createTarGzipBufferAsync(entries: TestTarEntry[]): Promise<Buffer> {
  const tarEntries = entries.map(entry => {
    if (entry.type === 'file') {
      const contents = new TextEncoder().encode(entry.contents);
      return new TarFile([contents], {
        ...createTarHeader(entry.name, TarTypeFlag.FILE),
        size: contents.byteLength,
      });
    }

    return new TarChunk([], {
      ...createTarHeader(
        entry.name,
        entry.type === 'symlink' ? TarTypeFlag.SYMLINK : TarTypeFlag.LINK
      ),
      linkname: entry.linkname,
    });
  });
  const chunks: Buffer[] = [];
  for await (const chunk of tar(tarEntries)) {
    chunks.push(Buffer.from(chunk));
  }
  return gzipSync(Buffer.concat(chunks));
}

function createTarHeader(name: string, typeflag: TarTypeFlag) {
  return {
    name,
    mode: 0o644,
    uid: 0,
    gid: 0,
    size: 0,
    mtime: 0,
    typeflag,
    linkname: null,
    uname: null,
    gname: null,
    devmajor: 0,
    devminor: 0,
  };
}
