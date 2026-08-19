// One shared GPU particle pool for every short-lived point effect in the stage.
//
// Flight is integrated in the vertex shader from `age = uTime - aBirth`, so a
// spawn is a few typed-array writes and a single `needsUpdate` flag; nothing
// touches the buffers per frame. The pool is fixed-size with a ring head —
// bursts and ambient motes recycle the same allocation instead of growing it.
//
// `burst` mode culls a particle once `u >= 1` (age >= life); `ambient` mode
// wraps `u = fract(age / life)` so the field never empties and never respawns.
// Under `prefers-reduced-motion` the clock is frozen and spawns seed an age
// spread across 0..life, composing a still field instead of a frozen flash.

import * as THREE from 'three';

export type GpuParticleMode = 'burst' | 'ambient';

export interface GpuParticlePoolOptions {
  /** Fixed particle count; a burst longer than this recycles the oldest. */
  capacity?: number;
  /** Seconds from birth to cull (burst) or to wrap (ambient). */
  life?: number;
  /** World-space point size before perspective scaling. */
  size?: number;
  /** Base tint, multiplied by the radial sprite alpha. */
  color?: number;
  mode?: GpuParticleMode;
  /** Freeze the aging clock and seed a still composition instead. */
  reducedMotion?: boolean;
}

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uLife;
  uniform float uRate;
  uniform float uWrap;
  uniform float uSize;
  uniform float uSwirl;

  attribute vec3 aOrigin;
  attribute vec3 aVelocity;
  attribute float aBirth;
  attribute vec2 aSeed;

  varying float vAlpha;

  void main() {
    float age = uTime - aBirth;
    float u = age / uLife;
    if (uWrap > 0.5) {
      u = fract(u);
    }

    // Burst particles are culled outside [0, 1]; ambient particles always live.
    float alive = uWrap > 0.5 ? 1.0 : step(0.0, u) * step(u, 1.0);
    // A slot never spawned keeps its sentinel birth and stays culled even in
    // ambient mode, where fract() would otherwise wrap it back into a blink.
    if (aBirth < -1e6) alive = 0.0;

    // flight is the wrapped age so an ambient particle returns to its origin
    // on wrap instead of drifting off with the raw (unbounded) age.
    float flight = u * uLife;
    vec3 pos = aOrigin + aVelocity * flight * (1.0 - 0.34 * u) * uRate;

    // Gentle per-particle swirl, phase and speed seeded from aSeed.
    float phase = aSeed.y * 6.2831853 + flight * (0.9 + aSeed.x * 1.8) * uRate;
    pos += vec3(sin(phase), 0.0, cos(phase)) * uSwirl * u;

    vAlpha = smoothstep(0.0, 0.09, u) * (1.0 - smoothstep(0.40, 1.0, u));

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (460.0 / max(1.0, -mv.z)) * alive;

    if (alive < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
    }
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uSprite;
  uniform vec3 uColor;
  uniform float uOpacity;

  varying float vAlpha;

  void main() {
    float a = texture2D(uSprite, gl_PointCoord).a;
    gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
  }
`;

/** Soft radial alpha sprite; a typed-array fallback keeps node tests DOM-free. */
function softRadialSprite(): THREE.Texture {
  const size = 64;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.85)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }
  }
  // Same falloff computed in JS — no 2D canvas, no WebGL, still a soft radial.
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - size / 2) / (size / 2);
      const dy = (y + 0.5 - size / 2) / (size / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const t = d >= 1 ? 0 : 1 - d;
      const soft = t * t * (3 - 2 * t);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(soft * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export class GpuParticlePool {
  readonly points: THREE.Points;
  readonly capacity: number;

  private readonly life: number;
  private readonly mode: GpuParticleMode;
  private reducedMotion: boolean;

  private readonly origins: Float32Array;
  private readonly velocities: Float32Array;
  private readonly births: Float32Array;
  private readonly seeds: Float32Array;

  private readonly originAttr: THREE.BufferAttribute;
  private readonly velocityAttr: THREE.BufferAttribute;
  private readonly birthAttr: THREE.BufferAttribute;
  private readonly seedAttr: THREE.BufferAttribute;

  private readonly material: THREE.ShaderMaterial;
  private readonly sprite: THREE.Texture;

  private head = 0;
  private uTime = 0;

  constructor(parent: THREE.Object3D, opts: GpuParticlePoolOptions = {}) {
    this.capacity = opts.capacity ?? 620;
    this.life = opts.life ?? 1.6;
    this.mode = opts.mode ?? 'burst';
    this.reducedMotion = opts.reducedMotion ?? false;

    this.origins = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.births = new Float32Array(this.capacity);
    this.seeds = new Float32Array(this.capacity * 2);

    // Stable phase/size per slot, and a birth far in the past so every slot is
    // culled (u < 0) until its first spawn writes a real birth.
    for (let i = 0; i < this.capacity; i++) {
      this.births[i] = -1e9;
      this.seeds[i * 2] = Math.random();
      this.seeds[i * 2 + 1] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    this.originAttr = new THREE.BufferAttribute(this.origins, 3);
    this.velocityAttr = new THREE.BufferAttribute(this.velocities, 3);
    this.birthAttr = new THREE.BufferAttribute(this.births, 1);
    this.seedAttr = new THREE.BufferAttribute(this.seeds, 2);
    geometry.setAttribute('aOrigin', this.originAttr);
    geometry.setAttribute('aVelocity', this.velocityAttr);
    geometry.setAttribute('aBirth', this.birthAttr);
    geometry.setAttribute('aSeed', this.seedAttr);
    // `position` doubles as the draw-count attribute and the origin array; the
    // shader reads `aOrigin` (same buffer) and ignores the injected `position`.
    geometry.setAttribute('position', this.originAttr);

    this.sprite = softRadialSprite();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: this.life },
        uRate: { value: 1 },
        uWrap: { value: this.mode === 'ambient' ? 1 : 0 },
        uSize: { value: opts.size ?? 0.035 },
        uSwirl: { value: 0.1 },
        uOpacity: { value: 1 },
        uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
        uSprite: { value: this.sprite },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  /**
   * Write one slot at the ring head. Ambient mode (and reduced motion) stagger
   * the birth across a whole life so the field is already filled; a burst under
   * motion starts every particle at age 0 so it flies out from the origin.
   */
  spawn(origin: THREE.Vector3, velocity: THREE.Vector3): void {
    const index = this.head;
    this.head = (this.head + 1) % this.capacity;

    const o = index * 3;
    this.origins[o] = origin.x;
    this.origins[o + 1] = origin.y;
    this.origins[o + 2] = origin.z;
    this.velocities[o] = velocity.x;
    this.velocities[o + 1] = velocity.y;
    this.velocities[o + 2] = velocity.z;
    this.births[index] =
      this.mode === 'ambient' || this.reducedMotion
        ? this.uTime - Math.random() * this.life
        : this.uTime;

    this.markDirty();
  }

  /** Burst `count` particles from `origin`, fanned outward and upward. */
  burst(origin: THREE.Vector3, count: number, spread: number): void {
    const velocity = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * spread;
      const outward = 0.3 + Math.random() * 0.7;
      position.set(
        origin.x + Math.cos(angle) * radius,
        origin.y + Math.random() * spread * 0.5,
        origin.z + Math.sin(angle) * radius
      );
      velocity.set(
        Math.cos(angle) * outward,
        0.5 + Math.random() * 0.9,
        Math.sin(angle) * outward
      );
      this.spawn(position, velocity);
    }
  }

  /** Emit a single particle at `pos` with a gentle upward drift. */
  emitAt(pos: THREE.Vector3): void {
    this.spawn(pos, new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.5, (Math.random() - 0.5) * 0.1));
  }

  /** Advance the aging clock; `t` is a monotonic time source, `dt` is unused. */
  update(dt: number, t: number): void {
    void dt;
    if (this.reducedMotion) return; // frozen: spawns already seeded a still age
    this.uTime = t;
    this.material.uniforms.uTime.value = t;
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  setColor(color: number): void {
    (this.material.uniforms.uColor.value as THREE.Color).setHex(color);
  }

  setSize(size: number): void {
    this.material.uniforms.uSize.value = size;
  }

  /** Multiply rise/swirl for the ambient field (e.g. 1 + speakingLevel). */
  setRate(rate: number): void {
    this.material.uniforms.uRate.value = rate;
  }

  /** Swirl amplitude in world units; 0 disables the per-particle orbit. */
  setSwirl(swirl: number): void {
    this.material.uniforms.uSwirl.value = swirl;
  }

  setOpacity(opacity: number): void {
    this.material.uniforms.uOpacity.value = opacity;
  }

  private markDirty(): void {
    this.originAttr.needsUpdate = true;
    this.velocityAttr.needsUpdate = true;
    this.birthAttr.needsUpdate = true;
    this.seedAttr.needsUpdate = true;
  }

  dispose(): void {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
    this.material.dispose();
    this.sprite.dispose();
  }
}
