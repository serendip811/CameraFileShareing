import { describe, expect, it } from 'vitest';
import { base64UrlDecode, base64UrlEncode, concatChunks } from './binary';

describe('binary helpers', () => {
  it('round-trips bytes through Base64URL', () => {
    const input = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(base64UrlDecode(base64UrlEncode(input))).toEqual(input);
  });

  it('concatenates chunks in order', () => {
    const output = concatChunks([new Uint8Array([1, 2]), new Uint8Array([3])], 3);
    expect(Array.from(output)).toEqual([1, 2, 3]);
  });

  it('rejects chunks with fewer bytes than the expected total', () => {
    expect(() => concatChunks([new Uint8Array([1, 2])], 3)).toThrow('Chunk byte total does not match totalBytes');
  });

  it('rejects chunks with more bytes than the expected total', () => {
    expect(() => concatChunks([new Uint8Array([1, 2, 3])], 2)).toThrow('Chunk byte total does not match totalBytes');
  });
});
