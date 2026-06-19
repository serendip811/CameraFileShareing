import { sha256Hex } from './checksum';
import { MAX_FILE_SIZE_BYTES, type FileManifest } from './types';
import {
  calculateTotalChunks,
  validateFileName,
  validateMimeType,
  validateNonEmptyFileSize,
  validateTransferId,
} from './validation';

interface CreateManifestInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  chunkSize: number;
  transferId?: string;
}

export function enforceMvpFileLimit(fileSize: number): void {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw new Error('File size must be a non-negative integer');
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error('MVP file limit is 1MB');
  }
}

export function createTransferId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createManifestFromBytes(input: CreateManifestInput): Promise<FileManifest> {
  validateChunkSize(input.chunkSize);
  enforceMvpFileLimit(input.bytes.byteLength);
  validateNonEmptyFileSize(input.bytes.byteLength);

  const transferId = input.transferId === undefined ? createTransferId() : validateTransferId(input.transferId);
  const fileName = validateFileName(input.fileName);
  const mimeType = validateMimeType(input.mimeType);

  return {
    transferId,
    fileName,
    mimeType,
    fileSize: input.bytes.byteLength,
    chunkSize: input.chunkSize,
    totalChunks: calculateTotalChunks(input.bytes.byteLength, input.chunkSize),
    sha256: await sha256Hex(input.bytes),
  };
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  enforceMvpFileLimit(file.size);
  validateNonEmptyFileSize(file.size);
  return new Uint8Array(await file.arrayBuffer());
}

function validateChunkSize(chunkSize: number): void {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('Chunk size must be a positive integer');
  }
}
