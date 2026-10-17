---
name: library-item
description: Add or upgrade an item in the Richmond Studio library — from an owner request in the app, a photo attached in chat, or a gap in the catalogue. Covers choosing parametric vs GLB, modelling conventions, catalogue entry, thumbnail, checks, and delivering it by pull request. Use whenever the owner asks for a new décor/furniture item, says "build my library requests", or a custom model request is open.
---

# Add a library item

Spec: `docs/PRODUCT_SPEC.md` §5.7 (LIB), §5.9 (REQ). Structure: `docs/ARCHITECTURE.md` §4.4.

## 1. Collect the request

- **From the app:** `GET /api/library-requests` with `Authorization: Bearer $LIBRARY_REQUESTS_TOKEN` (env var in the Claude environment, never in Git). If the app host is blocked by the network policy, tell the owner which host to allow, or ask them to attach the photos in chat.
- **From chat:** photos the owner attached.
- Record: what it is, real size (ask only if missing), placement (table / floor / wall / ceiling / hanging), colours, must-match details, which scenario it is for.
- The token is read-only. Status is never set by hand: a request shows "Requested" until your entry carries `"requestId": "<request id>"`, then "Ready" by itself.
- Request photos: `GET /api/uploads/<image id>` with the same token.
- Skip requests already delivered: any whose id appears as `requestId` in `data/library/*.json` (the server never stores "In library").
- Save reference photos only to a gitignored folder (`references/private_media/requests/`). Never commit them.

## 2. Choose the approach (cheapest that meets the request)

1. **Preset of an existing generator.** Same family and shape, different options (colours, counts, heights). Add a catalogue entry only.
2. **Extend a generator.** Shape is close but needs a new option (e.g. a 7-arm candelabra). Add the parameter with a default that keeps existing items unchanged, plus a unit test.
3. **New parametric generator.** A new shape family worth reusing (e.g. a lantern style).
4. **Custom GLB.** A one-off distinctive piece. Build it procedurally in a script (three.js geometry exported with `GLTFExporter`, or Blender headless if installed) — or adapt a CC0 model (Poly Haven) and record its source. Never use models without a licence that allows reuse.

## 3. Modelling conventions

- Metres, Y up, origin at the centre of the base (hanging items: at the attachment point).
- Real proportions from the photo + the owner's size; check against a known scale (table 0.74 m, chair seat 0.45 m).
- PBR materials from the shared material set (`src/scene/materials`); new textures only if CC0, ≤ 1K, recorded in `public/assets/LICENSES.md`.
- Budgets: table-top items ≤ 3k triangles (≤ 800 for the phone version); floor items ≤ 15k (≤ 4k phone); 1–3 materials. Instancing-friendly (no per-instance materials).
- Candles and lights: emissive parts tagged so evening mode makes them glow.
- Provide a phone-weight version: `lowModel` is required — a lighter GLB, or the same generator with `params.quality: "low"`; set `budget.phoneTriangles` (≤ a quarter of the family limit).

## 4. Catalogue entry

Add to `data/library/<family>.json`: `id`, `name` (owner's words), `family`, `placement`, `sizeM`, `sizePresets`, `model` (`{ kind: "parametric", generator, params }` or `{ kind: "glb", file }`), `lowModel`, `options` (they become the inspector controls), `source` (`built` | `cc0` | `custom` with origin and licence), `budget` (`triangles`, `phoneTriangles`, `drawCalls`), `requestId` if from a request.

A preset of an existing generator needs nothing else: sizes come from `sizeM`, fixed inputs from `params` (e.g. `{ "width": 1.2 }`, `{ "finish": "wood" }`, `{ "seats": 2, "oneSide": true }`, a linen's `{ "colour": "#eee3cb" }`), and the inspector from `options`.

- **Option types:** `number` (min, max, step), `choice` (choices of value + label; hex colours, uplight colours and floral palettes show as swatches), `boolean`, and `text` (`maxLength` ≤ 40; the words are cut to it before any generator sees them).
- **Floor generators** (`FLOOR_GENERATORS` in `src/domain/layout/items.ts`): `rectTable`, `roundTable`, `cocktail`, `danceFloor`, `djBooth`, `backdrop`, and the **piece generators** in `src/domain/layout/pieces.ts`: `plant`, `light`, `floralPiece`, `sign`, `eventPiece`. A piece's `params.kind` picks its look (e.g. `light` → `string`, `edison`, `uplight`, `pinSpot`, `chandelier`, `disco`, `djLights`, `monogram`; `eventPiece` → `stage`, `photoBooth`, `station`, `bar`, `cake`, `gift`, `lounge`). An unknown kind throws.
- **Pieces are built to `sizeM`**, measured from the floor at the default options (a hung piece's height includes where it hangs). A plant's species is data: `pot` (m), `crown` (share of the height), `leaves`, `leaf` (m), `colour`, `look` (`leaves`, `fronds`, `blossom`). A unit test fails if a piece's size differs from `sizeM` by more than 5 cm or spills outside its footprint.
- **Blocking follows `placement`:** `floor` pieces taller than 5 cm take floor space (collisions, walk, aisles); `hanging`, `ceiling` and `wall` pieces, and flat floor projections, never block. Hanging pieces should have a `hang` number option.
- `lowModel` for a piece is the same generator with `params.quality: "low"` (fewer leaves and blooms).

A new generator, or a new `kind` of a piece generator, needs code: a case in `items.ts` or `pieces.ts`, its mesh in `src/scene/items/` if it is not made of the shared primitives, and a unit test.

## 5. Verify

```bash
npm run library:thumbs -- <id>     # renders public/assets/thumbs/<id>.webp
npm run check                      # includes check-library (fields, licence, size bounds, budgets)
```
Render the item in the venue (table and floor placement, evening + day) and compare with the request photo side by side. Run `ux-reviewer` if it adds UI options. Fix until it reads as the same object at table distance.

## 6. Deliver

- Commit on the working branch: `feat(library): add <name> (REQ <id>)`.
- Pull request with the Vercel preview link, the render-vs-photo pair (sent to the owner in chat, not committed), and what is approximate.
- Set `requestId` on the new entry: after merge the request shows "Ready" with a button to place or use the item.
