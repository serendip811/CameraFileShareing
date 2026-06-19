import { describe, expect, it } from 'vitest';
import { createManifestFromBytes, enforceMvpFileLimit, readFileBytes } from './fileManifest';

const VALID_TRANSFER_ID = '0123456789abcdef';

describe('fileManifest', () => {
  it('creates a deterministic manifest from bytes', async () => {
    const manifest = await createManifestFromBytes({
      bytes: new TextEncoder().encode('hello'),
      fileName: 'hello.txt',
      mimeType: 'text/plain',
      chunkSize: 2,
      transferId: VALID_TRANSFER_ID,
    });
    expect(manifest).toMatchObject({
      transferId: VALID_TRANSFER_ID,
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
          transferId: VALID_TRANSFER_ID,
        }),
      ).rejects.toThrow('Chunk size must be a positive integer');
    }
  });

  it('rejects zero-byte files', async () => {
    await expect(
      createManifestFromBytes({
        bytes: new Uint8Array(),
        fileName: 'empty.txt',
        mimeType: 'text/plain',
        chunkSize: 512,
        transferId: VALID_TRANSFER_ID,
      }),
    ).rejects.toThrow('File must not be empty');
  });

  it('rejects caller-provided transfer IDs that are not 16 lowercase hex characters', async () => {
    for (const transferId of ['fixed-id', '0123456789abcde', '0123456789abcdeg', '0123456789ABCDE']) {
      await expect(
        createManifestFromBytes({
          bytes: new Uint8Array([1]),
          fileName: 'file.bin',
          mimeType: 'application/octet-stream',
          chunkSize: 512,
          transferId,
        }),
      ).rejects.toThrow('Transfer ID must be 16 lowercase hex characters');
    }
  });

  it('rejects invalid file names and MIME types', async () => {
    const invalidCases = [
      [{ fileName: '' }, 'File name must be non-empty'],
      [{ fileName: 'a'.repeat(256) }, 'File name must be at most 255 characters'],
      [{ fileName: 'folder/file.txt' }, 'File name must not contain slash characters'],
      [{ fileName: 'folder\\file.txt' }, 'File name must not contain slash characters'],
      [{ fileName: 'bad\u0000name.txt' }, 'File name must not contain control characters'],
      [{ mimeType: '' }, 'MIME type must be non-empty'],
      [{ mimeType: 'a'.repeat(128) }, 'MIME type must be at most 127 characters'],
      [{ mimeType: 'text/\u0000plain' }, 'MIME type must not contain control characters'],
    ] as const;

    for (const [override, message] of invalidCases) {
      await expect(
        createManifestFromBytes({
          bytes: new Uint8Array([1]),
          fileName: 'file.bin',
          mimeType: 'application/octet-stream',
          chunkSize: 512,
          transferId: VALID_TRANSFER_ID,
          ...override,
        }),
      ).rejects.toThrow(message);
    }
  });

  it('readFileBytes enforces the 1MB limit', async () => {
    const file = new File([new Uint8Array(1024 * 1024 + 1)], 'too-large.bin');
    await expect(readFileBytes(file)).rejects.toThrow('MVP file limit is 1MB');
  });

  it('readFileBytes rejects empty files', async () => {
    const file = new File([], 'empty.bin');
    await expect(readFileBytes(file)).rejects.toThrow('File must not be empty');
  });
});
