import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createScanRevealFx } from '../../src/three/scan-reveal';

// Node-safe: no WebGL context is ever created. `onBeforeCompile` is only
// exercised by a real renderer, so it is deliberately not covered here — the
// tests assert the cage, the shared conductor uniforms, completion,
// reduced-motion, and disposal, all of which work without a GPU.

const DIAG = Math.sqrt(3); // BoxGeometry(1, 1, 1)
const MAX_RADIUS = DIAG * 1.6;

function harness() {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return { scene, mesh, material, geometry };
}

function cage(mesh: THREE.Mesh): THREE.LineSegments {
  const line = mesh.children.find((c) => (c as THREE.LineSegments).isLineSegments);
  if (!line) throw new Error('no cage LineSegments child');
  return line as THREE.LineSegments;
}

function scanUniforms(mesh: THREE.Mesh): { [k: string]: THREE.IUniform } {
  return (cage(mesh).material as THREE.ShaderMaterial).uniforms;
}

describe('createScanRevealFx', () => {
  it('adds a LineSegments cage as a child of the target mesh', () => {
    const { mesh } = harness();
    const fx = createScanRevealFx(mesh, 0xff0044);
    expect(mesh.children.some((c) => (c as THREE.LineSegments).isLineSegments)).toBe(true);
    fx.dispose();
  });

  it('advances the scan radius toward maxRadius, then disables and removes the cage', () => {
    const { mesh } = harness();
    const fx = createScanRevealFx(mesh, 0xff0044);
    const u = scanUniforms(mesh);

    void fx.play(false);
    expect(u.uScanR.value).toBe(0);
    expect(u.uScanOn.value).toBe(1);

    // Advance well past the default 3s duration; update() drives the scan.
    for (let i = 0; i < 400; i++) fx.update(1 / 60);

    expect(u.uScanR.value).toBeCloseTo(MAX_RADIUS, 5);
    expect(u.uScanOn.value).toBe(0);
    expect(mesh.children.some((c) => (c as THREE.LineSegments).isLineSegments)).toBe(false);
    fx.dispose();
  });

  it('holds a ~62% still under reduced motion without advancing', () => {
    const { mesh } = harness();
    const fx = createScanRevealFx(mesh, 0xff0044);
    const u = scanUniforms(mesh);

    void fx.play(true);
    expect(u.uScanR.value).toBeCloseTo(MAX_RADIUS * 0.62, 5);

    for (let i = 0; i < 60; i++) fx.update(1 / 60);
    expect(u.uScanR.value).toBeCloseTo(MAX_RADIUS * 0.62, 5);
    fx.dispose();
  });

  it('dispose removes everything it added and leaves the target in the scene', () => {
    const { scene, mesh } = harness();
    const fx = createScanRevealFx(mesh, 0xff0044);

    // The burst pool is also a child of the target until disposal.
    expect(mesh.children.some((c) => (c as THREE.Points).isPoints)).toBe(true);

    fx.dispose();

    expect(mesh.children.some((c) => (c as THREE.LineSegments).isLineSegments)).toBe(false);
    expect(mesh.children.some((c) => (c as THREE.Points).isPoints)).toBe(false);
    // The target mesh and its own material/geometry are untouched.
    expect(scene.children).toContain(mesh);
  });
});
