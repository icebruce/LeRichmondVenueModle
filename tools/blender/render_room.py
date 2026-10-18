"""Bake the fixed room's evening light (direct + bounced) into one light map.

Usage: python bake_room.py <venue-export.glb> <venue_geometry.json> <out dir> <size> <samples>
Venue (x, up, z) maps to Blender (x, -z, up).
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

GLB, VENUE, OUT, SIZE, SAMPLES = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = SAMPLES
sc.cycles.max_bounces = 6
sc.cycles.diffuse_bounces = 6
sc.render.bake.margin = 6
bpy.ops.import_scene.gltf(filepath=GLB)
V = json.load(open(VENUE))
B = lambda x, up, z: Vector((x, -z, up))

recv = [o for o in sc.objects if o.type == "MESH" and o.name.startswith("R:")]
bpy.ops.object.select_all(action="DESELECT")
for o in recv:
    o.select_set(True)
bpy.context.view_layer.objects.active = recv[0]
bpy.ops.object.join()
room = bpy.context.active_object
room.name = "venue_baked"
uv_main = room.data.uv_layers[0].name
lm = room.data.uv_layers.new(name="lightmap")
room.data.uv_layers.active = lm
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.lightmap_pack(PREF_CONTEXT="ALL_FACES", PREF_PACK_IN_ONE=True, PREF_NEW_UVLAYER=False, PREF_BOX_DIV=12, PREF_MARGIN_DIV=0.3)
bpy.ops.object.mode_set(mode="OBJECT")
room.data.uv_layers[uv_main].active_render = True
print("unwrapped", round(time.time() - t0), "s")

# --- the venue's own evening light ------------------------------------------------------------
warm = (1.0, 0.83, 0.64)


def point(name, loc, watts, radius=0.15, color=warm):
    l = bpy.data.lights.new(name, "POINT")
    l.energy = watts
    l.color = color
    l.shadow_soft_size = radius
    o = bpy.data.objects.new(name, l)
    sc.collection.objects.link(o)
    o.location = loc


def spot(name, loc, target, watts, angle=60, color=warm, blend=0.6):
    l = bpy.data.lights.new(name, "SPOT")
    l.energy = watts
    l.color = color
    l.spot_size = math.radians(angle)
    l.spot_blend = blend
    l.shadow_soft_size = 0.6
    o = bpy.data.objects.new(name, l)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


for c in V["fixtures"]["chandeliers"]:
    if c["kind"] == "brassCluster":
        point("brass", B(c["x"], (c["bottom"] + c["top"]) / 2, c["z"]), 1100, 1.0)
    else:
        point("cage", B(c["x"], c["bottom"] + 0.6, c["z"]), 320, 0.6)
for row in V["fixtures"]["pendantRows"]:
    for i in range(row["count"]):
        x = row["x0"] + (row["x1"] - row["x0"]) * i / max(1, row["count"] - 1)
        spot("drum", B(x, row["height"] - 0.3, row["z"]), B(x, 0, row["z"]), 160, 115, blend=1.0)
C = V["room"]["ceiling"]["value"]
# Track spots washing the north brick and the paintings (R01, R06).
for x in (2.8, 13.3):
    spot("track", B(x, C - 0.6, 2.6), B(x, 3.0, 0.0), 300, 120, blend=1.0)
# Track lighting washing the north brick on both sides of the back bar (R06, R07): soft area washes.
for x0, x1 in ((0.4, 5.4), (11.0, 15.6)):
    wl = bpy.data.lights.new("wash", "AREA")
    wl.energy = 420
    wl.color = warm
    wl.shape = "RECTANGLE"
    wl.size, wl.size_y = x1 - x0, 0.6
    wo = bpy.data.objects.new("wash", wl)
    sc.collection.objects.link(wo)
    wo.location = B((x0 + x1) / 2, C - 1.2, 1.6)
    wo.rotation_euler = (Vector(B((x0 + x1) / 2, 2.6, 0.0)) - wo.location).to_track_quat("-Z", "Y").to_euler()
# Back bar: a soft warm source in front of the lit shelves (R02, R03, R14).
bb = V["backBar"]["rect"]["value"]
l = bpy.data.lights.new("backbar", "AREA")
l.energy = 260
l.color = (1.0, 0.86, 0.68)
l.shape = "RECTANGLE"
l.size, l.size_y = bb[2] - bb[0], 1.6
o = bpy.data.objects.new("backbar", l)
sc.collection.objects.link(o)
o.location = B((bb[0] + bb[2]) / 2, 2.0, bb[3] + 0.15)
o.rotation_euler = (math.radians(-90), 0, 0)
# Night outside: a faint cool sky through the glass.
sc.world = bpy.data.worlds.new("night")
sc.world.color = (0.05, 0.046, 0.042)

# --- direct render from the POC camera (no bake) ---------------------------------------------
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam)
cam.location = B(1.05, 1.7, 5.35)
cam.rotation_euler = (B(3.55, 0.85, 1.85) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.sensor_fit = "VERTICAL"; cam.data.angle = math.radians(50)
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 720, 450
sc.cycles.samples = 64
sc.render.filepath = os.path.join(OUT, "direct.png")
bpy.ops.render.render(write_still=True)
print("rendered", round(time.time() - t0), "s")
