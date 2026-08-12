// Render the three companion GLBs against transparency for the character
// screen. These are presentation assets only; the selected GLB remains the
// interactive source of truth in the Three.js stage.

import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.QA_URL ?? 'http://127.0.0.1:5199';
const OUT = new globalThis.URL('../public/assets/residents/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const residents = [
  ['rin', 'assets/waifu-nyx.glb'],
  ['kagura', 'assets/figurines/kagura-original.glb'],
  ['momo', 'assets/waifu-suri.glb'],
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  for (const [id, url] of residents) {
    const png = await page.evaluate(async (modelUrl) => {
      const THREE = await import('/@id/three');
      const { GLTFLoader } = await import('/@id/three/addons/loaders/GLTFLoader.js');
      const { KTX2Loader } = await import('/@id/three/addons/loaders/KTX2Loader.js');
      const { MeshoptDecoder } = await import('/@id/three/addons/libs/meshopt_decoder.module.js');
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(900, 1200, false);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.setKTX2Loader(new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer));
      const gltf = await loader.loadAsync(modelUrl);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = 2.05 / Math.max(size.y, 0.001);
      model.scale.setScalar(scale);
      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = scaledBox.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -center.y - 0.04, -center.z);
      scene.add(model);
      scene.add(new THREE.HemisphereLight(0xdce8ff, 0x08090b, 1.4));
      const key = new THREE.DirectionalLight(0xffead8, 3.1);
      key.position.set(-2.2, 3.4, 3.2);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xbfd7ff, 1.2);
      fill.position.set(2.4, 1.6, 2.2);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xff4a48, 2.1);
      rim.position.set(1.5, 2.6, -2.4);
      scene.add(rim);
      const camera = new THREE.PerspectiveCamera(29, 900 / 1200, 0.1, 20);
      camera.position.set(0.28, 0.15, 4.15);
      camera.lookAt(0, 0.04, 0);
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png').split(',')[1];
    }, url);
    const webp = await sharp(Buffer.from(png, 'base64'))
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize({ width: 760, height: 1040, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92, alphaQuality: 100, effort: 6 })
      .toBuffer();
    writeFileSync(`${OUT}${id}.webp`, webp);
    console.log(`${id}.webp ${(webp.length / 1024).toFixed(0)}KB`);
  }
} finally {
  await browser.close();
}
