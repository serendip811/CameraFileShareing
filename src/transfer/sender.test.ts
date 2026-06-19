import { describe, expect, it } from 'vitest';
import { prepareSenderTransfer, selectRepairPackets, selectRepairPacketsForNack } from './sender';
import { PROTOCOL_VERSION, type NackPacket } from '../protocol/types';

const TRANSFER_ID = '0123456789abcdef';
const OTHER_TRANSFER_ID = 'fedcba9876543210';

describe('sender transfer', () => {
  it('builds manifest and data packets', async () => {
    const transfer = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    expect(transfer.manifest.totalChunks).toBe(2);
    expect(transfer.packets.map((packet) => packet.type)).toEqual(['manifest', 'data', 'data']);
    expect(transfer.dataPackets[0].crc32).toBe('b6cc4292');
  });

  it('selects only requested repair chunks', async () => {
    const transfer = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    expect(selectRepairPackets(transfer, '1')).toHaveLength(1);
    expect(selectRepairPackets(transfer, '1')[0].chunkIndex).toBe(1);
  });

  it('rejects repair ranges outside the transfer chunk count', async () => {
    const transfer = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    expect(() => selectRepairPackets(transfer, '2')).toThrow('Invalid missing range');
  });

  it('selects repair packets from matching NACK packets', async () => {
    const transfer = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    const nack: NackPacket = {
      version: PROTOCOL_VERSION,
      transferId: TRANSFER_ID,
      type: 'nack',
      missingRanges: '0-2',
    };

    expect(selectRepairPacketsForNack(transfer, nack)).toHaveLength(3);
    expect(selectRepairPacketsForNack(transfer, nack).map((packet) => packet.chunkIndex)).toEqual([0, 1, 2]);
  });

  it('rejects NACK packets for another transfer', async () => {
    const transfer = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    const nack: NackPacket = {
      version: PROTOCOL_VERSION,
      transferId: OTHER_TRANSFER_ID,
      type: 'nack',
      missingRanges: '0',
    };

    expect(() => selectRepairPacketsForNack(transfer, nack)).toThrow('NACK transfer ID does not match transfer');
  });
});
