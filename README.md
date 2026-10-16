# Richmond Studio

A private, browser-based 3D planner for a wedding reception at **Restaurant Le Richmond** (Montreal), main restaurant floor only. Place tables, the dance floor and the DJ; see how 75 guests fill the room; try linens, candles and florals; save scenarios and compare them — on laptop or phone.

**Stage:** step 1 built — 3D venue, three cameras, layout tools, local scenarios. See [PROJECT_STATUS.md](PROJECT_STATUS.md).

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

## Hosting on Vercel (one-time setup, about 5 minutes)

1. Sign in at vercel.com with your GitHub account.
2. **Add New → Project → Import** `icebruce/LeRichmondVenueModle`.
3. Leave the detected settings (Framework: Vite, build `npm run build`, output `dist`) and press **Deploy**.
4. From then on every pushed branch gets its own preview link (shown on the pull request), and `main` is the live site.

Step 2 adds the shared password and cloud saving; it will need two environment variables and the free Upstash Redis integration, with exact steps at that time.

## Running locally (optional)

```bash
npm ci
npm run dev        # http://localhost:5173
npm run check      # typecheck, lint, format, unit tests, library check
npm run build && npm run test:e2e
```
