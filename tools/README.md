# Tools: asset pipeline (visual stage V0)

Offline tools Claude runs from committed scripts; nothing here ships in the app. Brought over from the proofs of concept (`proto/visual-poc`, never merged) and kept as they were proven; each stage tidies the scripts it uses.

## Setup

- **Blender, headless, as a Python module:** `python -m venv venv && venv/bin/pip install bpy numpy` (`blender.org` is allowed by the network policy). `import bpy` must come before `import bmesh`.
- **glTF processing:** `@gltf-transform/*` and `meshoptimizer` are dev dependencies.
- **Textures:** `sharp` is a dev dependency; no system tools.
- **Meshy:** the API key is injected by the session proxy; `docs.meshy.ai` is blocked (the API's own `/openapi` paths work). Meshy-generated models may be committed (owner, 2026-10-18).

## Checks

| Command | What |
|---|---|
| `npm run check:assets` | Every GLB under `public/assets/models/`, checked as one welded mesh (`assets/check-assets.ts`): open and non-manifold edges no more than its source had (`assets/sources.json`, 0 when absent: a Meshy model keeps its remesher's invisible fins and pin holes, since refilling them left jagged patches), no zero-area or flipped triangles, triangle lists with normals only, a triangle budget on every library entry that uses it and within it, texture size (2K, 1K for a phone version), contact within 5 mm for floor and table pieces; a library entry's missing file fails too. Guest figures (`people/`, V7) are checked per figure: closed (no open or non-manifold edge at all), within their level's budget (8,000, 2,000, 600 triangles), feet within 2 cm of the floor, seated ones resting on (or sunk into) the seat, clear of the table top and, for hands on the table, palms within 1 cm of it (`figureFit`). Runs in `npm run check` and CI; the chairs (V4) were the first GLBs; bloom models (`blooms/`, V5) are table-décor parts with a 1,000-triangle budget each. |

## Prepare a model

`npm run assets:optimize -- <in.glb> <out.glb> [desktop|phone]`: drops duplicate and unused data, resizes textures (2K or 1K) and compresses the geometry with meshopt; never simplifies or smooths. The app cannot decode meshopt under its CSP (no `'wasm-unsafe-eval'`), so the chairs ship uncompressed (about 250 KB each). Node ≥ 22.18 runs the `.ts` tools directly.

## Room textures

`npm run assets:textures`: downloads the Poly Haven CC0 sets the room uses (2K JPEG, cached in the gitignored `tools/.cache/`), bakes in the colour corrections the venue needs and writes WebP to `public/assets/textures/` (not KTX2: its decoder builds code at run time, which the site's CSP forbids): a 2K colour map for the four big surfaces on desktops, 1K for everything else and for phones (`assets/textures.ts`).

## Room light bake

`BAKE_PYTHON=<python with bpy> npm run bake [-- <samples>]` (default 256 samples; 128 takes about 15 minutes a set on 4 cores) (`bake/bake.ts`, visual stage V2, ADR-2):

1. Builds the app into `tools/.cache/bake/dist` and opens it with `?bake-export` and takes the fixed room as a GLB: the receivers (walls, floors, ceiling, mezzanine edge) with the light-map UVs the app computes (`src/scene/venue/lightmap.ts`), and every other opaque, drawn part as an occluder or, where it glows, an emitter.
2. Bakes each set, evening and daylight, in Blender (`blender/bake_room.py`): the venue's own lights from the venue data, Cycles diffuse direct and bounced, a light masked blur.
3. Checks it: islands that get light have no unlit texels (faces buried in the model get none and are never seen), and the map holds at least 30 texels a metre.
4. Writes WebP (lossless, 8-bit, 2.2 gamma, 2K and 1K) to `public/assets/bake/` and `data/bake/manifest.json`: the room's geometry fingerprint, the light inputs' fingerprint, the bake script's hash and each set's scale.

A room or light change makes the manifest stale: `[LGT-03]` fails in CI, and the app draws the live-lit room until the bake is re-run.

## Scripts

| Script | Use | Stage |
|---|---|---|
| `blender/assets.py`, `blender/assets_lib.py` | Author pieces (oval-back chair, place setting, lamp, roses, candles) and bake colour and AO from the full model onto the simple one: `venv/bin/python blender/assets.py <out_dir> <tex_dir> [asset ...]`. The normal-map bake still comes out empty. | V4, V5 |
| `blender/bake_room.py` | The room light bake, run by `npm run bake` (above). | V2 |
| `blender/render_room.py` | A Cycles reference render of the fixed room (proof of concept, kept for calibration shots). | V2 |
| `blender/meshy_pose.py` | Freeze a Meshy animated rig at one frame and fit it: `… <animated.glb> <out.glb> frame=1`. | V7 |
| `blender/mesh_audit.py`, `clash.py`, `seat_check.py`, `dims.py`, `glb_info.py`, `anim_info.py` | Inspect a GLB: open edges after welding, intersections between two models, close-up check renders, bounds, contents, animation frames. | all |
| `blender/chair_from_meshy.py` | A Meshy chair made ready for the app: `… <meshy.glb> <out.glb> <w> <d> <h> <front>`. Keeps the remesher's topology (see the check above), fits the width and height and places the backrest where a seated guest's back rests, and writes a grey detail map plus `<out>-mask.png` (frame black, seat white) so the app tints each part per library entry. Task ids and sizes: `meshy/TASKS.md`. | V4 |
| `blender/bloom_from_meshy.py` | A Meshy bloom made ready for the app: `… <meshy.glb> <out.glb> [stem] [front-up]`. Keeps the topology (`stem` folds a stem into a stub under the head rather than cutting it), fits it into -1..1, turns faces outward, smooths and bakes its creases into the vertex colour; the app tints it per arrangement. Task ids: `meshy/TASKS.md`. | V5 |
| `blender/chandelier_from_meshy.py` | A refined Meshy chandelier made ready for the app: `… <meshy.glb> <out.glb> <height> <width>`. Keeps the topology, fits height and width with its lowest point at 0, keeps only a 1K colour map. | V6 |
| `blender/plant_from_meshy.py` | A Meshy plant made ready for the app: `… <meshy.glb> <out.glb> <height>`. Keeps the topology, fits the height with the pot's foot at 0, keeps only a 1K colour map. | V5 |
| `blender/people_seated.py` | A guest Meshy generated seated at a table: the furniture (textured plain light grey) cut away and capped, scaled to the guest's own size, set on our seat with the back clear of the backrests, shins rescaled to our floor, forearms raised smoothly onto our 0.75 m top: `… <refined.glb> <out.glb> sit=<m>`. | V7 |
| `blender/people_standing.py` | A guest Meshy generated standing: scaled to `height`, feet on the floor, centred: `… <refined.glb> <out.glb> height=<m>`. | V7 |
| `blender/people_rebuild.py` | A placed guest rebuilt clean: voxel remesh, three levels (8,000, 2,000, 540 triangles), the texture sampled into vertex colours with the part (outfit, skin, hair, as is) in alpha: `… <posed.glb> <out.glb> [legs=<hem m>]`. | V7 |
| `blender/people_pack.py` | The four rebuilt figures packed one file per level (`public/assets/models/people/people-<level>.glb`): `… <rebuilt_dir> <out_dir>`. Task ids and clips: `meshy/TASKS.md`. | V7 |
| `meshy/meshy.py` | Meshy API: `preview` (`[polycount] [prop]` for objects), `refine`, `remesh <task_id> <polycount>` (5 credits), `rig`, `animate`, `wait` (`wait <kind> <task_id> <out_dir> <name>` downloads; see `meshy/TASKS.md` for the man's task ids and the useful clips). The rigged man (`meshy/source/man-b-rig.glb`, 9.5 MB) stays on `proto/visual-poc` until V7 needs it. | V7 |
