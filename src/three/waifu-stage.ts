// Companion-universe staging: the selected resident stands on the center
// base, the others wait behind-left as dimmed "shelf" copies. Selecting a
// resident swaps who holds the base.
//
// The models are static sculpts (no rig, no morph targets), so "alive" is
// carried by light and motion: a breathing sway, a turn toward the camera,
// and a base ring that pulses while she speaks.

import * as THREE from 'three';
import { loadNormalized } from './champions';
import { RESIDENTS, type VisualIdentity } from '../config/residents';
import type { QuestPresentation } from '../config/quests';

type MoteMotif = VisualIdentity['moteMotif'];

/** Total height on the base, including the figure's own display plinth. */
const HERO_HEIGHT = 1.3;
const GHOST_HEIGHT = 1.05;

/** Waiting spots behind and to the left of the base, matching the layout. */
/**
 * Waiting spots. Read from the stage camera they must step back *and* across,
 * otherwise perspective lines them up into a single column.
 */
export const GHOST_SLOTS: [number, number, number][] = [
  [-1.55, 0, 0.1], // nearer the camera: lower, larger, and clear of the base
  [1.65, 0, -3.6], // the far slot crosses to the right so the dossier column is clear
  [-1.2, 0, -5.8],
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
  private maxAnisotropy = 8;
  private glow: THREE.PointLight;
  private upLight: THREE.SpotLight;
  private motes: THREE.Points;
  private moteMotif: MoteMotif = 'data';
  private questMode = false;
  private archive = new THREE.Group();
  private archiveFrames: THREE.Mesh[] = [];
  private frame12: THREE.Mesh;
  private frame12Material: THREE.MeshBasicMaterial;
  private archiveSilhouette: THREE.Mesh;

  constructor(
    private scene: THREE.Scene,
    /** Top surface of the center base; the hero stands here. */
    baseTopY: number,
    maxAnisotropy = 8
  ) {
    this.maxAnisotropy = maxAnisotropy;
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

    // Display-case uplight: throws her silhouette off the dark backdrop and
    // catches the underside of the sculpt the key light misses.
    this.upLight = new THREE.SpotLight(0xffffff, 3.2, 5, Math.PI / 3, 0.85, 1.1);
    this.upLight.position.set(0, baseTopY + 0.05, 0.55);
    this.upLight.target.position.set(0, baseTopY + 1.15, 0);
    scene.add(this.upLight, this.upLight.target);

    const N = 220;
    const positions = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.022,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    scene.add(this.motes);

    // Prototype 1 uses authored geometry as the guaranteed scene. A generated
    // image may later replace a camera cut, but the mystery and its mutations
    // never wait on an image endpoint.
    const frameGeometry = new THREE.PlaneGeometry(0.58, 0.9);
    for (let i = 0; i < 11; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x76d9ff,
        transparent: true,
        opacity: 0.08 + (i % 3) * 0.025,
        wireframe: true,
        depthWrite: false,
      });
      const frame = new THREE.Mesh(frameGeometry.clone(), material);
      const side = i % 2 === 0 ? -1 : 1;
      frame.position.set(side * (1.05 + (i % 3) * 0.12), baseTopY + 0.95, -0.35 - i * 0.42);
      frame.rotation.y = side * -0.32;
      this.archive.add(frame);
      this.archiveFrames.push(frame);
    }
    this.frame12Material = new THREE.MeshBasicMaterial({
      color: 0xeafaff,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      depthWrite: false,
    });
    this.frame12 = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.45), this.frame12Material);
    this.frame12.position.set(0, baseTopY + 1.05, -4.9);
    this.archive.add(this.frame12);

    this.archiveSilhouette = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 1.05),
      new THREE.MeshBasicMaterial({
        color: 0x0d1724,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    this.archiveSilhouette.position.set(0.16, baseTopY + 0.98, -4.86);
    this.archive.add(this.archiveSilhouette);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 11),
      new THREE.MeshBasicMaterial({
        color: 0x102f45,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, baseTopY - 0.01, -2.2);
    this.archive.add(floor);
    this.archive.visible = false;
    scene.add(this.archive);
  }

  setBaseTop(y: number): void {
    const delta = y - this.heroY;
    this.heroY = y;
    this.ring.position.y = y + 0.01;
    this.glow.position.y = y + 0.35;
    this.upLight.position.y = y + 0.05;
    this.upLight.target.position.y = y + 1.15;
    const hero = this.heroId && this.entries.get(this.heroId);
    if (hero) hero.group.position.y = y;
    this.archive.position.y += delta;
  }

  /** Load every resident; the hero is fetched first. */
  async load(heroId: string, onReady: (id: string) => void): Promise<void> {
    this.heroId ??= heroId;
    const order = [heroId, ...RESIDENTS.map((r) => r.id).filter((id) => id !== heroId)];
    for (const id of order) {
      const cfg = RESIDENTS.find((r) => r.id === id)!;
      try {
        const model = await loadNormalized(cfg.modelUrl);
        const entry: Entry = {
          id,
          group: model,
          materials: [],
          targetYaw: 0,
          loaded: true,
        };
        const maxAniso = this.maxAnisotropy;
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            entry.materials.push(mat);
            const std = mat as THREE.MeshStandardMaterial;
            for (const map of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap, std.aoMap, std.emissiveMap]) {
              if (map && map.anisotropy !== maxAniso) {
                map.anisotropy = maxAniso;
                map.needsUpdate = true;
              }
            }
          }
        });
        this.entries.set(id, entry);
        this.scene.add(model);
        // Re-lay the whole set: placing only the new arrival would give every
        // late model the same waiting slot and stack them on each other.
        this.setHero(this.heroId ?? heroId);
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
    for (const r of RESIDENTS) {
      const isHero = r.id === id;
      if (!isHero) ghostIdx++;
      this.place(r.id, isHero, isHero ? 0 : ghostIdx - 1);
    }
  }

  private place(id: string, isHero: boolean, ghostIdx = 0): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.group.visible = !this.questMode || isHero;
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
    // Waiting residents stay solid and step back into shadow. Transparency
    // reads as a rendering fault once two of them overlap.
    for (const m of e.materials) {
      const mat = m as THREE.MeshStandardMaterial;
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      if (!mat.userData.baseColor && mat.color) {
        mat.userData.baseColor = mat.color.clone();
      }
      const base = mat.userData.baseColor as THREE.Color | undefined;
      if (base && mat.color) {
        mat.color.copy(base);
        if (!isHero) mat.color.multiplyScalar(0.3);
      }
    }
    e.group.renderOrder = 0;
  }

  /** Ring/light accent, matched to the active resident. */
  setAccent(color: number): void {
    this.ringMat.color.setHex(color);
    this.glow.color.setHex(color);
    // Uplight leans toward her accent but stays mostly neutral so skin and
    // metal do not turn into a single colour wash.
    this.upLight.color.setHex(color).lerp(new THREE.Color(0xffffff), 0.62);
  }

  /**
   * What her canon leaves in the air around her: Rin's data motes rise in
   * columns, Kagura's embers drift up from the floor, Momo's ribbons turn
   * slowly at chest height.
   */
  setMotes(color: number, motif: MoteMotif): void {
    this.moteMotif = motif;
    (this.motes.material as THREE.PointsMaterial).color.setHex(color);
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const a = (i / pos.count) * Math.PI * 2 * 7;
      const r = motif === 'ribbon' ? 0.9 + (i % 5) * 0.22 : 0.5 + (i % 9) * 0.16;
      const y = motif === 'ember' ? (i % 17) * 0.09 : 0.2 + (i % 21) * 0.09;
      pos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).size = motif === 'ribbon' ? 0.035 : 0.022;
  }

  /** Called when a greeting or reply starts/stops. */
  setSpeaking(on: boolean): void {
    this.speakingTarget = on ? 1 : 0;
  }

  /** Quest Mode owns the whole stage: only the selected resident remains. */
  setQuestMode(on: boolean): void {
    this.questMode = on;
    this.archive.visible = on;
    for (const [id, entry] of this.entries) {
      entry.group.visible = !on || id === this.heroId;
    }
    this.ring.visible = !on;
    this.setQuestVisual(on ? 'archive-corridor' : 'archive-corridor');
  }

  setQuestVisual(
    state: QuestPresentation['visualState'],
    mutation?: QuestPresentation['mutation']
  ): void {
    if (!this.questMode) return;
    const frameActive = state !== 'archive-corridor';
    this.frame12Material.opacity = frameActive ? 0.72 : 0.18;
    this.frame12Material.color.setHex(
      state === 'frame-sealed' ? 0x778a99 : state === 'frame-open' ? 0xeaf6ff : 0x9ee9ff
    );
    this.archiveSilhouette.visible = frameActive;
    this.archiveSilhouette.scale.setScalar(state === 'archive-desync' ? 1.12 : 1);
    this.archiveSilhouette.position.x =
      mutation === 'erase-signature' ? 8 : state === 'archive-desync' ? 0.29 : 0.16;
    if (mutation === 'quarantine') {
      this.frame12Material.opacity = 0.28;
      this.frame12Material.color.setHex(0x8d9aa6);
    }
    if (mutation === 'open-channel') {
      this.frame12Material.color.setHex(0xffffff);
      this.frame12Material.opacity = 0.92;
    }
    if (mutation === 'desync-motion') {
      this.archiveSilhouette.rotation.z = 0.055;
    } else {
      this.archiveSilhouette.rotation.z = 0;
    }
  }

  update(t: number, dt: number): void {
    this.speakingLevel += (this.speakingTarget - this.speakingLevel) * Math.min(1, dt * 5);

    // While speaking the ring flickers on a fast carrier so it reads as a
    // voice rather than a slow ambient pulse.
    const chatter = this.speakingLevel * (0.5 + 0.5 * Math.sin(t * 17.3) * Math.sin(t * 9.1));
    this.ringMat.opacity = 0.28 + chatter * 0.6 + Math.sin(t * 1.5) * 0.04;
    this.ring.scale.setScalar(1 + chatter * 0.05);
    this.glow.intensity = this.speakingLevel * 2.4 + 0.35;

    // Motes move the way her canon moves: data climbs, embers rise and fade,
    // ribbons turn. All three lift a little while she is speaking.
    const mm = this.motes.material as THREE.PointsMaterial;
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const rise = (this.moteMotif === 'ribbon' ? 0.05 : 0.16) * (1 + this.speakingLevel);
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * rise;
      if (y > 2.3) y = 0.05;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    this.motes.rotation.y += dt * (this.moteMotif === 'ribbon' ? 0.16 : 0.05);
    mm.opacity = 0.4 + this.speakingLevel * 0.3;

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

    if (this.questMode) {
      this.archiveFrames.forEach((frame, i) => {
        const material = frame.material as THREE.MeshBasicMaterial;
        material.opacity = 0.07 + (0.5 + 0.5 * Math.sin(t * 1.8 + i)) * 0.08;
      });
      this.frame12Material.opacity +=
        (0.58 + Math.sin(t * 3.2) * 0.12 - this.frame12Material.opacity) *
        Math.min(1, dt * 2);
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
    this.motes.parent?.remove(this.motes);
    this.motes.geometry.dispose();
    (this.motes.material as THREE.Material).dispose();
    this.glow.parent?.remove(this.glow);
    this.upLight.parent?.remove(this.upLight);
    this.upLight.target.parent?.remove(this.upLight.target);
    this.archive.parent?.remove(this.archive);
    this.archive.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = mesh.material
        ? Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        : [];
      for (const material of materials) material.dispose();
    });
  }
}
