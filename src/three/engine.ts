import * as THREE from 'three';

export type UpdateFn = (dt: number, elapsed: number) => void;

/**
 * Single owner of renderer, scene, camera, animation loop, resize and DPR.
 * Nothing else creates a renderer or calls requestAnimationFrame.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;

  private updates = new Set<UpdateFn>();
  private clock = new THREE.Clock();
  private running = false;
  private raf = 0;
  private timer = 0;
  private onVisibility: (() => void) | null = null;
  private onResizeBound = () => this.resize();

  readonly reducedMotion: boolean;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);

    this.reducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    window.addEventListener('resize', this.onResizeBound);
    this.resize();
  }

  onUpdate(fn: UpdateFn): () => void {
    this.updates.add(fn);
    return () => this.updates.delete(fn);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const step = () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      for (const fn of this.updates) fn(dt, t);
      this.renderer.render(this.scene, this.camera);
    };
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      step();
    };
    // rAF is suspended while the document is hidden, which would freeze
    // promise-based transitions mid-flight; fall back to a low-rate timer.
    const applyDriver = () => {
      cancelAnimationFrame(this.raf);
      window.clearInterval(this.timer);
      if (!this.running) return;
      if (document.visibilityState === 'hidden') {
        this.timer = window.setInterval(step, 33);
      } else {
        loop();
      }
    };
    document.addEventListener('visibilitychange', applyDriver);
    this.onVisibility = applyDriver;
    applyDriver();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.timer);
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('resize', this.onResizeBound);
    this.updates.clear();
    this.renderer.dispose();
  }
}
