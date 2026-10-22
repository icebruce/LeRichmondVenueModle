"""The rebuilt guests packed into one file per detail level, as the app loads them (visual stage V7).

venv/bin/python people_pack.py <rebuilt_dir> <out_dir>

Reads `<rebuilt_dir>/<body>-<pose>.glb` and `.npz` (`people_rebuild.py`, bodies `man` and `woman`,
poses `table` and `standing`) and writes `<out_dir>/people-detail.glb`, `people-medium.glb` and
`people-simple.glb`, each holding one mesh per figure named `<body>-<pose>`, and the textures they
share: `people-shade.webp` (shade, or the colour of what is drawn as is; sRGB) and `people-parts.png`
(outfit, skin and hair weights in red, green and blue). One tile per figure (column) and level (row).
A phone loads only the medium and simple files, a desktop all three.
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

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
shade, parts = [], []
for c, figure in enumerate(FIGURES):
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=f"{src}/{figure}.glb")
    tiles = np.load(f"{src}/{figure}.npz")
    for o in set(sc.objects) - before:
        level = o.name.split(".")[0]
        r = LEVELS.index(level)
        # Its own tile in the shared textures (Blender's v runs up, rows from the bottom).
        uv = np.zeros(len(o.data.loops) * 2)
        o.data.uv_layers.active.data.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2)
        uv = np.column_stack([(c + uv[:, 0]) / len(FIGURES), (r + uv[:, 1]) / len(LEVELS)])
        o.data.uv_layers.active.data.foreach_set("uv", uv.ravel())
        o.name = f"{level}:{figure}"
    shade.append(np.concatenate([tiles[f"{lv}-shade"] for lv in LEVELS], 0))
    parts.append(np.concatenate([tiles[f"{lv}-parts"] for lv in LEVELS], 0))


def save(a, path, **opts):
    Image.fromarray(np.flipud(np.clip(a * 255 + 0.5, 0, 255)).astype(np.uint8)).save(path, **opts)


linear = np.concatenate(shade, 1)
srgb = np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(np.maximum(linear, 0), 1 / 2.4) - 0.055)
save(srgb, f"{dst}/people-shade.webp", quality=90, method=6)
save(np.concatenate(parts, 1), f"{dst}/people-parts.png", optimize=True)

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
