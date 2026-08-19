import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from '../../src/three/rig';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CamPreset } from '../../src/config/cameras';

const PRESET: CamPreset = { pos: [0, 1.6, 7.2], target: [0, 1.1, 0], fov: 42 };

function makeRig(reducedMotion: boolean): { camera: THREE.PerspectiveCamera; rig: CameraRig } {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  const rig = new CameraRig(camera, reducedMotion);
  rig.applyPreset(PRESET);
  return { camera, rig };
}

describe('CameraRig sway', () => {
  it('sways the lookAt off the baseline when a pointer target is set', () => {
    const { camera, rig } = makeRig(false);
    const baseline = camera.quaternion.clone();

    rig.setSway(0.5, -0.3);
    rig.update(0.016);

    expect(camera.quaternion.equals(baseline)).toBe(false);
  });

  it('ignores sway under reduced motion', () => {
    const { camera, rig } = makeRig(true);
    const baseline = camera.quaternion.clone();

    rig.setSway(0.5, -0.3);
    rig.update(0.016);

    expect(camera.quaternion.equals(baseline)).toBe(true);
  });

  it('ignores sway while orbit controls are enabled', () => {
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    camera.position.set(...PRESET.pos);
    camera.lookAt(...PRESET.target);
    const baseline = camera.quaternion.clone();

    const rig = new CameraRig(camera, false);
    rig.attachControls({
      enabled: true,
      target: new THREE.Vector3(),
      update: () => {},
    } as unknown as OrbitControls);

    rig.setSway(0.5, -0.3);
    rig.update(0.016);

    expect(camera.quaternion.equals(baseline)).toBe(true);
  });
});
