import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS } from '../../src/config/cameras';
import { PORTAL_PLANE, planeScreenRect } from '../../src/three/gallery-portal';

function galleryCamera(width: number, height: number): THREE.PerspectiveCamera {
  const preset = CAMERA_PRESETS.gallery;
  const camera = new THREE.PerspectiveCamera(preset.fov ?? 40, width / height, 0.1, 100);
  camera.position.set(...preset.pos);
  camera.lookAt(...preset.target);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('gallery portal projection', () => {
  it('projects the plane to a rect inside the viewport', () => {
    const rect = planeScreenRect(galleryCamera(1280, 800), PORTAL_PLANE.center, PORTAL_PLANE.size, 1280, 800);
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.h).toBeGreaterThan(0);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1280);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.h).toBeLessThanOrEqual(800);
  });

  it('keeps the rect horizontally centered for a centered plane', () => {
    const rect = planeScreenRect(galleryCamera(1280, 800), PORTAL_PLANE.center, PORTAL_PLANE.size, 1280, 800);
    expect(Math.abs(rect.x + rect.w / 2 - 640)).toBeLessThan(40);
  });
});
