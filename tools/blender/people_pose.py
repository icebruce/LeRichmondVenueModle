"""A Meshy motion-capture clip frozen into one guest pose, placed for the app (visual stage V7).

venv/bin/python people_pose.py <animated.glb> <out.glb> pose=lap|table|standing|glass [frame=N] [seat=0.446]

- Freezes the clip at `frame` (motion-captured posture: the body is never posed by hand), welds the
  mesh along its UV seams (Meshy splits it there) and levels the head.
- `table`: forearms forward and hands laid palm-down on the table top (0.75 m), the hand found from
  the mesh's own palm (the rig's hand bones are unusable); only shoulders, elbows and wrists move.
- `glass`: a wine glass in the raised hand, as its own closed mesh named `glass`.
- Seated poses: hip joints 10 cm above the seat top `seat`, 7 cm behind the chair's place (the
  app's chair origin); standing: feet on the floor, hips over the origin. The app faces +z
  (Blender -y), the table edge 0.32 m ahead of the chair's place.
- Writes the posed, still textured mesh; `people_rebuild.py` makes the app's clean versions.
"""
import math
import sys

import bpy
import bmesh  # after bpy, which provides it
import numpy as np
from mathutils import Matrix, Vector

src, dst = sys.argv[1], sys.argv[2]
opts = dict(a.split("=", 1) for a in sys.argv[3:])
pose = opts["pose"]
frame = int(opts.get("frame", "0"))
seat = float(opts.get("seat", "0.446"))
seated = pose in ("lap", "table")
TABLE_TOP = 0.75

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=src)
for o in [o for o in sc.objects if o.name.startswith("Icosphere")]:
    bpy.data.objects.remove(o)
arm = next(o for o in sc.objects if o.type == "ARMATURE")
body = next(o for o in sc.objects if o.type == "MESH")
bm = bmesh.new()
bm.from_mesh(body.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(body.data)
bm.free()

# The clip's frame becomes the rest of the pose; the animation itself is dropped.
sc.frame_set(frame)
base = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
for o in sc.objects:
    o.animation_data_clear()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
# The palms face up in Meshy's rest pose (both characters): each palm's normal is taken there, in
# its hand bone's space, and carried into the pose by the bone (the hand mesh alone cannot tell the
# palm from the back of the hand).
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
_ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
_rest = np.array([(body.matrix_world @ v.co)[:] for v in _ev.data.vertices])
palm_local = {}
for s in ("Left", "Right"):
    g = body.vertex_groups[f"{s}Hand"].index
    X = _rest[[v.index for v in body.data.vertices if any(x.group == g and x.weight > 0.5 for x in v.groups)]]
    Y = X - X.mean(axis=0)
    n = np.linalg.eigh(Y.T @ Y)[1][:, 0]
    n = n if n[2] > 0 else -n
    R = (arm.matrix_world @ arm.pose.bones[f"{s}Hand"].matrix).to_3x3().normalized()
    palm_local[s] = R.inverted() @ Vector(n)
for pb in arm.pose.bones:
    pb.matrix_basis = base[pb.name]
# Standing: collarbones at rest (the clips raise them, which puffs the jacket's shoulders). Seated
# poses keep the clip's, which the hands in the lap and the reach to the table depend on.
if not seated:
    for name in ("LeftShoulder", "RightShoulder"):
        arm.pose.bones[name].matrix_basis = Matrix.Identity(4)
for md in body.modifiers:
    if md.type == "ARMATURE":
        md.use_deform_preserve_volume = True
bpy.context.view_layer.update()

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
P = arm.pose.bones
# The armature carries a rotation and a 0.01 scale: world directions go through A.
A = arm.matrix_world.to_3x3()
Ai = A.inverted()


def world(v):
    return arm.matrix_world @ v


def rotate_about(name, R):
    pb = P[name]
    r = (Ai @ R @ A).to_4x4()
    t = Matrix.Translation(pb.head)
    pb.matrix = t @ r @ t.inverted() @ pb.matrix
    bpy.context.view_layer.update()


def aim(name, d):
    bpy.context.view_layer.update()
    pb = P[name]
    cur = (A @ (pb.tail - pb.head)).normalized()
    rotate_about(name, cur.rotation_difference(Vector(d).normalized()).to_matrix())


def coords():
    bpy.context.view_layer.update()
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = body.matrix_world
    return np.array([(m @ v.co)[:] for v in ev.data.vertices])


gi = {g.name: g.index for g in body.vertex_groups}


def members(name, th=0.5):
    g = gi[name]
    return np.array([v.index for v in body.data.vertices if any(x.group == g and x.weight > th for x in v.groups)])


# Head level, looking ahead: the recorded poses look down.
head_dir = (A @ (P["Head"].tail - P["Head"].head)).normalized()
aim("Head", (head_dir.x * 0.3, 0.0, 1.0))


def offset():
    """World offset that places the figure: hip joints over the seat, or hips over the origin with feet down."""
    lj = (world(P["LeftUpLeg"].head) + world(P["RightUpLeg"].head)) / 2
    if seated:
        return Vector((-lj.x, 0.07 - lj.y, seat + 0.10 - lj.z))
    return Vector((-lj.x, -lj.y, -coords()[:, 2].min()))


hand = {s: members(f"{s}Hand") for s in ("Left", "Right")}


def hand_frame(C, s):
    """Palm axis (wrist to knuckles) from the mesh and palm normal from the rest pose (`palm_local`)."""
    W = np.array(world(P[f"{s}Hand"].head))
    X = C[hand[s]]
    d = np.linalg.norm(X - W, axis=1)
    palm = X[(d > 0.25 * d.max()) & (d < 0.55 * d.max())]
    a = palm.mean(axis=0) - W
    a /= np.linalg.norm(a)
    n = np.array((arm.matrix_world @ P[f"{s}Hand"].matrix).to_3x3().normalized() @ palm_local[s])
    n = n - a * (n @ a)
    n /= np.linalg.norm(n)
    return W, a, n


def basis(a, n):
    a = Vector(a).normalized()
    n = (Vector(n) - a * Vector(n).dot(a)).normalized()
    return Matrix((a, n, a.cross(n))).transposed()


def place_hand(s, sg, pitch, hand_pitch):
    """Forearm forward at `pitch`, rolled so the palm turns down, then the hand laid flat."""
    aim(f"{s}ForeArm", (-sg * 0.12, -1, pitch))
    fa = P[f"{s}ForeArm"]
    ax = (A @ (fa.tail - fa.head)).normalized()
    _, a, n = hand_frame(coords(), s)
    down = Vector((0, 0, -1))
    n_p = (Vector(n) - ax * Vector(n).dot(ax)).normalized()
    d_p = (down - ax * down.dot(ax)).normalized()
    rotate_about(f"{s}ForeArm", Matrix.Rotation(math.atan2(ax.dot(n_p.cross(d_p)), n_p.dot(d_p)), 3, ax))
    _, a, n = hand_frame(coords(), s)
    rotate_about(f"{s}Hand", basis((-sg * 0.1, -1, hand_pitch), down) @ basis(a, n).inverted())


if pose == "table":
    for s in ("Left", "Right"):
        sg = 1 if world(P[f"{s}Arm"].head).x > 0 else -1
        # Upper arm hanging forward; the reach, forearm and hand pitch that rest the palm on the top.
        rest = [P[f"{s}{b}"].matrix_basis.copy() for b in ("Arm", "ForeArm", "Hand")]
        best = None
        for reach in (-0.2, -0.32, -0.45, -0.6):
            for pitch in np.linspace(-0.7, 0.2, 19):
                for hp in (-0.05, -0.12, -0.2, -0.3):
                    for b, m in zip(("Arm", "ForeArm", "Hand"), rest):
                        P[f"{s}{b}"].matrix_basis = m.copy()
                    aim(f"{s}Arm", (sg * 0.15, reach, -0.94))
                    place_hand(s, sg, float(pitch), hp)
                    C = coords()
                    o = offset()
                    hz = C[hand[s], 2].min() + o.z
                    hy = C[hand[s], 1].mean() + o.y
                    # On the top, 3-10 cm in from its edge (0.32 m ahead, Blender -y), elbows bent rather
                    # than arms stretched.
                    err = (abs(hz - (TABLE_TOP + 0.01)) + max(0, hy + 0.35) * 2 + max(0, -0.42 - hy) * 2
                           + 0.05 * abs(reach))
                    if best is None or err < best[0]:
                        best = (err, reach, float(pitch), hp, round(hz, 3), round(hy, 3))
        for b, m in zip(("Arm", "ForeArm", "Hand"), rest):
            P[f"{s}{b}"].matrix_basis = m.copy()
        aim(f"{s}Arm", (sg * 0.15, best[1], -0.94))
        place_hand(s, sg, best[2], best[3])
        print("hand", s, "error", round(best[0], 3), "reach", best[1], "pitch", round(best[2], 2), "hand z", best[4], "hand y", best[5])

def hang(s):
    """A free arm hanging relaxed by the side, the palm turned toward the thigh."""
    sg = 1 if world(P[f"{s}Arm"].head).x > 0 else -1
    aim(f"{s}Arm", (sg * 0.1, 0.02, -1))
    aim(f"{s}ForeArm", (sg * 0.04, -0.1, -1))
    _, a, n = hand_frame(coords(), s)
    rotate_about(f"{s}Hand", basis((sg * 0.02, -0.06, -1), (-sg, 0, 0)) @ basis(a, n).inverted())


glass_at = None
if pose == "standing":
    for s in ("Left", "Right"):
        hang(s)
if pose == "glass":
    C = coords()
    s = max(("Left", "Right"), key=lambda s: C[hand[s], 2].mean())
    hang("Right" if s == "Left" else "Left")
    C = coords()
    W, a, n = hand_frame(C, s)
    # The bowl's stem in the fingers: just past the palm's centre, held upright.
    glass_at = Vector(C[hand[s]].mean(axis=0)) + Vector(a) * 0.02

bpy.ops.object.mode_set(mode="OBJECT")
off = offset()
posed = bpy.data.meshes.new_from_object(body.evaluated_get(bpy.context.evaluated_depsgraph_get()))
guest = bpy.data.objects.new("guest", posed)
sc.collection.objects.link(guest)
guest.matrix_world = body.matrix_world
for o in (body, arm):
    bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = guest
guest.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for v in guest.data.vertices:
    v.co += off

if glass_at is not None:
    # A wine glass 19 cm tall, its stem's middle at the fingers.
    profile = [(0.0, 0.0), (0.035, 0.0), (0.035, 0.004), (0.004, 0.01), (0.004, 0.09), (0.03, 0.11),
               (0.042, 0.15), (0.038, 0.19), (0.0, 0.19)]
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(t), r * math.sin(t), z)) for t in np.linspace(0, 2 * math.pi, 24, endpoint=False)])
    for lo, hi in zip(rings[:-1], rings[1:]):
        for k in range(24):
            bm.faces.new((lo[k], lo[(k + 1) % 24], hi[(k + 1) % 24], hi[k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    me = bpy.data.meshes.new("glass")
    bm.to_mesh(me)
    bm.free()
    glass = bpy.data.objects.new("glass", me)
    sc.collection.objects.link(glass)
    glass.location = glass_at + off - Vector((0, 0, 0.05))

if seated:
    # How far the buttocks sit from the seat top (negative: into the cushion). Heels below the floor
    # lift the figure, as long as it still sits in the cushion.
    near = [v.co for v in guest.data.vertices if abs(v.co.x) < 0.15 and -0.1 < v.co.y < 0.2 and seat - 0.15 < v.co.z < seat + 0.2]
    gap = min(c.z for c in near) - seat
    lift = max(0.0, min(-min(v.co.z for v in guest.data.vertices), -gap))
    for v in guest.data.vertices:
        v.co.z += lift
    off.z += lift
    print("seat gap", round(gap + lift, 3), "lift", round(lift, 3))
print("pose", pose, "frame", frame, "min z", round(min(v.co.z for v in guest.data.vertices), 3))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True, export_image_format="JPEG",
                          export_jpeg_quality=92)
