import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodePacket, encodePacket } from './protocol/packetCodec';
import {
  DEFAULT_CHUNK_SIZE_BYTES,
  DEFAULT_FRAME_INTERVAL_MS,
  MAX_FILE_SIZE_BYTES,
  type TransferPacket,
} from './protocol/types';
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
type SenderPhase = 'idle' | 'sending' | 'waiting' | 'repairing' | 'complete';

const SCAN_INTERVAL_MS = 120;
const RECEIVER_SETTLE_MS = 900;

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
  const [cameraMessage, setCameraMessage] = useState('Sender camera scans the receiver result QR automatically.');
  const [receiverPayload, setReceiverPayload] = useState('');
  const responseVideoRef = useRef<HTMLVideoElement | null>(null);
  const responseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const responseStreamRef = useRef<MediaStream | null>(null);
  const responseScanTimerRef = useRef<number | null>(null);
  const responseCameraRunRef = useRef(0);
  const transferRef = useRef<SenderTransfer | null>(null);
  const lastReceiverPayloadRef = useRef('');
  const timerRef = useRef<number | null>(null);
  const streamRunRef = useRef(0);
  const prepareRunRef = useRef(0);

  const stopRound = useCallback(() => {
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
          stopRound();
          setError(`Could not render QR frame: ${getErrorText(renderError)}`);
        }
      }
    },
    [stopRound],
  );

  const startPacketRound = useCallback(
    (packets: TransferPacket[], nextPhase: Extract<SenderPhase, 'sending' | 'repairing'>, nextStatus: string) => {
      stopRound();
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
        nextIndex += 1;
        if (nextIndex >= packets.length) {
          window.clearInterval(timerRef.current ?? undefined);
          timerRef.current = null;
          if (streamRunRef.current === runId) {
            setQrUrl('');
            setPhase('waiting');
            setStatus('Round sent. Keep both devices facing each other while waiting for receiver ACK/NACK QR.');
          }
          return;
        }
        setFrameIndex(nextIndex);
        void renderPacket(packets[nextIndex], runId);
      }, DEFAULT_FRAME_INTERVAL_MS);
    },
    [renderPacket, stopRound],
  );

  const releaseResponseStream = useCallback((stream: MediaStream) => {
    stopCameraStream(stream);
    if (responseStreamRef.current === stream) {
      responseStreamRef.current = null;
    }
    const video = responseVideoRef.current;
    if (video?.srcObject === stream) {
      video.srcObject = null;
    }
  }, []);

  const stopResponseCamera = useCallback(() => {
    responseCameraRunRef.current += 1;
    if (responseScanTimerRef.current !== null) {
      window.clearInterval(responseScanTimerRef.current);
      responseScanTimerRef.current = null;
    }
    if (responseStreamRef.current !== null) {
      releaseResponseStream(responseStreamRef.current);
    }
    if (responseVideoRef.current !== null) {
      responseVideoRef.current.srcObject = null;
    }
  }, [releaseResponseStream]);

  useEffect(
    () => () => {
      prepareRunRef.current += 1;
      stopRound();
      stopResponseCamera();
    },
    [stopResponseCamera, stopRound],
  );

  function setCurrentTransfer(nextTransfer: SenderTransfer | null): void {
    transferRef.current = nextTransfer;
    setTransfer(nextTransfer);
  }

  function scanReceiverFrame(options: { quiet: boolean }): boolean {
    if (responseVideoRef.current === null || responseCanvasRef.current === null) {
      if (!options.quiet) {
        setCameraMessage('Start the sender camera before scanning receiver result QR.');
      }
      return false;
    }

    try {
      const imageData = captureVideoFrame(responseVideoRef.current, responseCanvasRef.current);
      const payload = decodeQrFromImageData(imageData);
      if (payload === null) {
        if (!options.quiet) {
          setCameraMessage('No receiver result QR found in this frame.');
        }
        return false;
      }
      return applyReceiverPayload(payload, 'scan');
    } catch (scanError) {
      const text = getErrorText(scanError);
      if (!options.quiet || text !== 'Video frame is not ready') {
        setCameraMessage(text === 'Video frame is not ready' ? 'Sender camera is warming up.' : `Could not scan: ${text}`);
      }
      return false;
    }
  }

  async function startResponseCamera(): Promise<void> {
    setError('');
    stopResponseCamera();
    const runId = responseCameraRunRef.current + 1;
    responseCameraRunRef.current = runId;
    let stream: MediaStream | null = null;

    try {
      stream = await openCameraStream();
      if (responseCameraRunRef.current !== runId) {
        releaseResponseStream(stream);
        return;
      }
      responseStreamRef.current = stream;
      if (responseVideoRef.current !== null) {
        responseVideoRef.current.srcObject = stream;
        await responseVideoRef.current.play();
      }
      if (responseCameraRunRef.current !== runId) {
        releaseResponseStream(stream);
        return;
      }
      setCameraMessage('Scanning receiver ACK/NACK QR.');
      responseScanTimerRef.current = window.setInterval(() => {
        if (responseCameraRunRef.current === runId) {
          scanReceiverFrame({ quiet: true });
        }
      }, SCAN_INTERVAL_MS);
    } catch (cameraError) {
      if (stream !== null) {
        releaseResponseStream(stream);
      }
      if (responseCameraRunRef.current !== runId) {
        return;
      }
      stopResponseCamera();
      setCameraMessage('Camera unavailable. Paste receiver payload manually.');
      setError(getCameraAccessErrorMessage(cameraError));
    }
  }

  async function handleFile(file: File): Promise<void> {
    const runId = prepareRunRef.current + 1;
    prepareRunRef.current = runId;
    setError('');
    stopRound();
    setQrUrl('');
    setFrameIndex(0);
    setFrameCount(0);
    setPhase('idle');
    setStatus('Preparing sender transfer...');
    lastReceiverPayloadRef.current = '';

    try {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error('File is larger than the 1MB MVP limit.');
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (prepareRunRef.current !== runId) {
        return;
      }
      const nextTransfer = await prepareSenderTransfer({
        bytes,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        chunkSize: DEFAULT_CHUNK_SIZE_BYTES,
      });
      if (prepareRunRef.current !== runId) {
        return;
      }
      setCurrentTransfer(nextTransfer);
      void startResponseCamera();
      startPacketRound(
        nextTransfer.packets,
        'sending',
        `Sending ${nextTransfer.manifest.fileName}: ${nextTransfer.manifest.totalChunks} data chunks in this round.`,
      );
    } catch (prepareError) {
      if (prepareRunRef.current !== runId) {
        return;
      }
      setCurrentTransfer(null);
      setStatus('Choose a file up to 1MB.');
      const text = getErrorText(prepareError);
      setError(text === 'File is larger than the 1MB MVP limit.' ? text : `Could not prepare file: ${text}`);
    }
  }

  function applyReceiverPayload(payloadText: string, source: 'manual' | 'scan'): boolean {
    const currentTransfer = transferRef.current;
    if (currentTransfer === null) {
      if (source === 'manual') {
        setError('Choose a file before applying receiver payloads.');
      }
      return false;
    }

    if (payloadText.length === 0) {
      if (source === 'manual') {
        setError('Paste an ACK or NACK payload first.');
      }
      return false;
    }

    if (source === 'scan' && payloadText === lastReceiverPayloadRef.current && timerRef.current !== null) {
      return false;
    }

    try {
      const packet = decodePacket(payloadText);
      if (packet.type === 'ack') {
        if (packet.transferId !== currentTransfer.manifest.transferId) {
          if (source === 'manual') {
            setError('ACK transfer ID does not match this sender transfer.');
          }
          return false;
        }
        if (packet.sha256 !== currentTransfer.manifest.sha256) {
          if (source === 'manual') {
            setError('ACK hash does not match this sender transfer.');
          }
          return false;
        }

        lastReceiverPayloadRef.current = payloadText;
        stopRound();
        stopResponseCamera();
        setPhase('complete');
        setQrUrl('');
        setStatus('Transfer complete. Receiver verified SHA-256.');
        setCameraMessage('Receiver ACK scanned. Camera stopped.');
        setReceiverPayload('');
        setError('');
        return true;
      }

      if (packet.type === 'nack') {
        if (source === 'scan' && timerRef.current !== null) {
          setCameraMessage('Receiver NACK scanned. Finishing the current QR round before repair.');
          setError('');
          return false;
        }

        const repairPackets = selectRepairPacketsForNack(currentTransfer, packet);
        if (repairPackets.length === 0) {
          if (source === 'manual') {
            setError('NACK did not request any repair chunks.');
          }
          return false;
        }

        lastReceiverPayloadRef.current = payloadText;
        startPacketRound(
          repairPackets,
          'repairing',
          `Sending ${repairPackets.length} requested repair ${repairPackets.length === 1 ? 'frame' : 'frames'}.`,
        );
        setCameraMessage('Receiver NACK scanned. Sending requested repair frames.');
        setReceiverPayload('');
        setError('');
        return true;
      }

      if (source === 'manual') {
        setError('Paste an ACK or NACK packet from the receiver.');
      }
      return false;
    } catch (payloadError) {
      if (source === 'manual') {
        setError(`Could not use receiver payload: ${getErrorText(payloadError)}`);
      }
      return false;
    }
  }

  function handleReceiverPayload(): void {
    applyReceiverPayload(receiverPayload.trim(), 'manual');
  }

  return (
    <section className="workPanel" aria-labelledby="sender-title">
      <div className="panelHeader">
        <p className="eyebrow">Send mode</p>
        <h2 id="sender-title">Sender</h2>
        <p className="subtitle">Choose one file. This side sends one QR round, scans the receiver result QR, and repairs automatically.</p>
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

      <div className="cameraPanel">
        <span className="fieldTitle">Receiver result camera</span>
        <span className="fieldHint">{cameraMessage}</span>
        <video className="cameraPreview compactPreview" ref={responseVideoRef} muted playsInline />
        <canvas ref={responseCanvasRef} hidden />
        <div className="controls twoUp" aria-label="Sender camera controls">
          <button type="button" onClick={() => void startResponseCamera()}>
            Start camera
          </button>
          <button
            type="button"
            onClick={() => {
              stopResponseCamera();
              setCameraMessage('Sender camera stopped. Paste receiver payload manually or restart camera.');
            }}
          >
            Stop camera
          </button>
        </div>
      </div>

      <div className="payloadPanel">
        <label className="fieldTitle" htmlFor="receiver-payload">
          Manual ACK/NACK fallback
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
  const cameraRunRef = useRef(0);
  const receiverStateRef = useRef(receiverState);
  const receiverVersionRef = useRef(0);
  const verifyRunRef = useRef(0);
  const autoVerifyTimerRef = useRef<number | null>(null);

  const progress = useMemo(() => getReceiverProgress(receiverState), [receiverState]);

  const releaseCameraStream = useCallback((stream: MediaStream) => {
    stopCameraStream(stream);
    if (streamRef.current === stream) {
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video?.srcObject === stream) {
      video.srcObject = null;
    }
  }, []);

  const stopCameraTracks = useCallback(() => {
    cameraRunRef.current += 1;
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current !== null) {
      releaseCameraStream(streamRef.current);
    }
    if (videoRef.current !== null) {
      videoRef.current.srcObject = null;
    }
  }, [releaseCameraStream]);

  const clearDownload = useCallback(() => {
    if (downloadUrlRef.current !== null) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    setDownload(null);
  }, []);

  const clearVerificationResult = useCallback(() => {
    verifyRunRef.current += 1;
    setResultPayload('');
    setResultQrUrl('');
    setResultType(null);
    clearDownload();
  }, [clearDownload]);

  function setNextReceiverState(nextState: ReceiverState): void {
    receiverVersionRef.current += 1;
    receiverStateRef.current = nextState;
    setReceiverState(nextState);
  }

  function isCurrentVerification(receiverVersion: number, verifyRunId: number): boolean {
    return receiverVersionRef.current === receiverVersion && verifyRunRef.current === verifyRunId;
  }

  function clearAutoVerifyTimer(): void {
    if (autoVerifyTimerRef.current !== null) {
      window.clearTimeout(autoVerifyTimerRef.current);
      autoVerifyTimerRef.current = null;
    }
  }

  function scheduleAutoVerify(nextState: ReceiverState): void {
    clearAutoVerifyTimer();
    const nextProgress = getReceiverProgress(nextState);
    if (nextState.manifest === null || nextProgress.totalChunks === 0) {
      return;
    }

    if (nextProgress.missingChunks === 0) {
      void verifyTransfer(nextState, 'auto-complete');
      return;
    }

    autoVerifyTimerRef.current = window.setTimeout(() => {
      autoVerifyTimerRef.current = null;
      void verifyTransfer(receiverStateRef.current, 'auto-settled');
    }, RECEIVER_SETTLE_MS);
  }

  useEffect(
    () => () => {
      stopCameraTracks();
      clearAutoVerifyTimer();
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
      const nextState = ingestPacket(receiverStateRef.current, packet);
      if (nextState !== receiverStateRef.current) {
        setNextReceiverState(nextState);
        clearVerificationResult();
        scheduleAutoVerify(nextState);
      }
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
    const runId = cameraRunRef.current + 1;
    cameraRunRef.current = runId;
    let stream: MediaStream | null = null;

    try {
      stream = await openCameraStream();
      if (cameraRunRef.current !== runId) {
        releaseCameraStream(stream);
        return;
      }
      streamRef.current = stream;
      if (videoRef.current !== null) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (cameraRunRef.current !== runId) {
        releaseCameraStream(stream);
        return;
      }
      setMessage('Scanning QR frames');
      scanTimerRef.current = window.setInterval(() => {
        if (cameraRunRef.current === runId) {
          scanFrame({ quiet: true });
        }
      }, SCAN_INTERVAL_MS);
    } catch (cameraError) {
      if (stream !== null) {
        releaseCameraStream(stream);
      }
      if (cameraRunRef.current !== runId) {
        return;
      }
      stopCameraTracks();
      setMessage('Camera receiver');
      setError(getCameraAccessErrorMessage(cameraError));
    }
  }

  useEffect(() => {
    void startCamera();
  }, []);

  async function verifyTransfer(stateOverride?: ReceiverState, mode: 'manual' | 'auto-complete' | 'auto-settled' = 'manual'): Promise<void> {
    setError('');
    const receiverVersion = receiverVersionRef.current;
    const verifyRunId = verifyRunRef.current + 1;
    verifyRunRef.current = verifyRunId;

    try {
      const currentState = stateOverride ?? receiverStateRef.current;
      const result = await verifyReceiverState(currentState);
      const payload = encodePacket(result);
      const nextQrUrl = await renderQrDataUrl(payload);
      if (!isCurrentVerification(receiverVersion, verifyRunId)) {
        return;
      }

      if (result.type === 'ack') {
        const file = await buildVerifiedFile(currentState);
        if (!isCurrentVerification(receiverVersion, verifyRunId)) {
          return;
        }
        setResultPayload(payload);
        setResultQrUrl(nextQrUrl);
        setResultType(result.type);
        if (file !== null) {
          clearDownload();
          const url = URL.createObjectURL(new Blob([toArrayBuffer(file.bytes)], { type: file.mimeType }));
          downloadUrlRef.current = url;
          setDownload({ url, name: file.fileName });
        }
        setMessage(mode === 'manual' ? 'Verified. Show ACK to sender.' : 'Verified automatically. Show ACK to sender.');
        return;
      }

      setResultPayload(payload);
      setResultQrUrl(nextQrUrl);
      setResultType(result.type);
      clearDownload();
      setMessage(mode === 'manual' ? 'Repair needed. Show NACK to sender.' : 'Missing chunks detected. Show NACK to sender.');
    } catch (verifyError) {
      if (!isCurrentVerification(receiverVersion, verifyRunId)) {
        return;
      }
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
        <p className="subtitle">Keep the camera on the sender. This side verifies automatically and shows ACK or NACK QR.</p>
      </div>

      <div className="controls" aria-label="Camera controls">
        <button type="button" onClick={() => void startCamera()}>
          Start camera
        </button>
        <button type="button" onClick={() => scanFrame({ quiet: false })}>
          Scan one frame
        </button>
        <button type="button" onClick={() => void verifyTransfer()}>
          Verify now
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
    case 'sending':
      return 'Sending data round';
    case 'waiting':
      return 'Waiting for receiver QR';
    case 'repairing':
      return 'Sending repair round';
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
