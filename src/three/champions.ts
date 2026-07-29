// Loaded GLB faction champions (user-provided generated characters).
//
// The GLB is treated as presentation-ready and immutable: no recoloring, no
// mesh surgery — it is normalized (height, ground contact, centering) and
// placed on the shared collectible pedestal. Fulfils the same presentation
// contract as the procedural Figurine so scene code treats both alike.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { FactionConfig } from '../config/factions';
import { buildFeetShadow, buildPedestal, DNA } from './figurine';

/** Height of the character itself (pedestal excluded) — matches the DNA. */
const CHARACTER_HEIGHT = 1.45;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * Must run once (with the app renderer) before any model loads: attaches the
 * KTX2/BasisU transcoder used by the compressed character textures.
 */
export function initCharacterLoader(renderer: THREE.WebGLRenderer): void {
  const ktx2 = new KTX2Loader().setTranscoderPath('basis/').detectSupport(renderer);
  loader.setKTX2Loader(ktx2);
}

const cache = new Map<string, Promise<THREE.Group>>();
const loadWaiters = new Map<string, (g: THREE.Group) => void>();
const loadedBases = new Map<string, THREE.Group>();

/**
 * Resolves with the shared (non-cloned) normalized model once something else
 * has actually loaded it — never initiates a download itself. Used by the
 * thumbnail renderer so thumbs ride along with the progressive loader
 * instead of triggering eight parallel downloads.
 */
export function whenLoaded(url: string): Promise<THREE.Group> {
  const ready = loadedBases.get(url);
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve) => {
    const prev = loadWaiters.get(url);
    loadWaiters.set(url, (g) => {
      prev?.(g);
      resolve(g);
    });
  });
}

/** Load a GLB without character normalization (props, bases, scenery). */
export function loadRawModel(url: string): Promise<THREE.Group> {
  return loader.loadAsync(url).then((gltf) => {
    const g = new THREE.Group();
    g.add(gltf.scene);
    return g;
  });
}

/**
 * Where the figure actually stands, which is not where its bounding box says.
 * A sword held out to one side or a cape thrown to the other drags the box
 * centre away from the display disc, and the disc is the part that has to sit
 * concentric with the speaker. So the centre is taken from the footprint: the
 * horizontal extents of everything in the lowest slab of the model.
 */
function footCenter(src: THREE.Object3D, box: THREE.Box3): THREE.Vector3 {
  const height = box.max.y - box.min.y;
  const cut = box.min.y + Math.max(1e-4, height * 0.05);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let hits = 0;
  const v = new THREE.Vector3();

  src.updateWorldMatrix(true, true);
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return;
    // Every few vertices is plenty to bound a disc, and keeps a million-vertex
    // scan off the load path.
    const step = Math.max(1, Math.floor(pos.count / 20000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.y > cut) continue;
      hits++;
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
  });

  const box_ = box.getCenter(new THREE.Vector3());
  if (hits < 24) return box_;
  const foot = new THREE.Vector3((minX + maxX) / 2, box_.y, (minZ + maxZ) / 2);
  // A footprint wider than the whole figure means the slab caught something
  // other than a base; the bounding box is the safer answer then.
  const span = Math.max(maxX - minX, maxZ - minZ);
  const full = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  return span > full * 1.05 ? box_ : foot;
}

export function loadNormalized(url: string): Promise<THREE.Group> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      const src = gltf.scene;
      const box = new THREE.Box3().setFromObject(src);
      const size = box.getSize(new THREE.Vector3());
      src.scale.setScalar(CHARACTER_HEIGHT / (size.y || 1));
      const box2 = new THREE.Box3().setFromObject(src);
      const center = footCenter(src, box2);
      src.position.x -= center.x;
      src.position.z -= center.z;
      src.position.y -= box2.min.y;
      src.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats as THREE.MeshStandardMaterial[]) {
          for (const map of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap]) {
            if (map) map.anisotropy = 8;
          }
        }
      });
      const wrapper = new THREE.Group();
      wrapper.add(src);
      loadedBases.set(url, wrapper);
      loadWaiters.get(url)?.(wrapper);
      loadWaiters.delete(url);
      return wrapper;
    });
    cache.set(url, p);
  }
  // Clone per consumer; geometry and materials stay shared via the cache.
  return p.then((g) => g.clone(true));
}

/** Common presentation contract shared with the procedural Figurine. */
export interface ChampionView {
  root: THREE.Group;
  faction: FactionConfig;
  hoverLift: number;
  /** Turn the figure toward a yaw (radians); animated unless immediate. */
  setFacing(yaw: number, immediate?: boolean): void;
  updatePresentation(t: number, phase: number, dt: number): void;
  dispose(): void;
}

export class GlbChampion implements ChampionView {
  readonly root = new THREE.Group();
  hoverLift = 0;
  private figure = new THREE.Group();
  private ringMaterial: THREE.MeshStandardMaterial;
  private targetYaw = 0;

  constructor(
    readonly faction: FactionConfig,
    model: THREE.Group,
    opts: { pedestal?: boolean } = {}
  ) {
    const withPedestal = opts.pedestal !== false;
    if (withPedestal) {
      const ped = buildPedestal(faction.accentColor);
      this.root.add(ped.group);
      this.ringMaterial = ped.ringMaterial;
    } else {
      // Standing directly on a shared base: no collectible pedestal, just a
      // soft contact shadow under the feet.
      this.root.add(buildFeetShadow());
      this.ringMaterial = new THREE.MeshStandardMaterial();
    }
    this.figure.add(model);
    this.figure.position.y = withPedestal ? DNA.pedestalHeight : 0;
    this.baseY = this.figure.position.y;
    this.root.add(this.figure);
  }
  private baseY = 0;

  setFacing(yaw: number, immediate = false): void {
    this.targetYaw = yaw;
    if (immediate) this.figure.rotation.y = yaw;
  }

  /** Spin-in flourish: start several turns away and settle on the target. */
  spinTo(yaw: number): void {
    this.figure.rotation.y = yaw + Math.PI * 3;
    this.targetYaw = yaw;
  }

  updatePresentation(t: number, phase: number, dt: number): void {
    this.figure.position.y = this.baseY + this.hoverLift + Math.sin(t * 0.9 + phase) * 0.008;
    this.figure.rotation.y += (this.targetYaw - this.figure.rotation.y) * Math.min(1, dt * 4.5);
    this.ringMaterial.emissiveIntensity = 0.22 + this.hoverLift * 6 + Math.sin(t * 1.4 + phase) * 0.04;
  }

  dispose(): void {
    // Geometry/materials are shared via the loader cache — never disposed here.
    this.root.parent?.remove(this.root);
    this.ringMaterial.dispose();
  }
}

export async function createGlbChampion(faction: FactionConfig, url: string): Promise<GlbChampion> {
  const model = await loadNormalized(url);
  return new GlbChampion(faction, model);
}

/**
 * SIMULATED regeneration treatment. The real product regenerates the model
 * from the base file plus the user prompt through a generation service; this
 * mockup deterministically derives a faction-approved colorway from the
 * prompt seed and applies it as a material tint + emissive shift on a clone.
 * Materials are cloned per-mesh first so the shared cache stays pristine.
 */
export function applyVariantTint(
  root: THREE.Object3D,
  faction: FactionConfig,
  seed: number
): { label: string } {
  const palette = faction.palettes[seed % faction.palettes.length];
  const tint = new THREE.Color(palette.accent).lerp(new THREE.Color(0xffffff), 0.55);
  const emissive = new THREE.Color(palette.accent).multiplyScalar(0.14);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const cloned = mats.map((m) => {
      const c = m.clone() as THREE.MeshStandardMaterial;
      if (c.color) c.color.multiply(tint);
      if ('emissive' in c) c.emissive.add(emissive);
      return c;
    });
    mesh.material = cloned.length > 1 ? cloned : cloned[0];
  });
  return { label: palette.label };
}
