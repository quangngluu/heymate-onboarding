// Transformation reveal: an expanding light ring + short-lived particle burst
// around the Mate. Restrained by design — no bloom pass, no screen flash.

import * as THREE from 'three';

export interface RevealFx {
  play(reducedMotion: boolean): Promise<void>;
  update(dt: number): void;
  dispose(): void;
}

export function createRevealFx(parent: THREE.Object3D, accentColor: number): RevealFx {
  const group = new THREE.Group();
  parent.add(group);

  const ringMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 72), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  // Vertical light pillar that flares and collapses around the figure.
  const pillarMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 3.4, 32, 1, true), pillarMat);
  pillar.position.y = 1.7;
  group.add(pillar);

  const N = 280;
  const positions = new Float32Array(N * 3);
  const velocities: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.15 + Math.random() * 0.25;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = 0.15 + Math.random() * 1.2;
    positions[i * 3 + 2] = Math.sin(a) * r;
    velocities.push(
      new THREE.Vector3(Math.cos(a) * (0.4 + Math.random() * 0.7), 0.5 + Math.random() * 0.9, Math.sin(a) * (0.4 + Math.random() * 0.7))
    );
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: accentColor,
    size: 0.035,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(pGeo, pMat);
  group.add(points);

  let t = -1; // -1 = idle
  let duration = 1.8;
  let resolveDone: (() => void) | null = null;

  return {
    play(reducedMotion: boolean): Promise<void> {
      duration = reducedMotion ? 0.4 : 1.8;
      t = 0;
      return new Promise((res) => {
        resolveDone = res;
      });
    },
    update(dt: number): void {
      if (t < 0) return;
      t += dt;
      const k = Math.min(t / duration, 1);
      // Ring: expand + fade
      const scale = 0.3 + k * 2.2;
      ring.scale.setScalar(scale);
      ringMat.opacity = Math.sin(Math.min(k, 1) * Math.PI) * 0.5;
      // Pillar: quick flare in the first half, collapse inward after
      const pk = Math.min(k * 1.6, 1);
      pillarMat.opacity = Math.sin(pk * Math.PI) * 0.32;
      pillar.scale.set(1 - k * 0.55, 1, 1 - k * 0.55);
      pillar.rotation.y += dt * 1.4;
      // Particles: rise + fade
      const pos = pGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        pos.setX(i, pos.getX(i) + velocities[i].x * dt * 0.6);
        pos.setY(i, pos.getY(i) + velocities[i].y * dt * 0.8);
        pos.setZ(i, pos.getZ(i) + velocities[i].z * dt * 0.6);
      }
      pos.needsUpdate = true;
      pMat.opacity = Math.sin(Math.min(k, 1) * Math.PI) * 0.85;
      if (k >= 1) {
        t = -1;
        ringMat.opacity = 0;
        pMat.opacity = 0;
        pillarMat.opacity = 0;
        resolveDone?.();
        resolveDone = null;
      }
    },
    dispose(): void {
      group.parent?.remove(group);
      ring.geometry.dispose();
      ringMat.dispose();
      pillar.geometry.dispose();
      pillarMat.dispose();
      pGeo.dispose();
      pMat.dispose();
    },
  };
}
