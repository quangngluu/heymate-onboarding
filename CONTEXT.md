# HEYMATE Domain Context

## Worldform Studio

Worldform Studio answers: **Who would I be if I existed here?** It turns a
visitor's identity into a bounded, manufacturable Mate concept. It is not a
free-form character generator and must not describe a recoloured stock model as
a generated personal figurine.

## Terms

- **Mate Form Standard** — the shared physical and visual family all Mate
  outputs must preserve across worlds.
- **Custom Head** — the user-specific Face and bounded Hair silhouette that
  preserve identity and can move between compatible World Bodies.
- **World Body** — a preset role platform containing pose, outfit architecture,
  a Universal Head Dock, and concealed asset hardpoints. It must still read as
  a complete figurine when every Signature Asset is removed.
- **Mate Attachment System (MAS v1)** — the versioned connector grammar shared
  by the Universal Head Dock and asset hardpoints. The Head Dock is a keyed
  magnetic concept; Signature Assets use keyed mechanical pegs. A 3 mm asset
  peg is an engineering hypothesis until factory tolerance tests validate it.
- **Signature Kit** — exactly one hero Signature Asset and at most one restrained
  secondary accent compatible with one or more World Bodies.
- **Signature Asset** — the silhouette-readable, lore-bearing physical proof of
  which universe a Mate belongs to. Its type is weapon, VFX, companion, relic,
  back rig, wearable, or terrain; it must use declared MAS hardpoints.
- **World Pack** — a versioned configuration containing rights status, visual
  DNA, base grammar, negative rules, and a bounded set of World Archetypes.
- **World Archetype** — a role-shaped visual grammar inside a World Pack. It is
  not a licensed canon character.
- **User Identity** — the minimum appearance cues and desired-self input needed
  to recognise the visitor without inferring unnecessary sensitive traits.
- **Worldform Build** — the persisted aggregate that owns the state machine,
  selected World Pack and World Archetype, revisions, jobs, approvals, cost
  usage, and QC result.
- **Build Revision** — an immutable generation attempt. Retrying creates a new
  revision; it never overwrites a prior concept.
- **Approval Gate** — an explicit visitor decision that permits the next, more
  expensive generation stage. Front approval gates multiview; multiview
  approval gates 3D.
- **Manufacturing Profile** — factory-supplied dimensional and structural
  constraints. Unknown values remain `null`; the application must not invent
  them.
- **Generation Asset** — one separately stored source, camera view, model, or
  preview owned by one Build Revision. One camera view is one asset.
- **QC Result** — automatic evidence about dimensions and mesh integrity plus
  an explicit indication of whether manual manufacturing review is required.

## Invariants

1. World rules live in a World Pack, never in core orchestration logic.
2. The approved front asset is the source of truth for side and back.
3. Side and back cannot generate before front approval.
4. 3D cannot generate before multiview approval.
5. Infrastructure failures do not consume the visitor's successful-preview
   quota.
6. Provider requests with the same deterministic hash reuse prior assets/jobs.
7. A QC pass is not manufacturing approval. Human review remains a separate
   state.
8. A world with `commercialUse: false` cannot expose checkout or production
   export.
9. Face means who the user is; World Body means who they become; Signature
   Asset means which universe they belong to.
10. A Build Revision freezes its World Body and Signature Kit identifiers.
11. A World Body always contains the MAS Head Dock and standard hardpoint
    geometry, even when a port is reserved rather than active.
12. A Signature Kit contains one hero asset and at most one secondary accent;
    both must be compatible with active hardpoints on the selected World Body.
13. Removing the Signature Kit must not make the World Body look incomplete.
14. Declared connector geometry is not evidence of physical fit. QC keeps fit
    unknown until a factory profile and measured physical test validate it.
