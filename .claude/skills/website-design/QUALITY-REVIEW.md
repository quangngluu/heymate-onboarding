# Selection and Quality Review

## Included

- Framework-agnostic art direction: Anthropic `frontend-design`.
- Responsive implementation: `responsive-design` from `wshobson/agents`.
- Interface polish: `make-interfaces-feel-better` with scoped references and an explicit review format.
- Final QA: Vercel's Web Interface Guidelines, wrapped without changing the upstream checklist.
- Conditional Tailwind/shadcn stack skills from their canonical repositories.
- Official GSAP core, timeline, React, ScrollTrigger, and performance skills as a conditional motion bundle.
- Conversion copywriting as an optional website-content skill.

## Deliberately excluded

### `emil-design-eng`

Excluded after reading the full skill. It overlaps heavily with `make-interfaces-feel-better`, contains an initial-response instruction that can interrupt a working session, and conflicts on exact motion values such as press scale and spring bounce. Keeping both active would make results less deterministic.

### `interaction-design`

Excluded because its useful principles are already covered by the polish and GSAP skills, while its examples default to Framer Motion and include broad global reduced-motion CSS. It would add a second motion opinion without a clear routing advantage.

### `landing-page`

Excluded because its structure and copy rules substantially duplicate the more established `copywriting` skill. The pack keeps only `copywriting` and lets the brief determine page structure.

### Effect presets and mega-skills

Color-theme presets, one-off CSS effects, WebGL decorations, persona skills and mega-suites were excluded. They should be fetched only when a specific brand brief requires that exact effect.

## Known limitations

- `tailwind-design-system` targets Tailwind v4 and must not be applied blindly to v3 projects.
- `shadcn` contains CLI-oriented behavior and should activate only for a real shadcn project or explicit request.
- GSAP skills describe current APIs at the pinned commit; installed package versions still need checking inside each target project.
- Third-party skill content is preserved upstream text. The router constrains when it should be loaded but does not rewrite vendor opinions.
