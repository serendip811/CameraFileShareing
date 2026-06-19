import { describe, expect, it } from 'vitest';
import { buildVerifiedFile, createReceiverState, getReceiverProgress, ingestPacket, verifyReceiverState } from './receiver';
import { prepareSenderTransfer, selectRepairPacketsForNack } from './sender';
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

  it('preserves progress when an identical manifest repeats mid-stream', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    let state = createReceiverState();
    state = ingestPacket(state, sender.packets[0]);
    state = ingestPacket(state, sender.dataPackets[0]);
    state = ingestPacket(state, sender.dataPackets[1]);
    state = ingestPacket(state, sender.packets[0]);
    state = ingestPacket(state, sender.dataPackets[2]);

    expect(getReceiverProgress(state)).toMatchObject({ receivedChunks: 3, totalChunks: 3, missingChunks: 0 });
    expect(state.rejectedFrames).toBe(0);
    await expect(verifyReceiverState(state)).resolves.toMatchObject({ type: 'ack', transferId: TRANSFER_ID });
  });

  it('rejects conflicting manifests without switching transfers or dropping chunks', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    const otherTransfer = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: OTHER_TRANSFER_ID,
    });
    const otherMetadata = await prepareSenderTransfer({
      bytes: new Uint8Array([9, 8, 7]),
      fileName: 'other.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    let state = createReceiverState();
    state = ingestPacket(state, sender.packets[0]);
    state = ingestPacket(state, sender.dataPackets[0]);

    state = ingestPacket(state, otherTransfer.packets[0]);
    expect(state.manifest?.transferId).toBe(TRANSFER_ID);
    expect(state.chunks.size).toBe(1);
    expect(state.rejectedFrames).toBe(1);

    state = ingestPacket(state, otherMetadata.packets[0]);
    expect(state.manifest?.fileName).toBe('a.bin');
    expect(state.chunks.size).toBe(1);
    expect(state.rejectedFrames).toBe(2);
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

  it('starts with empty chunks when accepting the first manifest', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    const preloaded = {
      ...createReceiverState(),
      chunks: new Map([[0, new Uint8Array([9])]]),
    };

    const state = ingestPacket(preloaded, sender.packets[0]);

    expect(state.manifest?.transferId).toBe(TRANSFER_ID);
    expect(state.chunks.size).toBe(0);
    expect(state.rejectedFrames).toBe(0);
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

  it('requests all chunks when present chunks fail hash verification', async () => {
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

    const verdict = await verifyReceiverState(state);
    expect(verdict).toMatchObject({ type: 'nack', missingRanges: '0-1' });
    if (verdict.type !== 'nack') throw new Error('Expected NACK');
    expect(selectRepairPacketsForNack(sender, verdict)).toHaveLength(sender.dataPackets.length);
    await expect(buildVerifiedFile(state)).resolves.toBeNull();
  });

  it('requests all chunks when present chunks cannot reassemble to the manifest size', async () => {
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

    const wrongSize: DataPacket = {
      version: PROTOCOL_VERSION,
      transferId: TRANSFER_ID,
      type: 'data',
      chunkIndex: 1,
      totalChunks: sender.manifest.totalChunks,
      payload: new Uint8Array([9, 9]),
      crc32: '00000000',
    };
    state = ingestPacket(state, wrongSize);

    await expect(verifyReceiverState(state)).resolves.toMatchObject({ type: 'nack', missingRanges: '0-1' });
  });

  it('repairs dropped chunks using a bounded NACK repair round', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: TRANSFER_ID,
    });
    let state = createReceiverState();
    state = ingestPacket(state, sender.packets[0]);
    state = ingestPacket(state, sender.dataPackets[0]);
    state = ingestPacket(state, sender.dataPackets[2]);

    const nack = await verifyReceiverState(state);
    expect(nack).toMatchObject({ type: 'nack', missingRanges: '1' });
    if (nack.type !== 'nack') throw new Error('Expected NACK');

    for (const packet of selectRepairPacketsForNack(sender, nack)) {
      state = ingestPacket(state, packet);
    }

    expect(getReceiverProgress(state)).toMatchObject({ receivedChunks: 3, totalChunks: 3, missingChunks: 0 });
    await expect(verifyReceiverState(state)).resolves.toMatchObject({ type: 'ack', transferId: TRANSFER_ID });
  });
});
