// A picture of her, taken from the model that is already on the stage.
//
// The scene endpoint used to draw places with nobody in them, for a good
// reason: a text-to-image model invents a different face every call, so a
// second Rin beside the real one was a promise the app could not keep.
// Image-to-image removes that objection — if the drawing starts from her own
// render, her face is not being guessed, it is being carried.
//
// So this renders the resident's GLB once, offscreen, on a flat neutral field
// and hands back a JPEG data URI. It rides along with the progressive character
// loader (`whenLoaded`) and never triggers a download of its own; if her model
// is not in memory yet the caller simply gets null and the place is drawn
// without her, exactly as before.

import * as THREE from 'three';
import { whenLoaded } from './champions';

/** Portrait, because a standing figurine wastes half of a landscape frame. */
const W = 768;
const H = 1024;

/**
 * Mid grey. A cutout on black loses her silhouette wherever her outfit is
 * dark, and Kagura and Momo are both mostly dark.
 */
const FIELD = 0x8a8a8a;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

const cache = new Map<string, Promise<string | null>>();
const portraitCache = new Map<string, Promise<string | null>>();

let portraitRenderer: THREE.WebGLRenderer | null = null;
let portraitScene: THREE.Scene | null = null;
let portraitCamera: THREE.PerspectiveCamera | null = null;

function ensureRig(): void {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    // toDataURL needs the buffer to survive the render call.
    preserveDrawingBuffer: true,
    alpha: false,
  });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FIELD);
  // Flat and even. Any drama here would fight the lighting of the scene she is
  // about to be placed into.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.9);
  key.position.set(1.6, 3.4, 3.6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6f2, 0.7);
  fill.position.set(-2.4, 1.4, 1.8);
  scene.add(fill);

  camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 20);
  camera.position.set(0, 1.02, 3.15);
  camera.lookAt(0, 0.9, 0);
}

/**
 * Her render as a JPEG data URI, or null when her model is not loaded yet.
 *
 * Cached per model: the subject never changes, only the place she is put into.
 */
export function subjectShot(modelUrl: string): Promise<string | null> {
  let p = cache.get(modelUrl);
  if (!p) {
    p = Promise.race([
      whenLoaded(modelUrl),
      // Never wait on a model that has not reached the loader yet — the scene
      // picture is off the critical path and a missing subject is not an error.
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
    ])
      .then((model) => {
        if (!model) return null;
        ensureRig();
        scene!.add(model);
        // Fit the whole sculpt, not just its height. Kagura's sword is wider
        // than she is tall, so framing on height alone cropped it at both
        // edges; the distance has to satisfy width and height and then back off
        // for margin.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const vFov = (camera!.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera!.aspect);
        const forHeight = size.y / 2 / Math.tan(vFov / 2);
        const forWidth = Math.max(size.x, size.z) / 2 / Math.tan(hFov / 2);
        const distance = Math.max(forHeight, forWidth) * 1.18;
        camera!.position.set(centre.x, centre.y, centre.z + distance);
        camera!.lookAt(centre);
        renderer!.render(scene!, camera!);
        // JPEG, not PNG: this travels in a JSON body to the drawing model, and
        // a lossless 768x1024 would be several megabytes of base64.
        const data = renderer!.domElement.toDataURL('image/jpeg', 0.86);
        scene!.remove(model);
        return data;
      })
      .catch(() => null);
    cache.set(modelUrl, p);
  }
  return p;
}

function ensurePortraitRig(): void {
  if (portraitRenderer) return;
  portraitRenderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  });
  portraitRenderer.setSize(W, H, false);
  portraitRenderer.setPixelRatio(1);
  portraitRenderer.outputColorSpace = THREE.SRGBColorSpace;
  portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  portraitRenderer.setClearColor(0x000000, 0);

  portraitScene = new THREE.Scene();
  portraitScene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.55));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.9);
  key.position.set(1.6, 3.4, 3.6);
  portraitScene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6f2, 0.75);
  fill.position.set(-2.4, 1.4, 1.8);
  portraitScene.add(fill);

  portraitCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 20);
}

/**
 * Exact transparent resident render used by the offline Open Chat asset
 * capture script. It never calls an image model and never enters runtime chat
 * state; the yaw only gives the authored reward deck distinct camera views.
 */
export function subjectPortrait(modelUrl: string, yaw = 0): Promise<string | null> {
  const key = `${modelUrl}:${yaw.toFixed(3)}`;
  let pending = portraitCache.get(key);
  if (!pending) {
    pending = Promise.race([
      whenLoaded(modelUrl),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
    ])
      .then((loaded) => {
        if (!loaded) return null;
        ensurePortraitRig();
        const model = loaded.clone(true);
        model.rotation.y = yaw;
        portraitScene!.add(model);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const vFov = (portraitCamera!.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * portraitCamera!.aspect);
        const forHeight = size.y / 2 / Math.tan(vFov / 2);
        const forWidth = Math.max(size.x, size.z) / 2 / Math.tan(hFov / 2);
        const distance = Math.max(forHeight, forWidth) * 1.16;
        portraitCamera!.position.set(centre.x, centre.y, centre.z + distance);
        portraitCamera!.lookAt(centre);
        portraitRenderer!.render(portraitScene!, portraitCamera!);
        const data = portraitRenderer!.domElement.toDataURL('image/png');
        portraitScene!.remove(model);
        return data;
      })
      .catch(() => null);
    portraitCache.set(key, pending);
  }
  return pending;
}
