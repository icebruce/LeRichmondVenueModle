# Visual POC tools (prototype, not production)

Scripts behind the evening POC shot (`?poc&baked`). Binaries are not committed (public repo):
`public/poc/` and `public/assets/textures/ph/` are gitignored and regenerated here.

Setup: `python -m venv venv && venv/bin/pip install bpy numpy` (Blender as a Python module).

| Output | How |
|---|---|
| `public/assets/textures/ph/*.jpg` | Poly Haven (CC0), 1k JPG: `large_floor_tiles_02`, `old_wood_floor`, `red_brick`, `yellow_brick` (diff, nor_gl, rough) |
| `public/poc/{chair-oval,setting,lamp,roses,candles}.glb` | `venv/bin/python blender/assets.py public/poc <tex_dir> [asset ...]` |
| `public/poc/venue-baked.glb`, `venue-lightmap.hdr` | `npm run build && npx vite preview`, then `node tools/visual-poc/capture/export-venue.mjs venue-export.glb`, then `venv/bin/python blender/bake_room.py venue-export.glb data/venue_geometry.json public/poc 2048 <samples>` |
| `public/poc/guest-seated-meshy.glb` | `meshy/meshy.py` (preview, refine, rig, then `animate <rig_id> 33` for Chair Sit Idle Male; API key injected by the proxy), then `blender/meshy_pose.py <animated.glb> <out.glb> frame=1` |
| Check renders | `blender/seat_check.py <chair.glb> <guest.glb> <out_dir> [notable]` |
| POC shot | `node tools/visual-poc/capture/capture-baked.mjs <out_dir> <tag>` with the preview server running |

Meshy-generated models may be committed (owner, 2026-10-18). The rigged man, his prompts and task ids are in `meshy/` (`meshy/TASKS.md`).

Environment: `blender.org` is allowed by the network policy; the Meshy API key is injected by the session proxy; `docs.meshy.ai` is blocked.
