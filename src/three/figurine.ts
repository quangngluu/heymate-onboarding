// PROCEDURAL PROXY figurine builder.
//
// In the intended pipeline the three faction champions are Mint-generated
// GLBs. Mint MCP was unavailable in the build session, so this module builds
// clearly isolated stand-ins that follow the locked Heymate collectible DNA:
// oversized rounded head, compact chibi body, smooth vinyl surfaces,
// simplified hands/feet, no thin dangling parts, fixed pedestal footprint.
//
// The customization adapter (adapter.ts) binds to the SAME role/anchor
// contract a Mint GLB would be registered under (see config/assets.ts), so
// swapping a proxy for a real model does not touch this project's scene code.

import * as THREE from 'three';
import type { FactionConfig, AccentKind, EmblemGlyph } from '../config/factions';
import type { ExpressionId, HairId, EyewearId } from '../config/customization';
import type { AdapterAnchorName } from '../config/assets';

// ---- Shared DNA constants (locked; not user-editable) ----
export const DNA = {
  pedestalRadius: 0.5,
  pedestalHeight: 0.12,
  headRadius: 0.35,
  headY: 1.26,
  totalHeight: 1.61,
} as const;

const SKIN_COLOR = 0xf3dcc2;
const HAIR_COLOR = 0x2a2320;
const PEDESTAL_COLOR = 0x1a1d22;

// ---- Materials ----

export function vinyl(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.38,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.4,
  });
}

export interface FigurineMaterials {
  primary: THREE.MeshPhysicalMaterial;
  secondary: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshPhysicalMaterial;
  skin: THREE.MeshPhysicalMaterial;
  hair: THREE.MeshPhysicalMaterial;
  pedestal: THREE.MeshStandardMaterial;
  /** Emissive LED/light-bar material; recolored from the palette accent. */
  glow: THREE.MeshStandardMaterial;
}

export function makeMaterials(faction: FactionConfig): FigurineMaterials {
  const p = faction.palettes[0];
  const accent = vinyl(p.accent);
  accent.emissive = new THREE.Color(p.accent).multiplyScalar(0.12);
  const set: FigurineMaterials = {
    primary: vinyl(p.primary),
    secondary: vinyl(p.secondary),
    accent,
    skin: vinyl(SKIN_COLOR),
    hair: vinyl(HAIR_COLOR),
    pedestal: new THREE.MeshStandardMaterial({ color: PEDESTAL_COLOR, roughness: 0.55, metalness: 0.35 }),
    glow: new THREE.MeshStandardMaterial({
      color: 0x0c0d10,
      emissive: new THREE.Color(p.accent),
      emissiveIntensity: 1.3,
      roughness: 0.4,
    }),
  };
  // Flag as shared so slot-swap disposal (disposeGroup) leaves them alone;
  // they are disposed once, by the owning Figurine instance.
  for (const m of Object.values(set)) m.userData.shared = true;
  return set;
}

// ---- Shared geometry cache (reused across all figurines) ----

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, castShadow = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.castShadow = castShadow;
  return me;
}

// ---- Canvas textures: faces + emblems ----

const faceTextures = new Map<ExpressionId, THREE.CanvasTexture>();

export function faceTexture(expression: ExpressionId): THREE.CanvasTexture {
  const cached = faceTextures.get(expression);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = '#241d19';
  ctx.strokeStyle = '#241d19';
  ctx.lineCap = 'round';

  const eyeY = 250;
  const eyeDX = 88;
  // Eyes
  for (const s of [-1, 1]) {
    const x = 256 + s * eyeDX;
    ctx.beginPath();
    if (expression === 'playful') {
      // happy arc eyes
      ctx.lineWidth = 22;
      ctx.arc(x, eyeY + 12, 34, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      const h = expression === 'confident' ? 46 : 56;
      ctx.ellipse(x, eyeY, 26, h / 2 + 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // catchlight
      ctx.save();
      ctx.fillStyle = '#fdf6ea';
      ctx.beginPath();
      ctx.arc(x + 9, eyeY - 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // Brows
  ctx.lineWidth = 14;
  for (const s of [-1, 1]) {
    const x = 256 + s * eyeDX;
    ctx.beginPath();
    if (expression === 'confident') {
      ctx.moveTo(x - s * 30, eyeY - 74);
      ctx.lineTo(x + s * 28, eyeY - 88);
    } else {
      ctx.moveTo(x - 28, eyeY - 82);
      ctx.quadraticCurveTo(x, eyeY - 94, x + 28, eyeY - 82);
    }
    ctx.stroke();
  }
  // Mouth
  ctx.lineWidth = 16;
  ctx.beginPath();
  if (expression === 'calm') {
    ctx.moveTo(232, 352);
    ctx.quadraticCurveTo(256, 362, 280, 352);
    ctx.stroke();
  } else if (expression === 'confident') {
    ctx.moveTo(226, 350);
    ctx.quadraticCurveTo(262, 366, 292, 344);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#241d19';
    ctx.arc(256, 350, 30, 0, Math.PI);
    ctx.fill();
  }
  // Blush
  ctx.fillStyle = 'rgba(224, 130, 110, 0.35)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(256 + s * 150, 322, 30, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceTextures.set(expression, tex);
  return tex;
}

const emblemTextures = new Map<EmblemGlyph, THREE.CanvasTexture>();

export function emblemTexture(glyph: EmblemGlyph): THREE.CanvasTexture {
  const cached = emblemTextures.get(glyph);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  // dark disc + ivory glyph
  ctx.fillStyle = '#15171b';
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#efe6d4';
  ctx.fillStyle = '#efe6d4';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (glyph === 'chevron') {
    // double speed chevron (RED//SHIFT)
    for (const off of [-26, 26]) {
      ctx.beginPath();
      ctx.moveTo(74 + off, 78);
      ctx.lineTo(148 + off, 128);
      ctx.lineTo(74 + off, 178);
      ctx.lineTo(74 + off, 148);
      ctx.lineTo(112 + off, 128);
      ctx.lineTo(74 + off, 108);
      ctx.closePath();
      ctx.fill();
    }
  } else if (glyph === 'jaw') {
    // torn hazard teeth (RAZORPACK)
    ctx.beginPath();
    ctx.moveTo(56, 96);
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(76 + i * 30, 152);
      ctx.lineTo(96 + i * 30, 96);
    }
    ctx.lineTo(200, 96);
    ctx.lineTo(200, 76);
    ctx.lineTo(56, 76);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(56, 168, 144, 16);
  } else if (glyph === 'gauge') {
    // speedometer ring + needle (WARD-9)
    ctx.beginPath();
    ctx.arc(128, 136, 66, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * 0.75 + (i / 6) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 52, 136 + Math.sin(a) * 52);
      ctx.lineTo(128 + Math.cos(a) * 66, 136 + Math.sin(a) * 66);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(128, 136);
    ctx.lineTo(128 + Math.cos(Math.PI * 1.9) * 48, 136 + Math.sin(Math.PI * 1.9) * 48);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(128, 136, 10, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // offset halo rings + listening dot (NULL CHOIR)
    ctx.beginPath();
    ctx.arc(128, 128, 78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(140, 118, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(112, 148, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  emblemTextures.set(glyph, tex);
  return tex;
}

// ---- Pedestal (shared by procedural proxies and loaded GLB champions) ----

export interface PedestalBuild {
  group: THREE.Group;
  ringMaterial: THREE.MeshStandardMaterial;
}

let feetShadowTex: THREE.CanvasTexture | null = null;
function feetShadowTexture(): THREE.CanvasTexture {
  if (feetShadowTex) return feetShadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  feetShadowTex = new THREE.CanvasTexture(c);
  return feetShadowTex;
}

/** Standalone soft feet shadow (for figures standing on a shared base). */
export function buildFeetShadow(radius = DNA.pedestalRadius * 0.86): THREE.Mesh {
  const feet = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({ map: feetShadowTexture(), transparent: true, depthWrite: false })
  );
  feet.rotation.x = -Math.PI / 2;
  feet.position.y = 0.006;
  return feet;
}

export function buildPedestal(accentColor: number): PedestalBuild {
  const group = new THREE.Group();
  const ped = mesh(
    geo('pedestal', () => new THREE.CylinderGeometry(DNA.pedestalRadius, DNA.pedestalRadius * 1.06, DNA.pedestalHeight, 40)),
    new THREE.MeshStandardMaterial({ color: PEDESTAL_COLOR, roughness: 0.55, metalness: 0.35 })
  );
  ped.position.y = DNA.pedestalHeight / 2;
  ped.receiveShadow = true;
  group.add(ped);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x0c0e11,
    emissive: new THREE.Color(accentColor),
    emissiveIntensity: 0.25,
    roughness: 0.5,
  });
  const ring = mesh(
    geo('pedestal-ring', () => new THREE.TorusGeometry(DNA.pedestalRadius * 0.92, 0.016, 10, 48)),
    ringMaterial,
    false
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = DNA.pedestalHeight + 0.004;
  group.add(ring);
  // Soft contact shadow under the figure's feet on the pedestal top.
  const feet = new THREE.Mesh(
    geo('feet-shadow', () => new THREE.CircleGeometry(DNA.pedestalRadius * 0.86, 32)),
    new THREE.MeshBasicMaterial({ map: feetShadowTexture(), transparent: true, depthWrite: false })
  );
  feet.rotation.x = -Math.PI / 2;
  feet.position.y = DNA.pedestalHeight + 0.006;
  group.add(feet);
  return { group, ringMaterial };
}

// ---- Base figure (shared DNA + locked faction silhouette) ----

export interface BaseBuild {
  root: THREE.Group;
  figure: THREE.Group;
  anchors: Record<AdapterAnchorName, THREE.Object3D>;
  faceMesh: THREE.Mesh;
  ringMaterial: THREE.MeshStandardMaterial;
}

export function buildBase(faction: FactionConfig, mats: FigurineMaterials): BaseBuild {
  const root = new THREE.Group();
  const figure = new THREE.Group();
  root.add(figure);

  // Pedestal (locked footprint)
  const ped = mesh(
    geo('pedestal', () => new THREE.CylinderGeometry(DNA.pedestalRadius, DNA.pedestalRadius * 1.06, DNA.pedestalHeight, 40)),
    mats.pedestal
  );
  ped.position.y = DNA.pedestalHeight / 2;
  ped.receiveShadow = true;
  root.add(ped);

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x0c0e11,
    emissive: new THREE.Color(faction.accentColor),
    emissiveIntensity: 0.25,
    roughness: 0.5,
  });
  const ring = mesh(
    geo('pedestal-ring', () => new THREE.TorusGeometry(DNA.pedestalRadius * 0.92, 0.016, 10, 48)),
    ringMaterial,
    false
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = DNA.pedestalHeight + 0.004;
  root.add(ring);

  // Legs + feet
  for (const s of [-1, 1]) {
    const leg = mesh(geo('leg', () => new THREE.CapsuleGeometry(0.09, 0.22, 6, 14)), mats.primary);
    leg.position.set(s * 0.125, 0.34, 0);
    figure.add(leg);
    const foot = mesh(geo('foot', () => new THREE.SphereGeometry(0.105, 18, 14)), mats.secondary);
    foot.scale.set(1.1, 0.62, 1.4);
    foot.position.set(s * 0.13, 0.165, 0.035);
    figure.add(foot);
  }

  // Torso
  const torso = mesh(geo('torso', () => new THREE.CapsuleGeometry(0.23, 0.26, 8, 20)), mats.primary);
  torso.position.y = 0.74;
  figure.add(torso);

  // Arms + hands
  for (const s of [-1, 1]) {
    const arm = mesh(geo('arm', () => new THREE.CapsuleGeometry(0.072, 0.2, 6, 12)), mats.primary);
    arm.position.set(s * 0.28, 0.78, 0);
    arm.rotation.z = s * 0.28;
    figure.add(arm);
    const hand = mesh(geo('hand', () => new THREE.SphereGeometry(0.088, 16, 12)), mats.skin);
    hand.position.set(s * 0.335, 0.575, 0);
    figure.add(hand);
  }

  // Head (oversized, locked proportion)
  const head = mesh(geo('head', () => new THREE.SphereGeometry(DNA.headRadius, 32, 24)), mats.skin);
  head.position.y = DNA.headY;
  figure.add(head);

  // Face plate: sphere cap conforming to the head, canvas expression texture.
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTexture('calm'),
    transparent: true,
    roughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const faceMesh = new THREE.Mesh(
    geo('face-cap', () =>
      new THREE.SphereGeometry(DNA.headRadius + 0.004, 28, 20, Math.PI / 2 - 0.62, 1.24, Math.PI / 2 - 0.58, 1.05)
    ),
    faceMat
  );
  faceMesh.position.y = DNA.headY;
  figure.add(faceMesh);

  // ---- Locked faction silhouette ----
  const sil = faction.silhouette;
  if (sil.hood) {
    const hood = mesh(geo('hood', () => new THREE.SphereGeometry(0.19, 18, 14)), mats.secondary);
    hood.scale.set(1.5, 0.72, 0.95);
    hood.position.set(0, 1.0, -0.24);
    figure.add(hood);
  }
  if (sil.strap) {
    const strap = mesh(geo('strap', () => new THREE.BoxGeometry(0.1, 0.6, 0.05)), mats.accent);
    strap.position.set(0.02, 0.8, 0.215);
    strap.rotation.z = -0.55;
    strap.rotation.x = -0.12;
    figure.add(strap);
    const pack = mesh(geo('strap-pack', () => new THREE.SphereGeometry(0.09, 14, 10)), mats.secondary);
    pack.scale.set(1.1, 0.9, 0.8);
    pack.position.set(-0.2, 0.62, 0.2);
    figure.add(pack);
  }
  if (sil.kneePads) {
    for (const s of [-1, 1]) {
      const pad = mesh(geo('knee', () => new THREE.SphereGeometry(0.068, 14, 10)), mats.accent);
      pad.scale.set(1, 0.9, 0.9);
      pad.position.set(s * 0.125, 0.36, 0.075);
      figure.add(pad);
    }
  }
  if (sil.coatSkirt) {
    const skirt = mesh(
      geo('coat-skirt', () => new THREE.CylinderGeometry(0.245, 0.4, 0.36, 24, 1, true)),
      mats.secondary
    );
    (skirt.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
    skirt.position.y = 0.5;
    figure.add(skirt);
    const hem = mesh(geo('coat-hem', () => new THREE.TorusGeometry(0.4, 0.022, 8, 32)), mats.accent);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.325;
    figure.add(hem);
  }
  if (sil.highCollar) {
    const collar = mesh(geo('collar', () => new THREE.TorusGeometry(0.175, 0.055, 10, 28)), mats.secondary);
    collar.rotation.x = Math.PI / 2 + 0.1;
    collar.position.set(0, 1.0, -0.01);
    figure.add(collar);
  }
  if (sil.vest) {
    const vest = mesh(
      geo('vest', () => new THREE.CylinderGeometry(0.262, 0.282, 0.3, 24, 1, true)),
      mats.secondary
    );
    (vest.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
    vest.position.y = 0.78;
    figure.add(vest);
    const rim = mesh(geo('vest-rim', () => new THREE.TorusGeometry(0.262, 0.02, 8, 28)), mats.accent);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.93;
    figure.add(rim);
  }
  if (sil.shoulderPanels) {
    for (const s of [-1, 1]) {
      const panel = mesh(geo('sh-panel', () => new THREE.SphereGeometry(0.1, 14, 10)), mats.secondary);
      panel.scale.set(1.15, 0.55, 1.05);
      panel.position.set(s * 0.29, 0.985, 0);
      figure.add(panel);
    }
  }
  if (sil.shoulderFairings) {
    for (const s of [-1, 1]) {
      const fairing = mesh(geo('fairing', () => new THREE.SphereGeometry(0.105, 16, 12)), mats.secondary);
      fairing.scale.set(1.35, 0.55, 1.2);
      fairing.position.set(s * 0.3, 1.0, 0);
      fairing.rotation.z = s * -0.28;
      figure.add(fairing);
    }
  }
  if (sil.ledStrip) {
    const strip = mesh(geo('led-strip', () => new THREE.BoxGeometry(0.05, 0.38, 0.02)), mats.glow);
    strip.position.set(0.1, 0.86, 0.235);
    strip.rotation.z = -0.52;
    strip.rotation.x = -0.12;
    figure.add(strip);
    const dot = mesh(geo('led-dot', () => new THREE.SphereGeometry(0.03, 10, 8)), mats.glow);
    dot.position.set(0.27, 0.98, 0.13);
    figure.add(dot);
  }
  if (sil.backHelmet) {
    const shell = mesh(geo('back-helmet', () => new THREE.SphereGeometry(0.15, 18, 14)), mats.secondary);
    shell.scale.set(1, 0.95, 1);
    shell.position.set(0, 0.8, -0.32);
    figure.add(shell);
    const visor = mesh(geo('back-helmet-visor', () => new THREE.BoxGeometry(0.17, 0.05, 0.02)), mats.glow);
    visor.position.set(0, 0.83, -0.45);
    figure.add(visor);
  }
  if (sil.asymShoulder) {
    const pauldron = mesh(geo('asym-shoulder', () => new THREE.SphereGeometry(0.13, 16, 12)), mats.secondary);
    pauldron.scale.set(1.5, 0.85, 1.3);
    pauldron.position.set(-0.31, 1.0, 0);
    pauldron.rotation.z = 0.2;
    figure.add(pauldron);
    const rim = mesh(geo('asym-rim', () => new THREE.TorusGeometry(0.14, 0.018, 8, 20)), mats.accent);
    rim.position.set(-0.31, 1.03, 0);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = 0.2;
    figure.add(rim);
  }
  if (sil.scrapPanels) {
    const specs: [string, [number, number, number], [number, number, number], [number, number, number], boolean][] = [
      ['scrap-a', [0.16, 0.12, 0.03], [0.12, 0.86, 0.215], [0, 0, 0.18], false],
      ['scrap-b', [0.13, 0.1, 0.03], [-0.14, 0.7, 0.215], [0, 0, -0.3], true],
      ['scrap-c', [0.1, 0.15, 0.03], [0.19, 0.68, 0.15], [0, 0.4, 0], false],
    ];
    for (const [key, size, pos, rot, accent] of specs) {
      const panel = mesh(geo(key, () => new THREE.BoxGeometry(...size)), accent ? mats.accent : mats.secondary);
      panel.position.set(...pos);
      panel.rotation.set(...rot);
      figure.add(panel);
    }
  }
  if (sil.beltGauge) {
    // Sits on the coat-skirt surface when the faction wears one (WARD-9),
    // hence the outward offset and the tilt matching the cone slope.
    const onCoat = !!sil.coatSkirt;
    const y = onCoat ? 0.52 : 0.56;
    const z = onCoat ? 0.33 : 0.245;
    const tilt = onCoat ? -0.38 : 0;
    const dial = mesh(geo('gauge-dial', () => new THREE.CircleGeometry(0.05, 20)), mats.secondary);
    dial.position.set(0, y, z);
    dial.rotation.x = tilt;
    figure.add(dial);
    const ring = mesh(geo('gauge-ring', () => new THREE.TorusGeometry(0.055, 0.013, 8, 22)), mats.glow);
    ring.position.set(0, y, z + 0.004);
    ring.rotation.x = tilt;
    figure.add(ring);
  }
  if (sil.neckRing) {
    const ring = mesh(geo('neck-ring', () => new THREE.TorusGeometry(0.19, 0.045, 10, 28)), mats.secondary);
    ring.rotation.x = Math.PI / 2 + 0.1;
    ring.position.set(0, 1.02, 0);
    figure.add(ring);
    const glowRing = mesh(geo('neck-glow', () => new THREE.TorusGeometry(0.19, 0.012, 8, 28)), mats.glow);
    glowRing.rotation.x = Math.PI / 2 + 0.1;
    glowRing.position.set(0, 1.065, 0);
    figure.add(glowRing);
  }
  if (sil.wristRings) {
    for (const s of [-1, 1]) {
      const ring = mesh(geo('wrist-ring', () => new THREE.TorusGeometry(0.1, 0.024, 8, 20)), mats.glow);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = s * 0.28;
      ring.position.set(s * 0.315, 0.63, 0);
      figure.add(ring);
    }
  }
  if (sil.sensoryCrown) {
    const crown = mesh(geo('crown', () => new THREE.TorusGeometry(0.3, 0.032, 10, 32)), mats.secondary);
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, DNA.headY + 0.13, 0);
    figure.add(crown);
    for (const s of [-1, 1]) {
      const pod = mesh(geo('crown-pod', () => new THREE.SphereGeometry(0.045, 10, 8)), mats.glow);
      pod.position.set(s * 0.3, DNA.headY + 0.13, 0);
      figure.add(pod);
    }
  }
  if (sil.glowSeam) {
    const seam = mesh(geo('glow-seam', () => new THREE.BoxGeometry(0.028, 0.4, 0.015)), mats.glow);
    seam.position.set(0, 0.74, 0.243);
    figure.add(seam);
  }
  if (sil.backModule) {
    const mod = mesh(geo('back-mod', () => new THREE.BoxGeometry(0.26, 0.3, 0.11)), mats.secondary);
    mod.position.set(0, 0.8, -0.265);
    figure.add(mod);
    const stripe = mesh(geo('back-stripe', () => new THREE.BoxGeometry(0.05, 0.22, 0.012)), mats.accent);
    stripe.position.set(0, 0.8, -0.325);
    figure.add(stripe);
  }

  // ---- Anchors (the adapter contract) ----
  const anchors = {} as Record<AdapterAnchorName, THREE.Object3D>;
  const addAnchor = (name: AdapterAnchorName, pos: [number, number, number], rot?: [number, number, number]) => {
    const o = new THREE.Object3D();
    o.position.set(...pos);
    if (rot) o.rotation.set(...rot);
    figure.add(o);
    anchors[name] = o;
  };
  addAnchor('hair', [0, DNA.headY, 0]);
  addAnchor('face', [0, DNA.headY, DNA.headRadius]);
  addAnchor('neck', [0, 1.0, 0]);
  addAnchor('chest', [0, 0.845, 0.235], [0.18, 0, 0]);
  addAnchor('shoulder', [-0.265, 1.005, 0.09], [0.5, -0.35, 0.2]);
  addAnchor('hips', [0, 0.52, 0]);
  addAnchor('back', [0, 0.8, -0.25]);
  // Pedestal anchor lives on the root so it ignores the hover raise.
  const pedAnchor = new THREE.Object3D();
  pedAnchor.position.set(0, DNA.pedestalHeight * 0.62, DNA.pedestalRadius * 0.99);
  pedAnchor.rotation.x = -0.08;
  root.add(pedAnchor);
  anchors.pedestal = pedAnchor;

  return { root, figure, anchors, faceMesh, ringMaterial };
}

// ---- Variant part builders (hair / eyewear / accents / emblem) ----

export function buildHair(id: HairId, mats: FigurineMaterials): THREE.Group {
  const g = new THREE.Group();
  const r = DNA.headRadius + 0.028;
  if (id === 'crop') {
    const cap = mesh(geo('hair-crop', () => new THREE.SphereGeometry(r, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.44)), mats.hair);
    cap.position.y = 0.012;
    cap.rotation.x = -0.16;
    g.add(cap);
  } else if (id === 'swoop') {
    const cap = mesh(geo('hair-swoop-cap', () => new THREE.SphereGeometry(r, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.48)), mats.hair);
    cap.rotation.z = 0.18;
    cap.rotation.x = -0.14;
    cap.position.y = 0.012;
    g.add(cap);
    const wedge = mesh(geo('hair-swoop-wedge', () => new THREE.SphereGeometry(0.17, 16, 12)), mats.hair);
    wedge.scale.set(0.7, 1.15, 0.9);
    wedge.position.set(-0.3, 0.02, 0.06);
    g.add(wedge);
  } else {
    const cap = mesh(geo('hair-buns-cap', () => new THREE.SphereGeometry(r, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.4)), mats.hair);
    cap.position.y = 0.012;
    cap.rotation.x = -0.14;
    g.add(cap);
    for (const s of [-1, 1]) {
      const bun = mesh(geo('hair-bun', () => new THREE.SphereGeometry(0.115, 16, 12)), mats.hair);
      bun.position.set(s * 0.24, 0.3, -0.06);
      g.add(bun);
    }
  }
  return g;
}

export function buildEyewear(id: EyewearId, mats: FigurineMaterials): THREE.Group {
  const g = new THREE.Group();
  if (id === 'none') return g;
  if (id === 'visor') {
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x0d1420,
      roughness: 0.08,
      metalness: 0.65,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    visorMat.emissive = new THREE.Color(mats.accent.color).multiplyScalar(0.16);
    const band = new THREE.Mesh(
      geo('visor', () => new THREE.CylinderGeometry(DNA.headRadius + 0.018, DNA.headRadius + 0.018, 0.1, 28, 1, true, -0.85, 1.7)),
      visorMat
    );
    band.position.y = 0.045;
    g.add(band);
  } else {
    const frame = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.3, metalness: 0.7 });
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(geo('glasses-lens', () => new THREE.TorusGeometry(0.078, 0.015, 10, 24)), frame);
      lens.position.set(s * 0.125, 0.02, DNA.headRadius - 0.02);
      g.add(lens);
    }
    const bridge = new THREE.Mesh(geo('glasses-bridge', () => new THREE.BoxGeometry(0.09, 0.018, 0.018)), frame);
    bridge.position.set(0, 0.035, DNA.headRadius - 0.015);
    g.add(bridge);
  }
  return g;
}

export function buildAccent(kind: AccentKind, mats: FigurineMaterials): { group: THREE.Group; anchor: AdapterAnchorName } {
  const g = new THREE.Group();
  switch (kind) {
    case 'scarf': {
      const wrap = mesh(geo('scarf', () => new THREE.TorusGeometry(0.185, 0.06, 10, 26)), mats.accent);
      wrap.rotation.x = Math.PI / 2 + 0.12;
      g.add(wrap);
      const knot = mesh(geo('scarf-knot', () => new THREE.SphereGeometry(0.075, 12, 10)), mats.accent);
      knot.position.set(0.1, -0.08, 0.17);
      g.add(knot);
      return { group: g, anchor: 'neck' };
    }
    case 'satchel': {
      const bag = mesh(geo('satchel', () => new THREE.BoxGeometry(0.17, 0.2, 0.1)), mats.accent);
      bag.position.set(0.27, 0.05, 0.05);
      bag.rotation.y = -0.2;
      g.add(bag);
      const flap = mesh(geo('satchel-flap', () => new THREE.BoxGeometry(0.175, 0.09, 0.105)), mats.secondary);
      flap.position.set(0.27, 0.12, 0.05);
      flap.rotation.y = -0.2;
      g.add(flap);
      return { group: g, anchor: 'hips' };
    }
    case 'belt': {
      const band = mesh(geo('belt', () => new THREE.CylinderGeometry(0.25, 0.25, 0.07, 26, 1, false)), mats.accent);
      g.add(band);
      const buckle = mesh(geo('buckle', () => new THREE.BoxGeometry(0.09, 0.06, 0.03)), mats.secondary);
      buckle.position.set(0, 0, 0.25);
      g.add(buckle);
      return { group: g, anchor: 'hips' };
    }
    case 'collarTrim': {
      const trim = mesh(geo('collar-trim', () => new THREE.TorusGeometry(0.19, 0.035, 10, 28)), mats.accent);
      trim.rotation.x = Math.PI / 2 + 0.14;
      trim.position.y = 0.05;
      g.add(trim);
      return { group: g, anchor: 'neck' };
    }
    case 'shoulderDrape': {
      const drape = mesh(geo('drape', () => new THREE.ConeGeometry(0.17, 0.3, 18, 1)), mats.accent);
      drape.position.set(0, -0.08, 0);
      drape.rotation.z = 0.12;
      g.add(drape);
      return { group: g, anchor: 'shoulder' };
    }
    case 'cuffs': {
      for (const s of [-1, 1]) {
        const cuff = mesh(geo('cuff', () => new THREE.TorusGeometry(0.095, 0.032, 10, 20)), mats.accent);
        cuff.rotation.x = Math.PI / 2;
        cuff.rotation.z = s * 0.28;
        cuff.position.set(s * 0.315, 0.66 - 1.0, 0); // relative to neck anchor (y=1.0)
        g.add(cuff);
      }
      return { group: g, anchor: 'neck' };
    }
    case 'headPods': {
      for (const s of [-1, 1]) {
        const pod = mesh(geo('pod', () => new THREE.SphereGeometry(0.095, 14, 12)), mats.accent);
        pod.scale.set(0.55, 1, 1);
        pod.position.set(s * (DNA.headRadius + 0.02), 0, 0);
        g.add(pod);
      }
      return { group: g, anchor: 'hair' };
    }
  }
}

export function buildEmblem(glyph: EmblemGlyph, large: boolean): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    map: emblemTexture(glyph),
    roughness: 0.4,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const m = new THREE.Mesh(geo(large ? 'emblem-l' : 'emblem-s', () => new THREE.CircleGeometry(large ? 0.095 : 0.068, 28)), mat);
  m.castShadow = false;
  return m;
}

export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    // Shared cached geometries are never disposed; only per-instance materials.
    if (m.isMesh && m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if ((mat as { userData?: { shared?: boolean } }).userData?.shared !== true) mat.dispose();
    }
  });
}
