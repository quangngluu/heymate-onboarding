// Oversized character-name backdrop: a canvas-textured plane standing behind
// the selected plinth, neon-relic style. Presentation-only; fades between
// selections and always faces the active camera position.
//
// It can also carry an optional frame image (an Open Chat scene) on a second
// plane just behind the wordmark, so a generated picture reads as the backdrop
// *for the name* — off to the side, clear of the figure on the plinth — rather
// than a full-screen takeover sitting on top of the sculpt.

import * as THREE from 'three';

const imageLoader = new THREE.TextureLoader();

export class Nameplate {
  private mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private canvas = document.createElement('canvas');
  private targetOpacity = 0;
  private maxOpacity = 0.15;

  private imageMesh: THREE.Mesh;
  private imageMaterial: THREE.MeshBasicMaterial;
  private imageTarget = 0;
  private imageActive = false;
  /** How solid the frame behind the name gets once it has faded in. */
  private static readonly IMAGE_OPACITY = 0.62;
  /** The wordmark reads brighter while a frame is behind it, so it stays a label. */
  private static readonly NAME_OVER_IMAGE = 0.4;

  constructor(scene: THREE.Scene) {
    this.canvas.width = 2048;
    this.canvas.height = 560;
    const texture = new THREE.CanvasTexture(this.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.97), this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);

    this.imageMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.imageMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.5), this.imageMaterial);
    this.imageMesh.visible = false;
    // Behind the wordmark (-1), in front of the studio dome (-2). depthTest stays
    // on so the sculpt on the plinth occludes it, keeping the frame in the
    // background around the name rather than pasted over her.
    this.imageMesh.renderOrder = -1.5;
    scene.add(this.imageMesh);
  }

  setText(name: string, accent: number): void {
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Condensed display: draw wide-bold and squeeze horizontally.
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2 + 20);
    ctx.scale(0.82, 1);
    ctx.font = `800 430px 'Avenir Next', 'Futura', system-ui, sans-serif`;
    ctx.fillStyle = '#efe6d4';
    ctx.fillText(name.toUpperCase(), 0, 0);
    ctx.restore();
    // Thin accent underline, off-center like a registration mark.
    ctx.fillStyle = `#${accent.toString(16).padStart(6, '0')}`;
    ctx.fillRect(this.canvas.width * 0.3, this.canvas.height - 48, this.canvas.width * 0.18, 10);
    (this.material.map as THREE.CanvasTexture).needsUpdate = true;
  }

  /** Fade a frame in behind the name; resolves false if the image cannot load. */
  showImage(url: string): Promise<boolean> {
    this.imageActive = true;
    if (this.mesh.visible) this.targetOpacity = Nameplate.NAME_OVER_IMAGE;
    return new Promise((resolve) => {
      imageLoader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          this.imageMaterial.map = texture;
          this.imageMaterial.needsUpdate = true;
          this.imageMesh.visible = true;
          this.imageTarget = Nameplate.IMAGE_OPACITY;
          resolve(true);
        },
        undefined,
        () => resolve(false)
      );
    });
  }

  hideImage(): void {
    this.imageActive = false;
    this.imageTarget = 0;
    if (this.mesh.visible) this.targetOpacity = this.maxOpacity;
  }

  /** Place behind a plinth, pushed away from the camera, facing it. */
  showAt(plinth: THREE.Vector3, cameraPos: THREE.Vector3): void {
    const away = plinth.clone().sub(cameraPos);
    away.y = 0;
    away.normalize();
    this.mesh.position.copy(plinth).addScaledVector(away, 2.4);
    this.mesh.position.y = 1.75;
    this.mesh.lookAt(cameraPos.x, 1.75, cameraPos.z);
    this.mesh.visible = true;
    this.targetOpacity = this.imageActive ? Nameplate.NAME_OVER_IMAGE : this.maxOpacity;
    // The frame sits a touch further back and higher, so it frames the wordmark
    // instead of the figure standing in front of the plinth.
    this.imageMesh.position.copy(plinth).addScaledVector(away, 2.8);
    this.imageMesh.position.y = 2.05;
    this.imageMesh.quaternion.copy(this.mesh.quaternion);
  }

  hide(): void {
    this.targetOpacity = 0;
    this.imageActive = false;
    this.imageTarget = 0;
  }

  /** Fade toward target; call once per frame. */
  update(dt: number): void {
    const o = this.material.opacity;
    this.material.opacity = o + (this.targetOpacity - o) * Math.min(1, dt * 5);
    if (this.targetOpacity === 0 && this.material.opacity < 0.005) this.mesh.visible = false;

    const io = this.imageMaterial.opacity;
    this.imageMaterial.opacity = io + (this.imageTarget - io) * Math.min(1, dt * 4);
    if (this.imageTarget === 0 && this.imageMaterial.opacity < 0.005) this.imageMesh.visible = false;
  }

  /** Fade out, then swap text and fade back in at the new anchor. */
  transitionTo(name: string, accent: number, plinth: THREE.Vector3, cameraPos: THREE.Vector3): void {
    this.targetOpacity = 0;
    window.setTimeout(() => {
      this.setText(name, accent);
      this.showAt(plinth, cameraPos);
    }, 180);
  }
}
