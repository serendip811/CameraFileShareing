import { describe, expect, it } from 'vitest';
import {
  createChunkRequestPacket,
  createOfferPacket,
  decodeControlPacket,
  encodeControlPacket,
  type TransferOfferPacket,
} from './controlPacket';
import { DEFAULT_CHUNK_SIZE_BYTES, PROTOCOL_VERSION } from './types';

const VALID_TRANSFER_ID = '0123456789abcdef';
const VALID_SHA256 = 'a'.repeat(64);

function createOffer(overrides: Partial<TransferOfferPacket> = {}): TransferOfferPacket {
  return {
    version: PROTOCOL_VERSION,
    type: 'offer',
    transferId: VALID_TRANSFER_ID,
    fileName: 'hello.txt',
    mimeType: 'text/plain',
    fileSize: 3,
    chunkSize: DEFAULT_CHUNK_SIZE_BYTES,
    totalChunks: 1,
    sha256: VALID_SHA256,
    ...overrides,
  };
}

describe('controlPacket', () => {
  it('round-trips a sender offer packet', () => {
    const offer = createOfferPacket({
      transferId: VALID_TRANSFER_ID,
      fileName: 'hello.txt',
      mimeType: 'text/plain',
      fileSize: 3,
      chunkSize: DEFAULT_CHUNK_SIZE_BYTES,
      totalChunks: 1,
      sha256: VALID_SHA256,
    });

    expect(decodeControlPacket(encodeControlPacket(offer))).toEqual(offer);
  });

  it('round-trips a receiver chunk request packet', () => {
    const request = createChunkRequestPacket(VALID_TRANSFER_ID, '0,2-4');

    expect(decodeControlPacket(encodeControlPacket(request))).toEqual(request);
  });

  it('rejects unknown control packet types', () => {
    expect(() => decodeControlPacket(JSON.stringify({ v: PROTOCOL_VERSION, id: VALID_TRANSFER_ID, t: 'ack' }))).toThrow(
      'Unknown control packet type',
    );
  });

  it('validates offer manifest fields', () => {
    expect(() => decodeControlPacket(encodeControlPacket(createOffer({ fileSize: 0, totalChunks: 0 })))).toThrow(
      'File must not be empty',
    );
    expect(() => decodeControlPacket(encodeControlPacket(createOffer({ sha256: 'A'.repeat(64) })))).toThrow(
      'SHA-256 must be 64 lowercase hex characters',
    );
  });

  it('validates request missing range grammar', () => {
    for (const missing of ['0-', '1-2-3', 'a', '2-1']) {
      expect(() => createChunkRequestPacket(VALID_TRANSFER_ID, missing)).toThrow('Invalid missing range');
      expect(() =>
        decodeControlPacket(JSON.stringify({ v: PROTOCOL_VERSION, id: VALID_TRANSFER_ID, t: 'request', missing })),
      ).toThrow('Invalid missing range');
    }
  });
});
