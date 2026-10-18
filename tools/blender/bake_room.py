"""Bake the fixed room's light (direct + bounced) into its light map (visual stage V2, ADR-2).

Usage: python bake_room.py <room.glb> <venue_geometry.json> <out.f32> <size> <samples> <evening|day>

The GLB comes from the app (`?bake-export`, run by `npm run bake`): receivers named "R:..." carry
the light-map UVs as their second UV set; everything else is an occluder or, where it glows, an
emitter. Writes <size>x<size> RGB float32 irradiance, top row first, to <out.f32>.
Venue (x, up, z) maps to Blender (x, -z, up).
"""
import json
import math
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

GLB, VENUE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SIZE, SAMPLES, MODE = int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = False
sc.cycles.max_bounces = 6
sc.cycles.diffuse_bounces = 4
bpy.ops.import_scene.gltf(filepath=GLB)
V = json.load(open(VENUE))
B = lambda x, up, z: Vector((x, -z, up))
C = V["room"]["ceiling"]["value"]
W = V["room"]["width"]["value"]
D = V["room"]["depth"]["value"]

recv = [o for o in sc.objects if o.type == "MESH" and o.name.startswith("R:")]
bpy.ops.object.select_all(action="DESELECT")
for o in recv:
    o.select_set(True)
bpy.context.view_layer.objects.active = recv[0]
bpy.ops.object.join()
room = bpy.context.active_object
lightmap_uv = room.data.uv_layers[1].name
print("receivers joined", len(room.data.polygons), "faces;", round(time.time() - t0), "s")

warm = (1.0, 0.83, 0.64)


def add_light(name, kind, loc, watts, color=warm, radius=0.2, target=None, angle=None, blend=0.6):
    data = bpy.data.lights.new(name, kind)
    data.energy = watts
    data.color = color
    if kind in ("POINT", "SPOT"):
        data.shadow_soft_size = radius
    if kind == "SPOT":
        data.spot_size = math.radians(angle)
        data.spot_blend = blend
    obj = bpy.data.objects.new(name, data)
    sc.collection.objects.link(obj)
    obj.location = loc
    if target is not None:
        obj.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return data


sc.world = bpy.data.worlds.new(MODE)
sc.world.use_nodes = True
bg = sc.world.node_tree.nodes["Background"]
f = V["fixtures"]
if MODE == "evening":
    # The venue's own light (R06, R08, UV01): chandeliers, pendant drums, track washes on the brick,
    # the lit back bar; a faint night sky through the glass.
    bg.inputs["Color"].default_value = (0.05, 0.046, 0.042, 1)
    bg.inputs["Strength"].default_value = 1.0
    for c in f["chandeliers"]:
        if c["kind"] == "brassCluster":
            add_light("brass", "POINT", B(c["x"], (c["bottom"] + c["top"]) / 2, c["z"]), 1100, radius=1.0)
        else:
            add_light("cage", "POINT", B(c["x"], c["bottom"] + 0.6, c["z"]), 320, radius=0.6)
    for row in f["pendantRows"]:
        for i in range(row["count"]):
            x = row["x0"] + (row["x1"] - row["x0"]) * i / max(1, row["count"] - 1)
            add_light("drum", "SPOT", B(x, row["height"] - 0.3, row["z"]), 160, target=B(x, 0, row["z"]), angle=115, blend=1.0)
    for x0, x1 in ((0.4, 5.4), (11.0, 15.6)):
        wash = add_light("wash", "AREA", B((x0 + x1) / 2, C - 1.2, 1.6), 420, target=B((x0 + x1) / 2, 2.6, 0.0))
        wash.shape = "RECTANGLE"
        wash.size, wash.size_y = x1 - x0, 0.6
    bb = V["backBar"]["rect"]["value"]
    back = add_light("backbar", "AREA", B((bb[0] + bb[2]) / 2, 2.0, bb[3] + 0.15), 260, color=(1.0, 0.86, 0.68))
    back.shape = "RECTANGLE"
    back.size, back.size_y = bb[2] - bb[0], 1.6
    bpy.data.objects["backbar"].rotation_euler = (math.radians(-90), 0, 0)
else:
    # Daylight: soft sky through the garage doors and street windows, low sun from the terrace (west).
    bg.inputs["Color"].default_value = (0.62, 0.72, 0.9, 1)
    bg.inputs["Strength"].default_value = 3.0
    sun = add_light("sun", "SUN", B(-20, 14, D / 2 + 4), 3.5, color=(1.0, 0.95, 0.86), target=B(W / 2, 0, D / 2))
    sun.angle = math.radians(3)

# Emitters from the app (lit shelves, the kitchen, LED treads): a glTF emissive becomes emission.
img = bpy.data.images.new("lightmap", SIZE, SIZE, alpha=False, float_buffer=True)
for slot in room.material_slots:
    nt = slot.material.node_tree
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = img
    nt.nodes.active = node
bpy.ops.object.select_all(action="DESELECT")
room.select_set(True)
bpy.context.view_layer.objects.active = room
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, uv_layer=lightmap_uv, margin=2)
print("baked", MODE, round(time.time() - t0), "s")

# Denoise lightly: a masked blur that never mixes in empty texels (another island, or none).
px = np.array(img.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)[:, :, :3]
mask = (px.sum(axis=2) > 0).astype(np.float32)[:, :, None]
acc = np.zeros_like(px)
weight = np.zeros_like(mask)
for dy in (-1, 0, 1):
    for dx in (-1, 0, 1):
        w = 1.0 if (dx, dy) == (0, 0) else 0.6
        acc += w * np.roll(np.roll(px * mask, dy, 0), dx, 1)
        weight += w * np.roll(np.roll(mask, dy, 0), dx, 1)
px = np.where(mask > 0, acc / np.maximum(weight, 1e-6), px)
np.ascontiguousarray(px[::-1]).astype("<f4").tofile(OUT)
print("done", round(time.time() - t0), "s")
