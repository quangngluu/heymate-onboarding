// Oversized character-name backdrop: a canvas-textured plane standing behind
// the selected plinth, neon-relic style. Presentation-only; fades between
// selections and always faces the active camera position.
//
// It can also carry an optional frame image (an Open Chat scene) on a second,
// much larger plane far behind the scene. That plane covers the projected
// viewport width while keeping the image's own aspect ratio, so the picture
// reads as a distant background rather than a stretched panel.

import * as THREE from 'three';

const imageLoader = new THREE.TextureLoader();

export interface BackdropDimensions {
  width: number;
  height: number;
}

/**
 * World-space dimensions for a plane that covers the viewport horizontally.
 * Height follows from the source image, so no generated frame is stretched;
 * a minimum can preserve the established scale on narrow portrait screens.
 */
export function coverBackdropDimensions(
  effectiveVerticalFov: number,
  viewportAspect: number,
  viewDepth: number,
  imageAspect: number,
  overscan: number,
  minimumHeight = 0,
  horizontalCenterOffset = 0
): BackdropDimensions {
  const fov = THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(Math.abs(effectiveVerticalFov), 0.01, 179)
  );
  const safeViewportAspect = Math.max(Math.abs(viewportAspect), 0.01);
  const safeDepth = Math.max(Math.abs(viewDepth), 0.01);
  const safeImageAspect = Math.max(Math.abs(imageAspect), 0.01);
  const safeOverscan = Math.max(overscan, 1);
  const frustumHalfWidth =
    safeDepth * Math.tan(fov / 2) * safeViewportAspect;
  const projectedWidth =
    2 * (frustumHalfWidth + Math.abs(horizontalCenterOffset)) * safeOverscan;
  const height = Math.max(projectedWidth / safeImageAspect, minimumHeight);
  return { width: height * safeImageAspect, height };
}

export class Nameplate {
  private mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private canvas = document.createElement('canvas');
  private targetOpacity = 0;
  private maxOpacity = 0.15;
  private transitionRequest = 0;

  private imageMesh: THREE.Mesh;
  private imageMaterial: THREE.MeshBasicMaterial;
  private imageTarget = 0;
  private imageActive = false;
  private imagePlaced = false;
  private imageRequest = 0;
  private loadedImageRequest = 0;
  private imageAspect = 4 / 3;
  private imageAnchor = new THREE.Vector3();
  private imageAway = new THREE.Vector3();
  private imagePlaneNormal = new THREE.Vector3();
  private imagePlaneRight = new THREE.Vector3();
  private cameraForward = new THREE.Vector3();
  private cameraToImage = new THREE.Vector3();
  private viewAxisOnImage = new THREE.Vector3();
  /** How solid the distant backdrop gets once it has faded in. */
  private static readonly IMAGE_OPACITY = 0.6;
  /** Slight bleed prevents a hairline edge during camera easing and resizing. */
  private static readonly IMAGE_OVERSCAN = 1.06;
  /** Portrait keeps the established cinematic scale instead of shrinking away. */
  private static readonly IMAGE_MIN_HEIGHT = 9.5;
  /** Distance behind the figure, still well inside the 42-unit studio dome. */
  private static readonly IMAGE_DISTANCE = 13;

  constructor(
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera
  ) {
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
      // The opaque sculpt has already populated the depth buffer by the time
      // transparent layers render. Keeping the depth test on lets her mask this
      // distant plane, so the picture cannot wash over the lit figure.
      depthTest: true,
      side: THREE.DoubleSide,
    });
    // Unit plane; runtime scale follows the camera and the frame's real aspect.
    this.imageMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.imageMaterial);
    this.imageMesh.visible = false;
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

  /** Fade a frame in as the distant backdrop; resolves false if it cannot load. */
  showImage(url: string): Promise<boolean> {
    const request = ++this.imageRequest;
    this.imageActive = true;
    // Do not leave the prior frame visible while its replacement is loading.
    this.imageTarget = 0;
    return new Promise((resolve) => {
      imageLoader.load(
        url,
        (texture) => {
          // A late load must not replace a newer frame or resurrect a frame
          // after hideImage()/hide() has moved the conversation on.
          if (request !== this.imageRequest || !this.imageActive) {
            texture.dispose();
            resolve(false);
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          const previous = this.imageMaterial.map;
          this.imageMaterial.map = texture;
          this.imageMaterial.needsUpdate = true;
          const image = texture.image as
            | { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }
            | undefined;
          const width = image?.naturalWidth || image?.width || 0;
          const height = image?.naturalHeight || image?.height || 0;
          this.imageAspect = width > 0 && height > 0 ? width / height : 4 / 3;
          this.syncImageToCamera();
          this.loadedImageRequest = request;
          this.revealImageIfReady();
          if (previous && previous !== texture) previous.dispose();
          resolve(true);
        },
        undefined,
        () => {
          if (request === this.imageRequest) {
            this.imageActive = false;
            this.imageTarget = 0;
          }
          resolve(false);
        }
      );
    });
  }

  hideImage(): void {
    this.imageActive = false;
    this.imageRequest++;
    this.imageTarget = 0;
  }

  /**
   * Cover the projected viewport width at the plane's actual depth. The plane
   * faces the live camera horizontally; dividing by their forward/normal
   * alignment also accounts for camera pitch without distorting the texture.
   */
  private syncImageToCamera(): void {
    if (!this.imagePlaced) return;
    this.imageAway.subVectors(this.imageAnchor, this.camera.position);
    this.imageAway.y = 0;
    if (this.imageAway.lengthSq() < 0.0001) return;
    this.imageAway.normalize();
    this.imageMesh.position
      .copy(this.imageAnchor)
      .addScaledVector(this.imageAway, Nameplate.IMAGE_DISTANCE);
    this.imageMesh.position.y = 2.8;
    this.imageMesh.lookAt(
      this.camera.position.x,
      this.imageMesh.position.y,
      this.camera.position.z
    );
    this.imagePlaneNormal.set(0, 0, 1).applyQuaternion(this.imageMesh.quaternion);
    this.cameraToImage.subVectors(this.imageMesh.position, this.camera.position);
    const perpendicularDistance = Math.abs(
      this.cameraToImage.dot(this.imagePlaneNormal)
    );
    this.camera.getWorldDirection(this.cameraForward);
    const alignment = Math.max(
      Math.abs(this.cameraForward.dot(this.imagePlaneNormal)),
      0.1
    );
    const viewDepth = perpendicularDistance / alignment;
    this.imagePlaneRight.set(1, 0, 0).applyQuaternion(this.imageMesh.quaternion);
    this.viewAxisOnImage
      .copy(this.cameraForward)
      .multiplyScalar(viewDepth)
      .add(this.camera.position)
      .sub(this.imageMesh.position);
    const horizontalCenterOffset = Math.abs(
      this.viewAxisOnImage.dot(this.imagePlaneRight)
    );
    const dimensions = coverBackdropDimensions(
      this.camera.getEffectiveFOV(),
      this.camera.aspect,
      viewDepth,
      this.imageAspect,
      Nameplate.IMAGE_OVERSCAN,
      Nameplate.IMAGE_MIN_HEIGHT,
      horizontalCenterOffset
    );
    this.imageMesh.scale.set(dimensions.width, dimensions.height, 1);
  }

  /** Reveal only once both the current texture and its world-space anchor exist. */
  private revealImageIfReady(): void {
    if (
      !this.imageActive ||
      !this.imagePlaced ||
      this.loadedImageRequest !== this.imageRequest
    ) return;
    this.imageMesh.visible = true;
    this.imageTarget = Nameplate.IMAGE_OPACITY;
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
    this.targetOpacity = this.maxOpacity;
    // Far behind everything, centred and large: a distant background wall.
    this.imageAnchor.copy(plinth);
    this.imagePlaced = true;
    this.syncImageToCamera();
    this.revealImageIfReady();
  }

  hide(): void {
    this.transitionRequest++;
    this.targetOpacity = 0;
    this.imageActive = false;
    this.imagePlaced = false;
    this.imageRequest++;
    this.imageTarget = 0;
  }

  /** Fade toward target; call once per frame. */
  update(dt: number): void {
    // Camera flights/orbit change pose; viewport resize changes aspect/FOV.
    // Re-anchor, face and reframe against the live camera through every path.
    this.syncImageToCamera();
    const o = this.material.opacity;
    this.material.opacity = o + (this.targetOpacity - o) * Math.min(1, dt * 5);
    if (this.targetOpacity === 0 && this.material.opacity < 0.005) this.mesh.visible = false;

    const io = this.imageMaterial.opacity;
    this.imageMaterial.opacity = io + (this.imageTarget - io) * Math.min(1, dt * 4);
    if (this.imageTarget === 0 && this.imageMaterial.opacity < 0.005) this.imageMesh.visible = false;
  }

  /** Fade out, then swap text and fade back in at the new anchor. */
  transitionTo(name: string, accent: number, plinth: THREE.Vector3, cameraPos: THREE.Vector3): void {
    const request = ++this.transitionRequest;
    this.targetOpacity = 0;
    this.imagePlaced = false;
    this.imageTarget = 0;
    window.setTimeout(() => {
      if (request !== this.transitionRequest) return;
      this.setText(name, accent);
      this.showAt(plinth, cameraPos);
    }, 180);
  }
}
