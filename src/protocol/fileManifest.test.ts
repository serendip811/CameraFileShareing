import { describe, expect, it } from 'vitest';
import { createManifestFromBytes, enforceMvpFileLimit, readFileBytes } from './fileManifest';

describe('fileManifest', () => {
  it('creates a deterministic manifest from bytes', async () => {
    const manifest = await createManifestFromBytes({
      bytes: new TextEncoder().encode('hello'),
      fileName: 'hello.txt',
      mimeType: 'text/plain',
      chunkSize: 2,
      transferId: 'fixed-id',
    });
    expect(manifest).toMatchObject({
      transferId: 'fixed-id',
      fileName: 'hello.txt',
      mimeType: 'text/plain',
      fileSize: 5,
      chunkSize: 2,
      totalChunks: 3,
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    });
  });

  it('rejects files over 1MB', () => {
    expect(() => enforceMvpFileLimit(1024 * 1024 + 1)).toThrow('MVP file limit is 1MB');
  });

  it('rejects non-positive and fractional chunk sizes', async () => {
    for (const chunkSize of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        createManifestFromBytes({
          bytes: new Uint8Array([1]),
          fileName: 'file.bin',
          mimeType: 'application/octet-stream',
          chunkSize,
          transferId: 'fixed-id',
        }),
      ).rejects.toThrow('Chunk size must be a positive integer');
    }
  });

  it('readFileBytes enforces the 1MB limit', async () => {
    const file = new File([new Uint8Array(1024 * 1024 + 1)], 'too-large.bin');
    await expect(readFileBytes(file)).rejects.toThrow('MVP file limit is 1MB');
  });
});
