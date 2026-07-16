// Data-driven customization adapter.
//
// One place binds "what the user chose" to "what changes in the 3D model":
// recolorable material roles, accessory anchors, variant slots, and emblem
// placement. A Mint-generated GLB registers into this same contract through
// the role map in config/assets.ts — scene code never checks mesh names.

import * as THREE from 'three';
import type { FactionConfig } from '../config/factions';
import type { AdapterAnchorName } from '../config/assets';
import type { CustomizationState } from '../config/customization';
import {
  buildAccent,
  buildBase,
  buildEmblem,
  buildEyewear,
  buildHair,
  disposeGroup,
  faceTexture,
  makeMaterials,
  type FigurineMaterials,
} from './figurine';

export class Figurine {
  readonly root: THREE.Group;
  readonly figure: THREE.Group;
  readonly faction: FactionConfig;
  readonly ringMaterial: THREE.MeshStandardMaterial;

  private mats: FigurineMaterials;
  private anchors: Record<AdapterAnchorName, THREE.Object3D>;
  private faceMesh: THREE.Mesh;
  private slots = {
    hair: new THREE.Group(),
    eyewear: new THREE.Group(),
    accent: new THREE.Group(),
    emblem: new THREE.Group(),
  };
  private current: CustomizationState | null = null;

  /** Presentation-only offsets (hover raise, idle float) applied to `figure`. */
  hoverLift = 0;
  private baseFigureY = 0;
  private targetYaw = 0;

  constructor(faction: FactionConfig) {
    this.faction = faction;
    this.mats = makeMaterials(faction);
    const base = buildBase(faction, this.mats);
    this.root = base.root;
    this.figure = base.figure;
    this.anchors = base.anchors;
    this.faceMesh = base.faceMesh;
    this.ringMaterial = base.ringMaterial;
    this.baseFigureY = this.figure.position.y;
  }

  apply(c: CustomizationState): void {
    const prev = this.current;
    this.current = c;

    if (!prev || prev.hair !== c.hair) {
      this.swapSlot('hair', buildHair(c.hair, this.mats), this.anchors.hair);
    }
    if (!prev || prev.eyewear !== c.eyewear) {
      this.swapSlot('eyewear', buildEyewear(c.eyewear, this.mats), this.anchors.hair);
    }
    if (!prev || prev.accent !== c.accent) {
      const opt = this.faction.accents.find((a) => a.id === c.accent) ?? this.faction.accents[0];
      const built = buildAccent(opt.kind, this.mats);
      this.swapSlot('accent', built.group, this.anchors[built.anchor]);
    }
    if (!prev || prev.emblem !== c.emblem) {
      const emblem = buildEmblem(this.faction.emblem, c.emblem === 'pedestal');
      const g = new THREE.Group();
      g.add(emblem);
      this.swapSlot('emblem', g, this.anchors[c.emblem]);
    }
    if (!prev || prev.expression !== c.expression) {
      (this.faceMesh.material as THREE.MeshStandardMaterial).map = faceTexture(c.expression);
      (this.faceMesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }
    if (!prev || prev.palette !== c.palette) {
      const p = this.faction.palettes.find((x) => x.id === c.palette) ?? this.faction.palettes[0];
      this.mats.primary.color.setHex(p.primary);
      this.mats.secondary.color.setHex(p.secondary);
      this.mats.accent.color.setHex(p.accent);
      this.mats.accent.emissive.setHex(p.accent).multiplyScalar(0.12);
      this.mats.glow.emissive.setHex(p.accent);
    }
  }

  private swapSlot(name: keyof Figurine['slots'], next: THREE.Group, parent: THREE.Object3D): void {
    const old = this.slots[name];
    old.parent?.remove(old);
    disposeGroup(old);
    this.slots[name] = next;
    parent.add(next);
  }

  setFacing(yaw: number, immediate = false): void {
    this.targetYaw = yaw;
    if (immediate) this.figure.rotation.y = yaw;
  }

  /** Idle float + hover raise; presentation only. */
  updatePresentation(t: number, phase: number, dt = 0.016): void {
    this.figure.position.y = this.baseFigureY + this.hoverLift + Math.sin(t * 0.9 + phase) * 0.008;
    this.figure.rotation.y += (this.targetYaw - this.figure.rotation.y) * Math.min(1, dt * 4.5);
    this.ringMaterial.emissiveIntensity = 0.22 + this.hoverLift * 6 + Math.sin(t * 1.4 + phase) * 0.04;
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    for (const slot of Object.values(this.slots)) disposeGroup(slot);
    for (const m of Object.values(this.mats)) m.dispose();
    (this.faceMesh.material as THREE.Material).dispose();
    this.ringMaterial.dispose();
  }
}
