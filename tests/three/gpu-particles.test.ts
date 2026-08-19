import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GpuParticlePool } from '../../src/three/gpu-particles';

// These run in node: the pool never creates a WebGL context, and the sprite
// texture falls back to a typed-array radial when no 2D canvas exists.

describe('GpuParticlePool', () => {
  it('advances a ring head and clamps at capacity', () => {
    const scene = new THREE.Scene();
    const pool = new GpuParticlePool(scene, { capacity: 3, life: 1, mode: 'burst' });
    const origin = pool.points.geometry.getAttribute('aOrigin') as THREE.BufferAttribute;
    const birth = pool.points.geometry.getAttribute('aBirth') as THREE.BufferAttribute;

    pool.spawn(new THREE.Vector3(1, 0, 0), new THREE.Vector3());
    pool.spawn(new THREE.Vector3(2, 0, 0), new THREE.Vector3());
    pool.spawn(new THREE.Vector3(3, 0, 0), new THREE.Vector3());
    expect(origin.getX(0)).toBe(1);
    expect(origin.getX(1)).toBe(2);
    expect(origin.getX(2)).toBe(3);

    // A fourth spawn recycles the oldest slot instead of growing the pool.
    pool.spawn(new THREE.Vector3(4, 0, 0), new THREE.Vector3());
    expect(origin.getX(0)).toBe(4);
    expect(birth.getX(0)).toBeGreaterThanOrEqual(0);
    expect(pool.capacity).toBe(3);
  });

  it('keeps the aging clock frozen under reduced motion', () => {
    const scene = new THREE.Scene();
    const pool = new GpuParticlePool(scene, { capacity: 2, life: 1, mode: 'burst', reducedMotion: true });
    const material = pool.points.material as THREE.ShaderMaterial;

    pool.update(0.016, 1.0);
    expect(material.uniforms.uTime.value).toBe(0);
    pool.update(0.016, 2.0);
    expect(material.uniforms.uTime.value).toBe(0);

    // The flag can be toggled off so a later burst ages normally again.
    pool.setReducedMotion(false);
    pool.update(0.016, 3.0);
    expect(material.uniforms.uTime.value).toBe(3);
  });

  it('dispose removes the points from the parent', () => {
    const scene = new THREE.Scene();
    const pool = new GpuParticlePool(scene, { capacity: 2 });
    expect(scene.children).toContain(pool.points);
    pool.dispose();
    expect(scene.children).not.toContain(pool.points);
  });
});
