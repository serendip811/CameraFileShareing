import { describe, expect, it } from 'vitest';
import { buildVerifiedFile, createReceiverState, getReceiverProgress, ingestPacket, verifyReceiverState } from './receiver';
import { prepareSenderTransfer, selectRepairPacketsForNack } from './sender';

const TRANSFER_ID = '0123456789abcdef';

describe('simulated QR transfer with repair', () => {
  it('repairs intentionally dropped chunks and verifies the final file', async () => {
    const originalText = 'camera-transfer-'.repeat(320);
    const originalBytes = new TextEncoder().encode(originalText);
    const sender = await prepareSenderTransfer({
      bytes: originalBytes,
      fileName: 'payload.txt',
      mimeType: 'text/plain',
      chunkSize: 256,
      transferId: TRANSFER_ID,
    });

    let state = createReceiverState();
    for (const packet of sender.packets) {
      if (packet.type === 'data' && packet.chunkIndex % 3 === 1) {
        continue;
      }
      state = ingestPacket(state, packet);
    }

    expect(getReceiverProgress(state).missingChunks).toBeGreaterThan(0);

    const nack = await verifyReceiverState(state);
    expect(nack.type).toBe('nack');
    if (nack.type !== 'nack') {
      throw new Error('Expected NACK for intentionally dropped chunks');
    }

    const repairPackets = selectRepairPacketsForNack(sender, nack);
    expect(repairPackets.map((packet) => packet.chunkIndex)).toEqual(
      sender.dataPackets.filter((packet) => packet.chunkIndex % 3 === 1).map((packet) => packet.chunkIndex),
    );

    for (const packet of repairPackets) {
      state = ingestPacket(state, packet);
    }

    expect(getReceiverProgress(state)).toMatchObject({
      receivedChunks: sender.manifest.totalChunks,
      totalChunks: sender.manifest.totalChunks,
      missingChunks: 0,
    });
    await expect(verifyReceiverState(state)).resolves.toMatchObject({
      type: 'ack',
      transferId: TRANSFER_ID,
      sha256: sender.manifest.sha256,
    });

    const verifiedFile = await buildVerifiedFile(state);
    expect(verifiedFile).not.toBeNull();
    if (verifiedFile === null) {
      throw new Error('Expected verified file after ACK');
    }
    expect(verifiedFile.fileName).toBe('payload.txt');
    expect(verifiedFile.mimeType).toBe('text/plain');
    expect(new TextDecoder().decode(verifiedFile.bytes)).toBe(originalText);
  });
});
