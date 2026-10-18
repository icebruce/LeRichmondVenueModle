"""Meshy rigged man -> matte (minimal face kept), seated, simplified GLB for the POC.

Usage: python meshy_pose.py <rigged.glb> <out.glb> [standing]
Blender Z up, front = -Y. Seat top at z 0.50, seat centre at the origin.
"""
import math
import sys

import numpy as np

import bpy
import bmesh
from mathutils import Matrix, Vector

src, dst = sys.argv[1], sys.argv[2]
standing = len(sys.argv) > 3 and sys.argv[3] == "standing"
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=src)
for o in [o for o in sc.objects if o.name.startswith("Icosphere")]:
    bpy.data.objects.remove(o)
arm = next(o for o in sc.objects if o.type == "ARMATURE")
body = next(o for o in sc.objects if o.type == "MESH")
for o in sc.objects:
    o.animation_data_clear()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()

# --- matte materials ---------------------------------------------------------------------------
for m in body.data.materials:
    b = m.node_tree.nodes.get("Principled BSDF")
    for l in list(m.node_tree.links):
        if l.to_node == b and l.to_socket.name in ("Roughness", "Metallic"):
            m.node_tree.links.remove(l)
    b.inputs["Roughness"].default_value = 0.72
    b.inputs["Metallic"].default_value = 0.0

# --- skinning quality: keep volume at bends, smooth the hip/waist crease -------------------------
for md in body.modifiers:
    if md.type == "ARMATURE":
        md.use_deform_preserve_volume = True
gi = {g.name: g.index for g in body.vertex_groups}
fix = body.vertex_groups.new(name="fix")
zone = ("Hips", "LeftUpLeg", "RightUpLeg", "Spine02", "Spine01")
for v in body.data.vertices:
    w = max((g.weight for g in v.groups if body.vertex_groups[g.group].name in zone), default=0.0)
    if w > 0.05:
        fix.add([v.index], min(1.0, w * 1.5), "REPLACE")
cs = body.modifiers.new("cs", "CORRECTIVE_SMOOTH")
cs.vertex_group = "fix"
cs.iterations = 14
cs.factor = 0.7
cs.smooth_type = "LENGTH_WEIGHTED"
cs.rest_source = "ORCO"

# --- pose ----------------------------------------------------------------------------------------
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
P = arm.pose.bones


A = arm.matrix_world.to_3x3()
Ai = A.inverted()


def aim(name, d):
    bpy.context.view_layer.update()
    pb = P[name]
    cur = (A @ (pb.tail - pb.head)).normalized()
    q = cur.rotation_difference(Vector(d).normalized())
    r = (Ai @ q.to_matrix() @ A).to_4x4()
    t = Matrix.Translation(pb.head)
    pb.matrix = t @ r @ t.inverted() @ pb.matrix


def turn(name, axis_world, deg):
    bpy.context.view_layer.update()
    pb = P[name]
    r = (Ai @ Matrix.Rotation(math.radians(deg), 3, Vector(axis_world)) @ A).to_4x4()
    t = Matrix.Translation(pb.head)
    pb.matrix = t @ r @ t.inverted() @ pb.matrix


spine_low = next(c.name for c in P["Hips"].children if c.name.lower().startswith("spine"))
if not standing:
    # Pelvis tipped back a little and the spine brought upright again: the hips need less than 90°.
    turn("Hips", (1, 0, 0), 12)
    turn(spine_low, (1, 0, 0), -12)

for s, sg in (("Left", 1), ("Right", -1)):
    x = (A @ P[f"{s}Arm"].head).x
    sg = 1 if x > 0 else -1
    if standing:
        aim(f"{s}Arm", (sg * 0.12, 0.02, -1))
        aim(f"{s}ForeArm", (sg * 0.06, -0.12, -1))
        aim(f"{s}Hand", (sg * 0.03, -0.1, -1))
    else:
        aim(f"{s}UpLeg", (sg * 0.07, -1, -0.16))
        aim(f"{s}Leg", (sg * 0.02, 0.06, -1))
        aim(f"{s}Foot", (sg * 0.05, -1, -0.55))
        # Upper arms hang slightly forward; forearms rest toward the table edge.
        aim(f"{s}Arm", (sg * 0.15, -0.45, -0.88))
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.update()


def coords():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    m = body.matrix_world
    return np.array([(m @ v.co)[:] for v in ev.data.vertices])


def members(name, th=0.5):
    g = gi[name]
    return np.array([v.index for v in body.data.vertices if any(x.group == g and x.weight > th for x in v.groups)])


def seat_ref(C):
    hip = arm.matrix_world @ P["Hips"].head
    m = (np.abs(C[:, 1] - hip.y) < 0.13) & (np.abs(C[:, 0] - hip.x) < 0.2) & (C[:, 2] < hip.z)
    return C[m, 2].min(), C[m, 1].max()


def hand_frame(C, s):
    """Palm axis (wrist -> knuckles) and palm normal, read from the mesh (the rig's hand bone tail is unusable).
    Relaxed fingers curl toward the palm, which gives the normal its sign."""
    W = np.array(arm.matrix_world @ P[f"{s}Hand"].head)
    X = C[hand[s]]
    d = np.linalg.norm(X - W, axis=1)
    palm = X[(d > 0.25 * d.max()) & (d < 0.55 * d.max())]
    a = palm.mean(axis=0) - W
    a /= np.linalg.norm(a)
    Y = palm - palm.mean(axis=0)
    n = np.linalg.eigh(Y.T @ Y)[1][:, 0]
    n = n - a * (n @ a)
    n /= np.linalg.norm(n)
    if (X[d > 0.85 * d.max()].mean(axis=0) - palm.mean(axis=0)) @ n < 0:
        n = -n
    return W, a, n


def frame(a, n):
    a = Vector(a).normalized()
    n = (Vector(n) - a * Vector(n).dot(a)).normalized()
    return Matrix((a, n, a.cross(n))).transposed()


def rotate_about(name, pivot_bone, R):
    pb = P[name]
    r = (Ai @ R @ A).to_4x4()
    t = Matrix.Translation(P[pivot_bone].head)
    pb.matrix = t @ r @ t.inverted() @ pb.matrix


def place_hand(s, sg, pz, hz=-0.12):
    """Forearm forward at pitch pz, forearm rolled so the palm turns down, then the hand laid flat."""
    aim(f"{s}ForeArm", (-sg * 0.12, -1, float(pz)))
    bpy.context.view_layer.update()
    fa = P[f"{s}ForeArm"]
    ax = (A @ (fa.tail - fa.head)).normalized()
    _, a, n = hand_frame(coords(), s)
    down = Vector((0, 0, -1))
    n_p = (Vector(n) - ax * Vector(n).dot(ax)).normalized()
    d_p = (down - ax * down.dot(ax)).normalized()
    ang = math.atan2(ax.dot(n_p.cross(d_p)), n_p.dot(d_p))
    rotate_about(f"{s}ForeArm", f"{s}ForeArm", Matrix.Rotation(ang, 3, ax))
    twist.append(math.degrees(ang))
    bpy.context.view_layer.update()
    _, a, n = hand_frame(coords(), s)
    a1 = Vector((-sg * 0.1, -1, hz))
    R = frame(a1, down) @ frame(a, n).inverted()
    twist.append(math.degrees(R.to_quaternion().angle))
    rotate_about(f"{s}Hand", f"{s}Hand", R)


twist = []
if not standing:
    hand = {s: members(f"{s}Hand") for s in ("Left", "Right")}
    for s in ("Left", "Right"):
        sg = 1 if (A @ P[f"{s}Arm"].head).x > 0 else -1
        best = None
        rest = P[f"{s}ForeArm"].matrix_basis.copy(), P[f"{s}Hand"].matrix_basis.copy()
        for pz, tz in [(p, t) for p in np.linspace(-0.7, 0.2, 19) for t in (-0.05, -0.12, -0.2, -0.3)]:
            P[f"{s}ForeArm"].matrix_basis, P[f"{s}Hand"].matrix_basis = rest[0].copy(), rest[1].copy()
            place_hand(s, sg, pz, tz)
            C = coords()
            sz, by = seat_ref(C)
            hz = C[hand[s], 2].min() - sz + 0.50
            hy = C[hand[s], 1].mean() + (0.17 - by)
            err = abs(hz - 0.768) + (0 if hy < -0.41 else (hy + 0.41) * 2)
            if best is None or err < best[0]:
                best = (err, pz, hz, hy, tz)
        P[f"{s}ForeArm"].matrix_basis, P[f"{s}Hand"].matrix_basis = rest[0].copy(), rest[1].copy()
        twist = []
        place_hand(s, sg, best[1], best[4])
        _, a_, n_ = hand_frame(coords(), s)
        print("FRAME after", s, np.round(a_, 2), np.round(n_, 2))
        print("TWIST forearm roll / hand turn (deg)", [round(x) for x in twist])
        print("HAND", s, "pitch", round(float(best[1]), 2), "hand pitch", best[4], "hand bottom z", round(best[2], 3), "hand y", round(best[3], 3))
    bpy.ops.object.mode_set(mode="OBJECT")
for n in ("LeftUpLeg", "LeftLeg", "LeftArm", "LeftForeArm"):
    pb = P[n]
    print("DIR", n, tuple(round(x, 2) for x in (A @ (pb.tail - pb.head)).normalized()))
hip_w = arm.matrix_world @ P["Hips"].head
dg = bpy.context.evaluated_depsgraph_get()
posed = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
mesh = bpy.data.objects.new("guest", posed)
sc.collection.objects.link(mesh)
mesh.matrix_world = body.matrix_world
for o in (body, arm):
    bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Place: buttocks on the seat top (0.50) for the seated pose, feet on the floor when standing.
vs = [v.co for v in mesh.data.vertices]
if standing:
    dz = -min(v.z for v in vs)
    dy = -sum(v.y for v in vs) / len(vs)
else:
    # Buttocks: the body directly under the hip joint (the thighs run forward, out of this zone).
    under = [v for v in vs if abs(v.y - hip_w.y) < 0.13 and abs(v.x - hip_w.x) < 0.2 and v.z < hip_w.z]
    dz = 0.50 - min(v.z for v in under)
    dy = 0.17 - max(v.y for v in under)
for v in mesh.data.vertices:
    v.co.z += dz
    v.co.y += dy

md = mesh.modifiers.new("dec", "DECIMATE")
md.ratio = 0.55
bpy.ops.object.modifier_apply(modifier="dec")
for p in mesh.data.polygons:
    p.use_smooth = True
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True, export_image_format="JPEG", export_jpeg_quality=88)
print("exported", dst, len(mesh.data.polygons), "faces", "min z", min(v.co.z for v in mesh.data.vertices))
