import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS, type CamPreset } from '../../src/config/cameras';

function project(
  preset: CamPreset,
  width: number,
  height: number,
  point: [number, number, number]
): { x: number; y: number } {
  const camera = new THREE.PerspectiveCamera(preset.fov ?? 40, width / height, 0.1, 100);
  camera.position.set(...preset.pos);
  camera.lookAt(...preset.target);
  camera.updateMatrixWorld();
  const projected = new THREE.Vector3(...point).project(camera);
  return {
    x: ((projected.x + 1) * width) / 2,
    y: ((1 - projected.y) * height) / 2,
  };
}

describe('companion stage framing', () => {
  it('keeps the desktop hero left of the conversation rail and above the dock', () => {
    const center = project(CAMERA_PRESETS.stage, 1440, 900, [0, 0.9, 0]);
    const feet = project(CAMERA_PRESETS.stage, 1440, 900, [0, 0, 0]);
    const conversationRailLeft = 1440 - 24 - 460;

    expect(center.x + 110).toBeLessThan(conversationRailLeft);
    expect(feet.y).toBeLessThan(748);
  });

  it('keeps the mobile hero right of the speech band with feet above the dock', () => {
    const preset = CAMERA_PRESETS['stage-portrait'];
    const center = project(preset, 390, 844, [0, 0.9, 0]);
    const feet = project(preset, 390, 844, [0, 0, 0]);
    const speechBandRight = 10 + 232;

    expect(center.x - 75).toBeGreaterThan(speechBandRight);
    expect(feet.y).toBeLessThan(740);
  });
});
