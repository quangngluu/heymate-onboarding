import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CamPreset } from '../config/cameras';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface Flight {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromFov: number;
  toFov: number;
  t: number;
  dur: number;
  resolve: (completed: boolean) => void;
}

/**
 * Owner of all camera transitions. Presentation transforms only — canonical
 * model transforms are never touched here. Transitions are promises that
 * resolve `true` on completion, `false` when cancelled; `skip()` jumps to the
 * end and resolves `true`.
 */
export class CameraRig {
  readonly target = new THREE.Vector3(0, 1.2, 0);
  private flight: Flight | null = null;
  private controls: OrbitControls | null = null;
  private baseFov = 40;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private reducedMotion: boolean
  ) {}

  /**
   * Presets are framed for a landscape stage; on narrow (portrait) viewports
   * widen the fov so the subject still fits with headroom.
   */
  private adjustedFov(fov: number): number {
    const aspect = Math.max(this.camera.aspect, 0.01);
    const scale = THREE.MathUtils.clamp(Math.pow(1.45 / aspect, 0.6), 1, 1.6);
    return Math.min(fov * scale, 70);
  }

  /** Re-apply aspect compensation after a viewport resize. */
  refreshFov(): void {
    if (this.flight) return;
    this.camera.fov = this.adjustedFov(this.baseFov);
    this.camera.updateProjectionMatrix();
  }

  attachControls(controls: OrbitControls): void {
    this.controls = controls;
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  applyPreset(p: CamPreset): void {
    this.camera.position.set(...p.pos);
    this.target.set(...p.target);
    if (p.fov) this.baseFov = p.fov;
    this.camera.fov = this.adjustedFov(this.baseFov);
    this.camera.updateProjectionMatrix();
    this.syncLook();
  }

  flyTo(p: CamPreset, duration = 1.6): Promise<boolean> {
    this.cancel();
    if (this.reducedMotion || duration <= 0) {
      this.applyPreset(p);
      return Promise.resolve(true);
    }
    if (p.fov) this.baseFov = p.fov;
    return new Promise((resolve) => {
      this.flight = {
        fromPos: this.camera.position.clone(),
        toPos: new THREE.Vector3(...p.pos),
        fromTarget: this.target.clone(),
        toTarget: new THREE.Vector3(...p.target),
        fromFov: this.camera.fov,
        toFov: this.adjustedFov(this.baseFov),
        t: 0,
        dur: duration,
        resolve,
      };
    });
  }

  /** Jump the active flight to its end state. */
  skip(): void {
    const f = this.flight;
    if (!f) return;
    this.flight = null;
    this.camera.position.copy(f.toPos);
    this.target.copy(f.toTarget);
    this.camera.fov = f.toFov;
    this.camera.updateProjectionMatrix();
    this.syncLook();
    f.resolve(true);
  }

  cancel(): void {
    const f = this.flight;
    if (!f) return;
    this.flight = null;
    f.resolve(false);
  }

  update(dt: number): void {
    const f = this.flight;
    if (!f) return;
    f.t = Math.min(f.t + dt / f.dur, 1);
    const k = easeInOutCubic(f.t);
    this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
    this.target.lerpVectors(f.fromTarget, f.toTarget, k);
    this.camera.fov = f.fromFov + (f.toFov - f.fromFov) * k;
    this.camera.updateProjectionMatrix();
    this.syncLook();
    if (f.t >= 1) {
      this.flight = null;
      f.resolve(true);
    }
  }

  /** Keep OrbitControls (when enabled) and lookAt coherent with one target. */
  syncLook(): void {
    if (this.controls?.enabled) {
      this.controls.target.copy(this.target);
      this.controls.update();
    } else {
      this.camera.lookAt(this.target);
    }
  }
}
