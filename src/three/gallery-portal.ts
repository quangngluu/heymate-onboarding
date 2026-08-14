import * as THREE from 'three';
import type { CamPreset } from '../config/cameras';

/** A distant story image on the centerline of the empty gallery room. */
export const PORTAL_PLANE: { center: [number, number, number]; size: [number, number] } = {
  center: [0, 0.9, 0],
  // Match the authored 1344×768 office plate. At the gallery camera this is a
  // distant window; at the dolly endpoint it overscans the viewport like video cover.
  size: [2.2, 2.2 / (1344 / 768)],
};

/** End pose for the real camera dolly into the portal. */
export function portalDollyPreset(): CamPreset {
  return {
    pos: [0, PORTAL_PLANE.center[1], 1.45],
    target: [...PORTAL_PLANE.center],
    fov: 46,
  };
}

/** Project the portal corners into a top-left-origin CSS pixel rectangle. */
export function planeScreenRect(
  camera: THREE.PerspectiveCamera,
  center: [number, number, number],
  size: [number, number],
  viewW: number,
  viewH: number
): { x: number; y: number; w: number; h: number } {
  const [cx, cy, cz] = center;
  const halfW = size[0] / 2;
  const halfH = size[1] / 2;
  const corners: [number, number, number][] = [
    [cx - halfW, cy - halfH, cz],
    [cx + halfW, cy - halfH, cz],
    [cx - halfW, cy + halfH, cz],
    [cx + halfW, cy + halfH, cz],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const projected = new THREE.Vector3();

  for (const corner of corners) {
    projected.set(...corner).project(camera);
    const x = (projected.x * 0.5 + 0.5) * viewW;
    const y = (-projected.y * 0.5 + 0.5) * viewH;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export class GalleryPortal {
  private readonly group = new THREE.Group();
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private texture: THREE.Texture | null = null;

  constructor(private readonly scene: THREE.Scene) {
    this.group.visible = false;
    this.scene.add(this.group);
  }

  build(textureUrl: string, accentHex: number): void {
    this.clearMesh();
    const geometry = new THREE.PlaneGeometry(PORTAL_PLANE.size[0], PORTAL_PLANE.size[1]);
    const material = new THREE.MeshBasicMaterial({
      color: accentHex,
      toneMapped: false,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(...PORTAL_PLANE.center);
    // The portal is a film plate: once the camera reaches it, gallery geometry
    // must not bleed through and create a visible pop before the video cut.
    this.mesh.renderOrder = 20;
    this.group.add(this.mesh);

    new THREE.TextureLoader().load(
      textureUrl,
      (texture) => {
        if (!this.mesh || this.mesh.material !== material) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        this.texture?.dispose();
        this.texture = texture;
        material.color.set(0xffffff);
        material.map = texture;
        material.needsUpdate = true;
      },
      undefined,
      () => undefined
    );
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  rect(camera: THREE.PerspectiveCamera, viewW: number, viewH: number) {
    return planeScreenRect(camera, PORTAL_PLANE.center, PORTAL_PLANE.size, viewW, viewH);
  }

  dispose(): void {
    this.clearMesh();
    this.group.removeFromParent();
  }

  private clearMesh(): void {
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    this.texture?.dispose();
    this.texture = null;
  }
}
