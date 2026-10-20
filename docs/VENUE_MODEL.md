# Venue model — how the room is reconstructed

**Status:** Source of truth for venue reconstruction method · **Date:** 2026-10-15
**Evidence:** `references/venue_evidence_matrix.md` · **Register:** `references/source_manifest.json` · **Data:** `data/venue_geometry.json`

## 1. Rules

1. Main restaurant floor only. Mezzanine = visible edge + stair, not a floor (DJ spot excepted, `LAY-11`). Terrace = backdrop through the glass (dark at night but for faint string-light points, owner 2026-10-20). Terrace images (X01–X05) never inform geometry.
2. Every dimension is a range with a confidence and sources. Owner-confirmed facts (marked **C** in the evidence matrix) override inferences.
3. No measurements exist. Never present an estimate as measured. UI shows "≈".
4. Recent images beat older ones when they conflict (artwork and furniture change; architecture rarely does).
5. Reference images are never committed or deployed (ADR-6). They are fetched into gitignored folders per session (`scripts/collect_venue_media.py --photos-only`).

## 2. Process

1. **Evidence** — add new images to the register and the matrix: vantage, facing, landmarks, main-floor yes/no.
2. **Hypothesis** — update ranges in `data/venue_geometry.json` from scale anchors: stool pitch ~0.6 m, chair seat 0.45 m, table 0.74 m, bar counter 1.05–1.10 m, door 2.1 m, pane modules of the garage doors, adult height 1.65–1.80 m.
3. **Photo-match** — for each key reference (R01, R02, R03, R04, R09, R10, UV01, UV02) store a camera preset in the venue data that approximates its position, direction and field of view. Render from it and compare side by side with the (local, uncommitted) photo.
4. **Adjust** — change parameters to reduce mismatches in this order: room outline and wall directions → bar outline and position → openings (garage doors, windows) → levels (raised strip, mezzanine edge, stair) → ceiling structure → fixtures → materials and colour.
5. **Record** — log what changed and why in the matrix; update confidence.

## 3. Fidelity review

Run by the `fidelity-reviewer` agent (`.claude/agents/`) via the `visual-qa` skill:
- Pairs: render vs reference from each stored preset.
- Output: a ranked list of mismatches (shape > position > proportion > material > colour), each with the parameter to change.
- A step 1 gate needs: owner recognizes the room from the default dollhouse view and from R01/R03/R09 presets; no top-ranked "shape" mismatches left open.

## 4. Known uncertainties

See the evidence matrix §4 (dimension ranges) and §6 (open items). The largest risks are the overall room size and the extent of the raised east strip; layout advisories must stay labelled advisory for that reason.
