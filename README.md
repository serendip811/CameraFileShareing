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

## Deploy to GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`. The workflow runs tests, builds the Vite app, and deploys `dist/` to GitHub Pages on pushes to `main`.

After creating an empty GitHub repository:

```bash
git remote add origin git@github.com:<your-user>/<your-repo>.git
git push -u origin codex/qr-transfer-mvp:main
```

Then open the GitHub repository settings:

1. Go to `Settings` -> `Pages`.
2. Set `Source` to `GitHub Actions`.
3. Wait for the `Deploy to GitHub Pages` action to finish.
4. Open `https://<your-user>.github.io/<your-repo>/`.

The Vite `base` path is set automatically in GitHub Actions from the repository name, so project-site URLs such as `/CameraFileShareing/` work without hard-coding the repo name.

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
