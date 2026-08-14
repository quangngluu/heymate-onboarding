import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS } from '../../src/config/cameras';
import {
  PORTAL_PLANE,
  planeScreenRect,
  portalDollyPreset,
} from '../../src/three/gallery-portal';

function galleryCamera(width: number, height: number): THREE.PerspectiveCamera {
  const preset = CAMERA_PRESETS.gallery;
  const camera = new THREE.PerspectiveCamera(preset.fov ?? 40, width / height, 0.1, 100);
  camera.position.set(...preset.pos);
  camera.lookAt(...preset.target);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('gallery portal projection', () => {
  it('preserves the landscape desk-video aspect ratio', () => {
    expect(PORTAL_PLANE.size[0] / PORTAL_PLANE.size[1]).toBeCloseTo(1344 / 768);
  });

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

  it('fills the viewport at the dolly endpoint before video playback', () => {
    const preset = portalDollyPreset();
    const camera = new THREE.PerspectiveCamera(preset.fov ?? 40, 1280 / 800, 0.1, 100);
    camera.position.set(...preset.pos);
    camera.lookAt(...preset.target);
    camera.updateMatrixWorld(true);
    const rect = planeScreenRect(camera, PORTAL_PLANE.center, PORTAL_PLANE.size, 1280, 800);
    expect(rect.w).toBeGreaterThanOrEqual(1280);
    expect(rect.h).toBeGreaterThanOrEqual(800);
  });
});
