import QRCode from 'qrcode';

export async function renderQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'L',
    margin: 2,
    scale: 8,
  });
}
