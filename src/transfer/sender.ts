import { crc32Hex } from '../protocol/checksum';
import { splitIntoChunks } from '../protocol/chunker';
import { createManifestFromBytes } from '../protocol/fileManifest';
import { expandMissingRanges } from '../protocol/missingRanges';
import {
  PROTOCOL_VERSION,
  type DataPacket,
  type FileManifest,
  type ManifestPacket,
  type NackPacket,
  type TransferPacket,
} from '../protocol/types';

interface PrepareSenderInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  chunkSize: number;
  transferId?: string;
}

export interface SenderTransfer {
  manifest: FileManifest;
  chunks: Uint8Array[];
  dataPackets: DataPacket[];
  packets: TransferPacket[];
}

export async function prepareSenderTransfer(input: PrepareSenderInput): Promise<SenderTransfer> {
  const manifest = await createManifestFromBytes(input);
  const chunks = splitIntoChunks(input.bytes, manifest.chunkSize);
  const manifestPacket: ManifestPacket = {
    version: PROTOCOL_VERSION,
    type: 'manifest',
    ...manifest,
  };
  const dataPackets = chunks.map<DataPacket>((payload, chunkIndex) => ({
    version: PROTOCOL_VERSION,
    transferId: manifest.transferId,
    type: 'data',
    chunkIndex,
    totalChunks: manifest.totalChunks,
    payload,
    crc32: crc32Hex(payload),
  }));

  return {
    manifest,
    chunks,
    dataPackets,
    packets: [manifestPacket, ...dataPackets],
  };
}

export function selectRepairPackets(transfer: SenderTransfer, missingRanges: string): DataPacket[] {
  const requested = new Set(expandMissingRanges(missingRanges, transfer.manifest.totalChunks));
  return transfer.dataPackets.filter((packet) => requested.has(packet.chunkIndex));
}

export function selectRepairPacketsForNack(transfer: SenderTransfer, nack: NackPacket): DataPacket[] {
  if (nack.transferId !== transfer.manifest.transferId) {
    throw new Error('NACK transfer ID does not match transfer');
  }
  return selectRepairPackets(transfer, nack.missingRanges);
}
