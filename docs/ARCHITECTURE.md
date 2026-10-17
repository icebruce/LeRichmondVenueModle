# Richmond Studio — Architecture

**Status:** Source of truth for structure and implementation · **Version:** 1.0 · **Date:** 2026-10-15
**Behaviour:** `PRODUCT_SPEC.md` (wins on behaviour) · **Look:** `DESIGN_GUIDE.md`

---

## 1. Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | No `any` outside typed boundaries. |
| Build | Vite | Static output. |
| UI | React 19 | Function components, hooks. |
| 3D | three.js 0.186 via React Three Fiber 9 + drei 10 | Post-processing via `@react-three/postprocessing`. |
| State | Zustand (+ immer for command patches) | One store per concern; no React context for app state. |
| Validation | zod | At real boundaries only: venue data load, scenario import, API requests. |
| Local persistence | IndexedDB (`idb-keyval`) | Drafts, offline queue, image cache. |
| Server | Vercel Functions (Node 22) in `api/` | Plain handlers, no framework. |
| Storage | Upstash Redis (REST) | Scenarios, versions, notes, catalogue metadata and imported images (§6.3). |
| Tests | Vitest, Playwright (Chromium; mobile emulation) | See `TEST_STRATEGY.md`. |
| Lint/format | ESLint (typescript-eslint strict, react-hooks, import boundaries), Prettier | Enforced by hooks and CI. |
| Hosting | Vercel Hobby, Git integration | Preview URL per branch, production = `main`. |

New runtime dependencies need a one-line justification in the PR and an entry here.

## 2. Repository layout

```
api/                 Vercel Functions (auth, scenarios, imported items, uploads, library requests)
data/
  venue_geometry.json  Fixed room: metric parameters + confidence + sources
  catalog.json         Built-in furniture/décor definitions
src/
  domain/   Pure TypeScript: geometry, levels, footprints, seating, counts,
            advisories, command functions, scenario schema + migrations. No React, three or I/O.
  state/    Framework-free stores (zustand/vanilla + immer): editor state, command
            dispatch, undo/redo. Shared by scene, ui and data.
  scene/    R3F components that render venue + scenario state. Reads domain types.
  ui/       React panels, inspector, rail, sheets, tokens.css.
  data/     API client, sync, IndexedDB drafts, image processing.
  app/      Composition root: routes, providers, store wiring, the printable plan (canvas).
tests/
  unit/  e2e/  visual/
docs/  references/  scripts/  .claude/
```

## 3. Layer rules (enforced by ESLint import restrictions)

| Layer | May import |
|---|---|
| `domain` | nothing outside `domain` (and zod) |
| `state` | `domain`, zustand/vanilla, immer |
| `scene` | `domain`, `state`, three/R3F |
| `ui` | `domain`, `state`, `scene` (components and the studio context only), React |
| `data` | `domain`, `state` |
| `app` | everything |
| `api` | `src/domain` schemas only |

## 4. Data model

### 4.1 Venue geometry (`data/venue_geometry.json`)

Metric, right-handed, origin at the north-west interior corner, +x east, +z south, +y up. Every numeric parameter is an object `{ value, min, max, confidence: "H"|"M"|"L", sources: string[] }`. Sections: `room`, `levels` (main, raised east strip), `walls` (with openings: garage doors, windows, entrance, kitchen pass, exits), `bar`, `backBar`, `mezzanine` (edge line + height, non-walkable), `stair`, `fixtures` (chandeliers, pendants, paintings, banquettes, wine wall), `materials`, `cameraPresets` (dollhouse default, R01, R03, R09 …).

The scene is built from this file by pure functions in `domain/venue` (footprints, level polygons, colliders) and `scene/venue` (meshes). Changing a value rebuilds deterministically.

### 4.2 Scenario

```ts
type Scenario = {                       // src/domain/scenario/schema.ts (zod) is the source of truth
  schemaVersion: 4;
  id: string; name: string; phase?: "dinner" | "party";
  revision: number;                     // server-assigned from step 2, for conflict detection
  items: Item[];                        // tables, dance area, DJ; décor and imports from step 2
  style: TableStyle & { linenLength: "lap" | "floor"; settings: boolean; menus: boolean;
                        tableNumbers: boolean; lighting: "evening" | "day" };
  guests: { count: number; seed: number };
  thresholds: { aisleM: number; clearanceM: number; m2PerDancer: number; dancingShare: number };
  venueToggles: { barStools: boolean; paintings: Record<string, string> };
  notes: Note[];
  updatedAt: string; updatedBy?: "A" | "B";
};
type Item = { id: string; libraryId: string; x: number; z: number; rotY: number;
              options: Record<string, number | string | boolean>; label?: string;
              style?: Partial<TableStyle> };   // per-table décor override (DEC-05)
type TableStyle = { linen: string; chair: string; florals: string;                    // library ids or "none"
                    candles: { id: string; n: number }[];            // up to 3 kinds, 1–8 each (DEC-02)
                    runner: string; napkin: string;                                  // library ids or "none"
                    floralColour: string; flowerType: string; charger: string };
```

The level (main / raised / mezzanine) is derived from the position, not stored. People are not stored: they are placed from the layout, guest count, phase and `guests.seed` (`domain/layout/people.ts`, PPL-02). Older files (versions 1–3) are upgraded by the migrations in `domain/scenario/scenario.ts` (tested).

Schema changes bump `schemaVersion` and add a migration in `domain/scenario/scenario.ts` with a test.

### 4.3 Commands and undo

Every change is a command (`addItem`, `moveItems`, `rotateItems`, `setSeats`, `applyStyle`, …) that produces an immer patch pair. The store applies patches; undo/redo replays inverses. The same command stream drives autosave. No component mutates scenario state directly.

### 4.4 Library

```
data/library/<family>.json      Entries: id, name, family, placement, sizeM {w,d,h}, sizePresets,
                                model {kind:"parametric", generator, params} | {kind:"glb", file},
                                lowModel (phone version: same shape, or generator params.quality "low"),
                                options [{type:number|choice|boolean|text, key, label, default, …}],
                                thumbnail, source {type:"built"|"cc0"|"custom", origin, licence},
                                budget {triangles, phoneTriangles, drawCalls}
src/domain/layout/items.ts       Shape generators keyed by model.generator (rectTable, roundTable,
                                cocktail, danceFloor, djBooth, backdrop, and every piece generator):
                                sizes from sizeM/params/options, never ids
src/domain/layout/decor.ts       Table décor as unit-primitive parts (candles, florals, runners, settings)
                                The candle mix is laid out per table: each candle (a candle entry's
                                budget is for one) takes the free spot nearest its ideal one, clear of
                                the settings and flowers; candles with no room are left off
src/domain/layout/pieces.ts      Step-3 pieces (plant, light, floralPiece, sign, eventPiece) as the same
                                parts plus size, whether they block the floor, and optional words
src/scene/items/                 Meshes per shape kind; chairs instanced; table décor and pieces drawn
                                together, one instanced mesh per primitive and material
public/assets/models/            GLB files (CC0 adapted or custom-built), meshopt-compressed
public/assets/thumbs/            Generated thumbnails (scripts/render-thumbnails)
```

The inspector builds its controls from `options`, and library captions from the resolved shape, so a preset of an existing generator is a JSON entry only (LIB-12, tested). Validated with zod at load (`domain/library`). `scripts/check-library` fails CI on missing fields, missing licence, sizes outside family bounds or budget breaches. Imported items (IMP) store a built-in library model (`baseId`), the parameters the photo changes (colours, a table-top `scale` to the real height, the photo id for prints and photo previews), the real size, the crop's thumbnail and an optional product link; `domain/library/imported.ts` turns each into a catalogue entry with an `imported` label (Material, Approximate 3D, Photo preview) and suggests the closest model by proportions, real height and colour. The catalogue is the built-in files plus these entries, updated in place when an import arrives; an id the device has not loaded yet resolves to a plain placeholder panel. Imports are never edited after saving, only removed from the lists or put back with Undo (`archived`), so rooms that use one keep showing it. Custom requests (REQ) live in the app store, not Git; "Ready" is not stored but shown once a built-in entry carries the request's id in `requestId`. Exact 3D (GLB) import is deferred (owner decision, 2026-10-16).

## 5. Rendering

- **Venue shell:** generated meshes from venue data; PBR materials with tiling textures (CC0, provenance in `public/assets/LICENSES.md`) or procedural textures.
- **Lighting (ADR-2):** live only. Evening: hemisphere + a few shadow-free fill lights, one shadow-casting key light, emissive chandeliers/back bar/candles with selective bloom, N8AO ambient occlusion, ACES/AgX tone mapping. Daylight: soft sky + key light.
- **Dollhouse cutaway:** walls whose normal faces the camera switch to a low cut height with a cap mesh; ceiling layer hidden; recomputed on camera move (cheap dot-product test per wall).
- **Instancing:** chairs, people, candles, glasses use `InstancedMesh` per type and level of detail.
- **Quality tiers:** `high` (desktop: shadows, AO, bloom, 2× DPR), `medium`, `low` (phone: no AO, 1.5× DPR cap, simplified chandeliers). Chosen from GPU tier detection and adjusted by a frame-time monitor.
- **Walk collisions:** 2D circle-vs-polygon against level colliders; no physics engine (ADR-5).

## 6. Server and persistence

### 6.1 API

| Endpoint | Purpose |
|---|---|
| `POST /api/login`, `POST /api/logout`, `GET /api/session` | Shared password → signed httpOnly cookie (HMAC, 30 days). Rate-limited. |
| `GET /api/scenarios`, `POST /api/scenarios` | List / create. |
| `GET/PUT/DELETE /api/scenarios/:id` | PUT and DELETE require `If-Match: <revision>`; 409 on mismatch returns the server copy (`SCN-03`). Check and write are one atomic Redis script (`EVAL`), so two saves of the same revision never both succeed. |
| `GET /api/scenarios/:id/versions`, `POST /api/scenarios/:id/versions` `{ revision }` | History (last 50 per scenario); POST restores one as the newest revision. |
| `GET/POST /api/catalog`, `PATCH /api/catalog/:id` `{ archived, updatedAt }` | Imported items (IMP-06); create is idempotent; the only change is removing an item from the lists or putting it back (Undo), and the later `updatedAt` wins. |
| `GET/PUT /api/uploads/:id` | Photos (§6.3): JPEG, WebP or PNG, ≤ 600 KB raw, stored once per random id. |
| `GET/POST /api/library-requests` | Custom model requests (REQ); POST creates or updates one, and the later `updatedAt` wins. Reads of requests and their photos also accept `Authorization: Bearer <LIBRARY_REQUESTS_TOKEN>` (≥ 24 chars) for Claude sessions; the token can never write. |

All request bodies validated with the shared zod schemas. Responses `Cache-Control: no-store`. Without `APP_PASSWORD`, `SESSION_SECRET` (≥ 32 chars) and Upstash credentials the API answers 503 and the app stays local. Notes travel inside the scenario; if the partner only added notes, the client merges them and saves again instead of raising a conflict. Sync tasks run one at a time; a create whose reply was lost is recognised on the next pull, and a new device's untouched venue sample is not added to a non-empty shared list. Locally (`RS_DEV_API=1`) Vite serves the same handlers through `api/_lib/router.ts`, with `RS_MEMORY_STORE=1` for an in-memory store.

### 6.2 Offline and drafts

Edits apply locally at once and are written to IndexedDB; a sync queue pushes them (debounced 1.5 s). Connection loss keeps working locally (`SCN-09`).

### 6.3 Images

Client resizes to ≤ 1600 px long edge, WebP/JPEG, EXIF stripped, ≤ 500 KB, before upload. Stored in Upstash with the scenarios (within its value-size limit; owner decision 2026-10-16), so no new service. Images are private to the app and never committed to Git.

## 7. Budgets

| Metric | Desktop | Phone |
|---|---|---|
| First meaningful paint (plan + counts) | < 1.5 s | < 2.5 s |
| Initial download (JS + scene) | < 12 MB | < 6 MB |
| Draw calls, full evening scene, 15 tables + 150 people | < 250 | < 150 |
| Triangles | < 1.5 M | < 600 k |
| Frame rate | 60 fps target | 30 fps floor |

CI checks draw calls and triangles (software rendering makes fps meaningless there); fps is checked on real devices at gates.

## 8. Security

Shared password (env `APP_PASSWORD`) + `SESSION_SECRET` ≥ 32 chars; constant-time compare; login rate limit (8 tries per 15 min per address, counted atomically before the password is checked); the session signature covers the password, so changing it signs everyone out; security headers (CSP allowing `blob:` and `data:` for textures and workers, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: same-origin`, `X-Robots-Tag: noindex`). No secrets in Git (`.env.example` only).

## 9. Deployment and CI

- Vercel Git integration: every pushed branch gets a preview URL; `main` is production. Env vars: `APP_PASSWORD`, `SESSION_SECRET`, Upstash URL/token.
- GitHub Actions on every push/PR: install → typecheck → lint → unit → build → Playwright (e2e + visual) → requirement traceability check.

## 10. Decisions (ADR log)

| # | Decision | Why | Revisit if |
|---|---|---|---|
| ADR-1 | React + R3F + TypeScript with a build step | A state-driven 3D scene with many panels; less code than hand-wiring three.js + DOM. | — |
| ADR-2 | Live browser lighting only; pre-computed (baked) lighting deferred | Simplicity; evening candlelight hides most of the difference. Baking (offline Blender run by Claude) stays an invisible upgrade option. | Owner judges the step 1 render not atmospheric enough. |
| ADR-3 | Upstash Redis + one shared password | Two users, zero cost, proven setup. | More users or per-person permissions needed. |
| ADR-4 | Async collaboration with revision-based conflict detection, no live co-editing | Far simpler; matches how two partners actually plan. | Both routinely edit the same scenario at once. |
| ADR-5 | No physics engine; 2D footprints per level | Placement and walk need only planar collision. | — |
| ADR-6 | No third-party images in Git while the repo is public | Copyright; observations kept as text in `references/`. | Repo made private and rights confirmed. |
| ADR-7 | Venue dimensions edited in data by Claude; no calibration UI | Owner has no measurements; saves build time. | Venue supplies a dimensioned plan. |
| ADR-8 | One data-driven library for built-in, imported and custom items; parametric generators in code + CC0 GLBs (Poly Haven) | Many variants from few models; custom additions need no UI work. | — |
