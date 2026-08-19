const EVI_ENDPOINT = 'wss://api.hume.ai/v0/evi/chat';
const CALL_LIMIT_MS = 60_000;
const WARNING_AFTER_MS = 50_000;
const AUDIO_SLICE_MS = 100;

export type EviCallPhase = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

export interface EviCallState {
  phase: EviCallPhase;
  secondsRemaining: number;
  warning: boolean;
  activity: string;
  userText: string;
  assistantText: string;
}

type EviCallListener = (state: EviCallState) => void;

interface TokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
}

interface EviMessage {
  type?: unknown;
  data?: unknown;
  message?: unknown;
}

interface ActiveCall {
  id: number;
  deadline: number;
  countdownTimer: number;
  limitTimer: number;
  socket: WebSocket | null;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  playback: AudioPlaybackQueue;
}

const initialState: EviCallState = {
  phase: 'idle',
  secondsRemaining: 60,
  warning: false,
  activity: 'Ready for an English voice call.',
  userText: '',
  assistantText: '',
};

let state = initialState;
let activeCall: ActiveCall | null = null;
let nextCallId = 0;
const listeners = new Set<EviCallListener>();

/** The config id is intentionally public; only the credential pair is secret. */
export function isEviCallConfigured(): boolean {
  return Boolean(import.meta.env.VITE_HUME_CONFIG_ID?.trim());
}

export function getEviCallState(): EviCallState {
  return state;
}

export function subscribeEviCall(listener: EviCallListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function publish(patch: Partial<EviCallState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

function isCurrent(call: ActiveCall): boolean {
  return activeCall?.id === call.id;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function messageText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const content = (value as { content?: unknown }).content;
  return typeof content === 'string' ? content.trim() : '';
}

function recorderMimeType(): string | undefined {
  const supported = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  return supported.find((mime) => MediaRecorder.isTypeSupported(mime));
}

/**
 * EVI audio messages are independently decodable clips. Decode serially and
 * wait for each source to finish so network jitter cannot reorder playback.
 */
class AudioPlaybackQueue {
  private context: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;

  resume(): void {
    const AudioContextClass = window.AudioContext;
    this.context ??= new AudioContextClass();
    void this.context.resume().catch(() => undefined);
  }

  enqueue(base64Audio: string): void {
    const generation = this.generation;
    this.queue = this.queue
      .then(async () => {
        const context = this.context;
        if (!context || context.state === 'closed' || generation !== this.generation) return;
        const encoded = base64ToArrayBuffer(base64Audio);
        const decoded = await context.decodeAudioData(encoded.slice(0));
        if (generation !== this.generation || this.context !== context) return;

        await new Promise<void>((resolve) => {
          const source = context.createBufferSource();
          this.currentSource = source;
          source.buffer = decoded;
          source.connect(context.destination);
          source.addEventListener('ended', () => {
            if (this.currentSource === source) this.currentSource = null;
            resolve();
          }, { once: true });
          source.start();
        });
      })
      // A malformed or unsupported clip must not poison all later playback.
      .catch(() => undefined);
  }

  clear(): void {
    this.generation++;
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // It may already have ended between the check and stop().
      }
      this.currentSource = null;
    }
    this.queue = Promise.resolve();
  }

  stop(): void {
    this.clear();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close();
    this.queue = Promise.resolve();
  }
}

function stopCallResources(call: ActiveCall): void {
  window.clearInterval(call.countdownTimer);
  window.clearTimeout(call.limitTimer);

  const recorder = call.recorder;
  call.recorder = null;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onerror = null;
    if (recorder.state !== 'inactive') recorder.stop();
  }

  call.stream?.getTracks().forEach((track) => track.stop());
  call.stream = null;

  const socket = call.socket;
  call.socket = null;
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    try {
      socket.close(1000, 'client-ended');
    } catch {
      // A connecting socket can close itself while cleanup is running.
    }
  }

  call.playback.stop();
}

function finishCall(
  call: ActiveCall,
  phase: Extract<EviCallPhase, 'ended' | 'error'>,
  activity: string
): void {
  if (!isCurrent(call)) return;
  activeCall = null;
  stopCallResources(call);
  publish({
    phase,
    secondsRemaining: Math.max(0, Math.ceil((call.deadline - Date.now()) / 1000)),
    warning: false,
    activity,
  });
}

function updateCountdown(call: ActiveCall): void {
  if (!isCurrent(call)) return;
  const now = Date.now();
  if (now >= call.deadline) {
    finishCall(call, 'ended', '60-second call limit reached.');
    return;
  }
  const remaining = Math.max(0, Math.ceil((call.deadline - now) / 1000));
  publish({ secondsRemaining: remaining, warning: now >= call.deadline - (CALL_LIMIT_MS - WARNING_AFTER_MS) });
}

function safeErrorMessage(value: unknown): string {
  const detail = messageText(value);
  return detail ? `Call error: ${detail.slice(0, 120)}` : 'The voice call ended unexpectedly.';
}

function handleMessage(call: ActiveCall, event: MessageEvent): void {
  if (!isCurrent(call) || typeof event.data !== 'string') return;
  if (Date.now() >= call.deadline) {
    finishCall(call, 'ended', '60-second call limit reached.');
    return;
  }

  let payload: EviMessage;
  try {
    payload = JSON.parse(event.data) as EviMessage;
  } catch {
    return;
  }

  switch (payload.type) {
    case 'user_message': {
      const text = messageText(payload.message);
      // Barge-in should discard any assistant clips that were still queued.
      call.playback.clear();
      publish({ userText: text, activity: text ? 'Rin is listening…' : 'Listening…' });
      break;
    }
    case 'assistant_message': {
      const text = messageText(payload.message);
      publish({ assistantText: text, activity: 'Rin is responding…' });
      break;
    }
    case 'audio_output':
      if (typeof payload.data === 'string' && payload.data) {
        call.playback.enqueue(payload.data);
        publish({ activity: 'Rin is speaking…' });
      }
      break;
    case 'assistant_end':
      publish({ activity: 'Your turn.' });
      break;
    case 'error':
      finishCall(call, 'error', safeErrorMessage(payload.message));
      break;
    default:
      // chat_metadata and future protocol messages do not affect the call UI.
      break;
  }
}

function startRecorder(call: ActiveCall): void {
  const stream = call.stream;
  if (!stream || !isCurrent(call)) return;

  const mimeType = recorderMimeType();
  if (!mimeType) throw new Error('This browser cannot encode microphone audio for EVI.');

  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
  call.recorder = recorder;
  recorder.ondataavailable = (event) => {
    if (!event.data.size || !isCurrent(call) || call.socket?.readyState !== WebSocket.OPEN) return;
    if (Date.now() >= call.deadline) {
      finishCall(call, 'ended', '60-second call limit reached.');
      return;
    }
    void event.data.arrayBuffer().then((buffer) => {
      if (!isCurrent(call) || call.socket?.readyState !== WebSocket.OPEN) return;
      if (Date.now() >= call.deadline) {
        finishCall(call, 'ended', '60-second call limit reached.');
        return;
      }
      call.socket.send(JSON.stringify({ type: 'audio_input', data: arrayBufferToBase64(buffer) }));
    });
  };
  recorder.onerror = () => finishCall(call, 'error', 'Microphone capture failed.');
  recorder.start(AUDIO_SLICE_MS);
}

/**
 * Starts one English EVI session. Repeated calls are ignored until the active
 * session has fully ended. The 60-second safety timer begins before token or
 * microphone work so setup latency can never extend the cap.
 */
export async function startEviCall(): Promise<void> {
  const configId = import.meta.env.VITE_HUME_CONFIG_ID?.trim();
  if (activeCall || !configId) return;

  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === 'undefined' ||
    typeof window.AudioContext === 'undefined'
  ) {
    publish({ phase: 'error', activity: 'Voice calls are not supported in this browser.' });
    return;
  }

  const playback = new AudioPlaybackQueue();
  // Called synchronously from the click path so mobile browsers permit audio.
  playback.resume();

  const call: ActiveCall = {
    id: ++nextCallId,
    deadline: Date.now() + CALL_LIMIT_MS,
    countdownTimer: 0,
    limitTimer: 0,
    socket: null,
    stream: null,
    recorder: null,
    playback,
  };
  activeCall = call;
  state = initialState;
  publish({ phase: 'connecting', activity: 'Connecting to Rin…' });
  call.countdownTimer = window.setInterval(() => updateCountdown(call), 250);
  call.limitTimer = window.setTimeout(
    () => finishCall(call, 'ended', '60-second call limit reached.'),
    CALL_LIMIT_MS
  );

  try {
    const response = await fetch('/api/hume-token', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const token = (await response.json().catch(() => null)) as
      | (TokenResponse & { unavailable?: boolean })
      | null;
    const unavailable = token?.unavailable === true;
    if (
      !response.ok ||
      unavailable ||
      typeof token?.access_token !== 'string' ||
      !token.access_token
    ) {
      const message =
        response.status === 503 || unavailable
          ? 'Voice calling is not configured on this server.'
          : 'Could not authorize the voice call.';
      throw new Error(message);
    }
    if (!isCurrent(call)) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (!isCurrent(call)) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    call.stream = stream;

    const url = new URL(EVI_ENDPOINT);
    url.searchParams.set('access_token', token.access_token);
    url.searchParams.set('config_id', configId);
    const socket = new WebSocket(url);
    call.socket = socket;

    socket.addEventListener('open', () => {
      if (!isCurrent(call)) return;
      if (Date.now() >= call.deadline) {
        finishCall(call, 'ended', '60-second call limit reached.');
        return;
      }
      try {
        startRecorder(call);
        publish({ phase: 'live', activity: 'Live with Rin.' });
      } catch (error) {
        finishCall(call, 'error', error instanceof Error ? error.message : 'Microphone capture failed.');
      }
    });
    socket.addEventListener('message', (event) => handleMessage(call, event));
    socket.addEventListener('error', () => {
      finishCall(call, 'error', 'Could not connect to Rin.');
    });
    socket.addEventListener('close', (event) => {
      if (!isCurrent(call)) return;
      const clean = event.code === 1000 || event.code === 1001;
      finishCall(call, clean ? 'ended' : 'error', clean ? 'Call ended.' : 'The voice connection closed.');
    });
  } catch (error) {
    finishCall(
      call,
      'error',
      error instanceof Error && error.message ? error.message : 'Could not start the voice call.'
    );
  }
}

/** Stops the microphone, WebSocket, queued audio, and both client timers. */
export function endEviCall(): void {
  if (!activeCall) return;
  finishCall(activeCall, 'ended', 'Call ended.');
}
