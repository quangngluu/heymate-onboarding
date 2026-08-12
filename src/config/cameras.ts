import { CHARACTERS } from './characters';
import { plinthPositions } from './layout';
import type { QuestCamera } from './quests';

export interface CamPreset {
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

const BASE_PRESETS: Record<string, CamPreset> = {
  // Gallery keeps the camera in an empty dark room; no models load yet.
  gallery: { pos: [0, 1.6, 7.2], target: [0, 1.1, 0], fov: 42 },
  // Desktop conversation owns the right rail. Keep her full silhouette just
  // left of it, with her feet above the bottom composer.
  stage: { pos: [0.82, 1.5, 4.7], target: [0.48, 0.85, 0], fov: 36 },
  // Portrait. The wide framing left her a thumbnail in the corner: a phone's
  // narrow horizontal field plus a target pushed a long way left put her at the
  // edge, with the top half of the screen empty stage. This comes in closer and
  // keeps only enough left bias to clear the column her words sit in.
  'stage-portrait': { pos: [0.55, 1.38, 3.8], target: [-0.42, 0.84, 0], fov: 35 },
  // The product rail starts at x=826 on a 1200px canvas, so the optical centre
  // is ~413 rather than the canvas centre (600). Aim through that usable region.
  'premium-inspect': { pos: [0.48, 1.42, 3.35], target: [0.45, 0.86, 0], fov: 32 },
  'premium-inspect-portrait': { pos: [-0.38, 1.42, 3.08], target: [-0.12, 0.88, 0], fov: 32 },
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

export function premiumInspectPreset(): CamPreset {
  const portrait =
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches;
  return portrait ? CAMERA_PRESETS['premium-inspect-portrait'] : CAMERA_PRESETS['premium-inspect'];
}

/** Fixed cinematic grammar for Quest Mode; no free orbit during a story beat. */
export const QUEST_CAMERA_PRESETS: Record<QuestCamera, CamPreset> = {
  follow: { pos: [0.35, 1.45, 4.15], target: [0, 1.05, -0.65], fov: 40 },
  'side-composition': { pos: [-2.45, 1.38, 2.8], target: [0, 1.02, -0.45], fov: 38 },
  'object-pov': { pos: [0.08, 1.28, 2.35], target: [0, 1.02, -0.55], fov: 34 },
  'close-encounter': { pos: [0.72, 1.45, 2.58], target: [-0.08, 1.08, 0], fov: 32 },
  // Pulled in and offset toward the reveal. At z 5.45 / fov 44 she was about
  // forty pixels tall on a phone and the mutation was a detail in the distance,
  // which is the opposite of what a "show the world changed" camera is for.
  'wide-mutation': { pos: [0.9, 1.6, 4.05], target: [0.5, 1.05, -1.6], fov: 40 },
};
