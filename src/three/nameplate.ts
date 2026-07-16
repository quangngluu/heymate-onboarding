// Oversized character-name backdrop: a canvas-textured plane standing behind
// the selected plinth, neon-relic style. Presentation-only; fades between
// selections and always faces the active camera position.

import * as THREE from 'three';

export class Nameplate {
  private mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private canvas = document.createElement('canvas');
  private targetOpacity = 0;
  private maxOpacity = 0.15;

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

  /** Place behind a plinth, pushed away from the camera, facing it. */
  showAt(plinth: THREE.Vector3, cameraPos: THREE.Vector3): void {
    const away = plinth.clone().sub(cameraPos);
    away.y = 0;
    away.normalize().multiplyScalar(2.4);
    this.mesh.position.copy(plinth).add(away);
    this.mesh.position.y = 1.75;
    this.mesh.lookAt(cameraPos.x, 1.75, cameraPos.z);
    this.mesh.visible = true;
    this.targetOpacity = this.maxOpacity;
  }

  hide(): void {
    this.targetOpacity = 0;
  }

  /** Fade toward target; call once per frame. */
  update(dt: number): void {
    const o = this.material.opacity;
    this.material.opacity = o + (this.targetOpacity - o) * Math.min(1, dt * 5);
    if (this.targetOpacity === 0 && this.material.opacity < 0.005) this.mesh.visible = false;
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
