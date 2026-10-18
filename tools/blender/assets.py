"""POC assets for Richmond Studio, built headless with Blender's Python module.

Blender: Z up, front = -Y (exports to glTF +Z). Metres. Each asset gets ambient occlusion and
colour baked into one albedo texture so its soft shading travels with it.
Usage: python assets.py <out_dir> <tex_dir> [asset ...]
"""
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

OUT = sys.argv[1]
TEX = sys.argv[2]
ONLY = set(sys.argv[3:])


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.render.bake.margin = 8
    sc.world = bpy.data.worlds.new("w")
    sc.world.color = (1, 1, 1)


def mat(name, color, rough=0.6, metal=0.0, sheen=0.0, sheen_tint=(1, 1, 1), emit=None, emit_strength=0.0, alpha=1.0, tex=None, tex_scale=1.0, tint=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Tint"].default_value = (*sheen_tint, 1)
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    if tex:
        img = bpy.data.images.load(os.path.join(TEX, tex))
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (tex_scale, tex_scale, tex_scale)
        nt.links.new(coord.outputs["Object"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        t.projection = "BOX"
        t.projection_blend = 0.3
        if tint:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            nt.links.new(t.outputs["Color"], mix.inputs["A"])
            mix.inputs["B"].default_value = (*tint, 1)
            nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
        else:
            nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    return m


def obj_from(op, **kw):
    op(**kw)
    return bpy.context.active_object


def add_mod(o, kind, **props):
    md = o.modifiers.new(kind.lower(), kind)
    for k, v in props.items():
        setattr(md, k, v)
    return md


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=md.name)


def assign(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)


def shade_smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def select_only(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def uv_unwrap(o):
    select_only(o)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.01, angle_limit=math.radians(60))
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_albedo(o, size=1024, rough=0.6, sheen=0.0, sheen_tint=(1, 1, 1), ao_floor=0.35, metal=0.0):
    """Bake AO and colour into one albedo image, then give the object a single baked material."""
    uv_unwrap(o)
    imgs = {}
    for kind in ("AO", "COL"):
        img = bpy.data.images.new(f"{o.name}_{kind}", size, size, alpha=False)
        imgs[kind] = img
    for kind, btype, extra in (("AO", "AO", {}), ("COL", "DIFFUSE", {"pass_filter": {"COLOR"}})):
        for slot in o.material_slots:
            nt = slot.material.node_tree
            n = nt.nodes.get("bake_target") or nt.nodes.new("ShaderNodeTexImage")
            n.name = "bake_target"
            n.image = imgs[kind]
            nt.nodes.active = n
        select_only(o)
        bpy.ops.object.bake(type=btype, **extra)
    px = lambda img: np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    ao = px(imgs["AO"])[:, :1]
    col = px(imgs["COL"])
    out = col.copy()
    out[:, :3] = col[:, :3] * (ao_floor + (1 - ao_floor) * ao)
    final = bpy.data.images.new(f"{o.name}_albedo", size, size, alpha=False)
    final.pixels[:] = out.ravel()
    final.file_format = "JPEG"
    final.filepath_raw = os.path.join(OUT, f"{o.name}_albedo.jpg")
    final.save()
    m = bpy.data.materials.new(f"{o.name}_baked")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = final
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Tint"].default_value = (*sheen_tint, 1)
    o.data.materials.clear()
    o.data.materials.append(m)


def bake_high_low(hi, lo, size=1024, rough=0.6, sheen=0.0, sheen_tint=(1, 1, 1), ao_floor=0.35):
    """`lo` (a simpler build of the same piece) gets colour, occlusion and surface detail baked from `hi`."""
    uv_unwrap(lo)
    imgs = {k: bpy.data.images.new(f"{lo.name}_{k}", size, size, alpha=False) for k in ("AO", "COL", "NRM")}
    if True:
        imgs["NRM"].colorspace_settings.name = "Non-Color"
    sc = bpy.context.scene
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = 0.012
    for kind, btype, extra in (("AO", "AO", {}), ("COL", "DIFFUSE", {"pass_filter": {"COLOR"}})):
        for slot in lo.material_slots:
            nt = slot.material.node_tree
            n = nt.nodes.get("bake_target") or nt.nodes.new("ShaderNodeTexImage")
            n.name = "bake_target"
            n.image = imgs[kind]
            nt.nodes.active = n
        bpy.ops.object.select_all(action="DESELECT")
        hi.select_set(True)
        lo.select_set(True)
        bpy.context.view_layer.objects.active = lo
        bpy.ops.object.bake(type=btype, **extra)
    sc.render.bake.use_selected_to_active = False
    px = lambda img: np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    ao = px(imgs["AO"])[:, :1]
    out = px(imgs["COL"]).copy()
    out[:, :3] *= ao_floor + (1 - ao_floor) * ao
    final = bpy.data.images.new(f"{lo.name}_albedo", size, size, alpha=False)
    final.pixels[:] = out.ravel()
    final.file_format = "JPEG"
    final.filepath_raw = os.path.join(OUT, f"{lo.name}_albedo.jpg")
    final.save()
    nrm = bpy.data.images.new(f"{lo.name}_normal", size, size, alpha=False)
    nrm.pixels[:] = px(imgs["NRM"]).ravel()
    nrm.colorspace_settings.name = "Non-Color"
    nrm.file_format = "PNG"
    nrm.filepath_raw = os.path.join(OUT, f"{lo.name}_normal.png")
    nrm.save()
    m = bpy.data.materials.new(f"{lo.name}_baked")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = final
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = nrm
    nm = nt.nodes.new("ShaderNodeNormalMap")
    # Normal map bake comes out empty in this build; left unlinked until fixed (POC).
    b.inputs["Roughness"].default_value = rough
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Tint"].default_value = (*sheen_tint, 1)
    lo.data.materials.clear()
    lo.data.materials.append(m)
    bpy.data.objects.remove(hi)
    return lo


def export(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{name}.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_image_format="JPEG",
        export_jpeg_quality=88,
    )
    tris = sum(len(o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.loop_triangles) for o in objs if o.type == "MESH")
    print(f"exported {name}: {tris} tris")


def rounded_box(size, loc, bevel=0.01, segs=3, name="box"):
    o = obj_from(bpy.ops.mesh.primitive_cube_add, size=1, location=loc)
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    add_mod(o, "BEVEL", width=bevel, segments=segs, limit_method="NONE")
    o.name = name
    return o


def cyl(r1, r2, h, loc, verts=24, name="cyl", rot=(0, 0, 0)):
    o = obj_from(bpy.ops.mesh.primitive_cone_add, vertices=verts, radius1=r1, radius2=r2, depth=h, location=loc, rotation=rot)
    o.name = name
    return o


def ellipsoid(size, loc, name="ell", segs=24):
    o = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, segments=segs, ring_count=segs // 2, radius=1, location=loc)
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    shade_smooth(o)
    o.name = name
    return o


def lathe(profile, name, segs=48):
    """Revolve a (r, z) profile around Z."""
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for i in range(segs):
        r0, r1 = rings[i], rings[(i + 1) % segs]
        for j in range(len(profile) - 1):
            bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    shade_smooth(o)
    return o


# ---------------------------------------------------------------- chair
def chair_parts(low, wood, velvet):
    LS = 10 if low else 48
    TS = (28, 6) if low else (64, 12)
    CV = 24 if low else 64
    SUB = 1 if low else 2
    parts_w, parts_v = [], []
    seat_z = 0.43
    # Seat cushion, slightly wider at the front.
    c = obj_from(bpy.ops.mesh.primitive_cube_add, size=1, location=(0, 0, seat_z + 0.035))
    c.scale = (0.45, 0.43, 0.075)
    bpy.ops.object.transform_apply(scale=True)
    for v in c.data.vertices:
        if v.co.y < 0:
            v.co.x *= 1.07
        if v.co.z > 0:
            v.co.x *= 0.97
            v.co.y *= 0.97
    add_mod(c, "BEVEL", width=0.025, segments=2 if low else 3)
    add_mod(c, "SUBSURF", levels=SUB, render_levels=SUB)
    shade_smooth(c)
    parts_v.append(c)
    # Seat rail.
    for x0, y0, sx, sy in ((0, -0.225, 0.52, 0.05), (0, 0.215, 0.46, 0.05), (0.245, 0, 0.05, 0.44), (-0.245, 0, 0.05, 0.44)):
        parts_w.append(rounded_box((sx, sy, 0.065), (x0, y0, seat_z - 0.01), bevel=0.012, name="rail"))
    # Turned legs: front straight and tapered, back splayed.
    for sx in (-1, 1):
        f = lathe([(0.0, 0.0), (0.016, 0.0), (0.018, 0.03), (0.016, 0.06), (0.022, 0.30), (0.026, 0.36), (0.03, 0.38), (0.026, 0.40), (0.0, 0.40)], "leg", LS)
        f.location = (sx * 0.235, -0.215, 0)
        parts_w.append(f)
        b = lathe([(0.0, 0.0), (0.015, 0.0), (0.019, 0.1), (0.022, 0.43), (0.0, 0.43)], "legb", LS)
        for v in b.data.vertices:
            v.co.y += max(0.0, 0.25 - v.co.z) * 0.16
        b.location = (sx * 0.22, 0.212, 0)
        parts_w.append(b)
    # Oval back: a wood ring with a padded panel, tilted back.
    tilt = math.radians(10)
    cz, cy = 0.745, 0.255
    ring = obj_from(bpy.ops.mesh.primitive_torus_add, major_radius=0.2, minor_radius=0.017, major_segments=TS[0], minor_segments=TS[1], location=(0, 0, 0))
    ring.scale = (1.0, 1.28, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    ring.rotation_euler = (math.pi / 2 - tilt, 0, 0)
    ring.location = (0, cy, cz)
    shade_smooth(ring)
    parts_w.append(ring)
    pad = obj_from(bpy.ops.mesh.primitive_cylinder_add, vertices=CV, radius=0.19, depth=0.04, location=(0, 0, 0))
    pad.scale = (1.0, 1.28, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    add_mod(pad, "BEVEL", width=0.018, segments=2 if low else 4)
    if not low:
        add_mod(pad, "SUBSURF", levels=1, render_levels=1)
    pad.rotation_euler = (math.pi / 2 - tilt, 0, 0)
    pad.location = (0, cy + 0.005, cz)
    shade_smooth(pad)
    parts_v.append(pad)
    # Posts joining the back legs to the oval.
    for sx in (-1, 1):
        p = cyl(0.017, 0.015, 0.11, (sx * 0.085, 0.226, 0.475), verts=8 if low else 24, name="post", rot=(math.radians(-6), 0, 0))
        shade_smooth(p)
        parts_w.append(p)
    for o in parts_w:
        assign(o, wood)
    for o in parts_v:
        assign(o, velvet)
    for o in parts_w + parts_v:
        apply_all(o)
    sfx = "_low" if low else "_hi"
    return join(parts_w, "chair_wood" + sfx), join(parts_v, "chair_velvet" + sfx)


def chair():
    reset()
    wood = mat("wood", (0.72, 0.66, 0.58), rough=0.7, tex="grey_oak_veneer_01_diff_1k.jpg", tex_scale=2.0, tint=(0.92, 0.9, 0.88))
    velvet = mat("velvet", (0.3, 0.3, 0.3), rough=0.85, sheen=0.6, sheen_tint=(0.85, 0.85, 0.85))
    hw, hv = chair_parts(False, wood, velvet)
    lw, lv = chair_parts(True, wood, velvet)
    lw = bake_high_low(hw, lw, 1024, rough=0.65)
    lv = bake_high_low(hv, lv, 1024, rough=0.85, sheen=0.7, sheen_tint=(0.9, 0.9, 0.9))
    lw.name, lv.name = "chair_wood", "chair_velvet"
    export([lw, lv], "chair-oval")


# ---------------------------------------------------------------- seated guest
def skin_body(points, edges, radii, name):
    me = bpy.data.meshes.new(name)
    me.from_pydata(points, edges, [])
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    select_only(o)
    add_mod(o, "SKIN")
    sk = o.data.skin_vertices[0].data
    for i, r in enumerate(radii):
        sk[i].radius = r
    sk[0].use_root = True
    add_mod(o, "SUBSURF", levels=2, render_levels=2)
    shade_smooth(o)
    return o


def guest_seated():
    reset()
    suit = mat("suit", (0.11, 0.12, 0.135), rough=0.75)
    skin = mat("skin", (0.80, 0.62, 0.50), rough=0.55)
    hair = mat("hair", (0.16, 0.10, 0.07), rough=0.6)
    shirt = mat("shirt", (0.93, 0.92, 0.89), rough=0.7)
    shoe = mat("shoe", (0.03, 0.03, 0.03), rough=0.35)
    P = [
        (0, 0.06, 0.53),  # 0 pelvis
        (0, 0.07, 0.72),  # 1 waist
        (0, 0.06, 0.90),  # 2 chest
        (0, 0.05, 1.02),  # 3 neck base
        (0.19, 0.06, 0.99),  # 4 shoulder L
        (0.24, -0.10, 0.82),  # 5 elbow L
        (0.14, -0.36, 0.835),  # 6 wrist L
        (-0.19, 0.06, 0.99),  # 7 shoulder R
        (-0.24, -0.10, 0.82),  # 8 elbow R
        (-0.14, -0.36, 0.835),  # 9 wrist R
        (0.10, 0.05, 0.50),  # 10 hip L
        (0.11, -0.38, 0.52),  # 11 knee L
        (0.11, -0.43, 0.08),  # 12 ankle L
        (-0.10, 0.05, 0.50),  # 13 hip R
        (-0.11, -0.38, 0.52),  # 14 knee R
        (-0.11, -0.43, 0.08),  # 15 ankle R
    ]
    E = [(0, 1), (1, 2), (2, 3), (2, 4), (4, 5), (5, 6), (2, 7), (7, 8), (8, 9), (0, 10), (10, 11), (11, 12), (0, 13), (13, 14), (14, 15)]
    R = [
        (0.165, 0.12), (0.14, 0.1), (0.165, 0.11), (0.06, 0.055),
        (0.062, 0.06), (0.05, 0.05), (0.036, 0.034),
        (0.062, 0.06), (0.05, 0.05), (0.036, 0.034),
        (0.088, 0.088), (0.062, 0.062), (0.045, 0.045),
        (0.088, 0.088), (0.062, 0.062), (0.045, 0.045),
    ]
    body = skin_body(P, E, R, "body")
    assign(body, suit)
    apply_all(body)
    parts = [body]
    neck = cyl(0.042, 0.038, 0.12, (0, 0.045, 1.07), name="neck")
    shade_smooth(neck)
    assign(neck, skin)
    head = ellipsoid((0.083, 0.098, 0.112), (0, 0.035, 1.205), "head", 32)
    assign(head, skin)
    hr = ellipsoid((0.089, 0.104, 0.085), (0, 0.048, 1.245), "hair", 32)
    bm = bmesh.new()
    bm.from_mesh(hr.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0.0, -0.004), plane_no=Vector((0, -0.75, -1)).normalized(), clear_outer=True)
    bm.to_mesh(hr.data)
    bm.free()
    add_mod(hr, "SOLIDIFY", thickness=0.012)
    assign(hr, hair)
    parts += [neck, head, hr]
    # Shirt and collar in the jacket's V.
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((-0.055, -0.052, 1.035), (0.055, -0.052, 1.035), (0, -0.098, 0.86))]
    bm.faces.new(vs)
    me = bpy.data.meshes.new("shirt")
    bm.to_mesh(me)
    bm.free()
    sh = bpy.data.objects.new("shirt", me)
    bpy.context.collection.objects.link(sh)
    add_mod(sh, "SOLIDIFY", thickness=0.01)
    assign(sh, shirt)
    col = obj_from(bpy.ops.mesh.primitive_torus_add, major_radius=0.047, minor_radius=0.012, location=(0, 0.04, 1.04))
    col.scale = (1, 1.05, 0.9)
    shade_smooth(col)
    assign(col, shirt)
    parts += [sh, col]
    # Hands resting on the table edge, and shoes.
    for sx in (-1, 1):
        h = ellipsoid((0.03, 0.055, 0.018), (sx * 0.13, -0.405, 0.83), "hand")
        h.rotation_euler = (0, 0, math.radians(sx * -12))
        assign(h, skin)
        s = ellipsoid((0.045, 0.12, 0.04), (sx * 0.11, -0.48, 0.04), "shoe")
        assign(s, shoe)
        parts += [h, s]
    for o in parts:
        apply_all(o)
    g = join(parts, "guest_seated")
    bake_albedo(g, 1024, rough=0.7, ao_floor=0.4)
    export([g], "guest-seated")


# ---------------------------------------------------------------- cloth
def cloth(length=1.8, width=0.9, top=0.765):
    reset()
    table = obj_from(bpy.ops.mesh.primitive_cube_add, size=1, location=(0, 0, top - 0.02))
    table.scale = (length, width, 0.04)
    bpy.ops.object.transform_apply(scale=True)
    add_mod(table, "COLLISION")
    table.collision.thickness_outer = 0.006
    table.collision.cloth_friction = 20
    floor = obj_from(bpy.ops.mesh.primitive_plane_add, size=10, location=(0, 0, 0))
    add_mod(floor, "COLLISION")
    drop = top - 0.03
    cl = obj_from(bpy.ops.mesh.primitive_grid_add, x_subdivisions=int((length + 2 * drop) / 0.022), y_subdivisions=int((width + 2 * drop) / 0.022), size=1, location=(0, 0, top + 0.004))
    cl.scale = (length + 2 * drop, width + 2 * drop, 1)
    bpy.ops.object.transform_apply(scale=True)
    # Rounded corners (event linens): the hem then hangs evenly and floats just above the floor.
    bm = bmesh.new()
    bm.from_mesh(cl.data)
    hx, hy = length / 2, width / 2
    out = []
    for v in bm.verts:
        dx = max(0.0, abs(v.co.x) - hx)
        dy = max(0.0, abs(v.co.y) - hy)
        if math.hypot(dx, dy) > drop:
            out.append(v)
    bmesh.ops.delete(bm, geom=out, context="VERTS")
    bm.to_mesh(cl.data)
    bm.free()
    pin = cl.vertex_groups.new(name="pin")
    pin.add([v.index for v in cl.data.vertices if abs(v.co.x) < length / 2 - 0.04 and abs(v.co.y) < width / 2 - 0.04], 1.0, "REPLACE")
    md = add_mod(cl, "CLOTH")
    s = md.settings
    s.vertex_group_mass = "pin"
    s.quality = 8
    s.mass = 0.25
    s.tension_stiffness = 40
    s.compression_stiffness = 40
    s.shear_stiffness = 20
    s.bending_stiffness = 0.6
    md.collision_settings.distance_min = 0.004
    md.collision_settings.use_self_collision = False
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, 90
    md.point_cache.frame_end = 90
    for f in range(1, 91):
        sc.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(cl.evaluated_get(dg))
    out = bpy.data.objects.new("cloth", me)
    bpy.context.collection.objects.link(out)
    for o in (cl, table, floor):
        bpy.data.objects.remove(o)
    shade_smooth(out)
    add_mod(out, "SMOOTH", factor=0.5, iterations=3)
    add_mod(out, "SUBSURF", levels=1, render_levels=1)
    linen = mat("linen", (0.93, 0.9, 0.84), rough=0.9)
    assign(out, linen)
    apply_all(out)
    # Hidden table so the occlusion bake shades the folds against it.
    t2 = obj_from(bpy.ops.mesh.primitive_cube_add, size=1, location=(0, 0, top / 2))
    t2.scale = (length - 0.02, width - 0.02, top - 0.01)
    bake_albedo(out, 2048, rough=0.92, sheen=0.25, sheen_tint=(1, 1, 1), ao_floor=0.45)
    bpy.data.objects.remove(t2)
    export([out], f"cloth-{int(length * 100)}x{int(width * 100)}")


# ---------------------------------------------------------------- table pieces
def lamp():
    reset()
    gold = mat("gold", (0.83, 0.66, 0.36), rough=0.32, metal=1.0)
    diff = mat("diffuser", (1, 0.95, 0.85), rough=0.4, emit=(1.0, 0.82, 0.55), emit_strength=6.0)
    base = lathe([(0, 0), (0.043, 0), (0.046, 0.004), (0.046, 0.096), (0.043, 0.1), (0.008, 0.1), (0.006, 0.102), (0, 0.102)], "lampbase")
    stem = lathe([(0, 0.1), (0.0065, 0.1), (0.0065, 0.272), (0, 0.272)], "stem", 16)
    shade = lathe([(0, 0.276), (0.052, 0.276), (0.056, 0.28), (0.056, 0.292), (0.052, 0.298), (0, 0.3)], "shade")
    under = lathe([(0, 0.2765), (0.044, 0.2765)], "under")
    for o in (base, stem, shade):
        assign(o, gold)
    assign(under, diff)
    g = join([base, stem, shade], "lamp_gold")
    export([g, under], "lamp")


def setting():
    reset()
    gold = mat("gold", (0.8, 0.64, 0.36), rough=0.3, metal=1.0)
    china = mat("china", (0.95, 0.94, 0.92), rough=0.18)
    napkin = mat("napkin", (0.9, 0.87, 0.8), rough=0.9)
    glass = mat("glass", (0.95, 0.97, 1.0), rough=0.05, alpha=0.18)
    silver = mat("silver", (0.85, 0.85, 0.85), rough=0.2, metal=1.0)
    ch = lathe([(0, 0.0), (0.155, 0.0), (0.165, 0.008), (0.163, 0.012), (0.13, 0.006), (0, 0.006)], "charger", 64)
    assign(ch, gold)
    pl = lathe([(0, 0.008), (0.06, 0.008), (0.065, 0.012), (0.1, 0.014), (0.13, 0.024), (0.133, 0.027), (0.128, 0.026), (0.098, 0.017), (0, 0.016)], "plate", 64)
    assign(pl, china)
    nk = rounded_box((0.11, 0.2, 0.018), (0, 0, 0.03), bevel=0.008, segs=3, name="napkin")
    assign(nk, napkin)
    parts = [ch, pl, nk]
    for x, z0, rcup, hcup, stem in ((0.13, 0.0, 0.042, 0.11, 0.1), (0.21, 0.0, 0.035, 0.1, 0.0)):
        prof = [(0, z0), (0.035, z0), (0.036, z0 + 0.003), (0.004, z0 + 0.006)]
        if stem:
            prof += [(0.004, z0 + stem)]
        base_z = z0 + (stem or 0.006)
        prof += [(rcup * 0.6, base_z + 0.01), (rcup, base_z + hcup * 0.45), (rcup * 0.9, base_z + hcup), (rcup * 0.88, base_z + hcup), (rcup * 0.98, base_z + hcup * 0.45), (0, base_z + 0.012)]
        gl = lathe(prof, "glass", 32)
        gl.location = (x, -0.17, 0)
        assign(gl, glass)
        parts.append(gl)
    for x, l in ((-0.19, 0.2), (0.19, 0.22)):
        cu = rounded_box((0.016, l, 0.006), (x, 0, 0.004), bevel=0.002, segs=2, name="cutlery")
        assign(cu, silver)
        parts.append(cu)
    for o in parts:
        apply_all(o)
    export(parts, "setting")


def rose_head(r=0.035, petals=16, name="rose"):
    objs = []
    for i in range(petals):
        p = ellipsoid((1, 1, 1), (0, 0, 0), "petal", 16)
        bm = bmesh.new()
        bm.from_mesh(p.data)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(1, 0, 0), clear_inner=True)
        bm.to_mesh(p.data)
        bm.free()
        k = 0.45 + 0.55 * i / petals
        p.scale = (0.35 * r, 0.9 * r * k, 0.8 * r * k)
        p.rotation_euler = (0, math.radians(-25 - 35 * i / petals), math.radians(i * 137.5))
        p.location = (math.cos(math.radians(i * 137.5)) * r * 0.22 * k, math.sin(math.radians(i * 137.5)) * r * 0.22 * k, r * 0.15 * (1 - k))
        add_mod(p, "SOLIDIFY", thickness=0.002)
        apply_all(p)
        objs.append(p)
    return join(objs, name)


def roses():
    reset()
    bloom = mat("bloom", (0.95, 0.86, 0.82), rough=0.7, sheen=0.4)
    leaf = mat("leaf", (0.36, 0.45, 0.38), rough=0.6)
    gold = mat("gold", (0.8, 0.64, 0.36), rough=0.3, metal=1.0)
    bowl = lathe([(0, 0), (0.05, 0), (0.05, 0.01), (0.012, 0.02), (0.012, 0.06), (0.08, 0.1), (0.085, 0.104), (0.08, 0.106), (0, 0.07)], "compote", 48)
    assign(bowl, gold)
    parts = [bowl]
    pts = [(0, 0, 0.15), (0.06, 0.02, 0.13), (-0.055, 0.03, 0.13), (0.02, -0.06, 0.13), (-0.03, -0.05, 0.125), (0.045, 0.06, 0.12), (-0.02, 0.07, 0.12)]
    for i, (x, y, z) in enumerate(pts):
        h = rose_head(0.034 if i else 0.04, 16, "rose")
        h.location = (x, y, z)
        h.rotation_euler = (math.atan2(-y, 0.2) * 0.8, math.atan2(x, 0.2) * 0.8, i)
        assign(h, bloom)
        parts.append(h)
    for i in range(14):
        a = i * 2 * math.pi / 14
        lf = ellipsoid((0.016, 0.045, 0.004), (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.105 + 0.01 * (i % 3)), "leaf", 12)
        lf.rotation_euler = (math.radians(20), 0, a - math.pi / 2)
        assign(lf, leaf)
        parts.append(lf)
    for o in parts:
        apply_all(o)
    rs = [o for o in parts if o.name.startswith("rose")]
    ls = [o for o in parts if o.name.startswith("leaf")]
    b = join(rs, "roses")
    l = join(ls, "leaves")
    export([bowl, b, l], "roses")


def candles():
    reset()
    wax = mat("wax", (0.95, 0.92, 0.85), rough=0.45, emit=(1.0, 0.7, 0.4), emit_strength=0.15)
    flame = mat("flame", (1, 0.8, 0.5), emit=(1.0, 0.72, 0.38), emit_strength=25.0)
    parts = []
    for x, h in ((-0.06, 0.15), (0.05, 0.22), (0.0, 0.1)):
        c = lathe([(0, 0), (0.035, 0), (0.036, h - 0.006), (0.031, h), (0.006, h - 0.004), (0, h - 0.002)], "pillar", 32)
        c.location = (x, 0.02 if x else -0.05, 0)
        assign(c, wax)
        f = ellipsoid((0.006, 0.006, 0.016), (x, 0.02 if x else -0.05, h + 0.012), "flame", 12)
        assign(f, flame)
        parts += [c, f]
    for o in parts:
        apply_all(o)
    ws = [o for o in parts if o.name.startswith("pillar")]
    fs = [o for o in parts if o.name.startswith("flame")]
    export([join(ws, "wax"), join(fs, "flames")], "candles")


for name, fn in (("chair", chair), ("guest", guest_seated), ("cloth", cloth), ("lamp", lamp), ("setting", setting), ("roses", roses), ("candles", candles)):
    if not ONLY or name in ONLY:
        fn()
