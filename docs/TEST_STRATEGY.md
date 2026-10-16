# Test strategy

**Status:** Source of truth for testing · **Date:** 2026-10-15

The one rule: **maximum confidence per test, minimum test code.** Overlapping tests add maintenance and flake, not confidence. Put each check in the cheapest layer that can catch the bug.

## 1. Layers

| Layer | Tool | Covers | Does not cover |
|---|---|---|---|
| Unit | Vitest (`tests/unit`) | Everything in `src/domain`: venue geometry builders, level and footprint polygons, overlap and refusal rules, seating arrangement, counts, advisories, commands + undo/redo, scenario schema migrations, people placement determinism. API handlers with an in-memory store fake (auth, revisions, 409). | Rendering, layout CSS. |
| End-to-end | Playwright, Chromium (`tests/e2e`) | User flows across the app, desktop 1440×900 and phone emulation 390×844 (touch). One test per flow, tagged with requirement IDs. | Pixel-level look. |
| Visual | Playwright screenshots (`tests/visual`) | Fixed camera presets (dollhouse default, plan, R01, R03, R09) and key UI states; compared to committed baselines with a tolerance. Baselines change only in reviewed commits. | Whether it looks like the venue — that is the fidelity review (`VENUE_MODEL.md` §3). |
| Scene budget | Playwright + renderer stats | Draw calls and triangle counts for the heavy scenario stay within `ARCHITECTURE.md` §7. | Frame rate (measured on real devices at gates). |
| Manual gates | Owner on real laptop + phone | Recognition, mood, feel, real-device performance. | — |

Rendering in CI uses software WebGL (SwiftShader), verified to work in this environment. It is slow, so visual and budget tests use the smallest viewport that shows the subject.

## 2. Requirement traceability

- Test titles start with the requirement IDs they prove: `test('[LAY-04] dragging a table onto the bar is refused', …)`.
- `scripts/check-traceability` lists every **M** requirement in `PRODUCT_SPEC.md` for the current step that has no test. CI fails on gaps for requirements marked done in `PROJECT_STATUS.md`.
- A requirement that cannot be automated (e.g. VEN-01 recognition) is marked `manual` in the check with the gate where it is verified.

## 3. Core E2E flows

1. Load → default dollhouse evening view → counts visible. (`VEN-01`, `CAM-01`, `LGT-01`, `LAY-07`)
2. Add a 12-seat table, drag, rotate 90°, duplicate, try to drop on the bar (refused), undo ×3. (`LAY-01..06`)
3. Load F01 sample → set guests 75 → "15 without a seat" shown. (`LAY-09`, `PPL-01`)
4. Apply champagne linen to all, votives, low florals → placements unchanged. (`DEC-01..03`)
5. Create scenario B from A, change it, reload → both intact; export/import JSON round trip. (`SCN-01`, `SCN-08`, `SCN-09`)
6. Two browser contexts edit the same scenario → second save gets the conflict choice. (`SCN-03`)
7. Upload an image on phone emulation → crop → size → place on a table → reload → present. (`IMP-01..06`)
8. Walk from the entrance to the dance floor without passing through objects. (`CAM-03`)
9. Export the layout PDF → file has table numbers and totals. (`EXP-01`)

## 4. What not to test

Library behaviour (three.js, React, zod), CSS values already guarded by tokens, exact numbers of estimated venue dimensions (they change by design; test the builders' invariants instead: closed outlines, non-overlapping fixtures, levels inside the room).

## 5. Before every commit and push

Hooks run format + lint on edited files and block commits that fail typecheck, lint or unit tests (`.claude/settings.json`). E2E and visual tests run in CI and in the `release-check` skill before a pull request is marked ready.
