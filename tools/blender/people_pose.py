"""A Meshy motion-capture clip frozen into one guest pose, placed for the app (visual stage V7).

venv/bin/python people_pose.py <animated.glb> <out.glb> pose=standing|table [frame=N] [seat=0.446]

- Freezes the clip at `frame` and keeps its motion-captured posture: arms, hands and torso as
  recorded (owner, 2026-10-21: natural joints and hands, no mesh distortion), and levels the head
  (neck only).
- Re-skins the character first: rebuilt at rest as one closed surface with its texture in a colour
  attribute, bound to Meshy's skeleton with Blender's automatic weights (Meshy's own weights distort it).
- `standing`: the recorded frame as it is, arms by the sides, feet on the floor, hips over the origin.
- `table`: from a seated frame with the hands on the thighs (palms down), each arm reaches the
  table top (0.75 m, its edge 0.32 m ahead of the chair's place) by swinging the upper arm and forearm
  only, the wrists about shoulder-width apart; the hand keeps the orientation it had on the thigh. No
  bone is ever twisted about its own length. Hip joints 10 cm above the seat top `seat`, 7 cm behind the chair's place or less,
  so the back stays clear of the backrests.
- The app faces +z (Blender -y). Writes the posed closed mesh with its `srgb` colour attribute;
  `people_rebuild.py` makes the app's levels from it.
"""
import sys

import bpy
import bmesh  # after bpy, which provides it
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

src, dst = sys.argv[1], sys.argv[2]
opts = dict(a.split("=", 1) for a in sys.argv[3:])
pose = opts["pose"]
frame = int(opts.get("frame", "0"))
seat = float(opts.get("seat", "0.446"))
seated = pose == "table"
TABLE_TOP = 0.75
TABLE_EDGE = 0.33  # 0.32 m ahead of the chair's place, and 1 cm in
# The backrests' fronts start 0.21 m behind the chair's place (oval, crossback, chiavari), less a margin.
BACKREST = 0.20

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

# The clip's frame is kept; the animation itself is dropped.
sc.frame_set(frame)
base = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
for o in sc.objects:
    o.animation_data_clear()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

# Re-skinned (owner, 2026-10-21: Meshy's rig weights distort the mesh): at rest, the character is
# rebuilt as one closed surface (Meshy's mesh is cut along its texture seams), its texture sampled
# into a colour attribute, and bound to the same skeleton with Blender's automatic weights, which
# need a closed surface. The clips drive that skeleton as before.
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
rest = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
src_bm = bmesh.new()
src_bm.from_mesh(rest.to_mesh())
src_bm.transform(body.matrix_world)
bmesh.ops.triangulate(src_bm, faces=src_bm.faces)
src_bm.faces.ensure_lookup_table()
uv_layer = src_bm.loops.layers.uv.active
tree = BVHTree.FromBMesh(src_bm)
img = next(n.image for n in body.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
W, H = img.size
pixels = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)


def sample(p):
    """The texture's colour (as stored, sRGB) at the rest surface's nearest point to `p`."""
    loc, _, fi, _ = tree.find_nearest(p)
    f = src_bm.faces[fi]
    a, b, c = (lp.vert.co for lp in f.loops)
    v0, v1, v2 = b - a, c - a, loc - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01 or 1e-12
    wb = (d11 * d20 - d01 * d21) / den
    wc = (d00 * d21 - d01 * d20) / den
    uv = f.loops[0][uv_layer].uv * (1 - wb - wc) + f.loops[1][uv_layer].uv * wb + f.loops[2][uv_layer].uv * wc
    return pixels[min(H - 1, max(0, int((uv.y % 1) * H))), min(W - 1, max(0, int((uv.x % 1) * W))), :3]


skin = bpy.data.objects.new("guest", bpy.data.meshes.new_from_object(rest))
rest.to_mesh_clear()
sc.collection.objects.link(skin)
skin.matrix_world = body.matrix_world
for o in sc.objects:
    o.select_set(o is skin)
bpy.context.view_layer.objects.active = skin
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
rm = skin.modifiers.new("remesh", "REMESH")
rm.mode = "VOXEL"
rm.voxel_size = 0.005
bpy.ops.object.modifier_apply(modifier="remesh")
# Specks the remesher leaves off the body are dropped; the rest is simplified for the binding (the
# app's levels are made from the posed result by `people_rebuild.py`).
bm = bmesh.new()
bm.from_mesh(skin.data)
seen = set()
for f0 in bm.faces:
    if f0 in seen:
        continue
    island, todo = [], [f0]
    seen.add(f0)
    while todo:
        f = todo.pop()
        island.append(f)
        for e in f.edges:
            for g in e.link_faces:
                if g not in seen:
                    seen.add(g)
                    todo.append(g)
    if len(island) < 200:
        bmesh.ops.delete(bm, geom=island, context="FACES")
bm.to_mesh(skin.data)
bm.free()
dec = skin.modifiers.new("dec", "DECIMATE")
dec.ratio = min(1.0, 80000 / len(skin.data.polygons))
bpy.ops.object.modifier_apply(modifier="dec")
cols = np.array([[*sample(v.co), 1.0] for v in skin.data.vertices], dtype=np.float32)
attr = skin.data.color_attributes.new("srgb", "FLOAT_COLOR", "POINT")
attr.data.foreach_set("color", cols.ravel())
bpy.data.objects.remove(body)
body = skin
for o in sc.objects:
    o.select_set(o in (body, arm))
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
unbound = sum(1 for v in body.data.vertices if not v.groups)
print("bound", len(body.data.vertices), "vertices,", unbound, "without a bone")
for pb in arm.pose.bones:
    pb.matrix_basis = base[pb.name]
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
    """Turns a bone (and its children) by the world rotation `R` about its head."""
    pb = P[name]
    r = (Ai @ R @ A).to_4x4()
    t = Matrix.Translation(pb.head)
    pb.matrix = t @ r @ t.inverted() @ pb.matrix
    bpy.context.view_layer.update()


def coords():
    bpy.context.view_layer.update()
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = body.matrix_world
    return np.array([(m @ v.co)[:] for v in ev.data.vertices])


def members(name, th=0.5):
    g = body.vertex_groups[name].index
    return np.array([v.index for v in body.data.vertices if any(x.group == g and x.weight > th for x in v.groups)])


# Head level, looking ahead: the recorded poses look down. Only the neck turns.
head = (A @ (P["Head"].tail - P["Head"].head)).normalized()
rotate_about("Head", head.rotation_difference(Vector((head.x * 0.3, 0.0, 1.0)).normalized()).to_matrix())


def hips():
    return (world(P["LeftUpLeg"].head) + world(P["RightUpLeg"].head)) / 2


def back_line():
    """How far the back reaches behind the hip joints (Blender +y) where a backrest is, 0.55-0.85 m up."""
    lj = hips()
    C = coords()
    z = C[:, 2] + seat + 0.10 - lj.z
    torso = (np.abs(C[:, 0] - lj.x) < 0.12) & (z > 0.55) & (z < 0.85)
    return C[torso, 1].max() - lj.y


def offset(back=0.0, lift=0.0):
    """World offset that places the figure: hip joints over the seat, 7 cm behind the chair's place or
    forward enough that the back clears the backrests, raised by `lift`; or hips over the origin with
    the feet down."""
    lj = hips()
    if seated:
        return Vector((-lj.x, min(0.07, BACKREST - back) - lj.y, seat + 0.10 + lift - lj.z))
    return Vector((-lj.x, -lj.y, -coords()[:, 2].min()))


def seat_lift(back):
    """Heels below the floor lift a seated figure, as long as it still sits in the cushion."""
    C = coords() + np.array(offset(back))
    near = C[(np.abs(C[:, 0]) < 0.15) & (C[:, 1] > -0.1) & (C[:, 1] < 0.2) & (C[:, 2] > seat - 0.15) & (C[:, 2] < seat + 0.2)]
    return max(0.0, min(-C[:, 2].min(), -(near[:, 2].min() - seat)))


# Measured before the arms move: they reach neither the back, the floor nor the seat.
back = back_line() if seated else 0.0
lift = seat_lift(back) if seated else 0.0


def swing(name, frm, to):
    """Turns a bone by the least rotation taking direction `frm` to `to`: a swing, never a twist about
    the bone, which the rig's skinning would wring."""
    R = frm.normalized().rotation_difference(to.normalized()).to_matrix()
    rotate_about(name, R)
    return R


def reach(s, target):
    """Two-bone reach: the wrist of side `s` brought to `target` (world) by swinging the upper arm and
    forearm, the elbow down and a little out and back; the hand keeps the orientation it had."""
    sh, el, wr = (world(P[f"{s}{b}"].head) for b in ("Arm", "ForeArm", "Hand"))
    l1, l2 = (el - sh).length, (wr - el).length
    to = target - sh
    d = min(to.length, (l1 + l2) * 0.999)
    u = to.normalized()
    side = 1 if sh.x > hips().x else -1
    pole = Vector((side * 0.4, 0.3, -1.0))
    pole = (pole - u * pole.dot(u)).normalized()
    # The elbow on the circle where both bones meet (law of cosines).
    a = (l1 * l1 + d * d - l2 * l2) / (2 * d)
    elbow = sh + u * a + pole * max(0.0, l1 * l1 - a * a) ** 0.5
    R1 = swing(f"{s}Arm", el - sh, elbow - sh)
    el, wr = (world(P[f"{s}{b}"].head) for b in ("ForeArm", "Hand"))
    R2 = swing(f"{s}ForeArm", wr - el, sh + u * d - el)
    rotate_about(f"{s}Hand", (R2 @ R1).inverted())


if seated:
    hand = {s: members(f"{s}Hand") for s in ("Left", "Right")}
    o = Vector(offset(back, lift))
    for s in ("Left", "Right"):
        rest = [P[f"{s}{b}"].matrix_basis.copy() for b in ("Arm", "ForeArm", "Hand")]
        sx = world(P[f"{s}Arm"].head).x - hips().x
        best = None
        # Wrists about as far apart as the shoulders, a little in from the edge, just above the top.
        for spread in (0.8, 0.95, 1.1):
            for y in np.arange(-0.24, -0.37, -0.02):
                for z in np.arange(0.76, 0.85, 0.015):
                    for b, m in zip(("Arm", "ForeArm", "Hand"), rest):
                        P[f"{s}{b}"].matrix_basis = m.copy()
                    reach(s, Vector((hips().x + sx * spread, y, z)) - o)
                    H = coords()[hand[s]] + np.array(o)
                    over = H[H[:, 1] < -TABLE_EDGE]
                    hz = over[:, 2].min() if len(over) else 9.0
                    hy = H[:, 1].mean()
                    low = H[:, 2].min()
                    # The palm on the top (lowest point past the edge 1 cm above it), the hand's middle
                    # 3-10 cm in from the edge, nothing of it below the top.
                    err = (abs(hz - (TABLE_TOP + 0.01)) + max(0, hy + 0.35) * 2 + max(0, -0.42 - hy) * 2
                           + max(0, TABLE_TOP - low) * 4 + 0.01 * abs(spread - 0.95))
                    if best is None or err < best[0]:
                        best = (err, spread, float(y), float(z), round(hz, 3), round(hy, 3))
        for b, m in zip(("Arm", "ForeArm", "Hand"), rest):
            P[f"{s}{b}"].matrix_basis = m.copy()
        reach(s, Vector((hips().x + sx * best[1], best[2], best[3])) - o)
        print("hand", s, "error", round(best[0], 3), "spread", best[1], "wrist", round(best[2], 2), round(best[3], 3),
              "hand z", best[4], "hand y", best[5])

bpy.ops.object.mode_set(mode="OBJECT")
off = offset(back, lift)
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
if seated:
    near = [v.co for v in guest.data.vertices if abs(v.co.x) < 0.15 and -0.1 < v.co.y < 0.2 and seat - 0.15 < v.co.z < seat + 0.2]
    print("seat gap", round(min(c.z for c in near) - seat, 3), "lift", round(lift, 3))
print("pose", pose, "frame", frame, "min z", round(min(v.co.z for v in guest.data.vertices), 3))
bpy.ops.object.select_all(action="SELECT")
guest.data.color_attributes.active_color = guest.data.color_attributes["srgb"]
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True, export_vertex_color="ACTIVE",
                          export_active_vertex_color_when_no_material=True, export_materials="NONE",
                          export_texcoords=False)
