import { describe, expect, it } from 'vitest';
import { prepareSenderTransfer, selectRepairPackets } from './sender';

const TRANSFER_ID = '0123456789abcdef';

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
});
