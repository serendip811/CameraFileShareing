import { reassembleChunks } from '../protocol/chunker';
import { sha256Hex } from '../protocol/checksum';
import { encodeMissingRanges, getMissingIndexes } from '../protocol/missingRanges';
import {
  PROTOCOL_VERSION,
  type AckPacket,
  type DataPacket,
  type FileManifest,
  type NackPacket,
  type TransferPacket,
} from '../protocol/types';

export interface ReceiverState {
  manifest: FileManifest | null;
  chunks: Map<number, Uint8Array>;
  rejectedFrames: number;
}

export interface ReceiverProgress {
  receivedChunks: number;
  totalChunks: number;
  missingChunks: number;
}

export interface VerifiedFile {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

export function createReceiverState(): ReceiverState {
  return {
    manifest: null,
    chunks: new Map(),
    rejectedFrames: 0,
  };
}

export function ingestPacket(state: ReceiverState, packet: TransferPacket): ReceiverState {
  if (packet.type === 'manifest') {
    if (state.manifest === null) {
      return {
        manifest: packet,
        chunks: new Map(),
        rejectedFrames: state.rejectedFrames,
      };
    }

    if (isSameManifest(state.manifest, packet)) {
      return state;
    }

    return {
      ...state,
      rejectedFrames: state.rejectedFrames + 1,
    };
  }

  if (packet.type !== 'data') {
    return state;
  }

  if (state.manifest === null || !isExpectedDataPacket(state.manifest, packet)) {
    return { ...state, rejectedFrames: state.rejectedFrames + 1 };
  }

  const existing = state.chunks.get(packet.chunkIndex);
  if (existing !== undefined && bytesEqual(existing, packet.payload)) {
    return state;
  }

  const chunks = new Map(state.chunks);
  chunks.set(packet.chunkIndex, packet.payload);
  return { ...state, chunks };
}

export function getReceiverProgress(state: ReceiverState): ReceiverProgress {
  const totalChunks = state.manifest?.totalChunks ?? 0;
  const missingChunks = totalChunks === 0 ? 0 : getMissingIndexes(new Set(state.chunks.keys()), totalChunks).length;
  return {
    receivedChunks: state.chunks.size,
    totalChunks,
    missingChunks,
  };
}

export async function verifyReceiverState(state: ReceiverState): Promise<AckPacket | NackPacket> {
  if (state.manifest === null) {
    throw new Error('Cannot verify without manifest');
  }

  const missing = getMissingIndexes(new Set(state.chunks.keys()), state.manifest.totalChunks);
  if (missing.length > 0) {
    return createNack(state.manifest, missing);
  }

  const chunks = getOrderedChunks(state);
  if (chunks === null) {
    return createNack(state.manifest, getAllChunkIndexes(state.manifest.totalChunks));
  }

  const bytes = tryReassembleChunks(chunks, state.manifest.fileSize);
  if (bytes === null) {
    return createNack(state.manifest, getAllChunkIndexes(state.manifest.totalChunks));
  }

  const sha256 = await sha256Hex(bytes);
  if (sha256 !== state.manifest.sha256) {
    return createNack(state.manifest, getAllChunkIndexes(state.manifest.totalChunks));
  }

  return {
    version: PROTOCOL_VERSION,
    transferId: state.manifest.transferId,
    type: 'ack',
    sha256,
  };
}

export async function buildVerifiedFile(state: ReceiverState): Promise<VerifiedFile | null> {
  if (state.manifest === null) {
    return null;
  }

  const verdict = await verifyReceiverState(state);
  if (verdict.type !== 'ack') {
    return null;
  }

  const chunks = getOrderedChunks(state);
  if (chunks === null) {
    return null;
  }

  const bytes = tryReassembleChunks(chunks, state.manifest.fileSize);
  if (bytes === null) {
    return null;
  }

  return {
    bytes,
    fileName: state.manifest.fileName,
    mimeType: state.manifest.mimeType,
  };
}

function createNack(manifest: FileManifest, missing: number[]): NackPacket {
  return {
    version: PROTOCOL_VERSION,
    transferId: manifest.transferId,
    type: 'nack',
    missingRanges: encodeMissingRanges(missing),
  };
}

function getOrderedChunks(state: ReceiverState): Uint8Array[] | null {
  if (state.manifest === null) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  for (let index = 0; index < state.manifest.totalChunks; index += 1) {
    const chunk = state.chunks.get(index);
    if (chunk === undefined) {
      return null;
    }
    chunks.push(chunk);
  }
  return chunks;
}

function isExpectedDataPacket(manifest: FileManifest, packet: DataPacket): boolean {
  return (
    packet.transferId === manifest.transferId &&
    packet.totalChunks === manifest.totalChunks &&
    Number.isSafeInteger(packet.chunkIndex) &&
    packet.chunkIndex >= 0 &&
    packet.chunkIndex < manifest.totalChunks
  );
}

function isSameManifest(current: FileManifest, incoming: FileManifest): boolean {
  return (
    incoming.transferId === current.transferId &&
    incoming.fileName === current.fileName &&
    incoming.mimeType === current.mimeType &&
    incoming.fileSize === current.fileSize &&
    incoming.chunkSize === current.chunkSize &&
    incoming.totalChunks === current.totalChunks &&
    incoming.sha256 === current.sha256
  );
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function getAllChunkIndexes(totalChunks: number): number[] {
  return Array.from({ length: totalChunks }, (_, index) => index);
}

function tryReassembleChunks(chunks: Uint8Array[], fileSize: number): Uint8Array | null {
  try {
    return reassembleChunks(chunks, fileSize);
  } catch (error) {
    if (error instanceof Error && error.message === 'Chunk byte total does not match totalBytes') {
      return null;
    }
    throw error;
  }
}
