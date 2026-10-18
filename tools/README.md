# Tools: asset pipeline (visual stage V0)

Offline tools Claude runs from committed scripts; nothing here ships in the app. Brought over from the proofs of concept (`proto/visual-poc`, never merged) and kept as they were proven; each stage tidies the scripts it uses.

## Setup

- **Blender, headless, as a Python module:** `python -m venv venv && venv/bin/pip install bpy numpy` (`blender.org` is allowed by the network policy). `import bpy` must come before `import bmesh`.
- **glTF processing:** `@gltf-transform/*` and `meshoptimizer` are dev dependencies. KTX2 textures need KTX-Software's `toktx` on the path (installed when a stage first needs it).
- **Meshy:** the API key is injected by the session proxy; `docs.meshy.ai` is blocked (the API's own `/openapi` paths work). Meshy-generated models may be committed (owner, 2026-10-18).

## Checks

| Command | What |
|---|---|
| `npm run check:assets` | Every GLB under `public/assets/models/`, checked as one welded mesh (`assets/check-assets.ts`): open and non-manifold edges no more than its source had (`assets/sources.json`, 0 when absent), no zero-area or flipped triangles, triangle lists with normals only, a triangle budget on every library entry that uses it and within it, texture size (2K, 1K for a phone version), contact within 5 mm for floor and table pieces; a library entry's missing file fails too. Seat contact comes with the first chair GLB (V4). Runs in `npm run check` and CI; today there are no GLBs (every piece is parametric). |

## Prepare a model

`npm run assets:optimize -- <in.glb> <out.glb> [desktop|phone]`: drops duplicate and unused data, resizes textures (2K or 1K) and compresses the geometry with meshopt; never simplifies or smooths. Node ≥ 22.18 runs the `.ts` tools directly.

## Scripts

| Script | Use | Stage |
|---|---|---|
| `blender/assets.py`, `blender/assets_lib.py` | Author pieces (oval-back chair, place setting, lamp, roses, candles) and bake colour and AO from the full model onto the simple one: `venv/bin/python blender/assets.py <out_dir> <tex_dir> [asset ...]`. The normal-map bake still comes out empty. | V4, V5 |
| `blender/bake_room.py`, `blender/render_room.py` | Light-map bake and a Cycles reference render of the fixed room: `… <room.glb> data/venue_geometry.json <out_dir> <size> <samples>`. Needs the room exported from the app, which V2 adds with `npm run bake`. | V2 |
| `blender/meshy_pose.py` | Freeze a Meshy animated rig at one frame and fit it: `… <animated.glb> <out.glb> frame=1`. | V7 |
| `blender/mesh_audit.py`, `clash.py`, `seat_check.py`, `dims.py`, `glb_info.py`, `anim_info.py` | Inspect a GLB: open edges after welding, intersections between two models, close-up check renders, bounds, contents, animation frames. | all |
| `meshy/meshy.py` | Meshy API: `preview`, `refine`, `rig`, `animate`, `wait` (`wait <kind> <task_id> <out_dir> <name>` downloads; see `meshy/TASKS.md` for the man's task ids and the useful clips). The rigged man (`meshy/source/man-b-rig.glb`, 9.5 MB) stays on `proto/visual-poc` until V7 needs it. | V7 |
