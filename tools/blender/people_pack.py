"""The rebuilt guests packed into one file per detail level, as the app loads them (visual stage V7).

venv/bin/python people_pack.py <rebuilt_dir> <out_dir>

Reads `<rebuilt_dir>/<body>-<pose>.glb` (`people_rebuild.py`, bodies `man` and `woman`, poses `table`
and `standing`) and writes `<out_dir>/people-detail.glb`, `people-medium.glb` and
`people-simple.glb`, each holding one mesh per figure named `<body>-<pose>`. A phone loads only the
medium and simple files, a desktop only the detailed and medium ones.
"""
import sys

import bpy

src, dst = sys.argv[1], sys.argv[2]
BODIES = ("man", "woman")
POSES = ("table", "standing")
LEVELS = ("detail", "medium", "simple")

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for body in BODIES:
    for pose in POSES:
        before = set(sc.objects)
        bpy.ops.import_scene.gltf(filepath=f"{src}/{body}-{pose}.glb")
        for o in set(sc.objects) - before:
            o.name = f"{o.name.split('.')[0]}:{body}-{pose}"

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
        export_texcoords=False,
        export_tangents=False,
        export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=True,
        export_materials="NONE",
        export_animations=False,
        export_extras=False,
    )
    for o in chosen:
        o.name = f"{level}:{o.name}"
