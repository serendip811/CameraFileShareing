import { describe, expect, it } from 'vitest';
import { renderQrDataUrl } from './qrDisplay';

describe('qrDisplay', () => {
  it('renders a PNG data URL for a payload', async () => {
    await expect(renderQrDataUrl('hello')).resolves.toMatch(/^data:image\/png;base64,/);
  });
});
