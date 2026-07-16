// Cyber District stage — controlled procedural geometry, lighting, decals and
// particles. Deliberately NOT a generated world: deep graphite, sculptural
// light, restrained holographic detail.

import * as THREE from 'three';
import type { UniverseConfig } from '../config/universes';
import type { FactionConfig } from '../config/factions';
import { CENTER_PEDESTAL, PLINTH_HEIGHT, plinthPositions } from '../config/layout';

export { PLINTH_HEIGHT } from '../config/layout';

export interface StageHandles {
  group: THREE.Group;
  skyline: THREE.Group;
  portal: THREE.Group;
  /** Placeholder center pedestal; hidden once the portal-base GLB loads. */
  centerPedestal: THREE.Mesh;
  plinths: THREE.Mesh[];
  plinthLights: THREE.SpotLight[];
  particles: THREE.Points;
  setPortalActivation(v: number): void;
  update(dt: number, t: number): void;
}

function contactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function buildStage(
  scene: THREE.Scene,
  universe: UniverseConfig,
  /** One entry per plinth: the accent color of its resident's faction. */
  plinthAccents: number[]
): StageHandles {
  const env = universe.env;
  scene.background = new THREE.Color(env.background);
  scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);

  const group = new THREE.Group();
  scene.add(group);

  // Ground: a compact glossy stage disc, small enough that the faction
  // panorama's lower hemisphere stays visible beyond it, reflective enough
  // to pick up the environment.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(9.5, 64),
    new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.3, metalness: 0.6 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const groundRim = new THREE.Mesh(
    new THREE.TorusGeometry(9.5, 0.03, 8, 96),
    new THREE.MeshBasicMaterial({ color: env.coreColor, transparent: true, opacity: 0.18 })
  );
  groundRim.rotation.x = -Math.PI / 2;
  groundRim.position.y = 0.01;
  group.add(groundRim);

  // Concentric holo rings around the center pedestal (restrained)
  for (const [r, opacity] of [
    [1.4, 0.32],
    [2.2, 0.16],
    [5.2, 0.1],
  ] as const) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.012, r + 0.012, 96),
      new THREE.MeshBasicMaterial({
        color: env.coreColor,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    group.add(ring);
  }

  // Skyline silhouettes with sparse emissive strips (placeholder city;
  // hidden while a faction panorama backdrop is active)
  const skyline = new THREE.Group();
  group.add(skyline);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x0e1013, roughness: 0.9 });
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x3b4552 });
  const warmStripMat = new THREE.MeshBasicMaterial({ color: 0x8a6b4a });
  const rng = (i: number) => {
    const x = Math.sin(i * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng(i) * 0.2;
    const dist = 13 + rng(i + 40) * 8;
    const w = 1.2 + rng(i + 80) * 2.4;
    const h = 3 + rng(i + 120) * 9;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), towerMat);
    tower.position.set(Math.cos(a) * dist, h / 2 - 0.05, Math.sin(a) * dist);
    tower.rotation.y = rng(i + 7) * Math.PI;
    skyline.add(tower);
    if (rng(i + 200) > 0.45) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, h * (0.3 + rng(i + 300) * 0.5), 0.05),
        rng(i + 400) > 0.6 ? warmStripMat : stripMat
      );
      strip.position.copy(tower.position);
      strip.position.x += Math.cos(a + Math.PI / 2) * (w / 2 + 0.04);
      strip.position.z += Math.sin(a + Math.PI / 2) * (w / 2 + 0.04);
      skyline.add(strip);
    }
  }

  // Center pedestal (where the portal sleeps and the Mate is built)
  const centerPed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.95, 0.09, 48),
    new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.5, metalness: 0.4 })
  );
  centerPed.position.set(CENTER_PEDESTAL[0], 0.045, CENTER_PEDESTAL[2]);
  centerPed.receiveShadow = true;
  group.add(centerPed);

  // Contact shadows
  const shadowTex = contactShadowTexture();
  const addContactShadow = (x: number, z: number, size: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    group.add(m);
  };
  addContactShadow(CENTER_PEDESTAL[0], CENTER_PEDESTAL[2], 2.6);

  // Portal — a vertical light beam over the center base, dormant until the
  // CTA activates it, then idling faintly through the studio.
  const portal = new THREE.Group();
  const beamTexCanvas = document.createElement('canvas');
  beamTexCanvas.width = 4;
  beamTexCanvas.height = 256;
  {
    const bctx = beamTexCanvas.getContext('2d')!;
    const grad = bctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.85, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, 4, 256);
  }
  const beamTex = new THREE.CanvasTexture(beamTexCanvas);
  const makeBeam = (rTop: number, rBottom: number) =>
    new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBottom, 6.4, 32, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTex,
        color: env.coreColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
  const beamOuter = makeBeam(0.5, 0.8);
  const beamInner = makeBeam(0.2, 0.34);
  beamOuter.position.y = 3.2;
  beamInner.position.y = 3.2;
  portal.add(beamOuter, beamInner);
  const portalLight = new THREE.PointLight(env.coreColor, 0.0, 9, 1.6);
  portalLight.position.y = 1.4;
  portal.add(portalLight);
  group.add(portal);
  const beamOuterMat = beamOuter.material as THREE.MeshBasicMaterial;
  const beamInnerMat = beamInner.material as THREE.MeshBasicMaterial;

  // Plinths
  const plinths: THREE.Mesh[] = [];
  const plinthLights: THREE.SpotLight[] = [];
  const plinthPos = plinthPositions(plinthAccents.length);
  plinthAccents.forEach((accent, i) => {
    const [x, , z] = plinthPos[i];
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.66, PLINTH_HEIGHT, 36),
      new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.45, metalness: 0.45 })
    );
    plinth.position.set(x, PLINTH_HEIGHT / 2, z);
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    group.add(plinth);
    plinths.push(plinth);
    addContactShadow(x, z, 2.1);

    // Faction key light from the front-above, tinted toward ivory so the
    // characters read; the pedestal ring carries the pure accent color.
    const spotColor = new THREE.Color(accent).lerp(new THREE.Color(0xf3ead8), 0.7);
    const spot = new THREE.SpotLight(spotColor, 0.0, 12, Math.PI / 5, 0.85, 1.6);
    spot.position.set(x * 0.55, 3.2, z + 2.6);
    spot.target.position.set(x, 1.0, z);
    group.add(spot);
    group.add(spot.target);
    plinthLights.push(spot);
  });

  // Global lighting — sculptural, warm key + cool fill
  const hemi = new THREE.HemisphereLight(0x2a313b, 0x0a0b0d, 0.85);
  group.add(hemi);
  const key = new THREE.DirectionalLight(0xf3e9d5, 1.4);
  key.position.set(3.2, 6.5, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0004;
  group.add(key);
  const fill = new THREE.DirectionalLight(0x5b6b85, 0.5);
  fill.position.set(-4, 3, -2);
  group.add(fill);

  // Drifting dust particles — additive, tiny, restrained
  const N = 360;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rng(i) * Math.PI * 2;
    const r = 1.5 + rng(i + 500) * 9;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = 0.2 + rng(i + 600) * 3.4;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      color: 0xcdb98f,
      size: 0.02,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  group.add(particles);

  let activation = 0;

  return {
    group,
    skyline,
    portal,
    centerPedestal: centerPed,
    plinths,
    plinthLights,
    particles,
    setPortalActivation(v: number) {
      activation = THREE.MathUtils.clamp(v, 0, 1);
      beamOuterMat.opacity = activation * 0.22;
      beamInnerMat.opacity = activation * 0.5;
      portalLight.intensity = activation * 3.0;
    },
    update(dt: number, t: number) {
      beamOuter.rotation.y += dt * 0.25;
      beamInner.rotation.y -= dt * 0.4;
      const pulse = 1 + Math.sin(t * 1.3) * 0.05;
      beamOuter.scale.set(pulse, 1, pulse);
      particles.rotation.y = t * 0.012;
    },
  };
}
