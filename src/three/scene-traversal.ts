// 2.5D scene traversal — spike (flag-gated behind ?traversalSpike=1).
//
// Proves the Hybrid "moving through scenes" idea without a navigable 3D world.
// The character walks IN PLACE (see quest-rig.ts, root motion pinned) while a
// wide scene image scrolls horizontally behind her, so she reads as travelling
// through it; every few seconds the backdrop crossfades to the next scene,
// standing in for advancing a story beat.
//
// The point is the seam, not the art: any AI-generated scene (the FAL backdrop
// Quest already produces) can flow through `setScenes()`. Here it is driven by
// the shipped environment panoramas so the mechanic is visible fully offline.
//
// Deliberately self-contained: it owns its own layers and never touches the
// FactionBackdrop dome or the quest scene wiring, so it can be lifted into (or
// out of) the real backdrop path without entanglement.

import * as THREE from 'three';

const DEFAULT_SCENES = [
  'assets/env/env-ward-9.webp',
  'assets/env/env-red-shift.webp',
  'assets/env/env-null-choir.webp',
  'assets/env/env-razorpack.webp',
];

/** UV units per second — a slow, walking-pace drift, not a car window. */
const SCROLL_PER_SECOND = 0.045;
/** How long a scene holds before the next beat slides in. */
const BEAT_SECONDS = 7;
const FADE_SECONDS = 1.4;

const loader = new THREE.TextureLoader();

function loadScene(url: string): THREE.Texture {
  const tex = loader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Mirrored so the horizontal scroll never shows a hard seam.
  tex.wrapS = THREE.MirroredRepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

interface Layer {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  geometry: THREE.PlaneGeometry;
}

export class SceneTraversal {
  private layers: [Layer, Layer];
  private textures: THREE.Texture[];
  private active = 0; // which layer currently holds the shown scene
  private sceneIndex = 0;
  private sinceBeat = 0;
  private fading = 0; // seconds of crossfade remaining, 0 when settled
  private scroll = 0;
  private visible = false;

  constructor(scene: THREE.Scene, baseTopY: number, scenes: string[] = DEFAULT_SCENES) {
    this.textures = scenes.map(loadScene);
    const make = (): Layer => {
      const geometry = new THREE.PlaneGeometry(22, 11);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        // A pure background: drawn before the figure, ignoring depth, so it sits
        // behind the walking rig and over any dome without z-fighting.
        depthTest: false,
        depthWrite: false,
        color: 0xcfcfcf, // slightly dimmed so the figure stays dominant
        fog: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, baseTopY + 2.4, -6);
      mesh.renderOrder = -1;
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, material, geometry };
    };
    this.layers = [make(), make()];
    this.layers[0].material.map = this.textures[0];
    this.layers[0].material.needsUpdate = true;
  }

  /** Swap in a live scene set (e.g. AI-generated FAL scene URLs). */
  setScenes(urls: string[]): void {
    if (!urls.length) return;
    for (const t of this.textures) t.dispose();
    this.textures = urls.map(loadScene);
    this.sceneIndex = 0;
    this.layers[this.active].material.map = this.textures[0];
    this.layers[this.active].material.needsUpdate = true;
  }

  show(): void {
    this.visible = true;
    this.sinceBeat = 0;
    for (const l of this.layers) l.mesh.visible = true;
    this.layers[this.active].material.opacity = 1;
    this.layers[1 - this.active].material.opacity = 0;
  }

  hide(): void {
    this.visible = false;
    for (const l of this.layers) l.mesh.visible = false;
  }

  private advance(): void {
    this.sceneIndex = (this.sceneIndex + 1) % this.textures.length;
    const incoming = 1 - this.active;
    this.layers[incoming].material.map = this.textures[this.sceneIndex];
    this.layers[incoming].material.needsUpdate = true;
    this.fading = FADE_SECONDS;
  }

  update(dt: number): void {
    if (!this.visible) return;

    // Parallax: the world drifts past the walking-in-place figure. Wrapping keeps
    // offset bounded so a long session cannot drift into float imprecision.
    this.scroll = (this.scroll + dt * SCROLL_PER_SECOND) % 2;
    for (const t of this.textures) t.offset.x = this.scroll;

    if (this.fading > 0) {
      this.fading = Math.max(0, this.fading - dt);
      const k = 1 - this.fading / FADE_SECONDS; // 0 → 1
      const incoming = 1 - this.active;
      this.layers[incoming].material.opacity = k;
      this.layers[this.active].material.opacity = 1 - k;
      if (this.fading === 0) {
        this.active = incoming;
        this.sinceBeat = 0;
      }
    } else {
      this.sinceBeat += dt;
      if (this.sinceBeat >= BEAT_SECONDS) this.advance();
    }
  }

  dispose(): void {
    for (const l of this.layers) {
      l.mesh.parent?.remove(l.mesh);
      l.geometry.dispose();
      l.material.dispose();
    }
    for (const t of this.textures) t.dispose();
  }
}
