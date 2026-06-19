# Camera File Sharing

Browser MVP for transferring one small file between camera-equipped devices by showing QR frames on one screen and scanning them with another device.

## Scope

- One file per transfer
- 100KB to 1MB MVP target
- QR stream for file data
- SHA-256 verification on the receiver
- Reverse ACK/NACK QR for completion and missing-chunk repair

## Run

```bash
npm install
npm run dev
```

Open the dev URL on two devices. Use `Send` on the device with the file and `Receive` on the device with the camera pointed at the sender screen.

Camera access requires HTTPS or localhost. For phone-to-laptop testing on a LAN, use an HTTPS tunnel or a local HTTPS setup if the phone browser blocks camera access on plain HTTP.

## Verify

```bash
npm test
npm run build
```

Manual checks:

1. Transfer a small text file.
2. Transfer an image or PDF under 1MB.
3. Cover the receiver camera during part of the stream.
4. Verify that the receiver shows NACK.
5. Apply the NACK on the sender and stream repair frames.
6. Verify that the receiver shows ACK and the downloaded file opens.
