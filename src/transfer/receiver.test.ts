import { describe, expect, it } from 'vitest';
import { buildVerifiedFile, createReceiverState, getReceiverProgress, ingestPacket, verifyReceiverState } from './receiver';
import { prepareSenderTransfer } from './sender';
import { PROTOCOL_VERSION, type DataPacket } from '../protocol/types';

const TRANSFER_ID = '0123456789abcdef';
const OTHER_TRANSFER_ID = 'fedcba9876543210';

describe('receiver transfer', () => {
  it('verifies a complete transfer', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new TextEncoder().encode('hello world'),
      fileName: 'hello.txt',
      mimeType: 'text/plain',
      chunkSize: 4,
      transferId: TRANSFER_ID,
    });
    let state = createReceiverState();
    for (const packet of sender.packets) {
      state = ingestPacket(state, packet);
    }
    expect(getReceiverProgress(state)).toMatchObject({ receivedChunks: 3, totalChunks: 3, missingChunks: 0 });
    await expect(verifyReceiverState(state)).resolves.toMatchObject({ type: 'ack', transferId: TRANSFER_ID });
    const file = await buildVerifiedFile(state);
    expect(file).not.toBeNull();
    if (file === null) throw new Error('Expected verified file');
    expect(file.fileName).toBe('hello.txt');
    expect(new TextDecoder().decode(file.bytes)).toBe('hello world');
  });

  it('reports missing chunks as NACK', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    let state = createReceiverState();
    state = ingestPacket(state, sender.packets[0]);
    state = ingestPacket(state, sender.packets[1]);
    await expect(verifyReceiverState(state)).resolves.toMatchObject({ type: 'nack', missingRanges: '1-2' });
  });

  it('ignores data packets before manifest', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    const state = ingestPacket(createReceiverState(), sender.dataPackets[0]);
    expect(state.chunks.size).toBe(0);
    expect(state.rejectedFrames).toBe(1);
  });

  it('rejects data packets with wrong transfer context without storing them', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    let state = createReceiverState();
    state = ingestPacket(state, sender.packets[0]);

    const wrongTransferId: DataPacket = { ...sender.dataPackets[0], transferId: OTHER_TRANSFER_ID };
    const wrongTotalChunks: DataPacket = { ...sender.dataPackets[0], totalChunks: sender.manifest.totalChunks + 1 };
    const outOfRange: DataPacket = {
      ...sender.dataPackets[0],
      chunkIndex: sender.manifest.totalChunks,
    };
    state = ingestPacket(state, wrongTransferId);
    state = ingestPacket(state, wrongTotalChunks);
    state = ingestPacket(state, outOfRange);

    expect(state.chunks.size).toBe(0);
    expect(state.rejectedFrames).toBe(3);
  });

  it('returns NACK with empty missing ranges when present chunks fail hash verification', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    let state = createReceiverState();
    for (const packet of sender.packets) {
      state = ingestPacket(state, packet);
    }

    const corrupted: DataPacket = {
      version: PROTOCOL_VERSION,
      transferId: TRANSFER_ID,
      type: 'data',
      chunkIndex: 1,
      totalChunks: sender.manifest.totalChunks,
      payload: new Uint8Array([9]),
      crc32: '00000000',
    };
    state = ingestPacket(state, corrupted);

    await expect(verifyReceiverState(state)).resolves.toMatchObject({ type: 'nack', missingRanges: '' });
    await expect(buildVerifiedFile(state)).resolves.toBeNull();
  });
});
