import {
  MAX_FILE_SIZE_BYTES,
  PROTOCOL_VERSION,
  type FileManifest,
} from './types';
import {
  validateFileName,
  validateManifestChunkCount,
  validateMimeType,
  validateMissingRangeSyntax,
  validateNonEmptyFileSize,
  validateTransferId,
} from './validation';

export interface TransferOfferPacket extends FileManifest {
  version: typeof PROTOCOL_VERSION;
  type: 'offer';
}

export interface ChunkRequestPacket {
  version: typeof PROTOCOL_VERSION;
  transferId: string;
  type: 'request';
  missingRanges: string;
}

export type ControlPacket = TransferOfferPacket | ChunkRequestPacket;

type WireControlPacket =
  | {
      v: typeof PROTOCOL_VERSION;
      id: string;
      t: 'offer';
      name: string;
      mime: string;
      size: number;
      chunkSize: number;
      chunks: number;
      sha256: string;
    }
  | {
      v: typeof PROTOCOL_VERSION;
      id: string;
      t: 'request';
      missing: string;
    };

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export function createOfferPacket(manifest: FileManifest): TransferOfferPacket {
  return {
    ...manifest,
    version: PROTOCOL_VERSION,
    type: 'offer',
  };
}

export function createChunkRequestPacket(transferId: string, missingRanges: string): ChunkRequestPacket {
  validateTransferId(transferId);
  validateMissingRangeSyntax(missingRanges);
  return {
    version: PROTOCOL_VERSION,
    transferId,
    type: 'request',
    missingRanges,
  };
}

export function encodeControlPacket(packet: ControlPacket): string {
  return JSON.stringify(toWire(packet));
}

export function decodeControlPacket(value: string): ControlPacket {
  const wire = parseWireControlPacket(value);
  if (wire.t === 'offer') {
    return {
      version: PROTOCOL_VERSION,
      transferId: wire.id,
      type: 'offer',
      fileName: wire.name,
      mimeType: wire.mime,
      fileSize: wire.size,
      chunkSize: wire.chunkSize,
      totalChunks: wire.chunks,
      sha256: wire.sha256,
    };
  }

  return {
    version: PROTOCOL_VERSION,
    transferId: wire.id,
    type: 'request',
    missingRanges: wire.missing,
  };
}

function parseWireControlPacket(value: string): WireControlPacket {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid control packet JSON');
  }

  if (!isRecord(parsed)) {
    throw new Error('Invalid control packet JSON');
  }

  validateVersion(parsed.v);
  const transferId = validateTransferId(parsed.id);

  if (parsed.t === 'offer') {
    const fileSize = validateFileSize(parsed.size);
    validateNonEmptyFileSize(fileSize);
    const chunkSize = validatePositiveInteger(parsed.chunkSize, 'Chunk size must be a positive integer');
    const totalChunks = validatePositiveInteger(parsed.chunks, 'Total chunks must be a positive integer');
    validateManifestChunkCount(fileSize, chunkSize, totalChunks);

    return {
      v: PROTOCOL_VERSION,
      id: transferId,
      t: 'offer',
      name: validateFileName(parsed.name),
      mime: validateMimeType(parsed.mime),
      size: fileSize,
      chunkSize,
      chunks: totalChunks,
      sha256: validateSha256(parsed.sha256),
    };
  }

  if (parsed.t === 'request') {
    const missing = validateString(parsed.missing, 'Missing ranges must be a string');
    validateMissingRangeSyntax(missing);
    return {
      v: PROTOCOL_VERSION,
      id: transferId,
      t: 'request',
      missing,
    };
  }

  throw new Error('Unknown control packet type');
}

function toWire(packet: ControlPacket): WireControlPacket {
  if (packet.type === 'offer') {
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

  return {
    v: packet.version,
    id: packet.transferId,
    t: packet.type,
    missing: packet.missingRanges,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateVersion(value: unknown): void {
  if (value !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${String(value)}`);
  }
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
