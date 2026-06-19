import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { getCameraAccessErrorMessage } from './App';
import { crc32Hex } from './protocol/checksum';
import {
  createChunkRequestPacket,
  createOfferPacket,
  decodeControlPacket,
  encodeControlPacket,
  type TransferOfferPacket,
} from './protocol/controlPacket';
import { decodePacket, encodePacket } from './protocol/packetCodec';
import {
  DEFAULT_CHUNK_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES,
  PROTOCOL_VERSION,
  type DataPacket,
  type ManifestPacket,
} from './protocol/types';
import { CameraAccessError } from './qr/qrScanner';

const mocks = vi.hoisted(() => ({
  openCameraStream: vi.fn<() => Promise<MediaStream>>(),
  stopCameraStream: vi.fn<(stream: MediaStream) => void>(),
  captureVideoFrame: vi.fn<() => ImageData>(),
  decodeQrFromImageData: vi.fn<(imageData: ImageData) => string | null>(),
  renderQrDataUrl: vi.fn<(payload: string) => Promise<string>>(),
}));

vi.mock('./qr/qrScanner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./qr/qrScanner')>();
  return {
    ...actual,
    openCameraStream: mocks.openCameraStream,
    stopCameraStream: mocks.stopCameraStream,
    captureVideoFrame: mocks.captureVideoFrame,
    decodeQrFromImageData: mocks.decodeQrFromImageData,
  };
});

vi.mock('./qr/qrDisplay', () => ({
  renderQrDataUrl: mocks.renderQrDataUrl,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function createMockStream(): MediaStream {
  return { getTracks: vi.fn(() => [{ stop: vi.fn() }]) } as unknown as MediaStream;
}

function createImageData(): ImageData {
  return { data: new Uint8ClampedArray([0, 0, 0, 255]), width: 1, height: 1 } as ImageData;
}

function createManifestPacket(overrides: Partial<ManifestPacket> = {}): ManifestPacket {
  return {
    version: PROTOCOL_VERSION,
    type: 'manifest',
    transferId: '0123456789abcdef',
    fileName: 'hello.txt',
    mimeType: 'text/plain',
    fileSize: 2,
    chunkSize: DEFAULT_CHUNK_SIZE_BYTES,
    totalChunks: 2,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ...overrides,
  };
}

function createDataPacket(chunkIndex: number, payload: Uint8Array, totalChunks = 2): DataPacket {
  return {
    version: PROTOCOL_VERSION,
    type: 'data',
    transferId: '0123456789abcdef',
    chunkIndex,
    totalChunks,
    payload,
    crc32: crc32Hex(payload),
  };
}

function getRenderedManifestPacket(): ManifestPacket {
  for (const [payload] of mocks.renderQrDataUrl.mock.calls) {
    try {
      const packet = decodePacket(payload);
      if (packet.type === 'manifest') {
        return packet;
      }
    } catch {
      // Ignore non-transfer control packets.
    }
  }
  throw new Error('Expected rendered manifest packet');
}

function getRenderedOfferPacket(): TransferOfferPacket {
  for (const [payload] of mocks.renderQrDataUrl.mock.calls) {
    try {
      const packet = decodeControlPacket(payload);
      if (packet.type === 'offer') {
        return packet;
      }
    } catch {
      // Ignore transfer packets.
    }
  }
  throw new Error('Expected rendered offer packet');
}

function getRenderedChunkRequest(): ReturnType<typeof createChunkRequestPacket> {
  for (const [payload] of mocks.renderQrDataUrl.mock.calls) {
    try {
      const packet = decodeControlPacket(payload);
      if (packet.type === 'request') {
        return packet;
      }
    } catch {
      // Ignore transfer packets.
    }
  }
  throw new Error('Expected rendered chunk request packet');
}

function encodeChunkRequest(transferId: string, missingRanges: string): string {
  return encodeControlPacket(createChunkRequestPacket(transferId, missingRanges));
}

async function goToSendMode() {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
}

async function goToReceiveMode() {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
}

beforeEach(() => {
  vi.useRealTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  mocks.openCameraStream.mockReset();
  mocks.stopCameraStream.mockReset();
  mocks.captureVideoFrame.mockReset();
  mocks.decodeQrFromImageData.mockReset();
  mocks.renderQrDataUrl.mockReset();
  mocks.openCameraStream.mockResolvedValue(createMockStream());
  mocks.captureVideoFrame.mockReturnValue(createImageData());
  mocks.decodeQrFromImageData.mockReturnValue(null);
  mocks.renderQrDataUrl.mockImplementation(async (payload) => `data:image/png;base64,${btoa(payload)}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('lets the user choose send or receive mode', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(await screen.findByRole('heading', { name: 'Scanning QR frames' })).toBeInTheDocument();
  });

  it('renders sender file controls from home', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('heading', { name: 'Sender' })).toBeInTheDocument();
    expect(screen.getByLabelText('Choose file to send')).toBeInTheDocument();
    expect(screen.getByText('Choose a file up to 1MB.')).toBeInTheDocument();
  });

  it('starts receiver scanning without manual camera controls', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(await screen.findByRole('heading', { name: 'Scanning QR frames' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start camera' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scan one frame' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop camera' })).not.toBeInTheDocument();
  });

  it('scans a sender offer and automatically shows an initial chunk request', async () => {
    const offer = createOfferPacket(createManifestPacket({ totalChunks: 2, fileSize: DEFAULT_CHUNK_SIZE_BYTES + 1 }));
    mocks.decodeQrFromImageData.mockReturnValueOnce(encodeControlPacket(offer)).mockReturnValue(null);

    await goToReceiveMode();

    expect(
      await screen.findByRole('heading', { name: 'Ready for hello.txt. Requesting 2 chunks.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Chunk request')).toBeInTheDocument();
    const request = getRenderedChunkRequest();
    expect(request).toMatchObject({ transferId: offer.transferId, missingRanges: '0-1' });
  });

  it('maps camera access errors to actionable messages', () => {
    expect(getCameraAccessErrorMessage(new CameraAccessError('insecure-context', 'blocked'))).toContain(
      'Use HTTPS or localhost',
    );
    expect(getCameraAccessErrorMessage(new CameraAccessError('permission-denied', 'denied'))).toContain(
      'Allow camera access',
    );
    expect(getCameraAccessErrorMessage(new Error('boom'))).toBe('Could not open the camera. Try again.');
  });

  it('stops a camera stream that resolves after the receiver is stopped', async () => {
    const pendingStream = createDeferred<MediaStream>();
    const stream = createMockStream();
    mocks.openCameraStream.mockReturnValue(pendingStream.promise);

    await goToReceiveMode();
    await userEvent.click(screen.getByRole('button', { name: 'Camera File Sharing' }));

    await act(async () => {
      pendingStream.resolve(stream);
      await pendingStream.promise;
    });

    await waitFor(() => expect(mocks.stopCameraStream).toHaveBeenCalledWith(stream));
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('does not let a stale receiver camera continuation stop a newer active stream', async () => {
    const firstPlay = createDeferred<void>();
    const firstStream = createMockStream();
    const secondStream = createMockStream();
    const playMock = vi.mocked(HTMLMediaElement.prototype.play);
    playMock.mockReturnValueOnce(firstPlay.promise).mockResolvedValue(undefined);
    mocks.openCameraStream.mockResolvedValueOnce(firstStream).mockResolvedValueOnce(secondStream);

    await goToReceiveMode();
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Camera File Sharing' }));

    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2));
    mocks.stopCameraStream.mockClear();

    await act(async () => {
      firstPlay.resolve();
      await firstPlay.promise;
    });

    expect(mocks.stopCameraStream).not.toHaveBeenCalledWith(secondStream);
    expect(screen.getByRole('heading', { name: 'Scanning QR frames' })).toBeInTheDocument();
  });

  it('clears receiver verification output and download when another QR packet is ingested', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:verified');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    mocks.captureVideoFrame.mockReturnValue(createImageData());
    const dataPacket = createDataPacket(0, new Uint8Array([97]), 1);
    const changedDataPacket = createDataPacket(0, new Uint8Array([98]), 1);
    mocks.decodeQrFromImageData
      .mockReturnValueOnce(
        encodePacket(
          createManifestPacket({
            totalChunks: 1,
            fileSize: 1,
            sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
          }),
        ),
      )
      .mockReturnValueOnce(encodePacket(dataPacket))
      .mockReturnValue(null);

    await goToReceiveMode();

    expect(await screen.findByText('ACK payload')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download verified file' })).toHaveAttribute('href', 'blob:verified');

    mocks.decodeQrFromImageData.mockReturnValueOnce(encodePacket(changedDataPacket));

    await waitFor(() => expect(screen.queryByText('ACK payload')).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue(/"type":"ack"/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download verified file' })).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:verified');
  });

  it('ignores a verification result that finishes after receiver state changes', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stale');
    const pendingQr = createDeferred<string>();
    mocks.renderQrDataUrl.mockReturnValueOnce(pendingQr.promise);
    mocks.captureVideoFrame.mockReturnValue(createImageData());
    const dataPacket = createDataPacket(0, new Uint8Array([97]), 1);
    const changedDataPacket = createDataPacket(0, new Uint8Array([98]), 1);
    mocks.decodeQrFromImageData
      .mockReturnValueOnce(
        encodePacket(
          createManifestPacket({
            totalChunks: 1,
            fileSize: 1,
            sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
          }),
        ),
      )
      .mockReturnValueOnce(encodePacket(dataPacket))
      .mockReturnValue(null);

    await goToReceiveMode();
    await waitFor(() => expect(mocks.renderQrDataUrl).toHaveBeenCalledTimes(1));

    mocks.decodeQrFromImageData.mockReturnValueOnce(encodePacket(changedDataPacket));
    await waitFor(() => expect(mocks.decodeQrFromImageData.mock.calls.length).toBeGreaterThanOrEqual(3));
    await act(async () => {
      pendingQr.resolve('data:image/png;base64,stale');
      await pendingQr.promise;
    });

    expect(screen.queryByText('ACK payload')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/"type":"ack"/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download verified file' })).not.toBeInTheDocument();
  });

  it('keeps the latest selected sender file when preparation resolves out of order', async () => {
    const firstRead = createDeferred<ArrayBuffer>();
    const secondRead = createDeferred<ArrayBuffer>();
    const firstFile = new File(['a'], 'first.txt', { type: 'text/plain' });
    const secondFile = new File(['b'], 'second.txt', { type: 'text/plain' });
    vi.spyOn(firstFile, 'arrayBuffer').mockReturnValue(firstRead.promise);
    vi.spyOn(secondFile, 'arrayBuffer').mockReturnValue(secondRead.promise);

    await goToSendMode();
    const fileInput = screen.getByLabelText('Choose file to send');
    await userEvent.upload(fileInput, firstFile);
    await userEvent.upload(fileInput, secondFile);

    await act(async () => {
      secondRead.resolve(new Uint8Array([98]).buffer);
      await secondRead.promise;
    });
    expect((await screen.findAllByText(/second\.txt is ready/)).length).toBeGreaterThan(0);

    await act(async () => {
      firstRead.resolve(new Uint8Array([97]).buffer);
      await firstRead.promise;
    });

    expect(screen.getAllByText(/second\.txt is ready/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/first\.txt is ready/)).not.toBeInTheDocument();
  });

  it('offers a selected file and waits for receiver chunk request before sending data', async () => {
    await goToSendMode();

    await userEvent.upload(screen.getByLabelText('Choose file to send'), new File(['hi'], 'round.txt', { type: 'text/plain' }));

    expect((await screen.findAllByText(/round\.txt is ready/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Phase: Offering file/)).toBeInTheDocument();
    const offer = getRenderedOfferPacket();
    expect(offer.fileName).toBe('round.txt');
    expect(() => getRenderedManifestPacket()).toThrow('Expected rendered manifest packet');

    mocks.decodeQrFromImageData.mockReturnValueOnce(encodeChunkRequest(offer.transferId, '0')).mockReturnValue(null);

    expect((await screen.findAllByText(/Sending 1 requested chunk/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText(/Phase: Waiting for receiver request/)).toBeInTheDocument());
    expect(getRenderedManifestPacket().transferId).toBe(offer.transferId);
  });

  it('scans a receiver chunk request QR and sends only requested chunks', async () => {
    await goToSendMode();
    await userEvent.upload(
      screen.getByLabelText('Choose file to send'),
      new File(['repair me'], 'repair.txt', { type: 'text/plain' }),
    );
    await waitFor(() => expect(mocks.renderQrDataUrl).toHaveBeenCalled());
    const offer = getRenderedOfferPacket();

    mocks.decodeQrFromImageData.mockReturnValue(
      encodeChunkRequest(offer.transferId, '0'),
    );

    expect((await screen.findAllByText(/Sending 1 requested chunk/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Receiver request scanned/)).toBeInTheDocument();
  });

  it('scans a receiver ACK QR and completes the sender transfer', async () => {
    await goToSendMode();
    await userEvent.upload(screen.getByLabelText('Choose file to send'), new File(['done'], 'done.txt', { type: 'text/plain' }));
    await waitFor(() => expect(mocks.renderQrDataUrl).toHaveBeenCalled());
    const offer = getRenderedOfferPacket();

    mocks.decodeQrFromImageData.mockReturnValueOnce(encodeChunkRequest(offer.transferId, '0')).mockReturnValue(null);
    await waitFor(() => expect(screen.getByText(/Phase: Waiting for receiver request/)).toBeInTheDocument());

    mocks.decodeQrFromImageData.mockReturnValue(
      encodePacket({
        version: PROTOCOL_VERSION,
        type: 'ack',
        transferId: offer.transferId,
        sha256: offer.sha256,
      }),
    );

    expect(await screen.findByText('Transfer complete. Receiver verified SHA-256.')).toBeInTheDocument();
    expect(screen.getByText(/Phase: Complete/)).toBeInTheDocument();
  });

  it('rejects oversized sender files before reading bytes', async () => {
    await goToSendMode();
    const file = new File(['small placeholder'], 'large.bin', { type: 'application/octet-stream' });
    Object.defineProperty(file, 'size', { value: MAX_FILE_SIZE_BYTES + 1 });
    const readSpy = vi.spyOn(file, 'arrayBuffer');

    await userEvent.upload(screen.getByLabelText('Choose file to send'), file);

    expect(readSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('File is larger than the 1MB MVP limit.');
  });
});
