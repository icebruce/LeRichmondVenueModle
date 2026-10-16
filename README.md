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

### Turning on shared cloud saving (step 2, about 10 minutes, free)

Until this is done the app works as before: each device saves its own scenarios.

1. In Vercel, open the project → **Storage** (or **Marketplace**) → **Upstash** → **Redis** → create a database on the **free plan** and connect it to this project. This adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for you.
2. Project → **Settings → Environment Variables**, add for Production and Preview:
   - `APP_PASSWORD`: the password you and your partner will type (share it privately).
   - `SESSION_SECRET`: 32 or more random characters (for example from a password manager's generator).
3. **Deployments** → redeploy the latest one.
4. Open the site: it asks for the password and whose device it is (Partner A or B). Sign in on both laptop and phone; scenarios, notes and version history are now shared. Sessions last 30 days per device.

If both of you edit the same scenario at once, the second save asks: keep mine, take theirs, or save mine as a copy. Nothing is overwritten silently.

## Running locally (optional)

```bash
npm ci
npm run dev        # http://localhost:5173
npm run check      # typecheck, lint, format, unit tests, library check
npm run build && npm run test:e2e   # includes the cloud tests against a local in-memory API
RS_DEV_API=1 RS_MEMORY_STORE=1 APP_PASSWORD=test SESSION_SECRET=$(openssl rand -hex 24) npm run dev   # try sign-in locally
```
