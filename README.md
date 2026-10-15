# Richmond Studio

A private, browser-based 3D planner for a wedding reception at **Restaurant Le Richmond** (Montreal), main restaurant floor only. Place tables, the dance floor and the DJ; see how 75 guests fill the room; try linens, candles and florals; save scenarios and compare them — on laptop or phone.

**Stage:** planning complete, lo-fi mockup in review, no app code yet. See [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Documents

| Doc | What it decides |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Working rules for Claude Code |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | What the app does (requirement IDs + acceptance) |
| [docs/DESIGN_GUIDE.md](docs/DESIGN_GUIDE.md) | Look, interaction, copy, review checklist |
| [docs/mockups/lofi.html](docs/mockups/lofi.html) | Lo-fi screens and venue map |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, layers, data model, budgets, decisions |
| [docs/VENUE_MODEL.md](docs/VENUE_MODEL.md) | How the room is reconstructed from photos |
| [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) | Test layers and traceability |
| [references/venue_evidence_matrix.md](references/venue_evidence_matrix.md) | What each reference image shows; dimension estimates |
| [references/source_manifest.json](references/source_manifest.json) | Reference register (links, provenance) |
| [docs/handover/](docs/handover/) | Original handover, archived |

## Media and rights

Venue photos and videos belong to their owners. They are linked, not stored: this repository is public. Claude fetches them into gitignored folders when needed (`scripts/collect_venue_media.py`). Owner-supplied screenshots are described in the evidence matrix, not committed.

## Hosting

Vercel (free plan) from this repository; every branch gets a preview link. Setup steps arrive with step 2 (shared login and cloud saving).
