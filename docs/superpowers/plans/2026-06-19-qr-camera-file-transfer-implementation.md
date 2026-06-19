# QR Camera File Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser web app/PWA that sends a 100KB to 1MB file through a QR-code stream, verifies it with SHA-256, and repairs missing chunks through a reverse ACK/NACK QR.

**Architecture:** Use a Vite React TypeScript app with pure protocol modules under `src/protocol`, transfer state machines under `src/transfer`, QR browser adapters under `src/qr`, and React UI under `src/App.tsx`. Protocol and transfer modules stay DOM-free so Vitest can prove chunking, packet validation, missing-range repair, and final hash verification without a camera.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Vitest 4, qrcode 1.5, jsqr 1.4, browser `crypto.subtle`, browser `getUserMedia`.

---

## File Structure

- Create `package.json`: npm scripts and pinned app dependencies.
- Create `index.html`: Vite app mount point.
- Create `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.setup.ts`: TypeScript and test setup.
- Create `src/main.tsx`: React entrypoint.
- Create `src/App.tsx`: mode selection, send flow, receive flow, repair flow, and download UI.
- Create `src/styles.css`: responsive app layout and transfer controls.
- Create `src/protocol/types.ts`: shared packet, manifest, and transfer types.
- Create `src/protocol/binary.ts`: byte concatenation and Base64URL conversion.
- Create `src/protocol/checksum.ts`: CRC32 and SHA-256 helpers.
- Create `src/protocol/chunker.ts`: file chunk splitting and reassembly.
- Create `src/protocol/missingRanges.ts`: received bitmap and compact range encoding.
- Create `src/protocol/packetCodec.ts`: JSON QR payload encoding and decoding.
- Create `src/protocol/fileManifest.ts`: file metadata, transfer ID, and manifest creation.
- Create `src/transfer/sender.ts`: sender preparation, frame ordering, and repair frame selection.
- Create `src/transfer/receiver.ts`: receiver state updates, verification, ACK, and NACK generation.
- Create `src/qr/qrDisplay.ts`: QR data URL rendering through `qrcode`.
- Create `src/qr/qrScanner.ts`: camera lifecycle and `jsqr` frame decoding.
- Create `src/**/*.test.ts`: focused tests for protocol and state behavior.
- Create `README.md`: run instructions, MVP limits, and manual device verification.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`

- [ ] **Step 1: Create package metadata and scripts**

Use this `package.json` content:

```json
{
  "name": "camera-file-sharing",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -b tsconfig.json tsconfig.node.json && vite build",
    "preview": "vite preview --host 0.0.0.0",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^6.0.2",
    "jsqr": "^1.4.0",
    "qrcode": "^1.5.4",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "vite": "^8.0.16"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/qrcode": "^1.5.6",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "jsdom": "^29.1.1",
    "typescript": "^6.0.3",
    "vitest": "^4.1.9"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and npm exits with code 0.

- [ ] **Step 3: Create Vite and TypeScript config files**

Use `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Camera File Sharing</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Use `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

Use `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

Use `vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
  },
});
```

Use `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Create a minimal React app shell**

Use `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Use `src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="appShell">
      <section className="heroPanel">
        <p className="eyebrow">Camera File Sharing</p>
        <h1>Send files by showing QR frames to another camera.</h1>
        <p className="subtitle">MVP supports one file up to 1MB with final SHA-256 verification and QR repair requests.</p>
      </section>
    </main>
  );
}
```

Use `src/styles.css`:

```css
:root {
  color: #17201a;
  background: #f6f5ef;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input {
  font: inherit;
}

.appShell {
  min-height: 100vh;
  padding: 32px;
}

.heroPanel {
  max-width: 920px;
  margin: 0 auto;
}

.eyebrow {
  margin: 0 0 10px;
  color: #356b4f;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
}

h1 {
  max-width: 760px;
  margin: 0;
  font-size: 44px;
  line-height: 1.05;
  letter-spacing: 0;
}

.subtitle {
  max-width: 660px;
  color: #526158;
  font-size: 18px;
  line-height: 1.5;
}
```

- [ ] **Step 5: Verify scaffold**

Run: `npm run build`

Expected: `tsc -b` and `vite build` both exit with code 0.

- [ ] **Step 6: Commit scaffold**

Run:

```bash
git add package.json package-lock.json index.html tsconfig.json tsconfig.node.json vite.config.ts vitest.setup.ts src/main.tsx src/App.tsx src/styles.css
git commit -m "feat: scaffold QR transfer web app"
```

## Task 2: Binary, Checksum, Chunking, and Missing Ranges

**Files:**
- Create: `src/protocol/types.ts`
- Create: `src/protocol/binary.ts`
- Create: `src/protocol/checksum.ts`
- Create: `src/protocol/chunker.ts`
- Create: `src/protocol/missingRanges.ts`
- Test: `src/protocol/binary.test.ts`
- Test: `src/protocol/checksum.test.ts`
- Test: `src/protocol/chunker.test.ts`
- Test: `src/protocol/missingRanges.test.ts`

- [ ] **Step 1: Write failing tests for byte helpers**

Use `src/protocol/binary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { base64UrlDecode, base64UrlEncode, concatChunks } from './binary';

describe('binary helpers', () => {
  it('round-trips bytes through Base64URL', () => {
    const input = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(base64UrlDecode(base64UrlEncode(input))).toEqual(input);
  });

  it('concatenates chunks in order', () => {
    const output = concatChunks([new Uint8Array([1, 2]), new Uint8Array([3])], 3);
    expect(Array.from(output)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Write byte helpers**

Use `src/protocol/binary.ts`:

```ts
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
```

- [ ] **Step 3: Write failing tests for checksum helpers**

Use `src/protocol/checksum.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { crc32Hex, sha256Hex } from './checksum';

describe('checksum helpers', () => {
  it('computes a stable CRC32 hex value', () => {
    expect(crc32Hex(new TextEncoder().encode('123456789'))).toBe('cbf43926');
  });

  it('computes SHA-256 hex', async () => {
    await expect(sha256Hex(new TextEncoder().encode('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
```

- [ ] **Step 4: Write checksum helpers**

Use `src/protocol/checksum.ts`:

```ts
const CRC_TABLE = new Uint32Array(256).map((_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function crc32Hex(bytes: Uint8Array): string {
  return crc32(bytes).toString(16).padStart(8, '0');
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 5: Write failing tests for chunking**

Use `src/protocol/chunker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { reassembleChunks, splitIntoChunks } from './chunker';

describe('chunker', () => {
  it('splits bytes into fixed-size chunks and reassembles them', () => {
    const input = new Uint8Array([1, 2, 3, 4, 5]);
    const chunks = splitIntoChunks(input, 2);
    expect(chunks).toEqual([new Uint8Array([1, 2]), new Uint8Array([3, 4]), new Uint8Array([5])]);
    expect(reassembleChunks(chunks, input.byteLength)).toEqual(input);
  });

  it('rejects invalid chunk sizes', () => {
    expect(() => splitIntoChunks(new Uint8Array([1]), 0)).toThrow('Chunk size must be positive');
  });
});
```

- [ ] **Step 6: Write chunking functions and shared constants**

Use `src/protocol/types.ts`:

```ts
export const PROTOCOL_VERSION = 1;
export const MAX_FILE_SIZE_BYTES = 1024 * 1024;
export const DEFAULT_CHUNK_SIZE_BYTES = 512;
export const DEFAULT_FRAME_INTERVAL_MS = 150;

export type PacketType = 'manifest' | 'data' | 'ack' | 'nack';

export interface FileManifest {
  transferId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  sha256: string;
}

export interface ManifestPacket extends FileManifest {
  version: typeof PROTOCOL_VERSION;
  type: 'manifest';
}

export interface DataPacket {
  version: typeof PROTOCOL_VERSION;
  transferId: string;
  type: 'data';
  chunkIndex: number;
  totalChunks: number;
  payload: Uint8Array;
  crc32: string;
}

export interface AckPacket {
  version: typeof PROTOCOL_VERSION;
  transferId: string;
  type: 'ack';
  sha256: string;
}

export interface NackPacket {
  version: typeof PROTOCOL_VERSION;
  transferId: string;
  type: 'nack';
  missingRanges: string;
}

export type TransferPacket = ManifestPacket | DataPacket | AckPacket | NackPacket;
```

Use `src/protocol/chunker.ts`:

```ts
import { concatChunks } from './binary';

export function splitIntoChunks(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  if (chunkSize <= 0) {
    throw new Error('Chunk size must be positive');
  }
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.slice(offset, Math.min(offset + chunkSize, bytes.byteLength)));
  }
  return chunks;
}

export function reassembleChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  return concatChunks(chunks, totalBytes);
}
```

- [ ] **Step 7: Write failing tests for missing ranges**

Use `src/protocol/missingRanges.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encodeMissingRanges, expandMissingRanges, getMissingIndexes } from './missingRanges';

describe('missing ranges', () => {
  it('encodes missing indexes compactly', () => {
    expect(encodeMissingRanges([0, 1, 2, 5, 7, 8])).toBe('0-2,5,7-8');
  });

  it('expands ranges back to indexes', () => {
    expect(expandMissingRanges('0-2,5,7-8')).toEqual([0, 1, 2, 5, 7, 8]);
  });

  it('finds missing indexes from received chunk indexes', () => {
    expect(getMissingIndexes(new Set([0, 2]), 4)).toEqual([1, 3]);
  });
});
```

- [ ] **Step 8: Write missing range helpers**

Use `src/protocol/missingRanges.ts`:

```ts
export function getMissingIndexes(receivedIndexes: Set<number>, totalChunks: number): number[] {
  const missing: number[] = [];
  for (let index = 0; index < totalChunks; index += 1) {
    if (!receivedIndexes.has(index)) {
      missing.push(index);
    }
  }
  return missing;
}

export function encodeMissingRanges(indexes: number[]): string {
  if (indexes.length === 0) {
    return '';
  }
  const sorted = [...indexes].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const current of sorted.slice(1)) {
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return ranges.join(',');
}

export function expandMissingRanges(value: string): number[] {
  if (value.trim() === '') {
    return [];
  }
  return value.split(',').flatMap((part) => {
    const [startText, endText] = part.split('-');
    const start = Number(startText);
    const end = endText === undefined ? start : Number(endText);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new Error(`Invalid missing range: ${part}`);
    }
    return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  });
}
```

- [ ] **Step 9: Verify and commit protocol primitives**

Run: `npm test -- src/protocol`

Expected: all protocol primitive tests pass.

Run:

```bash
git add src/protocol
git commit -m "feat: add transfer protocol primitives"
```

## Task 3: Packet Codec and File Manifest

**Files:**
- Create: `src/protocol/packetCodec.ts`
- Create: `src/protocol/fileManifest.ts`
- Test: `src/protocol/packetCodec.test.ts`
- Test: `src/protocol/fileManifest.test.ts`

- [ ] **Step 1: Write failing packet codec tests**

Use `src/protocol/packetCodec.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodePacket, encodePacket } from './packetCodec';
import { PROTOCOL_VERSION, type DataPacket } from './types';

describe('packetCodec', () => {
  it('round-trips a data packet', () => {
    const packet: DataPacket = {
      version: PROTOCOL_VERSION,
      transferId: 'transfer-1',
      type: 'data',
      chunkIndex: 2,
      totalChunks: 4,
      payload: new Uint8Array([9, 8, 7]),
      crc32: 'a62dfd36',
    };
    expect(decodePacket(encodePacket(packet))).toEqual(packet);
  });

  it('rejects bad data CRC', () => {
    const encoded = encodePacket({
      version: PROTOCOL_VERSION,
      transferId: 'transfer-1',
      type: 'data',
      chunkIndex: 0,
      totalChunks: 1,
      payload: new Uint8Array([1, 2, 3]),
      crc32: '55bc801d',
    });
    expect(() => decodePacket(encoded.replace('55bc801d', '00000000'))).toThrow('CRC mismatch');
  });
});
```

- [ ] **Step 2: Write packet codec**

Use `src/protocol/packetCodec.ts`:

```ts
import { base64UrlDecode, base64UrlEncode } from './binary';
import { crc32Hex } from './checksum';
import { PROTOCOL_VERSION, type TransferPacket } from './types';

type WirePacket =
  | { v: 1; id: string; t: 'manifest'; name: string; mime: string; size: number; chunkSize: number; chunks: number; sha256: string }
  | { v: 1; id: string; t: 'data'; i: number; chunks: number; p: string; crc: string }
  | { v: 1; id: string; t: 'ack'; sha256: string }
  | { v: 1; id: string; t: 'nack'; missing: string };

export function encodePacket(packet: TransferPacket): string {
  const wire = toWire(packet);
  return JSON.stringify(wire);
}

export function decodePacket(value: string): TransferPacket {
  const wire = JSON.parse(value) as WirePacket;
  if (wire.v !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${wire.v}`);
  }
  if (wire.t === 'manifest') {
    return {
      version: PROTOCOL_VERSION,
      transferId: wire.id,
      type: 'manifest',
      fileName: wire.name,
      mimeType: wire.mime,
      fileSize: wire.size,
      chunkSize: wire.chunkSize,
      totalChunks: wire.chunks,
      sha256: wire.sha256,
    };
  }
  if (wire.t === 'data') {
    const payload = base64UrlDecode(wire.p);
    const actualCrc = crc32Hex(payload);
    if (actualCrc !== wire.crc) {
      throw new Error('CRC mismatch');
    }
    return {
      version: PROTOCOL_VERSION,
      transferId: wire.id,
      type: 'data',
      chunkIndex: wire.i,
      totalChunks: wire.chunks,
      payload,
      crc32: wire.crc,
    };
  }
  if (wire.t === 'ack') {
    return {
      version: PROTOCOL_VERSION,
      transferId: wire.id,
      type: 'ack',
      sha256: wire.sha256,
    };
  }
  return {
    version: PROTOCOL_VERSION,
    transferId: wire.id,
    type: 'nack',
    missingRanges: wire.missing,
  };
}

function toWire(packet: TransferPacket): WirePacket {
  if (packet.type === 'manifest') {
    return {
      v: packet.version,
      id: packet.transferId,
      t: packet.type,
      name: packet.fileName,
      mime: packet.mimeType,
      size: packet.fileSize,
      chunkSize: packet.chunkSize,
      chunks: packet.totalChunks,
      sha256: packet.sha256,
    };
  }
  if (packet.type === 'data') {
    return {
      v: packet.version,
      id: packet.transferId,
      t: packet.type,
      i: packet.chunkIndex,
      chunks: packet.totalChunks,
      p: base64UrlEncode(packet.payload),
      crc: packet.crc32,
    };
  }
  if (packet.type === 'ack') {
    return { v: packet.version, id: packet.transferId, t: packet.type, sha256: packet.sha256 };
  }
  return { v: packet.version, id: packet.transferId, t: packet.type, missing: packet.missingRanges };
}
```

- [ ] **Step 3: Write failing file manifest tests**

Use `src/protocol/fileManifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createManifestFromBytes, enforceMvpFileLimit } from './fileManifest';

describe('fileManifest', () => {
  it('creates a deterministic manifest from bytes', async () => {
    const manifest = await createManifestFromBytes({
      bytes: new TextEncoder().encode('hello'),
      fileName: 'hello.txt',
      mimeType: 'text/plain',
      chunkSize: 2,
      transferId: 'fixed-id',
    });
    expect(manifest).toMatchObject({
      transferId: 'fixed-id',
      fileName: 'hello.txt',
      mimeType: 'text/plain',
      fileSize: 5,
      chunkSize: 2,
      totalChunks: 3,
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    });
  });

  it('rejects files over 1MB', () => {
    expect(() => enforceMvpFileLimit(1024 * 1024 + 1)).toThrow('MVP file limit is 1MB');
  });
});
```

- [ ] **Step 4: Write file manifest helpers**

Use `src/protocol/fileManifest.ts`:

```ts
import { sha256Hex } from './checksum';
import { MAX_FILE_SIZE_BYTES, type FileManifest } from './types';

interface CreateManifestInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  chunkSize: number;
  transferId?: string;
}

export function enforceMvpFileLimit(fileSize: number): void {
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error('MVP file limit is 1MB');
  }
}

export function createTransferId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createManifestFromBytes(input: CreateManifestInput): Promise<FileManifest> {
  enforceMvpFileLimit(input.bytes.byteLength);
  return {
    transferId: input.transferId ?? createTransferId(),
    fileName: input.fileName,
    mimeType: input.mimeType || 'application/octet-stream',
    fileSize: input.bytes.byteLength,
    chunkSize: input.chunkSize,
    totalChunks: Math.ceil(input.bytes.byteLength / input.chunkSize),
    sha256: await sha256Hex(input.bytes),
  };
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  enforceMvpFileLimit(file.size);
  return new Uint8Array(await file.arrayBuffer());
}
```

- [ ] **Step 5: Verify and commit packet/manifest**

Run: `npm test -- src/protocol/packetCodec.test.ts src/protocol/fileManifest.test.ts`

Expected: packet codec and manifest tests pass.

Run:

```bash
git add src/protocol/packetCodec.ts src/protocol/fileManifest.ts src/protocol/packetCodec.test.ts src/protocol/fileManifest.test.ts
git commit -m "feat: encode QR transfer packets"
```

## Task 4: Sender and Receiver Transfer State

**Files:**
- Create: `src/transfer/sender.ts`
- Create: `src/transfer/receiver.ts`
- Test: `src/transfer/sender.test.ts`
- Test: `src/transfer/receiver.test.ts`

- [ ] **Step 1: Write failing sender tests**

Use `src/transfer/sender.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { prepareSenderTransfer, selectRepairPackets } from './sender';

describe('sender transfer', () => {
  it('builds manifest and data packets', async () => {
    const transfer = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: 'transfer-1',
    });
    expect(transfer.manifest.totalChunks).toBe(2);
    expect(transfer.packets.map((packet) => packet.type)).toEqual(['manifest', 'data', 'data']);
  });

  it('selects only requested repair chunks', async () => {
    const transfer = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: 'transfer-1',
    });
    expect(selectRepairPackets(transfer, '1')).toHaveLength(1);
    expect(selectRepairPackets(transfer, '1')[0].chunkIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Write sender transfer module**

Use `src/transfer/sender.ts`:

```ts
import { crc32Hex } from '../protocol/checksum';
import { splitIntoChunks } from '../protocol/chunker';
import { createManifestFromBytes } from '../protocol/fileManifest';
import { expandMissingRanges } from '../protocol/missingRanges';
import { PROTOCOL_VERSION, type DataPacket, type FileManifest, type ManifestPacket, type TransferPacket } from '../protocol/types';

interface PrepareSenderInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  chunkSize: number;
  transferId?: string;
}

export interface SenderTransfer {
  manifest: FileManifest;
  chunks: Uint8Array[];
  dataPackets: DataPacket[];
  packets: TransferPacket[];
}

export async function prepareSenderTransfer(input: PrepareSenderInput): Promise<SenderTransfer> {
  const manifest = await createManifestFromBytes(input);
  const chunks = splitIntoChunks(input.bytes, manifest.chunkSize);
  const manifestPacket: ManifestPacket = {
    version: PROTOCOL_VERSION,
    type: 'manifest',
    ...manifest,
  };
  const dataPackets = chunks.map<DataPacket>((payload, chunkIndex) => ({
    version: PROTOCOL_VERSION,
    transferId: manifest.transferId,
    type: 'data',
    chunkIndex,
    totalChunks: manifest.totalChunks,
    payload,
    crc32: crc32Hex(payload),
  }));
  return {
    manifest,
    chunks,
    dataPackets,
    packets: [manifestPacket, ...dataPackets],
  };
}

export function selectRepairPackets(transfer: SenderTransfer, missingRanges: string): DataPacket[] {
  const requested = new Set(expandMissingRanges(missingRanges));
  return transfer.dataPackets.filter((packet) => requested.has(packet.chunkIndex));
}
```

- [ ] **Step 3: Write failing receiver tests**

Use `src/transfer/receiver.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildVerifiedFile, createReceiverState, getReceiverProgress, ingestPacket, verifyReceiverState } from './receiver';
import { prepareSenderTransfer } from './sender';

describe('receiver transfer', () => {
  it('verifies a complete transfer', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new TextEncoder().encode('hello world'),
      fileName: 'hello.txt',
      mimeType: 'text/plain',
      chunkSize: 4,
      transferId: 'transfer-1',
    });
    let state = createReceiverState();
    for (const packet of sender.packets) {
      state = ingestPacket(state, packet);
    }
    expect(getReceiverProgress(state)).toMatchObject({ receivedChunks: 3, totalChunks: 3, missingChunks: 0 });
    await expect(verifyReceiverState(state)).resolves.toMatchObject({ type: 'ack', transferId: 'transfer-1' });
    const file = await buildVerifiedFile(state);
    expect(file).not.toBeNull();
    if (file === null) {
      throw new Error('Expected verified file');
    }
    expect(file.fileName).toBe('hello.txt');
    expect(new TextDecoder().decode(file.bytes)).toBe('hello world');
  });

  it('reports missing chunks as NACK', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      chunkSize: 2,
      transferId: 'transfer-1',
    });
    let state = createReceiverState();
    state = ingestPacket(state, sender.packets[0]);
    state = ingestPacket(state, sender.packets[1]);
    await expect(verifyReceiverState(state)).resolves.toMatchObject({ type: 'nack', missingRanges: '1-2' });
  });
});
```

- [ ] **Step 4: Write receiver transfer module**

Use `src/transfer/receiver.ts`:

```ts
import { reassembleChunks } from '../protocol/chunker';
import { sha256Hex } from '../protocol/checksum';
import { encodeMissingRanges, getMissingIndexes } from '../protocol/missingRanges';
import { PROTOCOL_VERSION, type AckPacket, type DataPacket, type FileManifest, type NackPacket, type TransferPacket } from '../protocol/types';

export interface ReceiverState {
  manifest: FileManifest | null;
  chunks: Map<number, Uint8Array>;
  rejectedFrames: number;
}

export interface ReceiverProgress {
  receivedChunks: number;
  totalChunks: number;
  missingChunks: number;
}

export interface VerifiedFile {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

export function createReceiverState(): ReceiverState {
  return {
    manifest: null,
    chunks: new Map(),
    rejectedFrames: 0,
  };
}

export function ingestPacket(state: ReceiverState, packet: TransferPacket): ReceiverState {
  if (packet.type === 'manifest') {
    return { ...state, manifest: packet };
  }
  if (packet.type !== 'data' || state.manifest === null) {
    return state;
  }
  if (!isExpectedDataPacket(state.manifest, packet)) {
    return { ...state, rejectedFrames: state.rejectedFrames + 1 };
  }
  const chunks = new Map(state.chunks);
  chunks.set(packet.chunkIndex, packet.payload);
  return { ...state, chunks };
}

export function getReceiverProgress(state: ReceiverState): ReceiverProgress {
  const totalChunks = state.manifest?.totalChunks ?? 0;
  const missingChunks = totalChunks === 0 ? 0 : getMissingIndexes(new Set(state.chunks.keys()), totalChunks).length;
  return {
    receivedChunks: state.chunks.size,
    totalChunks,
    missingChunks,
  };
}

export async function verifyReceiverState(state: ReceiverState): Promise<AckPacket | NackPacket> {
  if (state.manifest === null) {
    throw new Error('Cannot verify without manifest');
  }
  const missing = getMissingIndexes(new Set(state.chunks.keys()), state.manifest.totalChunks);
  if (missing.length > 0) {
    return createNack(state.manifest, missing);
  }
  const ordered = Array.from({ length: state.manifest.totalChunks }, (_, index) => state.chunks.get(index));
  if (ordered.some((chunk) => chunk === undefined)) {
    return createNack(state.manifest, missing);
  }
  const bytes = reassembleChunks(ordered as Uint8Array[], state.manifest.fileSize);
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== state.manifest.sha256) {
    return createNack(state.manifest, []);
  }
  return {
    version: PROTOCOL_VERSION,
    transferId: state.manifest.transferId,
    type: 'ack',
    sha256,
  };
}

export async function buildVerifiedFile(state: ReceiverState): Promise<VerifiedFile | null> {
  if (state.manifest === null) {
    return null;
  }
  const verdict = await verifyReceiverState(state);
  if (verdict.type !== 'ack') {
    return null;
  }
  const ordered = Array.from({ length: state.manifest.totalChunks }, (_, index) => state.chunks.get(index)) as Uint8Array[];
  return {
    bytes: reassembleChunks(ordered, state.manifest.fileSize),
    fileName: state.manifest.fileName,
    mimeType: state.manifest.mimeType,
  };
}

function createNack(manifest: FileManifest, missing: number[]): NackPacket {
  return {
    version: PROTOCOL_VERSION,
    transferId: manifest.transferId,
    type: 'nack',
    missingRanges: encodeMissingRanges(missing),
  };
}

function isExpectedDataPacket(manifest: FileManifest, packet: DataPacket): boolean {
  return packet.transferId === manifest.transferId && packet.totalChunks === manifest.totalChunks && packet.chunkIndex >= 0 && packet.chunkIndex < manifest.totalChunks;
}
```

- [ ] **Step 5: Verify and commit transfer state**

Run: `npm test -- src/transfer`

Expected: sender and receiver transfer tests pass.

Run:

```bash
git add src/transfer
git commit -m "feat: add sender and receiver transfer state"
```

## Task 5: QR Display and Scanner Adapters

**Files:**
- Create: `src/qr/qrDisplay.ts`
- Create: `src/qr/qrScanner.ts`
- Test: `src/qr/qrDisplay.test.ts`
- Test: `src/qr/qrScanner.test.ts`

- [ ] **Step 1: Write failing QR display test**

Use `src/qr/qrDisplay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderQrDataUrl } from './qrDisplay';

describe('qrDisplay', () => {
  it('renders a PNG data URL for a payload', async () => {
    await expect(renderQrDataUrl('hello')).resolves.toMatch(/^data:image\/png;base64,/);
  });
});
```

- [ ] **Step 2: Write QR display adapter**

Use `src/qr/qrDisplay.ts`:

```ts
import QRCode from 'qrcode';

export async function renderQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'L',
    margin: 2,
    scale: 8,
  });
}
```

- [ ] **Step 3: Write failing scanner decode test**

Use `src/qr/qrScanner.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { decodeQrFromImageData } from './qrScanner';

vi.mock('jsqr', () => ({
  default: () => ({ data: 'decoded-payload' }),
}));

describe('qrScanner', () => {
  it('returns decoded QR payload data', () => {
    const image = new ImageData(new Uint8ClampedArray(4 * 4 * 4), 4, 4);
    expect(decodeQrFromImageData(image)).toBe('decoded-payload');
  });
});
```

- [ ] **Step 4: Write QR scanner adapter**

Use `src/qr/qrScanner.ts`:

```ts
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
```

- [ ] **Step 5: Verify and commit QR adapters**

Run: `npm test -- src/qr`

Expected: QR adapter tests pass.

Run:

```bash
git add src/qr
git commit -m "feat: add QR display and scanner adapters"
```

## Task 6: React Sender and Receiver UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Use `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('lets the user choose send or receive mode', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(screen.getByText('Camera receiver')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Replace app shell with mode-based UI**

Implement `src/App.tsx` with these exported UI states:

```tsx
import { useMemo, useRef, useState } from 'react';
import { decodePacket, encodePacket } from './protocol/packetCodec';
import { DEFAULT_CHUNK_SIZE_BYTES, DEFAULT_FRAME_INTERVAL_MS, type TransferPacket } from './protocol/types';
import { renderQrDataUrl } from './qr/qrDisplay';
import { captureVideoFrame, decodeQrFromImageData, openCameraStream, stopCameraStream } from './qr/qrScanner';
import { buildVerifiedFile, createReceiverState, getReceiverProgress, ingestPacket, verifyReceiverState, type ReceiverState } from './transfer/receiver';
import { prepareSenderTransfer, selectRepairPackets, type SenderTransfer } from './transfer/sender';

type Mode = 'home' | 'send' | 'receive';
type SenderPhase = 'idle' | 'streaming' | 'scan-repair' | 'repairing' | 'complete';

export default function App() {
  const [mode, setMode] = useState<Mode>('home');
  return (
    <main className="appShell">
      <header className="topBar">
        <button className="brandButton" onClick={() => setMode('home')}>Camera File Sharing</button>
      </header>
      {mode === 'home' && <Home onSend={() => setMode('send')} onReceive={() => setMode('receive')} />}
      {mode === 'send' && <SendPanel />}
      {mode === 'receive' && <ReceivePanel />}
    </main>
  );
}

function Home({ onSend, onReceive }: { onSend: () => void; onReceive: () => void }) {
  return (
    <section className="heroPanel">
      <p className="eyebrow">QR optical transfer</p>
      <h1>Send a small file by showing QR frames to another camera.</h1>
      <p className="subtitle">The receiver verifies SHA-256 and shows an ACK or NACK QR for repair.</p>
      <div className="modeGrid">
        <button className="modeButton" onClick={onSend}>Send</button>
        <button className="modeButton secondary" onClick={onReceive}>Receive</button>
      </div>
    </section>
  );
}

function SendPanel() {
  const [transfer, setTransfer] = useState<SenderTransfer | null>(null);
  const [phase, setPhase] = useState<SenderPhase>('idle');
  const [qrUrl, setQrUrl] = useState<string>('');
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<number | null>(null);

  async function handleFile(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const nextTransfer = await prepareSenderTransfer({
      bytes,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      chunkSize: DEFAULT_CHUNK_SIZE_BYTES,
    });
    setTransfer(nextTransfer);
    setPhase('streaming');
    startStream(nextTransfer.packets);
  }

  function startStream(packets: TransferPacket[]) {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
    }
    let index = 0;
    void renderQrDataUrl(encodePacket(packets[index])).then(setQrUrl);
    timerRef.current = window.setInterval(() => {
      index = (index + 1) % packets.length;
      setFrameIndex(index);
      void renderQrDataUrl(encodePacket(packets[index])).then(setQrUrl);
    }, DEFAULT_FRAME_INTERVAL_MS);
  }

  async function handleRepairText(value: string) {
    if (transfer === null) {
      return;
    }
    const packet = decodePacket(value);
    if (packet.type === 'ack') {
      setPhase('complete');
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      return;
    }
    if (packet.type === 'nack') {
      const repairPackets = selectRepairPackets(transfer, packet.missingRanges);
      setPhase('repairing');
      startStream(repairPackets);
    }
  }

  const status = transfer === null ? 'Choose a file up to 1MB.' : `${transfer.manifest.fileName} - frame ${frameIndex + 1}`;

  return (
    <section className="workPanel">
      <h2>Sender</h2>
      <label className="fileDrop">
        <span>{status}</span>
        <input type="file" onChange={(event) => event.target.files?.[0] && void handleFile(event.target.files[0])} />
      </label>
      {qrUrl && <img className="qrImage" src={qrUrl} alt="Current transfer QR frame" />}
      <p className="statusLine">Phase: {phase}</p>
      <label className="repairInput">
        Paste ACK/NACK payload for desktop testing
        <textarea onBlur={(event) => void handleRepairText(event.currentTarget.value)} />
      </label>
    </section>
  );
}

function ReceivePanel() {
  const [state, setState] = useState<ReceiverState>(() => createReceiverState());
  const [resultQr, setResultQr] = useState<string>('');
  const [resultPayload, setResultPayload] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [downloadName, setDownloadName] = useState<string>('download.bin');
  const [message, setMessage] = useState('Camera receiver');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const progress = useMemo(() => getReceiverProgress(state), [state]);

  function readCurrentFrame(): boolean {
    if (videoRef.current === null || canvasRef.current === null) {
      return false;
    }
    const payload = decodeQrFromImageData(captureVideoFrame(videoRef.current, canvasRef.current));
    if (payload === null) {
      return false;
    }
    try {
      const packet = decodePacket(payload);
      setState((current) => ingestPacket(current, packet));
      setMessage(`Read ${packet.type} packet`);
      return true;
    } catch {
      setMessage('Rejected malformed QR payload');
      return false;
    }
  }

  async function startCamera() {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    const stream = await openCameraStream();
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setMessage('Scanning QR frames');
      scanTimerRef.current = window.setInterval(() => {
        readCurrentFrame();
      }, 120);
    }
  }

  function scanOnce() {
    if (!readCurrentFrame()) {
      setMessage('No QR found in this frame');
    }
  }

  async function verify() {
    const result = await verifyReceiverState(state);
    const payload = encodePacket(result);
    setResultPayload(payload);
    setResultQr(await renderQrDataUrl(payload));
    setMessage(result.type === 'ack' ? 'Verified. Show ACK to sender.' : 'Repair needed. Show NACK to sender.');
    if (result.type === 'ack') {
      const file = await buildVerifiedFile(state);
      if (file !== null) {
        if (downloadUrl) {
          URL.revokeObjectURL(downloadUrl);
        }
        setDownloadName(file.fileName);
        setDownloadUrl(URL.createObjectURL(new Blob([file.bytes], { type: file.mimeType })));
      }
    }
  }

  function stopCamera() {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    }
  }

  return (
    <section className="workPanel">
      <h2>{message}</h2>
      <div className="controls">
        <button onClick={() => void startCamera()}>Start camera</button>
        <button onClick={scanOnce}>Scan one frame</button>
        <button onClick={() => void verify()}>Verify</button>
        <button onClick={stopCamera}>Stop</button>
      </div>
      <video className="cameraPreview" ref={videoRef} muted playsInline />
      <canvas ref={canvasRef} hidden />
      <p className="statusLine">Received {progress.receivedChunks}/{progress.totalChunks} chunks. Missing: {progress.missingChunks}</p>
      {resultQr && <img className="qrImage" src={resultQr} alt="ACK or NACK QR" />}
      {downloadUrl && <a className="downloadButton" href={downloadUrl} download={downloadName}>Download verified file</a>}
      {resultPayload && <textarea className="payloadBox" readOnly value={resultPayload} />}
    </section>
  );
}
```

- [ ] **Step 3: Expand CSS for production-readable MVP UI**

Update `src/styles.css` with button, panel, QR, video, and mobile rules. Keep the existing base rules and add:

```css
.topBar {
  max-width: 1040px;
  margin: 0 auto 28px;
}

.brandButton {
  border: 0;
  background: transparent;
  color: #17201a;
  cursor: pointer;
  font-weight: 800;
}

.modeGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 220px));
  gap: 12px;
  margin-top: 28px;
}

.modeButton,
.controls button,
.downloadButton {
  min-height: 48px;
  border: 1px solid #17201a;
  border-radius: 8px;
  background: #17201a;
  color: #fff;
  cursor: pointer;
  font-weight: 800;
  display: inline-grid;
  place-items: center;
  padding: 0 16px;
  text-decoration: none;
}

.modeButton.secondary,
.controls button:nth-child(even) {
  background: #ffffff;
  color: #17201a;
}

.workPanel {
  max-width: 760px;
  margin: 0 auto;
  display: grid;
  gap: 18px;
}

.fileDrop,
.repairInput {
  display: grid;
  gap: 8px;
  border: 1px solid #c9c5b8;
  border-radius: 8px;
  padding: 16px;
  background: #ffffff;
}

.controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.qrImage {
  width: min(72vw, 420px);
  aspect-ratio: 1;
  border: 1px solid #17201a;
  border-radius: 8px;
  background: #ffffff;
  padding: 12px;
}

.cameraPreview {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  background: #101510;
}

.statusLine {
  color: #526158;
}

.payloadBox,
textarea {
  width: 100%;
  min-height: 100px;
  resize: vertical;
}

@media (max-width: 640px) {
  .appShell {
    padding: 18px;
  }

  h1 {
    font-size: 34px;
  }

  .modeGrid,
  .controls {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Verify UI tests and build**

Run: `npm test -- src/App.test.tsx`

Expected: UI mode test passes.

Run: `npm run build`

Expected: production build exits with code 0.

- [ ] **Step 5: Commit UI**

Run:

```bash
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add QR transfer UI"
```

## Task 7: End-to-End Simulation and Documentation

**Files:**
- Create: `src/transfer/simulation.test.ts`
- Create: `README.md`
- Modify: `tasks/todo.md`

- [ ] **Step 1: Write simulated transfer tests**

Use `src/transfer/simulation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createReceiverState, ingestPacket, verifyReceiverState } from './receiver';
import { prepareSenderTransfer, selectRepairPackets } from './sender';

describe('simulated transfer with repair', () => {
  it('repairs intentionally dropped chunks', async () => {
    const sender = await prepareSenderTransfer({
      bytes: new TextEncoder().encode('a'.repeat(2048)),
      fileName: 'payload.txt',
      mimeType: 'text/plain',
      chunkSize: 256,
      transferId: 'transfer-1',
    });

    let state = createReceiverState();
    for (const packet of sender.packets.filter((packet) => packet.type !== 'data' || packet.chunkIndex % 3 !== 1)) {
      state = ingestPacket(state, packet);
    }

    const nack = await verifyReceiverState(state);
    expect(nack.type).toBe('nack');
    if (nack.type !== 'nack') {
      throw new Error('Expected NACK');
    }

    for (const packet of selectRepairPackets(sender, nack.missingRanges)) {
      state = ingestPacket(state, packet);
    }

    await expect(verifyReceiverState(state)).resolves.toMatchObject({ type: 'ack' });
  });
});
```

- [ ] **Step 2: Write README**

Use `README.md`:

```md
# Camera File Sharing

Browser MVP for transferring one small file between camera-equipped devices by showing QR frames on one screen and scanning them with another device.

## Scope

- One file per transfer
- 100KB to 1MB MVP target
- QR stream for data
- SHA-256 verification on the receiver
- Reverse ACK/NACK QR for completion and missing-chunk repair

## Run

```bash
npm install
npm run dev
```

Open the dev URL on two devices. Use `Send` on the device with the file and `Receive` on the device with the camera pointed at the sender screen.

## Verify

```bash
npm test
npm run build
```

Manual checks:

1. Transfer a small text file.
2. Transfer an image or PDF under 1MB.
3. Cover the receiver camera during part of the stream.
4. Verify the receiver shows NACK.
5. Use repair streaming until the receiver shows ACK.
```

- [ ] **Step 3: Update task review log**

Update `tasks/todo.md` review section with:

```md
- Implementation plan written at `docs/superpowers/plans/2026-06-19-qr-camera-file-transfer-implementation.md`.
- Verification target for implementation: `npm test`, `npm run build`, and manual two-device QR transfer.
```

- [ ] **Step 4: Verify simulation, full tests, and build**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 5: Commit simulation and docs**

Run:

```bash
git add src/transfer/simulation.test.ts README.md tasks/todo.md
git commit -m "test: add QR transfer repair simulation"
```

## Task 8: Manual Browser Verification

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Start the dev server**

Run: `npm run dev -- --port 5173`

Expected: Vite prints a local URL such as `http://localhost:5173/`.

- [ ] **Step 2: Verify app loads in browser**

Open `http://localhost:5173/`.

Expected:

- Home screen shows `Send` and `Receive`.
- `Send` opens file selection.
- `Receive` opens camera controls.

- [ ] **Step 3: Verify simulated desktop repair path**

Use one browser window:

1. Open `Send`.
2. Select a file under 1MB.
3. Confirm QR frames start rendering.
4. Open `Receive` in another tab.
5. Use unit-level packet simulation result as the correctness proof for packet flow.

Expected: QR rendering works visually and automated tests prove repair semantics.

- [ ] **Step 4: Verify with two devices**

Use a phone and a MacBook:

1. Sender selects a small text file.
2. Receiver starts camera.
3. Receiver scans frames until chunks are present.
4. Receiver verifies and shows ACK or NACK.
5. If NACK, sender scans or pastes repair payload and streams missing chunks.

Expected: Receiver reaches ACK and downloaded bytes match original bytes.

- [ ] **Step 5: Record verification results**

Update `tasks/todo.md` review section with:

```md
- Automated verification: `npm test` passed.
- Build verification: `npm run build` passed.
- Browser verification: home, send, receive, QR render, and camera controls checked.
- Manual device verification: record file type, file size, devices, result, and repair behavior.
```

- [ ] **Step 6: Commit verification notes**

Run:

```bash
git add tasks/todo.md
git commit -m "docs: record QR transfer verification"
```

## Self-Review

- Spec coverage: The plan covers browser/PWA setup, single-file send/receive modes, 1MB file limit, manifest SHA-256, per-data CRC validation, chunk indexing, missing-range NACK, ACK completion, QR rendering, camera scanning, automated simulation, build verification, and manual two-device verification.
- Scope control: The plan keeps multi-file transfer, encryption, network transport, FEC, native apps, and automatic continuous bidirectional scanning outside the MVP.
- Type consistency: Shared names are `FileManifest`, `DataPacket`, `AckPacket`, `NackPacket`, `TransferPacket`, `SenderTransfer`, and `ReceiverState`; later tasks use the same names.
- Execution preference: Use subagent-driven development for Tasks 1-8, with one review after each task and commits after each completed task.
