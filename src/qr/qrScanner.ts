import jsQR from 'jsqr';

export function decodeQrFromImageData(imageData: ImageData): string | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code?.data ?? null;
}

export async function openCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is not supported in this browser');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'environment',
    },
  });
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
