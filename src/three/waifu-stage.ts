// Companion-universe staging: only the selected resident is loaded and stands
// on the center base. The cast selector is DOM imagery; it must not silently
// download and render three full GLBs behind the product shot.
//
// Open Chat uses static sculpts, so "alive" is carried by light and motion.
// Quest Mode swaps the selected sculpt for a real skinned placeholder. Meshy
// owns the first skin only; production motion remains a Mixamo retargeting job.

import * as THREE from 'three';
import { loadNormalized } from './champions';
import {
  disposeQuestRig,
  loadQuestRig,
  setQuestRigStatus,
} from './quest-rig';
import { RESIDENTS, type VisualIdentity } from '../config/residents';
import type { KaguraFigurineVariantId } from '../config/figurine-products';
import type { QuestPresentation } from '../config/quests';

type MoteMotif = VisualIdentity['moteMotif'];

/**
 * Where Frame 12 hangs, laterally.
 *
 * Right of the character, and that side specifically. Dead centre put it behind
 * her; the left is where the mobile speech column sits — 56% wide off the left
 * edge, so it covers roughly the first two thirds of a 390px screen. The right
 * band is the only part of a phone viewport that is reliably clear of both her
 * body and her words, which is where the one reveal in Episode 0 has to live.
 */
const FRAME12_X = 0.92;

/** Total height on the base, including the figure's own display plinth. */
const HERO_HEIGHT = 1.3;
const GHOST_HEIGHT = 1.05;
// The reference effect uses a small number of very large textured planes,
// randomized through a volume and rotated slowly. More tiny sprites read as
// bubbles; fewer layered clouds read as smoke.
const CRYO_SMOKE_COUNT = 56;

function cryoSmokeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const grids = [8, 16, 32, 64].map((cells, octave) => {
    const values = new Float32Array((cells + 1) * (cells + 1));
    for (let i = 0; i < values.length; i++) {
      const n = Math.sin((i + 17 * octave) * 91.731) * 43758.5453;
      values[i] = n - Math.floor(n);
    }
    return { cells, values };
  });
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (x: number, y: number, cells: number, values: Float32Array) => {
    const gx = (x / size) * cells;
    const gy = (y / size) * cells;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const tx = smooth(gx - ix);
    const ty = smooth(gy - iy);
    const stride = cells + 1;
    const a = values[iy * stride + ix];
    const b = values[iy * stride + ix + 1];
    const c = values[(iy + 1) * stride + ix];
    const d = values[(iy + 1) * stride + ix + 1];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let noise = 0;
      let weight = 0;
      grids.forEach(({ cells, values }, octave) => {
        const amplitude = 1 / 2 ** octave;
        noise += sample(x, y, cells, values) * amplitude;
        weight += amplitude;
      });
      noise /= weight;
      const nx = (x / size - 0.5) * 2;
      const ny = (y / size - 0.5) * 2;
      const falloff = THREE.MathUtils.smoothstep(1 - Math.sqrt(nx * nx + ny * ny), 0, 0.72);
      const density = THREE.MathUtils.clamp((noise - 0.37) * 2.35, 0, 1) * falloff;
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(density * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface QuestCharacterVisibilityInput {
  questMode: boolean;
  debugRig: boolean;
  hasRig: boolean;
  isHero: boolean;
}

export function questCharacterVisibility({
  questMode,
  debugRig,
  hasRig,
  isHero,
}: QuestCharacterVisibilityInput): { resident: boolean; rig: boolean } {
  if (!questMode) return { resident: true, rig: false };
  if (!debugRig) return { resident: false, rig: false };
  return { resident: !hasRig && isHero, rig: hasRig };
}

function questRigDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debugQuestRig') === '1';
}

interface Entry {
  id: string;
  group: THREE.Group;
  materials: THREE.Material[];
  targetYaw: number;
  loaded: boolean;
  revealScale: number;
}

const KAGURA_VARIANT_ENTRY_PREFIX = 'kagura-variant:';

export class WaifuStage {
  private entries = new Map<string, Entry>();
  private heroId: string | null = null;
  private heroY = 0;
  /** Shared yaw for whichever sculpt currently owns the center base. */
  private turntableYaw = 0;
  /** 0 = idle, 1 = mid-utterance; drives ring pulse and sway amplitude. */
  speakingLevel = 0;
  private speakingTarget = 0;

  readonly ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private premiumPedestal: THREE.Group;
  private premiumRingMat: THREE.MeshBasicMaterial;
  private maxAnisotropy = 8;
  private textureLoader = new THREE.TextureLoader();
  private glowTextures = new Set<THREE.Texture>();
  private glow: THREE.PointLight;
  private upLight: THREE.SpotLight;
  private upLightFill: THREE.SpotLight;
  private rimLight: THREE.SpotLight;
  private premiumKey: THREE.SpotLight;
  private premiumFill: THREE.SpotLight;
  private cryoPod = new THREE.Group();
  private cryoInnerLight: THREE.PointLight;
  private cryoSmoke: THREE.Points;
  private cryoSmokeMaterial: THREE.ShaderMaterial;
  private cryoSmokeLife = new Float32Array(CRYO_SMOKE_COUNT);
  private cryoSmokeMaxLife = new Float32Array(CRYO_SMOKE_COUNT);
  private cryoSmokeVelocity = Array.from(
    { length: CRYO_SMOKE_COUNT },
    () => new THREE.Vector3()
  );
  private cryoSmokeRotationSpeed = new Float32Array(CRYO_SMOKE_COUNT);
  private cryoSpawnCursor = 0;
  private cryoSpawnBudget = 0;
  private cryoRevealTime = -1;
  private cryoRevealEntry: Entry | null = null;
  private cryoRevealReady: (() => void) | null = null;
  private motes: THREE.Points;
  private moteMotif: MoteMotif = 'data';
  private officeStatic = false;
  private questMode = false;
  private readonly debugQuestRig: boolean;
  private questRig: THREE.Group | null = null;
  /** Drives the quest rig's walk clip; null until the animated asset loads. */
  private questMixer: THREE.AnimationMixer | null = null;
  private archive = new THREE.Group();
  private archiveFrames: THREE.Mesh[] = [];
  private frame12: THREE.Mesh;
  private frame12Material: THREE.MeshBasicMaterial;
  private archiveSilhouette: THREE.Mesh;
  /** Opacity `update()` breathes toward; owned by setQuestVisual. */
  private frame12Target = 0.18;
  /** Multiplier that steps the other eleven frames back on the reveal. */
  private archiveDim = 1;

  constructor(
    private scene: THREE.Scene,
    /** Top surface of the center base; the hero stands here. */
    baseTopY: number,
    maxAnisotropy = 8
  ) {
    this.debugQuestRig = questRigDebugEnabled();
    document.documentElement.dataset.questRigDebug = String(this.debugQuestRig);
    this.maxAnisotropy = maxAnisotropy;
    this.heroY = baseTopY;
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.014, 10, 64), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = baseTopY + 0.01;
    scene.add(this.ring);

    // Premium editions do not replace the resident on her chat base. They are
    // moved onto a smaller inspection plinth so the state change reads as a
    // product view, and "back to original" has a physical destination.
    this.premiumPedestal = new THREE.Group();
    const premiumBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.51, 0.12, 64),
      new THREE.MeshStandardMaterial({
        color: 0x08090c,
        metalness: 0.72,
        roughness: 0.25,
      })
    );
    this.premiumRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const premiumRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.43, 0.012, 8, 64),
      this.premiumRingMat
    );
    premiumRing.rotation.x = -Math.PI / 2;
    premiumRing.position.y = 0.066;
    this.premiumPedestal.add(premiumBody, premiumRing);
    this.premiumPedestal.position.set(this.premiumSpotX(), baseTopY - 0.06, 0.05);
    this.premiumPedestal.visible = false;
    scene.add(this.premiumPedestal);
    this.glow = new THREE.PointLight(0xffffff, 0, 4, 2);
    this.glow.position.set(0, baseTopY + 0.35, 0.3);
    scene.add(this.glow);

    // Rim-led hero rig for a near-black character floating in the void. A
    // single high top-down wash lost the black armour and hair against the
    // dark. Instead: a modest warm key rakes the front planes from 3/4 camera-
    // left to reveal the face and chest, and two strong back rims — cool
    // camera-left, warm-orange camera-right — trace the whole silhouette so the
    // sword-and-flame outline reads as clean lit edges, not a flat top wash.
    this.upLight = new THREE.SpotLight(0xffe9d2, 5.6, 9, Math.PI / 3.4, 0.72, 1.0);
    this.upLightFill = new THREE.SpotLight(0x9fd8ff, 4.7, 9, Math.PI / 3.7, 0.82, 1.2);
    this.rimLight = new THREE.SpotLight(0xff6a40, 4.6, 9, Math.PI / 3.7, 0.82, 1.2);
    this.upLight.position.set(-1.45, baseTopY + 1.62, 2.65);
    this.upLightFill.position.set(-1.9, baseTopY + 2.05, -1.75);
    this.rimLight.position.set(1.95, baseTopY + 2.05, -1.7);
    this.upLight.target.position.set(-0.05, baseTopY + 0.98, 0);
    this.upLightFill.target.position.set(-0.1, baseTopY + 1.05, 0);
    this.rimLight.target.position.set(0.1, baseTopY + 1.0, 0);
    for (const light of [this.upLight, this.upLightFill, this.rimLight]) {
      light.castShadow = false;
      scene.add(light, light.target);
    }

    // Product-photo lighting, activated only for a selected premium edition.
    // A warm key reveals skin and metal; a cool fill preserves detail in the
    // black armour instead of flattening it into the backdrop.
    this.premiumKey = new THREE.SpotLight(0xffe1c2, 0, 7, Math.PI / 3.8, 0.91, 1.25);
    this.premiumFill = new THREE.SpotLight(0xb8d9ff, 0, 6, Math.PI / 3.55, 0.94, 1.1);
    for (const light of [this.premiumKey, this.premiumFill]) {
      light.castShadow = false;
      scene.add(light, light.target);
    }

    // Cryo reveal prop. Layered shell panels, inset light strips and a proper
    // threshold keep this from reading as four black bars around a glass box.
    const podMetal = new THREE.MeshStandardMaterial({
      color: 0x11171d,
      metalness: 0.82,
      roughness: 0.28,
      emissive: 0x07131b,
      emissiveIntensity: 0.7,
    });
    // Open lit niche, not a closed capsule: a recessed back wall, an overhead
    // hood and a floor lip she thaws out of. No side rails or glass doors —
    // those sat at her sides and in front of her and sliced through the
    // sword-and-flame silhouette. The thaw is now carried by the inner light
    // blooming and the cold smoke clearing, not by doors swinging open.
    const podBack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.98, 0.08), podMetal);
    podBack.position.set(0, baseTopY + 0.99, -0.72);
    this.cryoPod.add(podBack);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.6), podMetal);
    canopy.position.set(0, baseTopY + 2.04, -0.45);
    this.cryoPod.add(canopy);
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.66), podMetal);
    threshold.position.set(0, baseTopY + 0.04, -0.2);
    this.cryoPod.add(threshold);
    const coldStripMaterial = new THREE.MeshBasicMaterial({ color: 0x9be9ff, toneMapped: false });
    for (const x of [-1.1, 1.1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.72, 0.025), coldStripMaterial);
      strip.position.set(x, baseTopY + 1.05, -0.58);
      this.cryoPod.add(strip);
    }
    const ventMaterial = new THREE.MeshStandardMaterial({ color: 0x050709, metalness: 0.8, roughness: 0.36 });
    for (let i = -2; i <= 2; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.09), ventMaterial);
      vent.position.set(i * 0.3, baseTopY + 2.0, -0.28);
      this.cryoPod.add(vent);
    }
    this.cryoPod.visible = false;
    scene.add(this.cryoPod);
    this.cryoInnerLight = new THREE.PointLight(0xbfefff, 0, 4.3, 1.7);
    this.cryoInnerLight.position.set(0, baseTopY + 1.25, 0.18);
    scene.add(this.cryoInnerLight);

    const smokeTexture = cryoSmokeTexture();
    const smokePositions = new Float32Array(CRYO_SMOKE_COUNT * 3);
    const smokeSizes = new Float32Array(CRYO_SMOKE_COUNT);
    const smokeAlpha = new Float32Array(CRYO_SMOKE_COUNT);
    const smokeRotation = new Float32Array(CRYO_SMOKE_COUNT);
    const smokeGeometry = new THREE.BufferGeometry();
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
    smokeGeometry.setAttribute('aSize', new THREE.BufferAttribute(smokeSizes, 1));
    smokeGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(smokeAlpha, 1));
    smokeGeometry.setAttribute('aRotation', new THREE.BufferAttribute(smokeRotation, 1));
    this.cryoSmokeMaterial = new THREE.ShaderMaterial({
      uniforms: { uSmoke: { value: smokeTexture }, uTint: { value: new THREE.Color(0xdff8ff) } },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aRotation;
        varying float vAlpha;
        varying float vRotation;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * (460.0 / max(1.0, -mv.z));
          vAlpha = aAlpha;
          vRotation = aRotation;
        }
      `,
      fragmentShader: `
        uniform sampler2D uSmoke;
        uniform vec3 uTint;
        varying float vAlpha;
        varying float vRotation;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vRotation);
          float s = sin(vRotation);
          vec2 uv = mat2(c, -s, s, c) * p + 0.5;
          float smoke = texture2D(uSmoke, uv).a;
          gl_FragColor = vec4(uTint, smoke * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.cryoSmoke = new THREE.Points(smokeGeometry, this.cryoSmokeMaterial);
    this.cryoSmoke.frustumCulled = false;
    this.cryoSmoke.visible = false;
    scene.add(this.cryoSmoke);

    const N = 220;
    const positions = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.022,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    scene.add(this.motes);

    // Prototype 1 uses authored geometry as the guaranteed scene. A generated
    // image may later replace a camera cut, but the mystery and its mutations
    // never wait on an image endpoint.
    const frameGeometry = new THREE.PlaneGeometry(0.58, 0.9);
    for (let i = 0; i < 11; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x76d9ff,
        transparent: true,
        opacity: 0.08 + (i % 3) * 0.025,
        wireframe: true,
        depthWrite: false,
      });
      const frame = new THREE.Mesh(frameGeometry.clone(), material);
      const side = i % 2 === 0 ? -1 : 1;
      frame.position.set(side * (1.05 + (i % 3) * 0.12), baseTopY + 0.95, -0.35 - i * 0.42);
      frame.rotation.y = side * -0.32;
      this.archive.add(frame);
      this.archiveFrames.push(frame);
    }
    this.frame12Material = new THREE.MeshBasicMaterial({
      color: 0xeafaff,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      depthWrite: false,
    });
    this.frame12 = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.45), this.frame12Material);
    // Off the character's axis on purpose. Dead-centre at the end of the
    // corridor put it directly behind her, so she occluded the silhouette —
    // which is the one thing beat 4 is supposed to reveal.
    this.frame12.position.set(FRAME12_X, baseTopY + 1.05, -4.5);
    this.archive.add(this.frame12);

    this.archiveSilhouette = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 1.05),
      new THREE.MeshBasicMaterial({
        // Near-black rather than navy: the corridor reads light, and the
        // silhouette has to be the darkest thing in the frame to register as a
        // person standing in it.
        color: 0x05090f,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      })
    );
    this.archiveSilhouette.position.set(FRAME12_X + 0.16, baseTopY + 0.98, -4.46);
    this.archive.add(this.archiveSilhouette);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 11),
      new THREE.MeshBasicMaterial({
        color: 0x102f45,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, baseTopY - 0.01, -2.2);
    this.archive.add(floor);
    this.archive.visible = false;
    scene.add(this.archive);

    if (this.debugQuestRig) {
      setQuestRigStatus('loading');
      void loadQuestRig(maxAnisotropy)
        .then(({ group, mixer }) => {
          this.questRig = group;
          this.questMixer = mixer;
          group.position.set(0, this.heroY, 0);
          group.visible = false;
          this.scene.add(group);
          setQuestRigStatus('ready');
          this.applyQuestCharacterVisibility();
        })
        .catch((error) => {
          setQuestRigStatus('fallback');
          console.warn('Quest debug rig failed to load; keeping it out of the live view.', error);
        });
    } else {
      setQuestRigStatus('disabled');
    }
  }

  setBaseTop(y: number): void {
    const delta = y - this.heroY;
    this.heroY = y;
    this.ring.position.y = y + 0.01;
    this.premiumPedestal.position.y = y - 0.06;
    this.glow.position.y = y + 0.35;
    this.upLight.position.y = y + 1.62;
    this.upLight.target.position.y = y + 0.98;
    this.upLightFill.position.y = y + 2.05;
    this.upLightFill.target.position.y = y + 1.05;
    this.rimLight.position.y = y + 2.05;
    this.rimLight.target.position.y = y + 1.0;
    const hero = this.heroId && this.entries.get(this.heroId);
    if (hero) hero.group.position.y = y;
    if (this.questRig) this.questRig.position.y = y;
    this.archive.position.y += delta;
  }

  /** Load the selected resident on demand. Selector thumbnails are static. */
  async load(heroId: string, onReady: (id: string) => void): Promise<void> {
    if (this.entries.has(heroId)) {
      onReady(heroId);
      return;
    }
    this.heroId = heroId;
    const cfg = RESIDENTS.find((r) => r.id === heroId)!;
    try {
      const model = await loadNormalized(cfg.modelUrl);
      const entry: Entry = {
        id: heroId,
        group: model,
        materials: [],
        targetYaw: this.turntableYaw,
        loaded: true,
        revealScale: 1,
      };
      const maxAniso = this.maxAnisotropy;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          entry.materials.push(mat);
          const std = mat as THREE.MeshStandardMaterial;
          for (const map of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap, std.aoMap, std.emissiveMap]) {
            if (map && map.anisotropy !== maxAniso) {
              map.anisotropy = maxAniso;
              map.needsUpdate = true;
            }
          }
        }
      });
      this.entries.set(heroId, entry);
      model.visible = false;
      this.scene.add(model);
      onReady(heroId);
    } catch {
      console.warn(`Waifu model failed to load: ${heroId}`);
    }
  }

  /** Swap only Kagura's collectible treatment; every model is lazy-loaded. */
  async loadKaguraVariant(
    variantId: KaguraFigurineVariantId,
    modelUrl: string,
    glowMapUrl: string,
    onReady: () => void
  ): Promise<void> {
    const entryId = `${KAGURA_VARIANT_ENTRY_PREFIX}${variantId}`;
    if (this.entries.has(entryId)) {
      onReady();
      return;
    }
    try {
      const [model, glowMap] = await Promise.all([
        loadNormalized(modelUrl),
        this.textureLoader.loadAsync(glowMapUrl),
      ]);
      glowMap.colorSpace = THREE.SRGBColorSpace;
      glowMap.flipY = false;
      glowMap.anisotropy = this.maxAnisotropy;
      this.glowTextures.add(glowMap);
      const entry: Entry = {
        id: entryId,
        group: model,
        materials: [],
        targetYaw: this.turntableYaw,
        loaded: true,
        revealScale: 1,
      };
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          entry.materials.push(material);
          const pbr = material as THREE.MeshStandardMaterial;
          if (pbr.isMeshStandardMaterial) pbr.userData.rodinGlowMap = glowMap;
          for (const map of [
            pbr.map,
            pbr.normalMap,
            pbr.roughnessMap,
            pbr.metalnessMap,
            pbr.aoMap,
            pbr.emissiveMap,
          ]) {
            if (map && map.anisotropy !== this.maxAnisotropy) {
              map.anisotropy = this.maxAnisotropy;
              map.needsUpdate = true;
            }
          }
        }
      });
      this.entries.set(entryId, entry);
      model.visible = false;
      this.scene.add(model);
      onReady();
    } catch {
      console.warn(`Kagura figurine variant failed to load: ${variantId}`);
    }
  }

  setKaguraVariantHero(variantId: KaguraFigurineVariantId): void {
    const entryId = `${KAGURA_VARIANT_ENTRY_PREFIX}${variantId}`;
    if (!this.entries.has(entryId)) return;
    const entry = this.entries.get(entryId)!;
    // Set the collapsed scale before the group becomes visible so there is no
    // one-frame full-size flash between teaser and materialisation.
    entry.revealScale = 0.04;
    this.heroId = entryId;
    for (const id of this.entries.keys()) this.place(id, id === entryId);
    const accent = new THREE.Color(0xff2038);
    for (const material of entry.materials) {
      const pbr = material as THREE.MeshStandardMaterial;
      if (!pbr.isMeshStandardMaterial) continue;
      pbr.envMapIntensity = 1.75;
      pbr.normalScale?.setScalar(1.06);
      pbr.roughness = Math.min(pbr.roughness, 0.88);
      // Rodin's Shaded export carries the authored red-energy mask. Using it
      // as emission over the PBR export preserves skin/armour detail and keeps
      // bloom away from neutral surfaces.
      pbr.emissiveMap = pbr.userData.rodinGlowMap as THREE.Texture;
      pbr.emissive.set(0xffffff);
      pbr.emissiveIntensity = variantId === 'ink' ? 0.72 : 1.15;
      pbr.toneMapped = true;
      pbr.needsUpdate = true;
    }
  }

  /** Premium editions are inspected on their own side pedestal, not the chat base. */
  setPremiumInspection(on: boolean): void {
    const entry = this.heroId && this.entries.get(this.heroId);
    if (!entry) return;
    const premiumX = this.premiumSpotX();
    entry.group.position.x = on ? premiumX : 0;
    entry.group.position.z = on ? 0.05 : 0;
    entry.group.rotation.y = on ? 0.12 : 0;
    this.premiumPedestal.position.x = premiumX;
    this.premiumPedestal.visible = on;
    this.ring.visible = !on && !this.questMode;
    this.premiumKey.intensity = on ? 2.15 : 0;
    this.premiumFill.intensity = on ? 1.3 : 0;
    this.premiumKey.position.set(premiumX + 1.6, this.heroY + 2.7, 2.1);
    this.premiumFill.position.set(premiumX - 1.5, this.heroY + 1.55, 1.4);
    for (const light of [this.premiumKey, this.premiumFill]) {
      light.target.position.set(premiumX, this.heroY + 0.78, 0);
    }
  }

  /** Leave the display base empty while the explicitly selected sculpt streams. */
  hideHero(): void {
    for (const entry of this.entries.values()) entry.group.visible = false;
  }

  /** Give the base to one resident and keep any cached model out of view. */
  setHero(id: string): void {
    this.heroId = id;
    this.premiumPedestal.visible = false;
    this.ring.visible = !this.questMode;
    this.premiumKey.intensity = 0;
    this.premiumFill.intensity = 0;
    const entry = this.entries.get(id);
    if (entry) entry.revealScale = 1;
    for (const residentId of this.entries.keys()) this.place(residentId, residentId === id);
  }

  /** Rotate the sculpt itself while the camera and desk plate stay locked. */
  setHeroYaw(yaw: number, immediate = false): void {
    this.turntableYaw = yaw;
    const entry = this.heroId && this.entries.get(this.heroId);
    if (!entry) return;
    entry.targetYaw = yaw;
    if (immediate) entry.group.rotation.y = yaw;
  }

  /** Close the resident inside the pod, then run one non-looping thaw reveal. */
  beginCryoReveal(id: string, onReadyForPullOut?: () => void): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.cryoRevealEntry = entry;
    this.cryoRevealReady = onReadyForPullOut ?? null;
    this.cryoRevealTime = 0;
    this.cryoSpawnCursor = 0;
    this.cryoSpawnBudget = 0;
    this.cryoPod.visible = true;
    this.cryoSmoke.visible = true;
    this.cryoInnerLight.intensity = 0.35;
    entry.group.visible = true;
    entry.group.position.set(0, this.heroY, -0.03);
    entry.group.scale.setScalar((HERO_HEIGHT / 1.45) * 0.98);
    for (let i = 0; i < this.cryoSmokeLife.length; i++) this.cryoSmokeLife[i] = 0;
    (this.cryoSmoke.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).array.fill(0);
  }

  private spawnCryoSmoke(count: number): void {
    const position = this.cryoSmoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sizes = this.cryoSmoke.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const alpha = this.cryoSmoke.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    const rotation = this.cryoSmoke.geometry.getAttribute('aRotation') as THREE.BufferAttribute;
    for (let n = 0; n < count; n++) {
      const i = this.cryoSpawnCursor++ % this.cryoSmokeLife.length;
      const side = Math.random() < 0.5 ? -1 : 1;
      // Cold air exits across the whole open seam. Most of it begins low and
      // falls over the lip; a smaller amount hangs higher around the doors.
      const floorBiased = Math.random() < 0.72;
      position.setXYZ(
        i,
        side * Math.random() * 0.7,
        this.heroY + (floorBiased ? 0.12 + Math.random() * 0.48 : 0.6 + Math.random() * 0.92),
        0.2 + Math.random() * 0.14
      );
      sizes.setX(i, 0.68 + Math.random() * 0.72);
      alpha.setX(i, 0.18 + Math.random() * 0.2);
      rotation.setX(i, Math.random() * Math.PI * 2);
      this.cryoSmokeRotationSpeed[i] = (Math.random() - 0.5) * 0.2;
      this.cryoSmokeMaxLife[i] = 2.1 + Math.random() * 1.8;
      this.cryoSmokeLife[i] = this.cryoSmokeMaxLife[i];
      this.cryoSmokeVelocity[i].set(
        side * (0.12 + Math.random() * 0.3),
        floorBiased ? -0.18 - Math.random() * 0.16 : -0.1 - Math.random() * 0.18,
        0.32 + Math.random() * 0.42
      );
    }
    position.needsUpdate = true;
    sizes.needsUpdate = true;
    alpha.needsUpdate = true;
    rotation.needsUpdate = true;
  }

  private premiumSpotX(): number {
    return window.matchMedia('(max-width: 760px)').matches ? 0 : 0;
  }

  displayFocus(): THREE.Vector3 {
    const premium = Boolean(this.heroId?.startsWith(KAGURA_VARIANT_ENTRY_PREFIX));
    return new THREE.Vector3(premium ? this.premiumSpotX() : 0, 0, premium ? 0.05 : 0);
  }

  private place(id: string, isHero: boolean): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.group.visible = questCharacterVisibility({
      questMode: this.questMode,
      debugRig: this.debugQuestRig,
      hasRig: this.questRig !== null,
      isHero,
    }).resident;
    // Models arrive normalized to 1.45 tall by the shared character loader.
    const scale = (isHero ? HERO_HEIGHT : GHOST_HEIGHT) / 1.45;
    e.group.scale.setScalar(scale * e.revealScale);
    if (isHero) {
      e.group.position.set(0, this.heroY, 0);
      e.targetYaw = this.turntableYaw;
    }
    // Waiting residents stay solid and step back into shadow. Transparency
    // reads as a rendering fault once two of them overlap.
    for (const m of e.materials) {
      const mat = m as THREE.MeshStandardMaterial;
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      if (!mat.userData.baseColor && mat.color) {
        mat.userData.baseColor = mat.color.clone();
      }
      const base = mat.userData.baseColor as THREE.Color | undefined;
      if (base && mat.color) {
        mat.color.copy(base);
        if (!isHero) mat.color.multiplyScalar(0.3);
      }
    }
    e.group.renderOrder = 0;
    if (!this.questMode) e.group.visible = isHero;
  }

  /** Ring/light accent, matched to the active resident. */
  setAccent(color: number): void {
    this.ringMat.color.setHex(color);
    this.premiumRingMat.color.setHex(color);
    this.glow.color.setHex(color);
    // Uplight leans toward her accent but stays mostly neutral so skin and
    // metal do not turn into a single colour wash.
    this.upLight.color.setHex(color).lerp(new THREE.Color(0xfff1df), 0.78);
    this.upLightFill.color.setHex(color).lerp(new THREE.Color(0xdce8ff), 0.86);
  }

  /**
   * What her canon leaves in the air around her: Rin's data motes rise in
   * columns, Kagura's embers drift up from the floor, Momo's ribbons turn
   * slowly at chest height.
   */
  setMotes(color: number, motif: MoteMotif): void {
    this.moteMotif = motif;
    (this.motes.material as THREE.PointsMaterial).color.setHex(color);
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const a = (i / pos.count) * Math.PI * 2 * 7;
      const r = motif === 'ribbon' ? 0.9 + (i % 5) * 0.22 : 0.5 + (i % 9) * 0.16;
      const y = motif === 'ember' ? (i % 17) * 0.09 : 0.2 + (i % 21) * 0.09;
      pos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).size = motif === 'ribbon' ? 0.035 : 0.022;
  }

  /** The office handoff is a physical desk shot, not a supernatural reveal. */
  setAmbientEffectsVisible(visible: boolean): void {
    this.officeStatic = !visible;
    this.motes.visible = visible;
    if (!visible) {
      this.cryoRevealTime = -1;
      this.cryoRevealEntry = null;
      this.cryoRevealReady = null;
      this.cryoPod.visible = false;
      this.cryoSmoke.visible = false;
      this.cryoInnerLight.intensity = 0;
      for (const entry of this.entries.values()) {
        entry.group.position.y = this.heroY;
        entry.group.rotation.z = 0;
      }
    }
  }

  /** Called when a greeting or reply starts/stops. */
  setSpeaking(on: boolean): void {
    this.speakingTarget = on ? 1 : 0;
  }

  /** Quest Mode owns the whole stage: only the selected resident remains. */
  setQuestMode(on: boolean): void {
    this.questMode = on;
    this.archive.visible = on;
    this.applyQuestCharacterVisibility();
    this.ring.visible = !on;
    this.setQuestVisual(on ? 'archive-corridor' : 'archive-corridor');
  }

  private applyQuestCharacterVisibility(): void {
    const hasRig = this.questRig !== null;
    for (const [id, entry] of this.entries) {
      entry.group.visible = questCharacterVisibility({
        questMode: this.questMode,
        debugRig: this.debugQuestRig,
        hasRig,
        isHero: id === this.heroId,
      }).resident;
    }
    if (this.questRig) {
      this.questRig.visible = questCharacterVisibility({
        questMode: this.questMode,
        debugRig: this.debugQuestRig,
        hasRig,
        isHero: true,
      }).rig;
    }
  }

  setQuestVisual(
    state: QuestPresentation['visualState'],
    mutation?: QuestPresentation['mutation']
  ): void {
    if (!this.questMode) return;
    const frameActive = state !== 'archive-corridor';
    // `update()` breathes the frame every tick, so a value written straight to
    // the material was gone within a frame and every mutation's opacity change
    // was invisible. The animation now oscillates around this target instead.
    this.frame12Target = frameActive ? 0.86 : 0.18;
    // The other eleven are data. When the twelfth powers on they step back so
    // the reveal is the brightest thing in the corridor rather than one more
    // wireframe among twelve.
    this.archiveDim = frameActive ? 0.28 : 1;
    this.frame12Material.opacity = this.frame12Target;
    this.frame12Material.color.setHex(
      state === 'frame-sealed' ? 0x778a99 : state === 'frame-open' ? 0xeaf6ff : 0x9ee9ff
    );
    this.archiveSilhouette.visible = frameActive;
    this.archiveSilhouette.scale.setScalar(state === 'archive-desync' ? 1.12 : 1);
    this.archiveSilhouette.position.x =
      mutation === 'erase-signature'
        ? 8
        : FRAME12_X + (state === 'archive-desync' ? 0.29 : 0.16);
    if (mutation === 'quarantine') {
      this.frame12Target = 0.3;
      this.frame12Material.color.setHex(0x8d9aa6);
    }
    if (mutation === 'open-channel') {
      this.frame12Material.color.setHex(0xffffff);
      this.frame12Target = 0.98;
    }
    if (mutation === 'desync-motion') {
      this.archiveSilhouette.rotation.z = 0.055;
    } else {
      this.archiveSilhouette.rotation.z = 0;
    }
  }

  update(t: number, dt: number): void {
    this.speakingLevel += (this.speakingTarget - this.speakingLevel) * Math.min(1, dt * 5);

    // While speaking the ring flickers on a fast carrier so it reads as a
    // voice rather than a slow ambient pulse.
    const chatter = this.speakingLevel * (0.5 + 0.5 * Math.sin(t * 17.3) * Math.sin(t * 9.1));
    this.ringMat.opacity = 0.28 + chatter * 0.6 + Math.sin(t * 1.5) * 0.04;
    this.ring.scale.setScalar(1 + chatter * 0.05);
    this.glow.intensity = this.speakingLevel * 2.4 + 0.35;

    // Motes move the way her canon moves: data climbs, embers rise and fade,
    // ribbons turn. All three lift a little while she is speaking.
    const mm = this.motes.material as THREE.PointsMaterial;
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const rise = (this.moteMotif === 'ribbon' ? 0.05 : 0.16) * (1 + this.speakingLevel);
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * rise;
      if (y > 2.3) y = 0.05;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    this.motes.rotation.y += dt * (this.moteMotif === 'ribbon' ? 0.16 : 0.05);
    mm.opacity = 0.4 + this.speakingLevel * 0.3;

    for (const [id, e] of this.entries) {
      const isHero = id === this.heroId;
      e.group.rotation.y += (e.targetYaw - e.group.rotation.y) * Math.min(1, dt * 4);
      if (isHero && e.group.visible) {
        if (e.revealScale < 1) {
          e.revealScale += (1 - e.revealScale) * Math.min(1, dt * 8.5);
          const scale = (HERO_HEIGHT / 1.45) * e.revealScale;
          e.group.scale.setScalar(scale);
        }
        if (this.officeStatic) {
          e.group.position.y = this.heroY;
          e.group.rotation.z = 0;
        } else {
          // Breathing sway, slightly stronger while talking.
          const amp = 0.006 + this.speakingLevel * 0.006;
          e.group.position.y = this.heroY + Math.sin(t * 1.15) * amp;
          e.group.rotation.z = Math.sin(t * 0.7) * 0.004;
        }
      }
    }

    if (this.cryoRevealTime >= 0) {
      this.cryoRevealTime += dt;
      const p = this.cryoRevealTime;
      // The mapped final video frame clears first; the audience holds on the
      // smoke-filled niche for one beat, then the inner light blooms and the
      // cold smoke clears to reveal her standing in it.
      this.cryoInnerLight.intensity = p < 0.4 ? 0.35 : Math.max(0, 2.8 * (1 - Math.max(0, p - 1.35) / 1.8));
      if (p > 0.72 && p < 1.9) {
        this.cryoSpawnBudget += dt * (p < 1.22 ? 138 : 62);
        const spawnCount = Math.floor(this.cryoSpawnBudget);
        if (spawnCount > 0) {
          this.cryoSpawnBudget -= spawnCount;
          this.spawnCryoSmoke(spawnCount);
        }
      }
      if (this.cryoRevealEntry) {
        const revealP = THREE.MathUtils.smoothstep(p, 1.02, 2.02);
        this.cryoRevealEntry.group.position.z = -0.03 + revealP * 0.14;
        const scale = (HERO_HEIGHT / 1.45) * (0.98 + revealP * 0.02);
        this.cryoRevealEntry.group.scale.setScalar(scale);
        for (const material of this.cryoRevealEntry.materials) {
          const standard = material as THREE.MeshStandardMaterial;
          if (standard.isMeshStandardMaterial) standard.envMapIntensity = 0.7 + revealP * 0.3;
        }
      }
      if (p > 2.62) {
        this.cryoPod.visible = false;
        this.cryoInnerLight.intensity = 0;
        const ready = this.cryoRevealReady;
        this.cryoRevealReady = null;
        ready?.();
      }
      if (p > 3.55) {
        this.cryoRevealTime = -1;
        this.cryoRevealEntry = null;
      }
    }

    const smokePosition = this.cryoSmoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    const smokeSizes = this.cryoSmoke.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const smokeAlpha = this.cryoSmoke.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    const smokeRotation = this.cryoSmoke.geometry.getAttribute('aRotation') as THREE.BufferAttribute;
    let smokeAlive = false;
    for (let i = 0; i < this.cryoSmokeLife.length; i++) {
      if (this.cryoSmokeLife[i] <= 0) continue;
      smokeAlive = true;
      this.cryoSmokeLife[i] = Math.max(0, this.cryoSmokeLife[i] - dt);
      const velocity = this.cryoSmokeVelocity[i];
      velocity.multiplyScalar(Math.max(0.84, 1 - dt * 1.8));
      const nextY = smokePosition.getY(i) + velocity.y * dt;
      const floorY = this.heroY + 0.045;
      if (nextY <= floorY) {
        // Dense cold vapor hugs the floor and spreads sideways before warming.
        velocity.y = 0.025 + Math.random() * 0.025;
        velocity.x *= 1.025;
      } else {
        velocity.y += dt * 0.06;
      }
      smokePosition.setXYZ(
        i,
        smokePosition.getX(i) + velocity.x * dt,
        Math.max(floorY, nextY),
        smokePosition.getZ(i) + velocity.z * dt
      );
      const lifeP = 1 - this.cryoSmokeLife[i] / this.cryoSmokeMaxLife[i];
      smokeSizes.setX(i, 0.72 + lifeP * 1.08);
      smokeAlpha.setX(i, this.cryoSmokeLife[i] > 0 ? Math.sin(lifeP * Math.PI) * 0.31 : 0);
      smokeRotation.setX(i, smokeRotation.getX(i) + this.cryoSmokeRotationSpeed[i] * dt);
    }
    smokePosition.needsUpdate = true;
    smokeSizes.needsUpdate = true;
    smokeAlpha.needsUpdate = true;
    smokeRotation.needsUpdate = true;
    this.cryoSmoke.visible = smokeAlive || this.cryoRevealTime >= 0;

    if (this.questMode) {
      // Advance the rig's walk clip (dt is the frame delta in seconds).
      if (this.debugQuestRig) this.questMixer?.update(dt);
      this.archiveFrames.forEach((frame, i) => {
        const material = frame.material as THREE.MeshBasicMaterial;
        material.opacity =
          (0.07 + (0.5 + 0.5 * Math.sin(t * 1.8 + i)) * 0.08) * this.archiveDim;
      });
      this.frame12Material.opacity +=
        (this.frame12Target + Math.sin(t * 3.2) * 0.06 - this.frame12Material.opacity) *
        Math.min(1, dt * 2);
    }
  }

  /**
   * SIMULATED look regeneration: the sculpt is untouched, a deterministic
   * colorway derived from the prompt seed is tinted onto cloned materials.
   * Production would swap in a regenerated GLB here instead.
   */
  tintHero(seed: number): void {
    const e = this.heroId && this.entries.get(this.heroId);
    if (!e) return;
    const hue = (seed % 360) / 360;
    const tint = new THREE.Color().setHSL(hue, 0.45, 0.62);
    e.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const cloned = mats.map((src) => {
        const base = (src.userData.originalMaterial as THREE.Material | undefined) ?? src;
        const c = base.clone() as THREE.MeshStandardMaterial;
        c.userData.originalMaterial = base;
        if (c.color) c.color.copy((base as THREE.MeshStandardMaterial).color).lerp(tint, 0.45);
        return c;
      });
      m.material = cloned.length > 1 ? cloned : cloned[0];
    });
    this.refreshMaterials(e);
  }

  restoreHero(): void {
    const e = this.heroId && this.entries.get(this.heroId);
    if (!e) return;
    e.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const restored = mats.map(
        (src) => (src.userData.originalMaterial as THREE.Material | undefined) ?? src
      );
      m.material = restored.length > 1 ? restored : restored[0];
    });
    this.refreshMaterials(e);
    this.place(e.id, true);
  }

  private refreshMaterials(e: Entry): void {
    e.materials = [];
    e.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) e.materials.push(mat);
    });
  }

  /** Character switching belongs to the static DOM selector, not the 3D scene. */
  pickTargets(): { id: string; object: THREE.Object3D }[] {
    return [];
  }

  dispose(): void {
    for (const e of this.entries.values()) e.group.parent?.remove(e.group);
    this.entries.clear();
    for (const texture of this.glowTextures) texture.dispose();
    this.glowTextures.clear();
    this.ring.parent?.remove(this.ring);
    this.ring.geometry.dispose();
    this.ringMat.dispose();
    this.premiumPedestal.parent?.remove(this.premiumPedestal);
    this.premiumPedestal.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    this.motes.parent?.remove(this.motes);
    this.motes.geometry.dispose();
    (this.motes.material as THREE.Material).dispose();
    this.cryoPod.parent?.remove(this.cryoPod);
    this.cryoPod.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = mesh.material
        ? Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        : [];
      for (const material of materials) material.dispose();
    });
    this.cryoSmoke.parent?.remove(this.cryoSmoke);
    this.cryoSmoke.geometry.dispose();
    (this.cryoSmokeMaterial.uniforms.uSmoke.value as THREE.Texture).dispose();
    this.cryoSmokeMaterial.dispose();
    this.cryoInnerLight.parent?.remove(this.cryoInnerLight);
    this.cryoInnerLight.dispose();
    this.glow.parent?.remove(this.glow);
    for (const light of [this.upLight, this.upLightFill, this.rimLight]) {
      light.parent?.remove(light);
      light.target.parent?.remove(light.target);
      light.dispose();
    }
    for (const light of [this.premiumKey, this.premiumFill]) {
      light.parent?.remove(light);
      light.target.parent?.remove(light.target);
      light.dispose();
    }
    this.archive.parent?.remove(this.archive);
    this.archive.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = mesh.material
        ? Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        : [];
      for (const material of materials) material.dispose();
    });
    this.questMixer?.stopAllAction();
    this.questMixer = null;
    if (this.questRig) disposeQuestRig(this.questRig);
    this.questRig = null;
  }
}
