---
name: web-interface-guidelines
description: Review frontend code for accessibility, interaction, content, responsive layout, performance, internationalization, and hydration issues using Vercel's Web Interface Guidelines. Use for pre-ship UI audits and targeted code review, not as the primary visual-art-direction skill.
license: MIT
---

# Web Interface Guidelines

Use this skill for a final, evidence-based interface audit.

1. Read [references/guidelines.md](references/guidelines.md) completely before reviewing.
2. Inspect the requested files and the project's actual framework and styling conventions.
3. Apply the checklist to code that was actually inspected. Do not claim coverage for uninspected surfaces.
4. Report findings with clickable `file:line` locations and concise fixes.
5. Run the relevant tests or browser checks after any fix. Clearly mark checks that were not run.

The bundled reference is the unmodified upstream Vercel command file. User instructions and established project conventions remain authoritative where the reference contains Vercel-specific stylistic preferences.
