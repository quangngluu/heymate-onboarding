// Companion-universe staging: the selected resident stands on the center
// base, the others wait behind-left as dimmed "shelf" copies. Selecting a
// resident swaps who holds the base.
//
// The models are static sculpts (no rig, no morph targets), so "alive" is
// carried by light and motion: a breathing sway, a turn toward the camera,
// and a base ring that pulses while she speaks.

import * as THREE from 'three';
import { loadNormalized } from './champions';
import { WAIFUS } from '../config/waifus';

/** Total height on the base, including the figure's own display plinth. */
const HERO_HEIGHT = 1.3;
const GHOST_HEIGHT = 1.05;

/** Waiting spots behind and to the left of the base, matching the layout. */
export const GHOST_SLOTS: [number, number, number][] = [
  [-2.35, 0, -1.5],
  [-3.5, 0, -3.1],
  [-1.9, 0, -4.6],
];

interface Entry {
  id: string;
  group: THREE.Group;
  materials: THREE.Material[];
  targetYaw: number;
  loaded: boolean;
}

export class WaifuStage {
  private entries = new Map<string, Entry>();
  private heroId: string | null = null;
  private heroY = 0;
  /** 0 = idle, 1 = mid-utterance; drives ring pulse and sway amplitude. */
  speakingLevel = 0;
  private speakingTarget = 0;

  readonly ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private glow: THREE.PointLight;

  constructor(
    private scene: THREE.Scene,
    /** Top surface of the center base; the hero stands here. */
    baseTopY: number
  ) {
    this.heroY = baseTopY;
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.014, 10, 64), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = baseTopY + 0.01;
    scene.add(this.ring);
    this.glow = new THREE.PointLight(0xffffff, 0, 4, 2);
    this.glow.position.set(0, baseTopY + 0.35, 0.3);
    scene.add(this.glow);
  }

  setBaseTop(y: number): void {
    this.heroY = y;
    this.ring.position.y = y + 0.01;
    this.glow.position.y = y + 0.35;
    const hero = this.heroId && this.entries.get(this.heroId);
    if (hero) hero.group.position.y = y;
  }

  /** Load every resident; the hero is fetched first. */
  async load(heroId: string, onReady: (id: string) => void): Promise<void> {
    const order = [heroId, ...WAIFUS.map((w) => w.id).filter((id) => id !== heroId)];
    for (const id of order) {
      const cfg = WAIFUS.find((w) => w.id === id)!;
      try {
        const model = await loadNormalized(cfg.modelUrl);
        const entry: Entry = {
          id,
          group: model,
          materials: [],
          targetYaw: 0,
          loaded: true,
        };
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) entry.materials.push(mat);
        });
        this.entries.set(id, entry);
        this.scene.add(model);
        this.place(id, id === this.heroId || id === heroId);
        onReady(id);
      } catch {
        console.warn(`Waifu model failed to load: ${id}`);
      }
    }
  }

  /** Give the base to a resident; everyone else moves to a waiting slot. */
  setHero(id: string): void {
    this.heroId = id;
    let ghostIdx = 0;
    for (const w of WAIFUS) {
      const isHero = w.id === id;
      if (!isHero) ghostIdx++;
      this.place(w.id, isHero, isHero ? 0 : ghostIdx - 1);
    }
  }

  private place(id: string, isHero: boolean, ghostIdx = 0): void {
    const e = this.entries.get(id);
    if (!e) return;
    // Models arrive normalized to 1.45 tall by the shared character loader.
    const scale = (isHero ? HERO_HEIGHT : GHOST_HEIGHT) / 1.45;
    e.group.scale.setScalar(scale);
    if (isHero) {
      e.group.position.set(0, this.heroY, 0);
      e.targetYaw = 0;
    } else {
      const slot = GHOST_SLOTS[ghostIdx % GHOST_SLOTS.length];
      e.group.position.set(slot[0], 0, slot[2]);
      e.targetYaw = 0.35; // angled slightly toward the base
    }
    for (const m of e.materials) {
      const mat = m as THREE.MeshStandardMaterial;
      mat.transparent = !isHero;
      mat.opacity = isHero ? 1 : 0.45;
      mat.depthWrite = isHero;
    }
    e.group.renderOrder = isHero ? 0 : -1;
  }

  /** Ring/light accent, matched to the active resident. */
  setAccent(color: number): void {
    this.ringMat.color.setHex(color);
    this.glow.color.setHex(color);
  }

  /** Called when a greeting or reply starts/stops. */
  setSpeaking(on: boolean): void {
    this.speakingTarget = on ? 1 : 0;
  }

  update(t: number, dt: number): void {
    this.speakingLevel += (this.speakingTarget - this.speakingLevel) * Math.min(1, dt * 5);

    // While speaking the ring flickers on a fast carrier so it reads as a
    // voice rather than a slow ambient pulse.
    const chatter = this.speakingLevel * (0.5 + 0.5 * Math.sin(t * 17.3) * Math.sin(t * 9.1));
    this.ringMat.opacity = 0.28 + chatter * 0.6 + Math.sin(t * 1.5) * 0.04;
    this.ring.scale.setScalar(1 + chatter * 0.05);
    this.glow.intensity = this.speakingLevel * 2.4 + 0.35;

    for (const [id, e] of this.entries) {
      const isHero = id === this.heroId;
      e.group.rotation.y += (e.targetYaw - e.group.rotation.y) * Math.min(1, dt * 4);
      if (isHero) {
        // Breathing sway, slightly stronger while talking.
        const amp = 0.006 + this.speakingLevel * 0.006;
        e.group.position.y = this.heroY + Math.sin(t * 1.15) * amp;
        e.group.rotation.z = Math.sin(t * 0.7) * 0.004;
      }
    }
  }

  /**
   * SIMULATED look regeneration: the sculpt is untouched, a deterministic
   * colorway derived from the prompt seed is tinted onto cloned materials.
   * Production would swap in a regenerated GLB here instead.
   */
  tintHero(seed: number): void {
    const e = this.heroId && this.entries.get(this.heroId);
    if (!e) return;
    const hue = (seed % 360) / 360;
    const tint = new THREE.Color().setHSL(hue, 0.45, 0.62);
    e.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const cloned = mats.map((src) => {
        const base = (src.userData.originalMaterial as THREE.Material | undefined) ?? src;
        const c = base.clone() as THREE.MeshStandardMaterial;
        c.userData.originalMaterial = base;
        if (c.color) c.color.copy((base as THREE.MeshStandardMaterial).color).lerp(tint, 0.45);
        return c;
      });
      m.material = cloned.length > 1 ? cloned : cloned[0];
    });
    this.refreshMaterials(e);
  }

  restoreHero(): void {
    const e = this.heroId && this.entries.get(this.heroId);
    if (!e) return;
    e.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const restored = mats.map(
        (src) => (src.userData.originalMaterial as THREE.Material | undefined) ?? src
      );
      m.material = restored.length > 1 ? restored : restored[0];
    });
    this.refreshMaterials(e);
    this.place(e.id, true);
  }

  private refreshMaterials(e: Entry): void {
    e.materials = [];
    e.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) e.materials.push(mat);
    });
  }

  /** Objects eligible for pointer picking (ghosts only; hero is already up). */
  pickTargets(): { id: string; object: THREE.Object3D }[] {
    return [...this.entries.entries()]
      .filter(([id]) => id !== this.heroId)
      .map(([id, e]) => ({ id, object: e.group }));
  }

  dispose(): void {
    for (const e of this.entries.values()) e.group.parent?.remove(e.group);
    this.entries.clear();
    this.ring.parent?.remove(this.ring);
    this.ring.geometry.dispose();
    this.ringMat.dispose();
    this.glow.parent?.remove(this.glow);
  }
}
