import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodePacket, encodePacket } from './protocol/packetCodec';
import { DEFAULT_CHUNK_SIZE_BYTES, DEFAULT_FRAME_INTERVAL_MS, type TransferPacket } from './protocol/types';
import { renderQrDataUrl } from './qr/qrDisplay';
import {
  CameraAccessError,
  captureVideoFrame,
  decodeQrFromImageData,
  openCameraStream,
  stopCameraStream,
} from './qr/qrScanner';
import {
  buildVerifiedFile,
  createReceiverState,
  getReceiverProgress,
  ingestPacket,
  verifyReceiverState,
  type ReceiverState,
} from './transfer/receiver';
import { prepareSenderTransfer, selectRepairPacketsForNack, type SenderTransfer } from './transfer/sender';

type Mode = 'home' | 'send' | 'receive';
type SenderPhase = 'idle' | 'streaming' | 'repairing' | 'complete';

const SCAN_INTERVAL_MS = 120;

export function getCameraAccessErrorMessage(error: unknown): string {
  if (!(error instanceof CameraAccessError)) {
    return 'Could not open the camera. Try again.';
  }

  switch (error.code) {
    case 'insecure-context':
      return 'Camera requires a secure context. Use HTTPS or localhost.';
    case 'unsupported':
      return 'This browser does not support camera access. Try a current mobile browser.';
    case 'permission-denied':
      return 'Allow camera access in your browser settings, then start the camera again.';
    case 'not-found':
      return 'No camera was found. Connect or enable a camera and try again.';
    case 'unknown':
      return 'Could not open the camera. Check camera availability and try again.';
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>('home');

  return (
    <main className="appShell">
      <header className="topBar">
        <button className="brandButton" type="button" onClick={() => setMode('home')}>
          Camera File Sharing
        </button>
      </header>
      {mode === 'home' && <Home onSend={() => setMode('send')} onReceive={() => setMode('receive')} />}
      {mode === 'send' && <SendPanel />}
      {mode === 'receive' && <ReceivePanel />}
    </main>
  );
}

function Home({ onSend, onReceive }: { onSend: () => void; onReceive: () => void }) {
  return (
    <section className="heroPanel" aria-labelledby="home-title">
      <p className="eyebrow">QR optical transfer</p>
      <h1 id="home-title">Send a small file by showing QR frames to another camera.</h1>
      <p className="subtitle">The receiver verifies SHA-256 and shows one ACK or NACK QR for the sender.</p>
      <div className="modeGrid">
        <button className="modeButton" type="button" onClick={onSend}>
          Send
        </button>
        <button className="modeButton secondary" type="button" onClick={onReceive}>
          Receive
        </button>
      </div>
    </section>
  );
}

function SendPanel() {
  const [transfer, setTransfer] = useState<SenderTransfer | null>(null);
  const [phase, setPhase] = useState<SenderPhase>('idle');
  const [qrUrl, setQrUrl] = useState('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [status, setStatus] = useState('Choose a file up to 1MB.');
  const [error, setError] = useState('');
  const [receiverPayload, setReceiverPayload] = useState('');
  const timerRef = useRef<number | null>(null);
  const streamRunRef = useRef(0);

  const stopStream = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRunRef.current += 1;
  }, []);

  const renderPacket = useCallback(
    async (packet: TransferPacket, runId: number) => {
      try {
        const nextQrUrl = await renderQrDataUrl(encodePacket(packet));
        if (streamRunRef.current === runId) {
          setQrUrl(nextQrUrl);
        }
      } catch (renderError) {
        if (streamRunRef.current === runId) {
          stopStream();
          setError(`Could not render QR frame: ${getErrorText(renderError)}`);
        }
      }
    },
    [stopStream],
  );

  const startStream = useCallback(
    (packets: TransferPacket[], nextPhase: SenderPhase, nextStatus: string) => {
      stopStream();
      if (packets.length === 0) {
        setError('No QR frames are available to stream.');
        return;
      }

      const runId = streamRunRef.current;
      let nextIndex = 0;
      setPhase(nextPhase);
      setStatus(nextStatus);
      setError('');
      setFrameIndex(0);
      setFrameCount(packets.length);
      void renderPacket(packets[0], runId);

      timerRef.current = window.setInterval(() => {
        nextIndex = (nextIndex + 1) % packets.length;
        setFrameIndex(nextIndex);
        void renderPacket(packets[nextIndex], runId);
      }, DEFAULT_FRAME_INTERVAL_MS);
    },
    [renderPacket, stopStream],
  );

  useEffect(() => stopStream, [stopStream]);

  async function handleFile(file: File): Promise<void> {
    setError('');
    stopStream();
    setQrUrl('');
    setFrameIndex(0);
    setFrameCount(0);
    setPhase('idle');
    setStatus('Preparing sender transfer...');

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const nextTransfer = await prepareSenderTransfer({
        bytes,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        chunkSize: DEFAULT_CHUNK_SIZE_BYTES,
      });
      setTransfer(nextTransfer);
      startStream(
        nextTransfer.packets,
        'streaming',
        `${nextTransfer.manifest.fileName} is streaming as ${nextTransfer.manifest.totalChunks} data chunks.`,
      );
    } catch (prepareError) {
      setTransfer(null);
      setStatus('Choose a file up to 1MB.');
      setError(`Could not prepare file: ${getErrorText(prepareError)}`);
    }
  }

  function handleReceiverPayload(): void {
    if (transfer === null) {
      setError('Choose a file before applying receiver payloads.');
      return;
    }

    const payloadText = receiverPayload.trim();
    if (payloadText.length === 0) {
      setError('Paste an ACK or NACK payload first.');
      return;
    }

    try {
      const packet = decodePacket(payloadText);
      if (packet.type === 'ack') {
        if (packet.transferId !== transfer.manifest.transferId) {
          setError('ACK transfer ID does not match this sender transfer.');
          return;
        }
        if (packet.sha256 !== transfer.manifest.sha256) {
          setError('ACK hash does not match this sender transfer.');
          return;
        }

        stopStream();
        setPhase('complete');
        setStatus('Transfer complete. Receiver verified SHA-256.');
        setReceiverPayload('');
        setError('');
        return;
      }

      if (packet.type === 'nack') {
        const repairPackets = selectRepairPacketsForNack(transfer, packet);
        if (repairPackets.length === 0) {
          setError('NACK did not request any repair chunks.');
          return;
        }

        startStream(
          repairPackets,
          'repairing',
          `Streaming ${repairPackets.length} repair ${repairPackets.length === 1 ? 'frame' : 'frames'}.`,
        );
        setReceiverPayload('');
        return;
      }

      setError('Paste an ACK or NACK packet from the receiver.');
    } catch (payloadError) {
      setError(`Could not use receiver payload: ${getErrorText(payloadError)}`);
    }
  }

  return (
    <section className="workPanel" aria-labelledby="sender-title">
      <div className="panelHeader">
        <p className="eyebrow">Send mode</p>
        <h2 id="sender-title">Sender</h2>
        <p className="subtitle">Choose one file and show the QR stream to the receiver camera.</p>
      </div>

      <label className="fileDrop">
        <span className="fieldTitle">File</span>
        <span className="fieldHint">{status}</span>
        <input
          aria-label="Choose file to send"
          type="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file !== undefined) {
              void handleFile(file);
            }
          }}
        />
      </label>

      {qrUrl !== '' && (
        <figure className="qrStage">
          <img className="qrImage" src={qrUrl} alt="Current transfer QR frame" />
          <figcaption>
            Frame {frameIndex + 1} of {frameCount}
          </figcaption>
        </figure>
      )}

      <p className="statusLine" aria-live="polite">
        Phase: {getSenderPhaseLabel(phase)}
      </p>

      <div className="payloadPanel">
        <label className="fieldTitle" htmlFor="receiver-payload">
          ACK/NACK payload
        </label>
        <textarea
          id="receiver-payload"
          className="payloadBox"
          value={receiverPayload}
          onChange={(event) => {
            setReceiverPayload(event.currentTarget.value);
            setError('');
          }}
          placeholder="Paste receiver ACK or NACK JSON"
        />
        <button className="inlineButton" type="button" onClick={handleReceiverPayload}>
          Apply receiver payload
        </button>
      </div>

      {error !== '' && (
        <p className="errorLine" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function ReceivePanel() {
  const [receiverState, setReceiverState] = useState<ReceiverState>(() => createReceiverState());
  const [message, setMessage] = useState('Camera receiver');
  const [error, setError] = useState('');
  const [resultPayload, setResultPayload] = useState('');
  const [resultQrUrl, setResultQrUrl] = useState('');
  const [resultType, setResultType] = useState<'ack' | 'nack' | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const downloadUrlRef = useRef<string | null>(null);

  const progress = useMemo(() => getReceiverProgress(receiverState), [receiverState]);

  const stopCameraTracks = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current !== null) {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    }
    if (videoRef.current !== null) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const clearDownload = useCallback(() => {
    if (downloadUrlRef.current !== null) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    setDownload(null);
  }, []);

  useEffect(
    () => () => {
      stopCameraTracks();
      if (downloadUrlRef.current !== null) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
    },
    [stopCameraTracks],
  );

  function scanFrame(options: { quiet: boolean }): boolean {
    if (videoRef.current === null || canvasRef.current === null) {
      if (!options.quiet) {
        setMessage('Start the camera before scanning.');
      }
      return false;
    }

    try {
      const imageData = captureVideoFrame(videoRef.current, canvasRef.current);
      const payload = decodeQrFromImageData(imageData);
      if (payload === null) {
        if (!options.quiet) {
          setMessage('No QR found in this frame.');
        }
        return false;
      }

      const packet = decodePacket(payload);
      setReceiverState((current) => ingestPacket(current, packet));
      setMessage(`Read ${packet.type} packet.`);
      setError('');
      return true;
    } catch (scanError) {
      const text = getErrorText(scanError);
      if (!options.quiet || text !== 'Video frame is not ready') {
        setMessage('Rejected QR frame.');
        setError(text === 'Video frame is not ready' ? 'Video frame is not ready yet.' : `Could not read QR: ${text}`);
      }
      return false;
    }
  }

  async function startCamera(): Promise<void> {
    setError('');
    stopCameraTracks();

    try {
      const stream = await openCameraStream();
      streamRef.current = stream;
      if (videoRef.current !== null) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMessage('Scanning QR frames');
      scanTimerRef.current = window.setInterval(() => {
        scanFrame({ quiet: true });
      }, SCAN_INTERVAL_MS);
    } catch (cameraError) {
      stopCameraTracks();
      setMessage('Camera receiver');
      setError(getCameraAccessErrorMessage(cameraError));
    }
  }

  async function verifyTransfer(): Promise<void> {
    setError('');

    try {
      const result = await verifyReceiverState(receiverState);
      const payload = encodePacket(result);
      const nextQrUrl = await renderQrDataUrl(payload);
      setResultPayload(payload);
      setResultQrUrl(nextQrUrl);
      setResultType(result.type);

      if (result.type === 'ack') {
        const file = await buildVerifiedFile(receiverState);
        if (file !== null) {
          clearDownload();
          const url = URL.createObjectURL(new Blob([toArrayBuffer(file.bytes)], { type: file.mimeType }));
          downloadUrlRef.current = url;
          setDownload({ url, name: file.fileName });
        }
        setMessage('Verified. Show ACK to sender.');
        return;
      }

      clearDownload();
      setMessage('Repair needed. Show NACK to sender.');
    } catch (verifyError) {
      setError(getVerifyErrorMessage(verifyError));
    }
  }

  function stopCamera(): void {
    stopCameraTracks();
    setMessage('Camera stopped');
  }

  return (
    <section className="workPanel" aria-labelledby="receiver-title">
      <div className="panelHeader">
        <p className="eyebrow">Receive mode</p>
        <h2 id="receiver-title">{message}</h2>
        <p className="subtitle">Scan sender frames, verify the file, then show the result QR back to the sender.</p>
      </div>

      <div className="controls" aria-label="Camera controls">
        <button type="button" onClick={() => void startCamera()}>
          Start camera
        </button>
        <button type="button" onClick={() => scanFrame({ quiet: false })}>
          Scan one frame
        </button>
        <button type="button" onClick={() => void verifyTransfer()}>
          Verify
        </button>
        <button type="button" onClick={stopCamera}>
          Stop camera
        </button>
      </div>

      <video className="cameraPreview" ref={videoRef} muted playsInline />
      <canvas ref={canvasRef} hidden />

      <p className="statusLine" aria-live="polite">
        Received {progress.receivedChunks}/{progress.totalChunks} chunks. Missing: {progress.missingChunks}. Rejected:{' '}
        {receiverState.rejectedFrames}.
      </p>

      {error !== '' && (
        <p className="errorLine" role="alert">
          {error}
        </p>
      )}

      {resultQrUrl !== '' && (
        <figure className="qrStage">
          <img className="qrImage" src={resultQrUrl} alt={resultType === 'ack' ? 'ACK QR payload' : 'NACK QR payload'} />
          <figcaption>{resultType === 'ack' ? 'ACK payload' : 'NACK payload'}</figcaption>
        </figure>
      )}

      {download !== null && (
        <a className="downloadButton" href={download.url} download={download.name}>
          Download verified file
        </a>
      )}

      {resultPayload !== '' && (
        <label className="payloadPanel">
          <span className="fieldTitle">Result payload</span>
          <textarea className="payloadBox" readOnly value={resultPayload} />
        </label>
      )}
    </section>
  );
}

function getSenderPhaseLabel(phase: SenderPhase): string {
  switch (phase) {
    case 'idle':
      return 'Idle';
    case 'streaming':
      return 'Streaming file frames';
    case 'repairing':
      return 'Streaming repair frames';
    case 'complete':
      return 'Complete';
  }
}

function getVerifyErrorMessage(error: unknown): string {
  const text = getErrorText(error);
  if (text === 'Cannot verify without manifest') {
    return 'Scan a transfer QR before verifying.';
  }
  return `Could not verify transfer: ${text}`;
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
