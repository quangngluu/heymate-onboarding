import { CHARACTERS } from './characters';
import { plinthPositions } from './layout';

export interface CamPreset {
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

const BASE_PRESETS: Record<string, CamPreset> = {
  arrival: { pos: [0, 1.7, 9.6], target: [0, 1.35, 0], fov: 40 },
  hall: { pos: [0, 2.5, 7.4], target: [0, 1.0, -2.8], fov: 46 },
  reveal: { pos: [1.0, 1.5, 3.2], target: [-0.1, 1.05, 0], fov: 38 },
  lineup: { pos: [0, 2.5, 8.0], target: [0, 0.95, -1.6], fov: 46 },
};

// One close-up preset per plinth, derived from the character-count layout —
// the camera sits between the plinth and the center, slightly above eye line.
// The studio slider reuses these exact framings.
function plinthPresets(): Record<string, CamPreset> {
  const out: Record<string, CamPreset> = {};
  plinthPositions(CHARACTERS.length).forEach(([x, , z], i) => {
    const toCenter = Math.hypot(x, z) || 1;
    const nx = x / toCenter;
    const nz = z / toCenter;
    out[`plinth-${i}`] = {
      pos: [x - nx * 3.1 + 0.25, 1.6, z - nz * 3.1],
      target: [x, 1.18, z],
      fov: 40,
    };
  });
  return out;
}

export const CAMERA_PRESETS: Record<string, CamPreset> = {
  ...BASE_PRESETS,
  ...plinthPresets(),
};
