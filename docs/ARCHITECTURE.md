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
| Storage | Upstash Redis (REST) | Scenarios, versions, notes, catalogue metadata. Image storage: §6.3. |
| Tests | Vitest, Playwright (Chromium; mobile emulation) | See `TEST_STRATEGY.md`. |
| Lint/format | ESLint (typescript-eslint strict, react-hooks, import boundaries), Prettier | Enforced by hooks and CI. |
| Hosting | Vercel Hobby, Git integration | Preview URL per branch, production = `main`. |

New runtime dependencies need a one-line justification in the PR and an entry here.

## 2. Repository layout

```
api/                 Vercel Functions (auth, scenarios, notes, catalogue, uploads)
data/
  venue_geometry.json  Fixed room: metric parameters + confidence + sources
  catalog.json         Built-in furniture/décor definitions
src/
  domain/   Pure TypeScript: geometry, levels, footprints, seating, counts,
            advisories, commands, scenario schema + migrations. No React, three or I/O.
  scene/    R3F components that render venue + scenario state. Reads domain types.
  ui/       React panels, inspector, rail, sheets, tokens.css.
  data/     API client, sync, IndexedDB drafts, image processing.
  app/      Composition root: routes, providers, store wiring.
tests/
  unit/  e2e/  visual/
docs/  references/  scripts/  .claude/
```

## 3. Layer rules (enforced by ESLint import restrictions)

| Layer | May import |
|---|---|
| `domain` | nothing outside `domain` (and zod) |
| `scene` | `domain`, three/R3F |
| `ui` | `domain`, `scene` (components only), React |
| `data` | `domain` |
| `app` | everything |
| `api` | `src/domain` schemas only |

## 4. Data model

### 4.1 Venue geometry (`data/venue_geometry.json`)

Metric, right-handed, origin at the north-west interior corner, +x east, +z south, +y up. Every numeric parameter is an object `{ value, min, max, confidence: "H"|"M"|"L", sources: string[] }`. Sections: `room`, `levels` (main, raised east strip), `walls` (with openings: garage doors, windows, entrance, kitchen pass, exits), `bar`, `backBar`, `mezzanine` (edge line + height, non-walkable), `stair`, `fixtures` (chandeliers, pendants, paintings, banquettes, wine wall), `materials`, `cameraPresets` (dollhouse default, R01, R03, R09 …).

The scene is built from this file by pure functions in `domain/venue` (footprints, level polygons, colliders) and `scene/venue` (meshes). Changing a value rebuilds deterministically.

### 4.2 Scenario

```ts
type Scenario = {
  schemaVersion: number;
  id: string; name: string; phase?: "dinner" | "party";
  revision: number;            // server-assigned, for conflict detection
  items: Item[];               // tables, dance floor, DJ, stations, décor, imported
  style: { linen: LinenId; candles: CandleId; florals: FloralId; chair: ChairId; lighting: "evening" | "day" };
  guests: { count: number; seed: number };
  thresholds: { aisleM: number; clearanceM: number; m2PerDancer: number; dancingShare: number };
  venueToggles: { communalTable: boolean; barStools: boolean; paintings: Record<string, boolean> };
  notes: Note[];
  updatedAt: string; updatedBy: "A" | "B";
};
type Item = { id: string; kind: ItemKind; catalogId: string; x: number; z: number; rotY: number;
              level: "main" | "raised"; params: Record<string, number | string>; styleOverride?: Partial<Scenario["style"]>; label?: string };
```

Schema changes bump `schemaVersion` and add a migration in `domain/scenario/migrations.ts` with a test.

### 4.3 Commands and undo

Every change is a command (`addItem`, `moveItems`, `rotateItems`, `setSeats`, `applyStyle`, …) that produces an immer patch pair. The store applies patches; undo/redo replays inverses. The same command stream drives autosave. No component mutates scenario state directly.

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
| `GET/PUT/DELETE /api/scenarios/:id` | PUT requires `If-Match: <revision>`; 409 on mismatch returns the server copy (`SCN-03`). |
| `GET /api/scenarios/:id/versions`, `POST …/restore` | History (last 50 per scenario). |
| `GET/POST /api/catalog` | Imported items metadata. |
| `POST /api/uploads` | Image upload (§6.3). |

All request bodies validated with the shared zod schemas. Responses `Cache-Control: no-store`.

### 6.2 Offline and drafts

Edits apply locally at once and are written to IndexedDB; a sync queue pushes them (debounced 1.5 s). Connection loss keeps working locally (`SCN-09`).

### 6.3 Images

Client resizes to ≤ 1600 px long edge, WebP/JPEG, EXIF stripped, ≤ 500 KB, before upload. Storage target decided in step 3 by measured limits: Upstash (if within its value-size limit) or Vercel Blob. Images are private to the app and never committed to Git.

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

Shared password (env `APP_PASSWORD`) + `SESSION_SECRET` ≥ 32 chars; constant-time compare; login rate limit; security headers (CSP allowing `blob:` and `data:` for textures and workers, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: same-origin`, `X-Robots-Tag: noindex`). No secrets in Git (`.env.example` only).

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
