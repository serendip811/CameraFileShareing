import jsQR from 'jsqr';

export type CameraErrorCode = 'insecure-context' | 'unsupported' | 'permission-denied' | 'not-found' | 'unknown';

export class CameraAccessError extends Error {
  constructor(
    public readonly code: CameraErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CameraAccessError';
  }
}

const cameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: 'user',
  },
};

export function decodeQrFromImageData(imageData: ImageData): string | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code?.data ?? null;
}

export async function openCameraStream(): Promise<MediaStream> {
  if (globalThis.isSecureContext === false) {
    throw new CameraAccessError(
      'insecure-context',
      'Camera access requires a secure context. Use HTTPS or localhost.',
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraAccessError('unsupported', 'Camera access is not supported in this browser');
  }
  try {
    return await navigator.mediaDevices.getUserMedia(cameraConstraints);
  } catch (error) {
    const code = getCameraErrorCode(error);
    throw new CameraAccessError(code, getCameraErrorMessage(code), error);
  }
}

export function stopCameraStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function captureVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): ImageData {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width === 0 || height === 0) {
    throw new Error('Video frame is not ready');
  }
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    throw new Error('Could not create canvas context');
  }
  context.drawImage(video, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function getCameraErrorCode(error: unknown): CameraErrorCode {
  const errorName = getErrorName(error);
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return 'permission-denied';
  }
  if (errorName === 'NotFoundError' || errorName === 'OverconstrainedError') {
    return 'not-found';
  }
  return 'unknown';
}

function getErrorName(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

function getCameraErrorMessage(code: CameraErrorCode): string {
  switch (code) {
    case 'permission-denied':
      return 'Camera permission was denied or blocked by browser settings';
    case 'not-found':
      return 'No usable camera was found';
    default:
      return 'Could not open the camera';
  }
}
