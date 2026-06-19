# QR Camera File Transfer Design

## Summary

Build a browser web app/PWA that transfers a single file between two camera-equipped devices by showing a rapidly changing QR-code stream on one screen and scanning it with the other device's camera. The MVP targets 100KB to 1MB files and prioritizes deterministic correctness over maximum throughput.

The selected protocol is a hybrid flow:

1. Send file data as a one-way QR stream from sender screen to receiver camera.
2. Verify the reconstructed file with SHA-256 on the receiver.
3. Use a short reverse QR from the receiver screen to the sender camera for ACK/NACK.
4. If needed, resend only missing or corrupt chunks.

This keeps the main data path fast while still giving a clear, machine-verifiable completion signal.

## Goals

- Transfer one file between two devices using only browser APIs, screens, and cameras.
- Support common desktop and mobile browsers where camera access is available.
- Make completion deterministic with manifest-level SHA-256 verification.
- Recover from missed QR frames without restarting the whole transfer.
- Keep the MVP simple enough to implement and test before optimizing for large files.

## Non-Goals

- Multi-file batch transfer.
- Files larger than 1MB in the initial MVP.
- Native iOS, Android, or macOS apps.
- Network, Bluetooth, WebRTC, AirDrop, or local server transport.
- End-to-end encryption beyond local browser memory handling.
- Automatic bidirectional streaming while both devices scan continuously.

## User Experience

The app has two primary modes: `Send` and `Receive`.

In `Send`, the user selects a file. The app computes file metadata and SHA-256, chunks the file, and begins showing QR frames. The sender screen shows progress by current frame, transfer phase, and whether it is streaming all chunks or repair chunks.

In `Receive`, the user grants camera permission and points the camera at the sender screen. The app decodes QR frames, validates each frame, tracks received chunks, and displays progress. When all chunks appear present, the receiver rebuilds the file and verifies SHA-256. If verification succeeds, the receiver offers a download button and shows an ACK QR. If verification fails or chunks are missing, it shows a NACK QR that lists missing chunk ranges.

For repair, the sender switches to a `Scan Receiver QR` step. It scans the ACK/NACK QR from the receiver. If ACK, the transfer is complete. If NACK, the sender streams only the requested chunks. The receiver keeps scanning until hash verification succeeds.

## Architecture

The code should be organized around small, testable modules:

- `fileManifest`: reads file metadata and computes SHA-256.
- `chunker`: splits and reassembles binary files.
- `packetCodec`: serializes and parses QR payloads.
- `checksum`: computes per-frame CRC and validates parsed packets.
- `missingRanges`: tracks received chunk indexes and encodes compact ranges.
- `qrDisplay`: renders the outgoing QR frame sequence.
- `qrScanner`: reads camera frames and decodes QR payloads.
- `transferState`: owns sender and receiver state transitions.
- `ui`: renders mode selection, progress, repair prompts, and download actions.

The packet and transfer logic should not depend on DOM APIs. That allows protocol behavior to be tested without a camera.

## Packet Format

The protocol uses a small text or binary-safe payload encoded into QR data. The exact encoding can be finalized during implementation, but the logical fields are fixed.

Manifest packet:

- protocol version
- transfer ID
- packet type: `manifest`
- file name
- MIME type
- file size
- chunk size
- total chunk count
- file SHA-256

Data packet:

- protocol version
- transfer ID
- packet type: `data`
- chunk index
- total chunk count
- payload bytes
- payload CRC

ACK packet:

- protocol version
- transfer ID
- packet type: `ack`
- file SHA-256

NACK packet:

- protocol version
- transfer ID
- packet type: `nack`
- missing chunk ranges
- optional corrupt chunk ranges

Each packet includes enough transfer identity to reject stale frames from a previous transfer.

## Data Flow

Sender setup:

1. User selects a file.
2. Browser reads file into an `ArrayBuffer`.
3. App computes SHA-256.
4. App creates the manifest and data chunks.
5. App starts rendering manifest and data QR frames in a loop.

Receiver scan:

1. User starts camera scanning.
2. App decodes QR payloads.
3. App ignores packets with unknown version, wrong transfer ID, malformed payloads, or failed CRC.
4. App stores valid chunks by index.
5. App displays received count and missing count.

Verification:

1. Receiver reassembles chunks once all indexes are present.
2. Receiver computes SHA-256 over the rebuilt file.
3. If the hash matches, receiver enables download and shows ACK.
4. If chunks are missing or hash mismatches, receiver shows NACK with missing ranges.

Repair:

1. Sender scans the receiver's ACK/NACK QR.
2. If ACK matches the transfer, sender marks done.
3. If NACK matches the transfer, sender streams only requested chunk indexes.
4. Receiver repeats verification after repair chunks arrive.

## Reliability Strategy

Frame loss is expected. The sender should loop frames until the receiver succeeds or requests repair. A dropped QR frame must not corrupt the file because every data packet is sequence-addressed and CRC-checked.

The MVP should use conservative defaults:

- modest chunk size that fits reliably in a QR code after metadata overhead
- configurable frame interval for tuning
- repeated manifest frames so the receiver can join the stream late
- compact missing-range encoding for repair requests
- transfer ID to avoid mixing sessions

Forward error correction can be considered later, but is not required for the first MVP.

## Error Handling

Camera permission denied:

- Show a clear blocked state and keep the user in `Receive` mode.

Unsupported browser APIs:

- Detect missing `getUserMedia`, `crypto.subtle.digest`, or required file APIs at startup and show a non-transferable state.

Malformed QR payload:

- Ignore the frame and continue scanning.

CRC failure:

- Count as rejected and continue scanning.

Hash mismatch:

- Treat as repair-needed, not success. Show NACK.

Wrong transfer ID:

- Ignore the frame and keep current transfer state.

Oversized file:

- Reject files above the MVP limit before streaming begins.

## Testing Plan

Protocol tests:

- manifest creation and parsing
- chunk split and reassembly
- data packet encode/decode
- CRC failure rejection
- missing range generation
- ACK/NACK parse and validation
- full simulated transfer with intentionally dropped chunks

Browser-level checks:

- sender can select a small file and generate QR frames
- receiver state can ingest simulated decoded packets
- final download bytes match original bytes
- NACK repair sends only missing indexes

Manual device test:

- transfer a small text file
- transfer a small image or PDF under 1MB
- force missed frames by briefly covering the camera, then complete repair

## Open Implementation Choices

- QR rendering and scanning libraries.
- Exact QR payload encoding: JSON plus Base64 is easiest; a compact binary encoding may be faster later.
- Initial chunk size and frame interval.
- Whether repair scan uses the same camera component as receive mode or a separate sender-side scanner view.

These are implementation details, not product ambiguity. The design assumes they will be chosen conservatively during planning.
