// Procedural ambient bed + tiny interaction cues.
//
// Mint MCP audio generation was unavailable in the build session, so this is
// a clearly isolated local stand-in: two detuned oscillators through a slow
// LFO and lowpass — a faint city-hum. Registered under the logical key
// `cyber-district-ambience` in mint-assets.json for later replacement.

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private started = false;
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
    if (ctx.state === 'suspended') void ctx.resume();
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
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.clipToken = (this.clipToken + 1) | 0;
    this.startBuffer(buffer);
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
    if (this.started) return;
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
    } catch {
      // Audio is optional — never block the experience on it.
    }
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
