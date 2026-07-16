// Character thumbnails for the studio slider: each loaded model is rendered
// once into a small offscreen renderer and cached as a data URL. Missing
// models fall back to a typographic monogram tile.

import * as THREE from 'three';
import { whenLoaded } from './champions';

const SIZE_W = 120;
const SIZE_H = 150;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

const cache = new Map<string, Promise<string>>();

function ensureRig(): void {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setSize(SIZE_W, SIZE_H, false);
  renderer.setPixelRatio(2);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  scene.add(new THREE.HemisphereLight(0x3a4252, 0x0a0b0d, 1));
  const key = new THREE.DirectionalLight(0xf3e9d5, 2.6);
  key.position.set(2, 4, 4);
  scene.add(key);
  camera = new THREE.PerspectiveCamera(30, SIZE_W / SIZE_H, 0.1, 20);
  camera.position.set(0.35, 1.05, 3.1);
  camera.lookAt(0, 0.72, 0);
}

export function monogramThumb(letter: string, accent: number): string {
  const c = document.createElement('canvas');
  c.width = SIZE_W * 2;
  c.height = SIZE_H * 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = `#${accent.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, c.height - 10, c.width, 10);
  ctx.fillStyle = '#efe6d4';
  ctx.font = `700 130px 'Avenir Next', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter.toUpperCase(), c.width / 2, c.height / 2);
  return c.toDataURL('image/png');
}

export function characterThumb(url: string, fallbackLetter: string, accent: number): Promise<string> {
  let p = cache.get(url);
  if (!p) {
    // Rides along with the progressive character loader — never triggers a
    // download of its own. Until then the monogram placeholder stays up.
    p = whenLoaded(url)
      .then((model) => {
        ensureRig();
        scene!.add(model);
        renderer!.render(scene!, camera!);
        const data = renderer!.domElement.toDataURL('image/png');
        scene!.remove(model);
        return data;
      })
      .catch(() => monogramThumb(fallbackLetter, accent));
    cache.set(url, p);
  }
  return p;
}
