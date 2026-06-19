const TRANSFER_ID_PATTERN = /^[0-9a-f]{16}$/;
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1f\x7f]/;
const SLASH_PATTERN = /[\\/]/;

export function validateTransferId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Transfer ID must be a non-empty string');
  }
  if (!TRANSFER_ID_PATTERN.test(value)) {
    throw new Error('Transfer ID must be 16 lowercase hex characters');
  }
  return value;
}

export function validateFileName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('File name must be a string');
  }
  if (value.length === 0) {
    throw new Error('File name must be non-empty');
  }
  if (value.length > 255) {
    throw new Error('File name must be at most 255 characters');
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new Error('File name must not contain control characters');
  }
  if (SLASH_PATTERN.test(value)) {
    throw new Error('File name must not contain slash characters');
  }
  return value;
}

export function validateMimeType(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('MIME type must be a string');
  }
  if (value.length === 0) {
    throw new Error('MIME type must be non-empty');
  }
  if (value.length > 127) {
    throw new Error('MIME type must be at most 127 characters');
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new Error('MIME type must not contain control characters');
  }
  return value;
}

export function validateNonEmptyFileSize(fileSize: number): void {
  if (fileSize === 0) {
    throw new Error('File must not be empty');
  }
}

export function calculateTotalChunks(fileSize: number, chunkSize: number): number {
  return Math.ceil(fileSize / chunkSize);
}

export function validateManifestChunkCount(fileSize: number, chunkSize: number, totalChunks: number): void {
  if (totalChunks !== calculateTotalChunks(fileSize, chunkSize)) {
    throw new Error('Manifest chunk count does not match file size and chunk size');
  }
}

export function validateMissingRangeSyntax(value: string): void {
  if (value === '') {
    return;
  }

  for (const part of value.split(',')) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (match === null) {
      throw new Error(`Invalid missing range: ${part}`);
    }

    const [, startText, endText] = match;
    const start = BigInt(startText);
    const end = endText === undefined ? start : BigInt(endText);
    if (end < start) {
      throw new Error(`Invalid missing range: ${part}`);
    }
  }
}
