import { describe, expect, it } from 'vitest';
import { decodePacket, encodePacket } from './packetCodec';
import { PROTOCOL_VERSION, type DataPacket } from './types';

const VALID_TRANSFER_ID = '0123456789abcdef';
const VALID_SHA256 = 'a'.repeat(64);

describe('packetCodec', () => {
  it('round-trips a data packet', () => {
    const packet: DataPacket = {
      version: PROTOCOL_VERSION,
      transferId: VALID_TRANSFER_ID,
      type: 'data',
      chunkIndex: 2,
      totalChunks: 4,
      payload: new Uint8Array([9, 8, 7]),
      crc32: 'a62dfd36',
    };
    expect(decodePacket(encodePacket(packet))).toEqual(packet);
  });

  it('rejects bad data CRC', () => {
    const encoded = encodePacket({
      version: PROTOCOL_VERSION,
      transferId: VALID_TRANSFER_ID,
      type: 'data',
      chunkIndex: 0,
      totalChunks: 1,
      payload: new Uint8Array([1, 2, 3]),
      crc32: '55bc801d',
    });
    expect(() => decodePacket(encoded.replace('55bc801d', '00000000'))).toThrow('CRC mismatch');
  });

  it('rejects invalid JSON', () => {
    expect(() => decodePacket('not json')).toThrow('Invalid packet JSON');
  });

  it('rejects unsupported protocol versions', () => {
    expect(() => decodePacket(JSON.stringify({ v: 2, id: VALID_TRANSFER_ID, t: 'ack', sha256: VALID_SHA256 }))).toThrow(
      'Unsupported protocol version: 2',
    );
  });

  it('rejects unknown packet types', () => {
    expect(() => decodePacket(JSON.stringify({ v: PROTOCOL_VERSION, id: VALID_TRANSFER_ID, t: 'other' }))).toThrow(
      'Unknown packet type',
    );
  });

  it('rejects empty transfer ids', () => {
    expect(() => decodePacket(JSON.stringify({ v: PROTOCOL_VERSION, id: '', t: 'ack', sha256: VALID_SHA256 }))).toThrow(
      'Transfer ID must be a non-empty string',
    );
  });

  it('rejects transfer ids that are not 16 lowercase hex characters', () => {
    const invalidTransferIds = ['transfer-1', '0123456789abcde', '0123456789abcdeg', '0123456789ABCDE'];
    for (const transferId of invalidTransferIds) {
      expect(() =>
        decodePacket(JSON.stringify({ v: PROTOCOL_VERSION, id: transferId, t: 'ack', sha256: VALID_SHA256 })),
      ).toThrow('Transfer ID must be 16 lowercase hex characters');
    }
  });

  it('validates manifest fields before constructing a packet', () => {
    const wire = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'manifest',
      name: 'file.txt',
      mime: 'text/plain',
      size: 1024 * 1024 + 1,
      chunkSize: 512,
      chunks: 1,
      sha256: VALID_SHA256,
    };
    expect(() => decodePacket(JSON.stringify(wire))).toThrow('File size must be between 0 and 1MB');
  });

  it('validates manifest numeric fields', () => {
    const validManifest = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'manifest',
      name: 'file.txt',
      mime: 'text/plain',
      size: 1,
      chunkSize: 512,
      chunks: 1,
      sha256: VALID_SHA256,
    };
    const invalidCases = [
      [{ size: -1 }, 'File size must be a non-negative integer'],
      [{ size: 1.5 }, 'File size must be a non-negative integer'],
      [{ chunkSize: 0 }, 'Chunk size must be a positive integer'],
      [{ chunkSize: 1.5 }, 'Chunk size must be a positive integer'],
      [{ chunks: 0 }, 'Total chunks must be a positive integer'],
      [{ chunks: 1.5 }, 'Total chunks must be a positive integer'],
    ] as const;

    for (const [override, message] of invalidCases) {
      expect(() => decodePacket(JSON.stringify({ ...validManifest, ...override }))).toThrow(message);
    }
  });

  it('rejects zero-size manifest packets', () => {
    const wire = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'manifest',
      name: 'file.txt',
      mime: 'text/plain',
      size: 0,
      chunkSize: 512,
      chunks: 0,
      sha256: VALID_SHA256,
    };
    expect(() => decodePacket(JSON.stringify(wire))).toThrow('File must not be empty');
  });

  it('rejects manifest chunk counts that do not match size and chunk size', () => {
    const validManifest = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'manifest',
      name: 'file.txt',
      mime: 'text/plain',
      size: 5,
      chunkSize: 2,
      chunks: 3,
      sha256: VALID_SHA256,
    };
    expect(() => decodePacket(JSON.stringify({ ...validManifest, chunks: 2 }))).toThrow(
      'Manifest chunk count does not match file size and chunk size',
    );
    expect(() => decodePacket(JSON.stringify({ ...validManifest, chunks: 4 }))).toThrow(
      'Manifest chunk count does not match file size and chunk size',
    );
  });

  it('rejects invalid manifest file names and MIME types', () => {
    const validManifest = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'manifest',
      name: 'file.txt',
      mime: 'text/plain',
      size: 1,
      chunkSize: 512,
      chunks: 1,
      sha256: VALID_SHA256,
    };
    const invalidCases = [
      [{ name: '' }, 'File name must be non-empty'],
      [{ name: 'a'.repeat(256) }, 'File name must be at most 255 characters'],
      [{ name: 'folder/file.txt' }, 'File name must not contain slash characters'],
      [{ name: 'folder\\file.txt' }, 'File name must not contain slash characters'],
      [{ name: 'bad\u0000name.txt' }, 'File name must not contain control characters'],
      [{ mime: '' }, 'MIME type must be non-empty'],
      [{ mime: 'a'.repeat(128) }, 'MIME type must be at most 127 characters'],
      [{ mime: 'text/\u0000plain' }, 'MIME type must not contain control characters'],
    ] as const;

    for (const [override, message] of invalidCases) {
      expect(() => decodePacket(JSON.stringify({ ...validManifest, ...override }))).toThrow(message);
    }
  });

  it('rejects malformed SHA-256 values in manifest and ACK packets', () => {
    const manifest = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'manifest',
      name: 'file.txt',
      mime: 'text/plain',
      size: 1,
      chunkSize: 512,
      chunks: 1,
      sha256: 'A'.repeat(64),
    };
    const ack = { v: PROTOCOL_VERSION, id: VALID_TRANSFER_ID, t: 'ack', sha256: 'abc' };
    expect(() => decodePacket(JSON.stringify(manifest))).toThrow('SHA-256 must be 64 lowercase hex characters');
    expect(() => decodePacket(JSON.stringify(ack))).toThrow('SHA-256 must be 64 lowercase hex characters');
  });

  it('validates data indexes and Base64URL payload grammar', () => {
    const badIndex = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'data',
      i: 1,
      chunks: 1,
      p: 'AQID',
      crc: '55bc801d',
    };
    const badPayload = { ...badIndex, i: 0, p: 'AQI+' };
    expect(() => decodePacket(JSON.stringify(badIndex))).toThrow('Chunk index must be less than total chunks');
    expect(() => decodePacket(JSON.stringify(badPayload))).toThrow('Payload must be Base64URL encoded');
  });

  it('validates data numeric fields', () => {
    const validData = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'data',
      i: 0,
      chunks: 1,
      p: 'AQID',
      crc: '55bc801d',
    };
    const invalidCases = [
      [{ i: -1 }, 'Chunk index must be a non-negative integer'],
      [{ i: 1.5 }, 'Chunk index must be a non-negative integer'],
      [{ chunks: 0 }, 'Total chunks must be a positive integer'],
      [{ chunks: 1.5 }, 'Total chunks must be a positive integer'],
    ] as const;

    for (const [override, message] of invalidCases) {
      expect(() => decodePacket(JSON.stringify({ ...validData, ...override }))).toThrow(message);
    }
  });

  it('rejects malformed CRC values before comparing payload checksums', () => {
    const wire = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'data',
      i: 0,
      chunks: 1,
      p: 'AQID',
      crc: '55BC801D',
    };
    expect(() => decodePacket(JSON.stringify(wire))).toThrow('CRC must be 8 lowercase hex characters');
  });

  it('rejects non-canonical Base64URL payloads before comparing CRC', () => {
    const wire = {
      v: PROTOCOL_VERSION,
      id: VALID_TRANSFER_ID,
      t: 'data',
      i: 0,
      chunks: 1,
      p: 'AR',
      crc: 'a505df1b',
    };
    expect(() => decodePacket(JSON.stringify(wire))).toThrow('Payload must be canonical Base64URL encoded');
  });

  it('validates NACK missing range grammar', () => {
    for (const missing of ['0-', '1-2-3', 'a', '2-1']) {
      const wire = { v: PROTOCOL_VERSION, id: VALID_TRANSFER_ID, t: 'nack', missing };
      expect(() => decodePacket(JSON.stringify(wire))).toThrow('Invalid missing range');
    }
  });

  it('decodes a syntactically valid large NACK range without applying transfer bounds', () => {
    const wire = { v: PROTOCOL_VERSION, id: VALID_TRANSFER_ID, t: 'nack', missing: '0-1048576' };
    expect(decodePacket(JSON.stringify(wire))).toEqual({
      version: PROTOCOL_VERSION,
      transferId: VALID_TRANSFER_ID,
      type: 'nack',
      missingRanges: '0-1048576',
    });
  });
});
