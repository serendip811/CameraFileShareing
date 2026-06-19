import { afterEach, describe, expect, it, vi } from 'vitest';

const { jsQrMock } = vi.hoisted(() => ({
  jsQrMock: vi.fn<() => { data: string } | null>(() => ({ data: 'decoded-payload' })),
}));

vi.mock('jsqr', () => ({
  default: jsQrMock,
}));

import { captureVideoFrame, decodeQrFromImageData, stopCameraStream } from './qrScanner';

function createImageData(width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  } as ImageData;
}

describe('qrScanner', () => {
  afterEach(() => {
    jsQrMock.mockReset();
    jsQrMock.mockReturnValue({ data: 'decoded-payload' });
  });

  it('returns decoded QR payload data', () => {
    const image = createImageData(4, 4);
    expect(decodeQrFromImageData(image)).toBe('decoded-payload');
  });

  it('returns null when no QR code is decoded', () => {
    jsQrMock.mockReturnValueOnce(null);
    const image = createImageData(4, 4);
    expect(decodeQrFromImageData(image)).toBeNull();
  });

  it('stops every camera track', () => {
    const firstTrack = { stop: vi.fn() };
    const secondTrack = { stop: vi.fn() };
    const stream = {
      getTracks: () => [firstTrack, secondTrack],
    } as unknown as MediaStream;

    stopCameraStream(stream);

    expect(firstTrack.stop).toHaveBeenCalledTimes(1);
    expect(secondTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('throws when video dimensions are zero', () => {
    const video = { videoWidth: 0, videoHeight: 4 } as HTMLVideoElement;
    const canvas = document.createElement('canvas');

    expect(() => captureVideoFrame(video, canvas)).toThrow('Video frame is not ready');
  });
});
