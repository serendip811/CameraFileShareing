import { base64UrlDecode, base64UrlEncode } from './binary';
import { crc32Hex } from './checksum';
import { expandMissingRanges } from './missingRanges';
import { MAX_FILE_SIZE_BYTES, PROTOCOL_VERSION, type TransferPacket } from './types';

type WirePacket =
  | {
      v: typeof PROTOCOL_VERSION;
      id: string;
      t: 'manifest';
      name: string;
      mime: string;
      size: number;
      chunkSize: number;
      chunks: number;
      sha256: string;
    }
  | { v: typeof PROTOCOL_VERSION; id: string; t: 'data'; i: number; chunks: number; p: string; crc: string }
  | { v: typeof PROTOCOL_VERSION; id: string; t: 'ack'; sha256: string }
  | { v: typeof PROTOCOL_VERSION; id: string; t: 'nack'; missing: string };

type JsonRecord = Record<string, unknown>;

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const CRC32_HEX_PATTERN = /^[0-9a-f]{8}$/;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]*$/;
const MAX_NACK_CHUNKS = MAX_FILE_SIZE_BYTES;

export function encodePacket(packet: TransferPacket): string {
  return JSON.stringify(toWire(packet));
}

export function decodePacket(value: string): TransferPacket {
  const wire = parseWirePacket(value);
  if (wire.t === 'manifest') {
    return {
      version: PROTOCOL_VERSION,
      transferId: wire.id,
      type: 'manifest',
      fileName: wire.name,
      mimeType: wire.mime,
      fileSize: wire.size,
      chunkSize: wire.chunkSize,
      totalChunks: wire.chunks,
      sha256: wire.sha256,
    };
  }
  if (wire.t === 'data') {
    const payload = base64UrlDecode(wire.p);
    const actualCrc = crc32Hex(payload);
    if (actualCrc !== wire.crc) {
      throw new Error('CRC mismatch');
    }
    return {
      version: PROTOCOL_VERSION,
      transferId: wire.id,
      type: 'data',
      chunkIndex: wire.i,
      totalChunks: wire.chunks,
      payload,
      crc32: wire.crc,
    };
  }
  if (wire.t === 'ack') {
    return {
      version: PROTOCOL_VERSION,
      transferId: wire.id,
      type: 'ack',
      sha256: wire.sha256,
    };
  }
  return {
    version: PROTOCOL_VERSION,
    transferId: wire.id,
    type: 'nack',
    missingRanges: wire.missing,
  };
}

function parseWirePacket(value: string): WirePacket {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid packet JSON');
  }

  if (!isRecord(parsed)) {
    throw new Error('Invalid packet JSON');
  }

  validateVersion(parsed.v);
  const transferId = validateTransferId(parsed.id);

  if (parsed.t === 'manifest') {
    return {
      v: PROTOCOL_VERSION,
      id: transferId,
      t: 'manifest',
      name: validateString(parsed.name, 'File name must be a string'),
      mime: validateString(parsed.mime, 'MIME type must be a string'),
      size: validateFileSize(parsed.size),
      chunkSize: validatePositiveInteger(parsed.chunkSize, 'Chunk size must be a positive integer'),
      chunks: validatePositiveInteger(parsed.chunks, 'Total chunks must be a positive integer'),
      sha256: validateSha256(parsed.sha256),
    };
  }

  if (parsed.t === 'data') {
    const chunkIndex = validateNonNegativeInteger(parsed.i, 'Chunk index must be a non-negative integer');
    const totalChunks = validatePositiveInteger(parsed.chunks, 'Total chunks must be a positive integer');
    if (chunkIndex >= totalChunks) {
      throw new Error('Chunk index must be less than total chunks');
    }
    return {
      v: PROTOCOL_VERSION,
      id: transferId,
      t: 'data',
      i: chunkIndex,
      chunks: totalChunks,
      p: validateBase64UrlPayload(parsed.p),
      crc: validateCrc32(parsed.crc),
    };
  }

  if (parsed.t === 'ack') {
    return { v: PROTOCOL_VERSION, id: transferId, t: 'ack', sha256: validateSha256(parsed.sha256) };
  }

  if (parsed.t === 'nack') {
    const missing = validateString(parsed.missing, 'Missing ranges must be a string');
    expandMissingRanges(missing, MAX_NACK_CHUNKS);
    return { v: PROTOCOL_VERSION, id: transferId, t: 'nack', missing };
  }

  throw new Error('Unknown packet type');
}

function toWire(packet: TransferPacket): WirePacket {
  if (packet.type === 'manifest') {
    return {
      v: packet.version,
      id: packet.transferId,
      t: packet.type,
      name: packet.fileName,
      mime: packet.mimeType,
      size: packet.fileSize,
      chunkSize: packet.chunkSize,
      chunks: packet.totalChunks,
      sha256: packet.sha256,
    };
  }
  if (packet.type === 'data') {
    return {
      v: packet.version,
      id: packet.transferId,
      t: packet.type,
      i: packet.chunkIndex,
      chunks: packet.totalChunks,
      p: base64UrlEncode(packet.payload),
      crc: packet.crc32,
    };
  }
  if (packet.type === 'ack') {
    return { v: packet.version, id: packet.transferId, t: packet.type, sha256: packet.sha256 };
  }
  return { v: packet.version, id: packet.transferId, t: packet.type, missing: packet.missingRanges };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateVersion(value: unknown): void {
  if (value !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${String(value)}`);
  }
}

function validateTransferId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Transfer ID must be a non-empty string');
  }
  return value;
}

function validateString(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw new Error(message);
  }
  return value;
}

function validateFileSize(value: unknown): number {
  const fileSize = validateNonNegativeInteger(value, 'File size must be a non-negative integer');
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error('File size must be between 0 and 1MB');
  }
  return fileSize;
}

function validateNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}

function validatePositiveInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(message);
  }
  return value;
}

function validateSha256(value: unknown): string {
  if (typeof value !== 'string' || !SHA256_HEX_PATTERN.test(value)) {
    throw new Error('SHA-256 must be 64 lowercase hex characters');
  }
  return value;
}

function validateCrc32(value: unknown): string {
  if (typeof value !== 'string' || !CRC32_HEX_PATTERN.test(value)) {
    throw new Error('CRC must be 8 lowercase hex characters');
  }
  return value;
}

function validateBase64UrlPayload(value: unknown): string {
  if (typeof value !== 'string' || !BASE64_URL_PATTERN.test(value) || value.length % 4 === 1) {
    throw new Error('Payload must be Base64URL encoded');
  }
  return value;
}
