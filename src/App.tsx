import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChunkRequestPacket,
  createOfferPacket,
  decodeControlPacket,
  encodeControlPacket,
  type TransferOfferPacket,
} from './protocol/controlPacket';
import { encodeMissingRanges } from './protocol/missingRanges';
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
import { prepareSenderTransfer, selectRepairPackets, type SenderTransfer } from './transfer/sender';

type Mode = 'home' | 'send' | 'receive';
type SenderPhase = 'idle' | 'offering' | 'responding' | 'waiting' | 'complete';

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
      <p className="subtitle">The receiver requests chunk ranges, verifies SHA-256, and closes the transfer with ACK.</p>
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
  const [phase, setPhase] = useState<SenderPhase>('idle');
  const [qrUrl, setQrUrl] = useState('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [status, setStatus] = useState('Choose a file up to 1MB.');
  const [error, setError] = useState('');
  const [cameraMessage, setCameraMessage] = useState('Choose a file, then face the receiver screen.');
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

  const setSenderPhase = useCallback((nextPhase: SenderPhase) => {
    setPhase(nextPhase);
  }, []);

  const renderQrPayload = useCallback(
    async (payload: string, runId: number) => {
      try {
        const nextQrUrl = await renderQrDataUrl(payload);
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

  const renderPacket = useCallback(
    (packet: TransferPacket, runId: number) => {
      void renderQrPayload(encodePacket(packet), runId);
    },
    [renderQrPayload],
  );

  const startPacketRound = useCallback(
    (packets: TransferPacket[], nextStatus: string) => {
      stopRound();
      if (packets.length === 0) {
        setError('No QR frames are available to stream.');
        return;
      }

      const runId = streamRunRef.current;
      let nextIndex = 0;
      setSenderPhase('responding');
      setStatus(nextStatus);
      setError('');
      setFrameIndex(0);
      setFrameCount(packets.length);
      renderPacket(packets[0], runId);

      timerRef.current = window.setInterval(() => {
        nextIndex += 1;
        if (nextIndex >= packets.length) {
          window.clearInterval(timerRef.current ?? undefined);
          timerRef.current = null;
          if (streamRunRef.current === runId) {
            setQrUrl('');
            setSenderPhase('waiting');
            setStatus('Response sent. Waiting for the receiver request or final ACK QR.');
          }
          return;
        }
        setFrameIndex(nextIndex);
        renderPacket(packets[nextIndex], runId);
      }, DEFAULT_FRAME_INTERVAL_MS);
    },
    [renderPacket, setSenderPhase, stopRound],
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
  }

  function showOfferQr(nextTransfer: SenderTransfer): void {
    const runId = streamRunRef.current;
    const offer = createOfferPacket(nextTransfer.manifest);
    setSenderPhase('offering');
    setStatus(`${nextTransfer.manifest.fileName} is ready. Waiting for receiver chunk request QR.`);
    setCameraMessage('Scanning the receiver request QR.');
    setFrameIndex(0);
    setFrameCount(1);
    void renderQrPayload(encodeControlPacket(offer), runId);
  }

  function scanReceiverFrame(options: { quiet: boolean }): boolean {
    if (responseVideoRef.current === null || responseCanvasRef.current === null) {
      if (!options.quiet) {
        setCameraMessage('Camera is not ready yet.');
      }
      return false;
    }

    try {
      const imageData = captureVideoFrame(responseVideoRef.current, responseCanvasRef.current);
      const payload = decodeQrFromImageData(imageData);
      if (payload === null) {
        if (!options.quiet) {
          setCameraMessage('No receiver QR found in this frame.');
        }
        return false;
      }
      return applyReceiverPayload(payload);
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
      setCameraMessage('Scanning receiver request and ACK QR.');
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
      setCameraMessage('Camera unavailable. Allow camera access, then re-enter Send mode.');
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
    setSenderPhase('idle');
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
      showOfferQr(nextTransfer);
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

  function applyReceiverPayload(payloadText: string): boolean {
    const currentTransfer = transferRef.current;
    if (currentTransfer === null) {
      return false;
    }

    if (payloadText.length === 0) {
      return false;
    }

    if (payloadText === lastReceiverPayloadRef.current && timerRef.current !== null) {
      return false;
    }

    try {
      const controlPacket = decodeControlPacket(payloadText);
      if (controlPacket.type !== 'request') {
        return false;
      }
      if (controlPacket.transferId !== currentTransfer.manifest.transferId) {
        return false;
      }
      if (timerRef.current !== null) {
        setCameraMessage('Receiver request scanned. Finishing the current response first.');
        setError('');
        return false;
      }

      const requestedPackets = selectRepairPackets(currentTransfer, controlPacket.missingRanges);
      if (requestedPackets.length === 0) {
        return false;
      }

      lastReceiverPayloadRef.current = payloadText;
      startPacketRound(
        [currentTransfer.packets[0], ...requestedPackets],
        `Sending ${requestedPackets.length} requested ${requestedPackets.length === 1 ? 'chunk' : 'chunks'}.`,
      );
      setCameraMessage('Receiver request scanned. Sending requested chunks.');
      setError('');
      return true;
    } catch {
      // Not a control packet; try final transfer verdicts below.
    }

    try {
      const packet = decodePacket(payloadText);
      if (packet.type === 'ack') {
        if (packet.transferId !== currentTransfer.manifest.transferId) {
          return false;
        }
        if (packet.sha256 !== currentTransfer.manifest.sha256) {
          return false;
        }

        lastReceiverPayloadRef.current = payloadText;
        stopRound();
        stopResponseCamera();
        setSenderPhase('complete');
        setQrUrl('');
        setStatus('Transfer complete. Receiver verified SHA-256.');
        setCameraMessage('Receiver ACK scanned. Camera stopped.');
        setError('');
        return true;
      }

      if (packet.type === 'nack') {
        if (packet.transferId !== currentTransfer.manifest.transferId) {
          return false;
        }
        if (timerRef.current !== null) {
          setCameraMessage('Receiver repair request scanned. Finishing the current response first.');
          setError('');
          return false;
        }

        const repairPackets = selectRepairPackets(currentTransfer, packet.missingRanges);
        if (repairPackets.length === 0) {
          return false;
        }

        lastReceiverPayloadRef.current = payloadText;
        startPacketRound(
          [currentTransfer.packets[0], ...repairPackets],
          `Sending ${repairPackets.length} requested repair ${repairPackets.length === 1 ? 'chunk' : 'chunks'}.`,
        );
        setCameraMessage('Receiver repair request scanned. Sending requested chunks.');
        setError('');
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  return (
    <section className="workPanel" aria-labelledby="sender-title">
      <div className="panelHeader">
        <p className="eyebrow">Send mode</p>
        <h2 id="sender-title">Sender</h2>
        <p className="subtitle">Choose one file. This side offers it, waits for receiver requests, and sends only requested chunks.</p>
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

      <div className="transferSurface" aria-label="Transfer workspace">
        <figure className="qrStage">
          <span className="fieldTitle">Outgoing QR</span>
          {qrUrl !== '' ? (
            <img className="qrImage" src={qrUrl} alt="Current transfer QR frame" />
          ) : (
            <div className="emptyVisual" aria-hidden="true">
              Waiting
            </div>
          )}
          <figcaption>{qrUrl !== '' ? `QR ${frameIndex + 1} of ${frameCount}` : getSenderPhaseLabel(phase)}</figcaption>
        </figure>

        <div className="cameraPanel">
          <span className="fieldTitle">Receiver screen</span>
          <span className="fieldHint">{cameraMessage}</span>
          <video className="cameraPreview compactPreview" ref={responseVideoRef} muted playsInline />
          <canvas ref={responseCanvasRef} hidden />
        </div>
      </div>

      <p className="statusLine" aria-live="polite">
        Phase: {getSenderPhaseLabel(phase)}. {status}
      </p>

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
  const [offer, setOffer] = useState<TransferOfferPacket | null>(null);
  const [message, setMessage] = useState('Camera receiver');
  const [error, setError] = useState('');
  const [resultPayload, setResultPayload] = useState('');
  const [resultQrUrl, setResultQrUrl] = useState('');
  const [resultType, setResultType] = useState<'request' | 'ack' | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const downloadUrlRef = useRef<string | null>(null);
  const cameraRunRef = useRef(0);
  const offerRef = useRef<TransferOfferPacket | null>(null);
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

  function setCurrentOffer(nextOffer: TransferOfferPacket | null): void {
    offerRef.current = nextOffer;
    setOffer(nextOffer);
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

  async function publishChunkRequest(
    transferId: string,
    missingRanges: string,
    messageText: string,
    stateVersion = receiverVersionRef.current,
  ): Promise<void> {
    const verifyRunId = verifyRunRef.current + 1;
    verifyRunRef.current = verifyRunId;
    const request = createChunkRequestPacket(transferId, missingRanges);

    try {
      const payload = encodeControlPacket(request);
      const nextQrUrl = await renderQrDataUrl(payload);
      if (!isCurrentVerification(stateVersion, verifyRunId)) {
        return;
      }
      setResultPayload(payload);
      setResultQrUrl(nextQrUrl);
      setResultType('request');
      clearDownload();
      setMessage(messageText);
      setError('');
    } catch (requestError) {
      if (!isCurrentVerification(stateVersion, verifyRunId)) {
        return;
      }
      setError(`Could not create request QR: ${getErrorText(requestError)}`);
    }
  }

  function acceptOffer(nextOffer: TransferOfferPacket): boolean {
    const currentOffer = offerRef.current;
    if (currentOffer?.transferId === nextOffer.transferId && receiverStateRef.current.manifest === null) {
      return true;
    }

    clearAutoVerifyTimer();
    clearVerificationResult();
    setCurrentOffer(nextOffer);
    setNextReceiverState(createReceiverState());
    const stateVersion = receiverVersionRef.current;
    const allRanges = encodeMissingRanges(Array.from({ length: nextOffer.totalChunks }, (_, index) => index));
    void publishChunkRequest(
      nextOffer.transferId,
      allRanges,
      `Ready for ${nextOffer.fileName}. Requesting ${nextOffer.totalChunks} chunks.`,
      stateVersion,
    );
    return true;
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

      try {
        const controlPacket = decodeControlPacket(payload);
        if (controlPacket.type === 'offer') {
          const accepted = acceptOffer(controlPacket);
          setError('');
          return accepted;
        }
        return true;
      } catch {
        // Not a control packet; continue with transfer packet decoding.
      }

      const packet = decodePacket(payload);
      const nextState = ingestPacket(receiverStateRef.current, packet);
      if (nextState !== receiverStateRef.current) {
        setCurrentOffer(null);
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
      if (result.type === 'ack') {
        const payload = encodePacket(result);
        const nextQrUrl = await renderQrDataUrl(payload);
        if (!isCurrentVerification(receiverVersion, verifyRunId)) {
          return;
        }
        const file = await buildVerifiedFile(currentState);
        if (!isCurrentVerification(receiverVersion, verifyRunId)) {
          return;
        }
        setResultPayload(payload);
        setResultQrUrl(nextQrUrl);
        setResultType('ack');
        if (file !== null) {
          clearDownload();
          const url = URL.createObjectURL(new Blob([toArrayBuffer(file.bytes)], { type: file.mimeType }));
          downloadUrlRef.current = url;
          setDownload({ url, name: file.fileName });
        }
        setMessage(mode === 'manual' ? 'Verified. Show ACK to sender.' : 'Verified automatically. Show ACK to sender.');
        return;
      }

      const request = createChunkRequestPacket(result.transferId, result.missingRanges);
      const payload = encodeControlPacket(request);
      const nextQrUrl = await renderQrDataUrl(payload);
      if (!isCurrentVerification(receiverVersion, verifyRunId)) {
        return;
      }
      setResultPayload(payload);
      setResultQrUrl(nextQrUrl);
      setResultType('request');
      clearDownload();
      setMessage(mode === 'manual' ? 'Requesting missing chunks.' : 'Missing chunks detected. Requesting repair chunks.');
    } catch (verifyError) {
      if (!isCurrentVerification(receiverVersion, verifyRunId)) {
        return;
      }
      setError(getVerifyErrorMessage(verifyError));
    }
  }

  return (
    <section className="workPanel" aria-labelledby="receiver-title">
      <div className="panelHeader">
        <p className="eyebrow">Receive mode</p>
        <h2 id="receiver-title">{message}</h2>
        <p className="subtitle">Keep this camera on the sender screen. This side requests chunks, verifies them, and shows the next QR automatically.</p>
      </div>

      <div className="transferSurface" aria-label="Transfer workspace">
        <div className="cameraPanel">
          <span className="fieldTitle">Sender screen</span>
          <span className="fieldHint">{message}</span>
          <video className="cameraPreview" ref={videoRef} muted playsInline />
          <canvas ref={canvasRef} hidden />
        </div>

        <figure className="qrStage">
          <span className="fieldTitle">Outgoing QR</span>
          {resultQrUrl !== '' ? (
            <img className="qrImage" src={resultQrUrl} alt={resultType === 'ack' ? 'ACK QR payload' : 'Chunk request QR payload'} />
          ) : (
            <div className="emptyVisual" aria-hidden="true">
              Waiting
            </div>
          )}
          <figcaption>{resultQrUrl !== '' ? (resultType === 'ack' ? 'ACK payload' : 'Chunk request') : 'Request QR'}</figcaption>
        </figure>
      </div>

      <p className="statusLine" aria-live="polite">
        {offer !== null && receiverState.manifest === null
          ? `Offered: ${offer.fileName} (${offer.totalChunks} chunks). `
          : ''}
        Received {progress.receivedChunks}/{progress.totalChunks} chunks. Missing: {progress.missingChunks}. Rejected: {receiverState.rejectedFrames}.
      </p>

      {error !== '' && (
        <p className="errorLine" role="alert">
          {error}
        </p>
      )}

      {download !== null && (
        <a className="downloadButton" href={download.url} download={download.name}>
          Download verified file
        </a>
      )}

      {resultPayload !== '' && <span className="srOnly">Current QR payload is ready.</span>}
    </section>
  );
}

function getSenderPhaseLabel(phase: SenderPhase): string {
  switch (phase) {
    case 'idle':
      return 'Idle';
    case 'offering':
      return 'Offering file';
    case 'responding':
      return 'Sending requested chunks';
    case 'waiting':
      return 'Waiting for receiver request';
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
