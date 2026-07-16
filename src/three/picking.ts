import * as THREE from 'three';

/**
 * Intentional raycast picking: a fixed pick set of application-level entries,
 * evaluated only when the pointer actually moved (dirty flag) — never
 * per-frame while idle.
 */
export interface PickEntry {
  id: string;
  object: THREE.Object3D;
}

export class Picker {
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private dirty = false;
  private hasPointer = false;
  private entries: PickEntry[] = [];
  enabled = false;

  hovered: string | null = null;
  onHover: (id: string | null) => void = () => {};
  onPick: (id: string) => void = () => {};

  constructor(
    private dom: HTMLElement,
    private camera: THREE.Camera
  ) {
    dom.addEventListener('pointermove', (e) => {
      this.setPointer(e.clientX, e.clientY);
    });
    dom.addEventListener('pointerleave', () => {
      this.hasPointer = false;
      this.setHover(null);
    });
    dom.addEventListener('pointercancel', () => {
      this.hasPointer = false;
      this.setHover(null);
    });
    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.setPointer(e.clientX, e.clientY);
      const id = this.cast();
      if (id) this.onPick(id);
    });
  }

  private setPointer(x: number, y: number): void {
    this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.hasPointer = true;
    this.dirty = true;
  }

  setPickSet(entries: PickEntry[]): void {
    this.entries = entries;
    this.dirty = true;
  }

  private cast(): string | null {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    let best: { id: string; dist: number } | null = null;
    for (const e of this.entries) {
      const hits = this.raycaster.intersectObject(e.object, true);
      if (hits.length && (!best || hits[0].distance < best.dist)) {
        best = { id: e.id, dist: hits[0].distance };
      }
    }
    return best?.id ?? null;
  }

  private setHover(id: string | null): void {
    if (this.hovered === id) return;
    this.hovered = id;
    this.dom.style.cursor = id ? 'pointer' : '';
    this.onHover(id);
  }

  /** Call once per frame; does nothing unless pointer state changed. */
  update(): void {
    if (!this.enabled || !this.dirty || !this.hasPointer) return;
    this.dirty = false;
    this.setHover(this.cast());
  }
}
