import { describe, expect, it } from 'vitest';
import { crc32Hex, sha256Hex } from './checksum';

describe('checksum helpers', () => {
  it('computes a stable CRC32 hex value', () => {
    expect(crc32Hex(new TextEncoder().encode('123456789'))).toBe('cbf43926');
  });

  it('computes SHA-256 hex', async () => {
    await expect(sha256Hex(new TextEncoder().encode('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
