import { concatChunks } from './binary';

export function splitIntoChunks(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  if (chunkSize <= 0) {
    throw new Error('Chunk size must be positive');
  }
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.slice(offset, Math.min(offset + chunkSize, bytes.byteLength)));
  }
  return chunks;
}

export function reassembleChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  return concatChunks(chunks, totalBytes);
}
