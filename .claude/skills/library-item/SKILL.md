---
name: library-item
description: Add or upgrade an item in the Richmond Studio library — from an owner request in the app, a photo attached in chat, or a gap in the catalogue. Covers choosing parametric vs GLB, modelling conventions, catalogue entry, thumbnail, checks, and delivering it by pull request. Use whenever the owner asks for a new décor/furniture item, says "build my library requests", or a custom model request is open.
---

# Add a library item

Spec: `docs/PRODUCT_SPEC.md` §5.7 (LIB), §5.9 (REQ). Structure: `docs/ARCHITECTURE.md` §4.4.

## 1. Collect the request

- **From the app:** `GET /api/library-requests?status=requested` with `Authorization: Bearer $LIBRARY_REQUESTS_TOKEN` (env var in the Claude environment, never in Git). If the app host is blocked by the network policy, tell the owner which host to allow, or ask them to attach the photos in chat.
- **From chat:** photos the owner attached.
- Record: what it is, real size (ask only if missing), placement (table / floor / wall / ceiling / hanging), colours, must-match details, which scenario it is for.
- Set the request to `in_progress` (PATCH) when you start.
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

A preset of an existing generator needs nothing else: sizes come from `sizeM`, fixed inputs from `params` (e.g. `{ "width": 1.2 }`, `{ "finish": "wood" }`, `{ "seats": 2, "oneSide": true }`, a linen's `{ "colour": "#eee3cb" }`), and the inspector from `options`. Floor generators today: `rectTable`, `roundTable`, `cocktail`, `danceFloor`, `djBooth` (`FLOOR_GENERATORS` in `src/domain/layout/items.ts`). A new generator adds a case there plus its mesh in `src/scene/items/`, with a unit test.

## 5. Verify

```bash
npm run library:thumbs -- <id>     # renders public/assets/thumbs/<id>.webp
npm run check                      # includes check-library (fields, licence, size bounds, budgets)
```
Render the item in the venue (table and floor placement, evening + day) and compare with the request photo side by side. Run `ux-reviewer` if it adds UI options. Fix until it reads as the same object at table distance.

## 6. Deliver

- Commit on the working branch: `feat(library): add <name> (REQ <id>)`.
- Pull request with the Vercel preview link, the render-vs-photo pair (sent to the owner in chat, not committed), and what is approximate.
- After merge: PATCH the request to `in_library` with the item id.
