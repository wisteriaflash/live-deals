# OpenSpec instructions

This repo uses OpenSpec. Read `openspec/project.md` first.

- Current behavior lives in `openspec/specs/` (empty until changes are archived).
- Active work lives in `openspec/changes/<change-name>/`.
- Do not edit `openspec/specs/` directly while a change is in progress; update the change's delta specs instead.
- Artifact order: `proposal.md` → `specs/**` → `design.md` → `tasks.md` → implement.
- After implementation, archive the change so deltas merge into `openspec/specs/`.

Active changes:

- `add-shanghai-fastfood-alerts` — v1 baseline (fetch/inbox/WxPusher); largely implemented on branch
- `add-live-browser-promo-polling` — next: Playwright intercept live JSON + promo parse + discount gate

Implementation detail for the next change: `openspec/changes/add-live-browser-promo-polling/` (`proposal.md`, `design.md`, `specs/`, `tasks.md`).

