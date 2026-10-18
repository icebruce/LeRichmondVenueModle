# Visual POC tools (prototype, not production)

Scripts behind the evening POC shot (`?poc&baked`). Binaries are not committed (public repo):
`public/poc/` and `public/assets/textures/ph/` are gitignored and regenerated here.

Setup: `python -m venv venv && venv/bin/pip install bpy numpy` (Blender as a Python module).

| Output | How |
|---|---|
| `public/assets/textures/ph/*.jpg` | Poly Haven (CC0), 1k JPG: `large_floor_tiles_02`, `old_wood_floor`, `red_brick`, `yellow_brick` (diff, nor_gl, rough) |
| `public/poc/{chair-oval,setting,lamp,roses,candles}.glb` | `venv/bin/python blender/assets.py public/poc <tex_dir> [asset ...]` |
| `public/poc/venue-baked.glb`, `venue-lightmap.hdr` | `npm run build && npx vite preview`, then `node tools/visual-poc/capture/export-venue.mjs venue-export.glb`, then `venv/bin/python blender/bake_room.py venue-export.glb data/venue_geometry.json public/poc 2048 <samples>` |
| `public/poc/guest-seated-meshy.glb` | `meshy/meshy.py` (preview, refine, rig, animate; API key injected by the proxy), then `blender/meshy_pose.py <rigged.glb> <out.glb>` |
| Check renders | `blender/seat_check.py <chair.glb> <guest.glb> <out_dir> [notable]` |
| POC shot | `node tools/visual-poc/capture/capture-baked.mjs <out_dir> <tag>` with the preview server running |

Meshy-generated models stay out of Git until Meshy's terms are confirmed for a public repo.
