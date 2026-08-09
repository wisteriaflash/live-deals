# OpenSpec instructions

This repo uses OpenSpec. Read `openspec/project.md` first.

- Current behavior lives in `openspec/specs/` (empty until changes are archived).
- Active work lives in `openspec/changes/<change-name>/`.
- Do not edit `openspec/specs/` directly while a change is in progress; update the change's delta specs instead.
- Artifact order: `proposal.md` → `specs/**` → `design.md` → `tasks.md` → implement.
- After implementation, archive the change so deltas merge into `openspec/specs/`.

Active change: `add-shanghai-fastfood-alerts`.

Implementation detail lives in the change folder as `plan.md` (merged with OpenSpec; not required under `docs/superpowers/plans/`). Use `tasks.md` as the summary checklist and `plan.md` for file-level steps.
