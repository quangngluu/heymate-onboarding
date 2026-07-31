# Quest rig placeholder

The Quest prototype ships `public/assets/quest/rigs/meshy-biped-placeholder.glb`
as a staging asset, not as Rin artwork.

- Source: user-generated Meshy biped base.
- Asset gate: one skin, 24 joints, one material and one embedded texture.
- Required semantic bones: hips, three spine joints, neck, head and both hands.
- Missing by design: facial morph targets, finger bones and authored character
  materials.
- The Meshy rest-pose clip is not used. Meshy supplies the initial skin only.
- Mixamo is the primary motion source. Future motion clips must be retargeted
  onto the accepted skeleton contract before they enter the runtime.

Quest Mode falls back to the existing static resident sculpt if this file
cannot load. The document root exposes `data-quest-rig="loading|ready|fallback"`
so browser smoke tests can verify the actual runtime path.
