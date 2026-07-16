// Faction environment backdrops: generated 360° panoramas, one per faction,
// crossfaded when the studio selection moves between factions. Implemented as
// two giant inverted spheres (so we can fade, which scene.background cannot)
// plus scene.environment for image-based lighting on the characters.

import * as THREE from 'three';

export const FACTION_ENVS: Record<string, string> = {
  'red-shift': 'assets/env/env-red-shift.webp',
  razorpack: 'assets/env/env-razorpack.webp',
  'ward-9': 'assets/env/env-ward-9.webp',
  'null-choir': 'assets/env/env-null-choir.webp',
};

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture>>();

function loadPano(url: string): Promise<THREE.Texture> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.mapping = THREE.EquirectangularReflectionMapping;
      return t;
    });
    cache.set(url, p);
  }
  return p;
}

function makeDome(): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
    // Dimmed so the figurines and UI stay dominant over the panorama.
    color: 0x9d9d9d,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(42, 48, 32), mat);
  dome.renderOrder = -2;
  dome.rotation.y = Math.PI; // seam behind the hall
  return dome;
}

export class FactionBackdrop {
  private front = makeDome();
  private back = makeDome();
  private fadeIn = 0; // target opacity of front dome
  private activeFaction: string | null = null;

  constructor(
    private scene: THREE.Scene,
    /** Objects to hide while a panorama is active (placeholder skyline). */
    private hideWhenActive: THREE.Object3D[]
  ) {
    scene.add(this.front, this.back);
  }

  async show(factionId: string): Promise<void> {
    if (this.activeFaction === factionId) return;
    const url = FACTION_ENVS[factionId];
    if (!url) return;
    this.activeFaction = factionId;
    const tex = await loadPano(url);
    if (this.activeFaction !== factionId) return; // superseded meanwhile
    // Current front becomes the fading back layer.
    const prev = this.front;
    this.front = this.back;
    this.back = prev;
    const mat = this.front.material as THREE.MeshBasicMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
    this.front.renderOrder = -2;
    this.back.renderOrder = -3;
    this.fadeIn = 1;
    this.scene.environment = tex;
    this.scene.environmentIntensity = 0.55;
    for (const o of this.hideWhenActive) o.visible = false;
  }

  hide(): void {
    this.activeFaction = null;
    this.fadeIn = 0;
    this.scene.environment = null;
    for (const o of this.hideWhenActive) o.visible = true;
  }

  update(dt: number): void {
    const f = this.front.material as THREE.MeshBasicMaterial;
    const b = this.back.material as THREE.MeshBasicMaterial;
    f.opacity += ((this.fadeIn ? 1 : 0) - f.opacity) * Math.min(1, dt * 3);
    b.opacity += (0 - b.opacity) * Math.min(1, dt * 3);
    this.front.visible = f.opacity > 0.004;
    this.back.visible = b.opacity > 0.004;
  }
}
