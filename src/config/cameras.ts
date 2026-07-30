import { CHARACTERS } from './characters';
import { plinthPositions } from './layout';

export interface CamPreset {
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

const BASE_PRESETS: Record<string, CamPreset> = {
  // Gallery keeps the camera in an empty dark room; no models load yet.
  gallery: { pos: [0, 1.6, 7.2], target: [0, 1.1, 0], fov: 42 },
  // Companion stage: hero sits right of frame center so the giant name and
  // the waiting residents own the left side.
  stage: { pos: [0.6, 1.5, 4.7], target: [-0.62, 0.88, 0], fov: 36 },
  // Portrait. The wide framing left her a thumbnail in the corner: a phone's
  // narrow horizontal field plus a target pushed a long way left put her at the
  // edge, with the top half of the screen empty stage. This comes in closer and
  // keeps only enough left bias to clear the column her words sit in.
  'stage-portrait': { pos: [0.42, 1.32, 3.1], target: [-0.3, 1.0, 0], fov: 34 },
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

/**
 * How she is framed on the companion stage, for the viewport in front of us.
 *
 * Read through this rather than off `CAMERA_PRESETS.stage` directly: the rim
 * lights, the nameplate and the free-inspection arc are all derived from the
 * camera position, so a second framing has to reach all of them or the lighting
 * ends up aimed at where she used to stand.
 */
export function stagePreset(): CamPreset {
  const portrait =
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches;
  return portrait ? CAMERA_PRESETS['stage-portrait'] : CAMERA_PRESETS.stage;
}
