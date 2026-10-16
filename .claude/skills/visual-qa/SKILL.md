---
name: visual-qa
description: Launch Richmond Studio, capture screenshots of the venue from the stored camera presets and key UI states at desktop and phone sizes, fetch the matching reference photos, and run the fidelity and UX reviewers on them. Use after changes to the venue model, materials, lighting or any visible UI, and at every step gate.
---

# Visual QA

## 1. Prepare references (once per session)

```bash
python3 scripts/collect_venue_media.py --photos-only
```
Photos land in `references/PRIVATE_LOCAL_PHOTO_CACHE/` (gitignored). Never commit them. Owner-supplied stills are not in Git; if needed, ask the owner to re-attach them.

## 2. Build and serve

```bash
npm run build && npm run preview -- --port 4173 &
```
Wait until `http://localhost:4173` responds.

## 3. Capture

Run the Playwright capture script `tests/visual/capture.ts` (it reads `cameraPresets` from `data/venue_geometry.json`):
- Venue presets: dollhouse default, plan, R01, R02, R03, R04, R09, R10, UV01, UV02 — evening and daylight.
- UI states: empty scenario, F01 scenario with 75 guests, table selected, refused move, advisory showing, import sheet (phone).
- Sizes: 1440×900 and 390×844.

Output to `test-results/visual-qa/<timestamp>/` (gitignored). Chromium runs with `--use-angle=swiftshader --enable-unsafe-swiftshader` in the cloud container.

## 4. Review

- Spawn `fidelity-reviewer` with render/reference pairs for every venue preset that has a reference photo.
- Spawn `ux-reviewer` with the UI-state screenshots and the current diff.
- Run them in parallel.

## 5. Act

Fix every Blocker and Major before asking the owner to review. Log venue parameter changes and their reasons in `references/venue_evidence_matrix.md`. At a gate, send the owner the key pairs (render next to reference) — never the reference photos alone in any committed file.
