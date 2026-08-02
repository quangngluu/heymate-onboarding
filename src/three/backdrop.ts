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

/**
 * Procedural studio panorama for companion universes: a soft vertical
 * gradient with an overhead softbox, so the residents read like product
 * photography instead of standing in a city.
 */
function studioTexture(top: number, bottom: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const hex = (v: number) => `#${v.toString(16).padStart(6, '0')}`;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, hex(top));
  grad.addColorStop(0.45, hex(top));
  grad.addColorStop(0.62, hex(bottom));
  grad.addColorStop(1, hex(bottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);
  // Overhead softbox: a bright band across the top of the dome.
  const soft = ctx.createRadialGradient(512, 40, 20, 512, 40, 420);
  soft.addColorStop(0, 'rgba(255,255,255,0.85)');
  soft.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, 1024, 300);
  // Two dim side kickers for shape.
  for (const x of [150, 880]) {
    const kick = ctx.createRadialGradient(x, 210, 10, x, 210, 240);
    kick.addColorStop(0, 'rgba(255,255,255,0.22)');
    kick.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = kick;
    ctx.fillRect(x - 240, 0, 480, 420);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

function loadPano(url: string): Promise<THREE.Texture> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.mapping = THREE.EquirectangularReflectionMapping;
      return t;
    }).catch((error) => {
      cache.delete(url);
      throw error;
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

function makeSceneLayer(): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    fog: false,
    depthTest: true,
    depthWrite: false,
    color: 0x9d9d9d,
  });
  const layer = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  layer.renderOrder = -4;
  layer.visible = false;
  return layer;
}

export class FactionBackdrop {
  private front = makeDome();
  private back = makeDome();
  private sceneFront: THREE.Mesh | null = null;
  private sceneBack: THREE.Mesh | null = null;
  private sceneFadeIn = 0;
  private fadeIn = 0; // target opacity of front dome
  private activeFaction: string | null = null;
  private requestedBackdrop: string | null = null;

  constructor(
    private scene: THREE.Scene,
    /** Objects to hide while a panorama is active (placeholder skyline). */
    private hideWhenActive: THREE.Object3D[],
    private readonly imageLoader: (url: string) => Promise<THREE.Texture> = loadPano,
    private readonly reducedMotion = false,
    private readonly camera?: THREE.PerspectiveCamera
  ) {
    scene.add(this.front, this.back);
    if (camera) {
      this.sceneFront = makeSceneLayer();
      this.sceneBack = makeSceneLayer();
      scene.add(this.sceneFront, this.sceneBack);
    }
  }

  private hideSceneLayers(): void {
    this.sceneFadeIn = 0;
    for (const layer of [this.sceneFront, this.sceneBack]) {
      if (!layer) continue;
      layer.visible = false;
      (layer.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  /** Companion universes: procedural studio dome, no download. */
  showStudio(top: number, bottom: number, intensity: number): void {
    const key = `studio:${top}:${bottom}`;
    if (this.activeFaction === key) return;
    this.requestedBackdrop = key;
    this.activeFaction = key;
    this.hideSceneLayers();
    this.applyTexture(studioTexture(top, bottom), intensity);
  }

  async show(factionId: string): Promise<void> {
    if (this.activeFaction === factionId) return;
    const url = FACTION_ENVS[factionId];
    if (!url) return;
    this.requestedBackdrop = factionId;
    const tex = await this.imageLoader(url);
    if (this.requestedBackdrop !== factionId) return; // superseded meanwhile
    this.activeFaction = factionId;
    this.hideSceneLayers();
    this.applyTexture(tex, 0.55);
  }

  /** Quest scenes load off-path; a failed replacement leaves the prior dome intact. */
  async showScene(url: string): Promise<boolean> {
    const key = `scene:${url}`;
    if (this.activeFaction === key) return true;
    this.requestedBackdrop = key;
    let tex: THREE.Texture;
    try {
      tex = await this.imageLoader(url);
    } catch {
      if (this.requestedBackdrop === key) this.requestedBackdrop = null;
      return false;
    }
    if (this.requestedBackdrop !== key) return false;
    this.activeFaction = key;
    const direction = [...url].reduce((hash, char) => hash + char.charCodeAt(0), 0) % 2 ? 1 : -1;
    if (this.sceneFront && this.sceneBack && this.camera) {
      this.applySceneTexture(tex, 0.28, direction);
    } else {
      this.applyTexture(tex, 0.28, direction);
    }
    return true;
  }

  /**
   * Runtime Quest images are ordinary 4:3 frames, not 360 panoramas. Present
   * them on a camera-facing layer so the authored composition remains visible
   * instead of wrapping it around the panorama dome.
   */
  private applySceneTexture(tex: THREE.Texture, intensity: number, motionDirection: number): void {
    const previous = this.sceneFront!;
    this.sceneFront = this.sceneBack!;
    this.sceneBack = previous;
    const material = this.sceneFront.material as THREE.MeshBasicMaterial;
    material.map = tex;
    material.needsUpdate = true;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    tex.needsUpdate = true;
    this.sceneFront.userData.sceneMotion = { elapsed: 0, direction: motionDirection };
    this.sceneFront.visible = true;
    this.sceneFadeIn = 1;

    // The dome remains the right projection for faction panoramas, but would
    // distort a generated story frame and compete with this layer.
    this.fadeIn = 0;
    this.front.visible = false;
    this.back.visible = false;
    (this.front.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.back.material as THREE.MeshBasicMaterial).opacity = 0;
    this.scene.environment = tex;
    this.scene.environmentIntensity = intensity;
    for (const object of this.hideWhenActive) object.visible = false;
  }

  private applyTexture(tex: THREE.Texture, intensity: number, motionDirection = 0): void {
    // Current front becomes the fading back layer.
    const prev = this.front;
    this.front = this.back;
    this.back = prev;
    const mat = this.front.material as THREE.MeshBasicMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    tex.needsUpdate = true;
    this.front.rotation.set(0, Math.PI, 0);
    this.front.userData.sceneMotion = motionDirection
      ? { elapsed: 0, direction: motionDirection }
      : null;
    this.front.renderOrder = -2;
    this.back.renderOrder = -3;
    this.fadeIn = 1;
    this.scene.environment = tex;
    this.scene.environmentIntensity = intensity;
    for (const o of this.hideWhenActive) o.visible = false;
  }

  hide(): void {
    this.activeFaction = null;
    this.requestedBackdrop = null;
    this.fadeIn = 0;
    this.hideSceneLayers();
    this.scene.environment = null;
    for (const o of this.hideWhenActive) o.visible = true;
  }

  update(dt: number): void {
    if (this.sceneFadeIn && this.sceneFront && this.sceneBack && this.camera) {
      const frontMaterial = this.sceneFront.material as THREE.MeshBasicMaterial;
      const backMaterial = this.sceneBack.material as THREE.MeshBasicMaterial;
      frontMaterial.opacity += (1 - frontMaterial.opacity) * Math.min(1, dt * 3);
      backMaterial.opacity += (0 - backMaterial.opacity) * Math.min(1, dt * 3);
      this.sceneFront.visible = frontMaterial.opacity > 0.004;
      this.sceneBack.visible = backMaterial.opacity > 0.004;
      this.placeSceneLayer(this.sceneFront, dt);
      this.placeSceneLayer(this.sceneBack, dt);
      return;
    }

    const f = this.front.material as THREE.MeshBasicMaterial;
    const b = this.back.material as THREE.MeshBasicMaterial;
    f.opacity += ((this.fadeIn ? 1 : 0) - f.opacity) * Math.min(1, dt * 3);
    b.opacity += (0 - b.opacity) * Math.min(1, dt * 3);
    this.front.visible = f.opacity > 0.004;
    this.back.visible = b.opacity > 0.004;

    const motion = this.front.userData.sceneMotion as
      | { elapsed: number; direction: number }
      | null;
    if (!motion || this.reducedMotion || !f.map) return;
    motion.elapsed += dt;
    const travel = Math.min(1, motion.elapsed / 18);
    const zoom = 1 - 0.035 * travel;
    const pan = motion.direction * 0.006 * travel;
    this.front.rotation.y = Math.PI + motion.direction * 0.018 * travel;
    this.front.rotation.x = Math.sin(motion.elapsed * 0.12) * 0.003;
    f.map.repeat.set(zoom, zoom);
    f.map.offset.set((1 - zoom) / 2 + pan, (1 - zoom) / 2);
  }

  private placeSceneLayer(layer: THREE.Mesh, dt: number): void {
    const camera = this.camera!;
    const motion = layer.userData.sceneMotion as
      | { elapsed: number; direction: number }
      | undefined;
    if (motion && !this.reducedMotion) motion.elapsed += dt;
    const travel = motion && !this.reducedMotion ? Math.min(1, motion.elapsed / 18) : 0;
    const distance = Math.min(camera.far - 5, 60);
    const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
    const width = height * camera.aspect;
    const zoom = 1 + 0.035 * travel;

    layer.position.copy(camera.position);
    layer.quaternion.copy(camera.quaternion);
    layer.translateZ(-distance);
    layer.translateX((motion?.direction ?? 0) * width * 0.006 * travel);
    layer.scale.set(width * zoom, height * zoom, 1);
  }
}
