// Procedural ambient bed + tiny interaction cues.
//
// Mint MCP audio generation was unavailable in the build session, so this is
// a clearly isolated local stand-in: two detuned oscillators through a slow
// LFO and lowpass — a faint city-hum. Registered under the logical key
// `cyber-district-ambience` in mint-assets.json for later replacement.

/**
 * Put iOS in the audio session that media belongs in.
 *
 * By default a page's WebAudio runs in the *ambient* session: it is mixed at
 * ringer volume and the hardware Ring/Silent switch mutes it outright. That is
 * correct for a UI blip and wrong for a character who talks — with the switch
 * flipped, which is how most phones sit, every line of hers was silent while
 * the same build was audible on desktop. Resuming the context on a gesture,
 * which is the autoplay fix, does nothing about this: the context reaches
 * `running` and plays into a muted session.
 *
 * `playback` is the session for content the visitor came for. It ignores the
 * switch and follows media volume. Absent before iOS 16.4, hence the guard and
 * the element fallback below.
 */
function claimPlaybackSession(): void {
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = 'playback';
  } catch {
    // A value this Safari does not know: leave whatever it had.
  }
}

/**
 * The pre-16.4 form of the same fix.
 *
 * An `<audio>` element always played in the media session, so starting a
 * silent looping one promotes the whole page — WebAudio included — out of the
 * ambient session. It has to begin inside the entry gesture like everything
 * else here, and it stays playing, because the session reverts when the last
 * element stops.
 */
function startSessionAnchor(): HTMLAudioElement | null {
  try {
    // A 0.05s silent mono WAV, written out rather than pasted as a base64
    // blob so it is readable and obviously silent.
    const rate = 8000;
    const frames = rate / 20;
    const bytes = new Uint8Array(44 + frames * 2);
    const view = new DataView(bytes.buffer);
    const ascii = (at: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
    };
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + frames * 2, true);
    ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits
    ascii(36, 'data');
    view.setUint32(40, frames * 2, true);
    // Samples stay zero — silence is the point.

    const el = document.createElement('audio');
    el.src = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    el.loop = true;
    // Without this iOS can take the element over fullscreen rather than just
    // playing it. Typed on video only, so it goes on as an attribute.
    el.setAttribute('playsinline', '');
    // Audible enough to hold the session, silent because the file is.
    el.volume = 1;
    // In the document, because Safari establishes the session from elements the
    // page actually has; hidden, because there is nothing to show.
    el.setAttribute('aria-hidden', 'true');
    el.style.display = 'none';
    document.body.appendChild(el);
    void el.play().catch(() => undefined);
    return el;
  } catch {
    return null;
  }
}

/** A clip being fed in as it arrives. */
export interface PcmStream {
  push(samples: Float32Array): void;
  /** Seconds of audio still queued ahead of now. */
  end(): number;
  /** Context time the first piece was scheduled for, or null if none was. */
  playedFrom(): number | null;
}

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private started = false;
  /** The silent element holding the media session open on older iOS. */
  private anchor: HTMLAudioElement | null = null;
  muted = false;

  private clipCache = new Map<string, Promise<AudioBuffer>>();
  private clipSource: AudioBufferSourceNode | null = null;
  private clipGain: GainNode | null = null;

  /**
   * Play a one-shot clip (voice greeting). Routed through the WebAudio
   * context that the entry CTA already unlocked, so autoplay policy never
   * silently blocks it. A new clip stops the previous one.
   */
  playClip(url: string): void {
    const myToken = (this.clipToken = (this.clipToken + 1) | 0);
    void this.prepareClip(url).then((buffer) => {
      if (!buffer || myToken !== this.clipToken) return;
      this.startBuffer(buffer);
    });
  }

  /** Decode a clip before it is revealed, so dialogue and speech can start together. */
  async prepareClip(url: string): Promise<AudioBuffer | null> {
    this.start();
    const ctx = this.ctx;
    if (!ctx) return null;
    this.resumeIfNeeded();
    let p = this.clipCache.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`voice ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => ctx.decodeAudioData(buf));
      this.clipCache.set(url, p);
    }
    try {
      return await p;
    } catch {
      return null;
    }
  }

  /** Start a pre-decoded voice clip immediately. */
  playBuffer(buffer: AudioBuffer): void {
    this.start();
    if (!this.ctx) return;
    this.resumeIfNeeded();
    this.clipToken = (this.clipToken + 1) | 0;
    this.startBuffer(buffer);
  }

  /**
   * Play audio that is still arriving.
   *
   * Waiting for a whole clip to render costs seconds the visitor spends
   * watching nothing happen. The provider will stream raw PCM instead, so each
   * piece is scheduled on the audio clock the moment it lands, butted against
   * the end of the previous one. The lead-in absorbs network jitter: without
   * it the first late chunk would arrive after its slot had already passed and
   * leave a hole in the middle of a word.
   */
  openStream(sampleRate: number): PcmStream {
    this.start();
    const ctx = this.ctx;
    this.clipToken = (this.clipToken + 1) | 0;
    const token = this.clipToken;
    this.clipSource?.stop();
    this.clipSource = null;
    if (!ctx) return { push: () => {}, end: () => 0, playedFrom: () => null };

    this.resumeIfNeeded();
    if (!this.clipGain) {
      this.clipGain = ctx.createGain();
      this.clipGain.connect(ctx.destination);
    }
    this.clipGain.gain.value = this.muted ? 0 : 0.9;
    const gain = this.clipGain;

    const LEAD_IN = 0.12;
    let next = 0;
    let started: number | null = null;
    const live = () => token === this.clipToken;

    return {
      push: (samples: Float32Array) => {
        if (!live() || !samples.length) return;
        const buf = ctx.createBuffer(1, samples.length, sampleRate);
        buf.copyToChannel(samples, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gain);
        const at = Math.max(next, ctx.currentTime + LEAD_IN);
        src.start(at);
        if (started === null) started = at;
        next = at + buf.duration;
        this.clipSource = src;
      },
      end: () => (started === null ? 0 : Math.max(0, next - ctx.currentTime)),
      playedFrom: () => started,
    };
  }

  private startBuffer(buffer: AudioBuffer): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.clipSource?.stop();
    if (!this.clipGain) {
      this.clipGain = ctx.createGain();
      this.clipGain.connect(ctx.destination);
    }
    this.clipGain.gain.value = this.muted ? 0 : 0.9;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.clipGain);
    src.start();
    this.clipSource = src;
  }
  private clipToken = 0;

  stopClip(): void {
    this.clipToken++;
    this.clipSource?.stop();
    this.clipSource = null;
  }

  /** Must be called from a user gesture. */
  start(): void {
    if (this.started) {
      this.resumeIfNeeded();
      return;
    }
    // Both of these have to happen before the context exists and inside the
    // gesture, so the context is created into a session that is already the
    // media one. See the notes on the two helpers.
    claimPlaybackSession();
    this.anchor = startSessionAnchor();
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.05;
      master.connect(ctx.destination);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      lp.connect(master);

      for (const [freq, det, g] of [
        [55, 0, 0.5],
        [110.3, 4, 0.22],
        [164.8, -3, 0.1],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = g;
        osc.connect(og);
        og.connect(lp);
        osc.start();
      }
      // Slow swell LFO
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain);
      lfoGain.connect(master.gain);
      lfo.start();

      this.ctx = ctx;
      this.master = master;
      this.started = true;
      // iOS can create a suspended context even inside the entry tap. Resume
      // while that gesture is still active; later TTS responses arrive outside
      // the autoplay allowance.
      this.resumeIfNeeded();
    } catch {
      // Audio is optional — never block the experience on it.
    }
  }

  /**
   * Safari may report `interrupted` after the app is backgrounded or the phone
   * is locked. That state is not in every TypeScript DOM lib, so checking for
   * anything other than running/closed covers it without a browser-specific
   * branch.
   */
  private resumeIfNeeded(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    // A call, an alarm or Control Center hands the session back as ambient and
    // pauses the anchor, so both are re-asserted on every wake — not only when
    // the context itself needs resuming.
    claimPlaybackSession();
    if (this.anchor?.paused) void this.anchor.play().catch(() => undefined);
    if (ctx.state === 'running') return;
    void ctx.resume().catch(() => undefined);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.05, this.ctx.currentTime, 0.15);
    }
    if (this.clipGain && this.ctx) {
      this.clipGain.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  /** Short soft cue for selection / reveal moments. */
  chime(freq = 660): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  }
}
