import { afterEach, describe, expect, it, vi } from 'vitest';

const { jsQrMock } = vi.hoisted(() => ({
  jsQrMock: vi.fn<(data: Uint8ClampedArray, width: number, height: number) => { data: string } | null>(() => ({
    data: 'decoded-payload',
  })),
}));

vi.mock('jsqr', () => ({
  default: jsQrMock,
}));

import {
  CameraAccessError,
  type CameraErrorCode,
  captureVideoFrame,
  decodeQrFromImageData,
  openCameraStream,
  stopCameraStream,
} from './qrScanner';

const originalSecureContextDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
const originalMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

function createImageData(width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  } as ImageData;
}

function restoreProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, key);
    return;
  }
  Object.defineProperty(target, key, descriptor);
}

function setSecureContext(value: boolean): void {
  Object.defineProperty(globalThis, 'isSecureContext', {
    configurable: true,
    value,
  });
}

function setMediaDevices(mediaDevices: Partial<MediaDevices> | undefined): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: mediaDevices,
  });
}

async function expectCameraErrorCode(code: CameraErrorCode): Promise<void> {
  await openCameraStream().then(
    () => {
      throw new Error(`Expected camera error ${code}`);
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(CameraAccessError);
      expect((error as CameraAccessError).code).toBe(code);
    },
  );
}

describe('qrScanner', () => {
  afterEach(() => {
    jsQrMock.mockReset();
    jsQrMock.mockReturnValue({ data: 'decoded-payload' });
    restoreProperty(globalThis, 'isSecureContext', originalSecureContextDescriptor);
    restoreProperty(navigator, 'mediaDevices', originalMediaDevicesDescriptor);
  });

  it('returns decoded QR payload data', () => {
    const image = createImageData(4, 4);
    expect(decodeQrFromImageData(image)).toBe('decoded-payload');
    expect(jsQrMock).toHaveBeenCalledWith(image.data, 4, 4);
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

  it('requests the user-facing camera without audio', async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>().mockResolvedValue(stream);
    setSecureContext(true);
    setMediaDevices({ getUserMedia } as Partial<MediaDevices>);

    await expect(openCameraStream()).resolves.toBe(stream);

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: 'user',
      },
    });
  });

  it('classifies insecure browser contexts', async () => {
    const getUserMedia = vi.fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>();
    setSecureContext(false);
    setMediaDevices({ getUserMedia } as Partial<MediaDevices>);

    await expectCameraErrorCode('insecure-context');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('classifies missing media device support', async () => {
    setSecureContext(true);
    setMediaDevices(undefined);

    await expectCameraErrorCode('unsupported');
  });

  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
  ] satisfies Array<[string, CameraErrorCode]>)('classifies %s camera failures', async (errorName, code) => {
    const getUserMedia = vi
      .fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockRejectedValue(new DOMException('denied', errorName));
    setSecureContext(true);
    setMediaDevices({ getUserMedia } as Partial<MediaDevices>);

    await expectCameraErrorCode(code);
  });

  it.each([
    ['NotFoundError', 'not-found'],
    ['OverconstrainedError', 'not-found'],
  ] satisfies Array<[string, CameraErrorCode]>)('classifies %s camera failures', async (errorName, code) => {
    const getUserMedia = vi
      .fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockRejectedValue(new DOMException('missing camera', errorName));
    setSecureContext(true);
    setMediaDevices({ getUserMedia } as Partial<MediaDevices>);

    await expectCameraErrorCode(code);
  });

  it('classifies unexpected camera failures as unknown', async () => {
    const getUserMedia = vi
      .fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockRejectedValue(new DOMException('camera failed', 'AbortError'));
    setSecureContext(true);
    setMediaDevices({ getUserMedia } as Partial<MediaDevices>);

    await expectCameraErrorCode('unknown');
  });

  it('captures a ready video frame from a canvas context', () => {
    const image = createImageData(8, 6);
    const video = { videoWidth: 8, videoHeight: 6 } as HTMLVideoElement;
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => image),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;

    expect(captureVideoFrame(video, canvas)).toBe(image);
    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(6);
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 8, 6);
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 8, 6);
  });

  it('throws when canvas context creation fails', () => {
    const video = { videoWidth: 4, videoHeight: 4 } as HTMLVideoElement;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement;

    expect(() => captureVideoFrame(video, canvas)).toThrow('Could not create canvas context');
  });

  it('throws when video dimensions are zero', () => {
    const video = { videoWidth: 0, videoHeight: 4 } as HTMLVideoElement;
    const canvas = document.createElement('canvas');

    expect(() => captureVideoFrame(video, canvas)).toThrow('Video frame is not ready');
  });
});
