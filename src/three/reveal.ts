// Transformation reveal: an expanding light ring + short-lived particle burst
// around the Mate. Restrained by design — no bloom pass, no screen flash.
//
// The burst is a fixed GPU pool: particles are spawned once on `play()` and
// integrated in the vertex shader, so no CPU loop touches the buffers per frame.

import * as THREE from 'three';
import { GpuParticlePool } from './gpu-particles';

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

  // Burst pool reuses the old 280-particle budget; flight lives in the shader.
  const pool = new GpuParticlePool(group, {
    capacity: 280,
    life: 1.8,
    size: 0.035,
    color: accentColor,
    mode: 'burst',
    reducedMotion: false,
  });
  pool.setOpacity(0);

  let t = -1; // -1 = idle
  let duration = 1.8;
  let elapsed = 0; // monotonic clock for the pool, independent of the reveal t
  let resolveDone: (() => void) | null = null;

  return {
    play(reducedMotion: boolean): Promise<void> {
      duration = reducedMotion ? 0.4 : 1.8;
      t = 0;
      pool.setReducedMotion(reducedMotion);
      // Resync the shader clock to the caller's elapsed time before spawning so
      // a burst always starts at the current time, then fan the particles out
      // from around the figure. Under reduced motion the pool freezes time and
      // seeds a still age spread instead of a flash.
      pool.update(0, elapsed);
      pool.burst(new THREE.Vector3(0, 0.5, 0), 280, 0.4);
      return new Promise((res) => {
        resolveDone = res;
      });
    },
    update(dt: number): void {
      elapsed += dt;
      pool.update(dt, elapsed);
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
      // Particles fade with the ring; the shader ages and culls them on its own.
      pool.setOpacity(Math.sin(Math.min(k, 1) * Math.PI) * 0.85);
      if (k >= 1) {
        t = -1;
        ringMat.opacity = 0;
        pool.setOpacity(0);
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
      pool.dispose();
    },
  };
}
