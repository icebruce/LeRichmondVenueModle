"""The rebuilt guests packed into one file per detail level, as the app loads them (visual stage V7).

venv/bin/python people_pack.py <rebuilt_dir> <out_dir>

Reads `<rebuilt_dir>/<body>-<pose>.glb` and `.npz` (`people_rebuild.py`, bodies `man` and `woman`,
poses `table` and `standing`) and writes `<out_dir>/people-detail.glb`, `people-medium.glb` and
`people-simple.glb`, each holding one mesh per figure named `<body>-<pose>`, and the textures they
share: `people-shade.webp` (shade, or the colour of what is drawn as is; sRGB) and `people-parts.png`
(outfit, skin and hair weights in red, green and blue), 2048×1280: a 512-texel tile per figure for
the detailed level along the bottom, the medium level's above, then 256-texel ones for the simple.
Every device loads all three. Then `node tools/assets/quantize.ts` on each GLB (half the size).
"""
import sys

import bpy
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
BODIES = ("man", "woman")
POSES = ("table", "standing")
LEVELS = ("detail", "medium", "simple")
FIGURES = [f"{b}-{p}" for b in BODIES for p in POSES]
W, H = 2048, 1280


def place(level, c):
    """A tile's corner and side (texels, Blender's v up) in the shared textures."""
    if level == "simple":
        return c * 256, 1024, 256
    return c * 512, 512 * (level == "medium"), 512


bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
shade, parts = np.zeros((H, W, 3), np.float32), np.zeros((H, W, 3), np.float32)
for c, figure in enumerate(FIGURES):
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=f"{src}/{figure}.glb")
    tiles = np.load(f"{src}/{figure}.npz")
    for o in set(sc.objects) - before:
        level = o.name.split(".")[0]
        x, y, side = place(level, c)
        # Its own tile in the shared textures.
        uv = np.zeros(len(o.data.loops) * 2)
        o.data.uv_layers.active.data.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2)
        uv = np.column_stack([(x + uv[:, 0] * side) / W, (y + uv[:, 1] * side) / H])
        o.data.uv_layers.active.data.foreach_set("uv", uv.ravel())
        o.name = f"{level}:{figure}"
        shade[y : y + side, x : x + side] = tiles[f"{level}-shade"]
        parts[y : y + side, x : x + side] = tiles[f"{level}-parts"]


def save(a, path, **opts):
    Image.fromarray(np.flipud(np.clip(a * 255 + 0.5, 0, 255)).astype(np.uint8)).save(path, **opts)


srgb = np.where(shade <= 0.0031308, shade * 12.92, 1.055 * np.power(np.maximum(shade, 0), 1 / 2.4) - 0.055)
save(srgb, f"{dst}/people-shade.webp", quality=90, method=6)
save(parts, f"{dst}/people-parts.png", optimize=True)

for level in LEVELS:
    chosen = [o for o in sc.objects if o.name.startswith(f"{level}:")]
    for o in sc.objects:
        o.select_set(o in chosen)
    for o in chosen:
        o.name = o.data.name = o.name.split(":")[1]
    bpy.ops.export_scene.gltf(
        filepath=f"{dst}/people-{level}.glb",
        export_format="GLB",
        use_selection=True,
        export_normals=True,
        export_texcoords=True,
        export_tangents=False,
        export_vertex_color="NONE",
        export_materials="NONE",
        export_animations=False,
        export_extras=False,
    )
    for o in chosen:
        o.name = f"{level}:{o.name}"
