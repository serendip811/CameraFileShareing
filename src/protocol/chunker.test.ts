import { describe, expect, it } from 'vitest';
import { reassembleChunks, splitIntoChunks } from './chunker';

describe('chunker', () => {
  it('splits bytes into fixed-size chunks and reassembles them', () => {
    const input = new Uint8Array([1, 2, 3, 4, 5]);
    const chunks = splitIntoChunks(input, 2);
    expect(chunks).toEqual([new Uint8Array([1, 2]), new Uint8Array([3, 4]), new Uint8Array([5])]);
    expect(reassembleChunks(chunks, input.byteLength)).toEqual(input);
  });

  it('rejects invalid chunk sizes', () => {
    expect(() => splitIntoChunks(new Uint8Array([1]), 0)).toThrow('Chunk size must be positive');
  });
});
