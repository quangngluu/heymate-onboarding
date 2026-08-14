import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private bloomEnabled = false;

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
    // Companion stages composite live 3D over a DOM video plate. Other routes
    // still render their opaque scene.background, so one renderer serves both.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Threshold 1 keeps the world and skin out of bloom; only HDR emissive
    // values authored for the figurine and display rings contribute.
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.28, 1.45);
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.reducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    window.addEventListener('resize', this.onResizeBound);
    this.resize();
  }

  onUpdate(fn: UpdateFn): () => void {
    this.updates.add(fn);
    return () => this.updates.delete(fn);
  }

  setBloomEnabled(enabled: boolean): void {
    this.bloomEnabled = enabled;
    this.bloomPass.enabled = enabled;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const step = () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      for (const fn of this.updates) fn(dt, t);
      // Keep the normal showroom on the renderer's shortest path. The extra
      // framebuffer and bloom work only belongs to the premium inspection.
      if (this.bloomEnabled) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
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
    this.composer.setSize(w, h);
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
    this.composer.dispose();
    this.bloomPass.dispose();
    this.renderer.dispose();
  }
}
