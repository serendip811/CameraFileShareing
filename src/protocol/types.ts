export const PROTOCOL_VERSION = 1;
export const MAX_FILE_SIZE_BYTES = 1024 * 1024;
export const DEFAULT_CHUNK_SIZE_BYTES = 512;
export const DEFAULT_FRAME_INTERVAL_MS = 150;

export type PacketType = 'manifest' | 'data' | 'ack' | 'nack';

export interface FileManifest {
  transferId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  sha256: string;
}

export interface ManifestPacket extends FileManifest {
  version: typeof PROTOCOL_VERSION;
  type: 'manifest';
}

export interface DataPacket {
  version: typeof PROTOCOL_VERSION;
  transferId: string;
  type: 'data';
  chunkIndex: number;
  totalChunks: number;
  payload: Uint8Array;
  crc32: string;
}

export interface AckPacket {
  version: typeof PROTOCOL_VERSION;
  transferId: string;
  type: 'ack';
  sha256: string;
}

export interface NackPacket {
  version: typeof PROTOCOL_VERSION;
  transferId: string;
  type: 'nack';
  missingRanges: string;
}

export type TransferPacket = ManifestPacket | DataPacket | AckPacket | NackPacket;
