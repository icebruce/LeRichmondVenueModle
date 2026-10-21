"""A guest generated seated at a table by Meshy (no rig), freed of the furniture and fitted (visual stage V7).

venv/bin/python people_seated.py <meshy.glb> <out.glb> sit=<m> [seat=0.446] [table=0.75] [edge=0.32]

Owner, 2026-10-21: the rig distorted arms and hands, so the seated guest is generated in its pose,
at a table and on a chair (`tools/meshy/prompts/*-seated-*.txt`; they are textured plain light grey).

- The furniture is told apart by the texture: plain light grey faces are table and chair, and are
  removed with every piece left that is not the guest; the holes they leave (under the thighs and the
  palms, hidden on the seat and the top) are capped.
- Fitted (the generated furniture, measured from its grey faces before they go, is not to scale):
  scaled to the guest's own size (head `sit` m above the seat), set on our seat, the generated
  table's near edge `edge` m ahead of the chair's place (Blender -y, the app's +z); then the shins
  are rescaled to reach our floor and the forearms raised smoothly onto our tabletop.
- Writes the posed, textured mesh named `guest`; `people_rebuild.py` makes the app's levels from it.
"""
import colorsys
import sys

import bpy
import bmesh  # after bpy, which provides it
import numpy as np
from mathutils import Matrix, Vector

src, dst = sys.argv[1], sys.argv[2]
opts = dict(a.split("=", 1) for a in sys.argv[3:])
SEAT = float(opts.get("seat", "0.446"))
TABLE = float(opts.get("table", "0.75"))
EDGE = float(opts.get("edge", "0.32"))
SIT = float(opts["sit"])
# The backrests' fronts start 0.21 m behind the chair's place (oval, crossback, chiavari), less a margin.
BACKREST = 0.19

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=src)
body = next(o for o in sc.objects if o.type == "MESH")
for o in sc.objects:
    o.select_set(o is body)
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = body.data
img = next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
W, H = img.size
pixels = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)

bm = bmesh.new()
bm.from_mesh(me)
# Welded along the texture seams Meshy cuts it at, so pieces are found by connection.
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.normal_update()
uv = bm.loops.layers.uv.active


def furniture(f, loose=False):
    """Plain light grey in the texture (the guest's white shirt is brighter, the suit darker);
    `loose`: the furniture's greyish shading where it touched the guest."""
    u = sum((lp[uv].uv for lp in f.loops), Vector((0, 0))) / len(f.loops)
    c = pixels[min(H - 1, int((u.y % 1) * H)), min(W - 1, int((u.x % 1) * W)), :3]
    _, s, v = colorsys.rgb_to_hsv(*c)
    return s < 0.16 and 0.3 < v < 0.96 if loose else s < 0.08 and 0.45 < v < 0.93


# The furniture: grey faces in large connected patches (a stray grey fold of the shirt stays).
is_grey = {f for f in bm.faces if furniture(f)}
grey, seen = [], set()
for f0 in is_grey:
    if f0 in seen:
        continue
    patch, todo = [], [f0]
    seen.add(f0)
    while todo:
        f = todo.pop()
        patch.append(f)
        for e in f.edges:
            for g in e.link_faces:
                if g in is_grey and g not in seen:
                    seen.add(g)
                    todo.append(g)
    if len(patch) >= 200:
        grey += patch
# Grown into the greyish faces it touches (where the furniture met the guest, its texture bleeds).
grown, todo = set(grey), list(grey)
while todo:
    f = todo.pop()
    for e in f.edges:
        for g in e.link_faces:
            if g not in grown and furniture(g, loose=True):
                grown.add(g)
                todo.append(g)
grey = list(grown)
guest_pts = np.array([f.calc_center_median()[:] for f in bm.faces if f not in set(grey)])
mid_x = np.median(guest_pts[:, 0])
body_y = np.median(guest_pts[:, 1])
# The tabletop and the seat are the two largest level grey surfaces (area by height, 1 cm steps),
# the higher the tabletop; its edge facing the guest is the near edge.
up = [(f.calc_center_median(), f) for f in grey if f.normal.z > 0.95]
print("furniture faces", len(grey), "level", len(up))
levels = {}
for c, f in up:
    levels[round(c.z, 2)] = levels.get(round(c.z, 2), 0) + f.calc_area()
# Neighbouring steps of one surface are one level.
clusters = []
for z in sorted(levels):
    if clusters and z - clusters[-1][-1] <= 0.03:
        clusters[-1].append(z)
    else:
        clusters.append([z])
area = {max(c, key=levels.get): sum(levels[z] for z in c) for c in clusters}
top_z, seat_z = sorted(sorted(area, key=area.get, reverse=True)[:2], reverse=True)
floor_z = min(v.co.z for v in bm.verts)
head_z = guest_pts[:, 2].max()
print("floor", round(floor_z, 3), "head", round(head_z, 3), "seat-to-top", round(top_z - seat_z, 3),
      "seat-to-head", round(head_z - seat_z, 3), "floor-to-seat", round(seat_z - floor_z, 3))
top_pts = np.array([v.co[:] for c, f in up if abs(c.z - top_z) < 0.01 for v in f.verts])
toward = -1 if top_pts[:, 1].mean() < body_y else 1
near_edge = top_pts[:, 1].max() if toward < 0 else top_pts[:, 1].min()
print("tabletop", round(top_z, 3), "near edge y", round(near_edge, 3), "seat", round(seat_z, 3),
      "facing", "-y" if toward < 0 else "+y")
bmesh.ops.delete(bm, geom=grey, context="FACES")
# Keep the guest: the largest connected piece; crumbs of furniture go.
pieces, seen = [], set()
for f0 in bm.faces:
    if f0 in seen:
        continue
    piece, todo = [], [f0]
    seen.add(f0)
    while todo:
        f = todo.pop()
        piece.append(f)
        for e in f.edges:
            for g in e.link_faces:
                if g not in seen:
                    seen.add(g)
                    todo.append(g)
    pieces.append(piece)
pieces.sort(key=len, reverse=True)
for p in pieces[1:]:
    if len(p) < 0.02 * len(pieces[0]):
        bmesh.ops.delete(bm, geom=p, context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
# The caps take the colour around them: each corner gets the texture coordinate of the guest's
# surface at the same vertex.
# Where a cut left an edge shared by more than two faces or a boundary that touches itself, the
# offending faces go first, until every hole is a clean loop the cap can close.
caps = []
for _ in range(10):
    for e in [e for e in bm.edges if e.is_valid and len(e.link_faces) > 2]:
        bmesh.ops.delete(bm, geom=sorted(e.link_faces, key=lambda f: f.calc_area())[:-2], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    pinched = [v for v in bm.verts if sum(1 for e in v.link_edges if e.is_boundary) > 2]
    bmesh.ops.delete(bm, geom=list({f for v in pinched for f in v.link_faces}), context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    caps += bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)["faces"]
    # A hole the fill leaves (a loop it cannot triangulate) is closed by a fan to its middle.
    left = {e for e in bm.edges if e.is_boundary}
    while left:
        e = left.pop()
        loop, v = [e.verts[0]], e.verts[1]
        while v is not loop[0]:
            loop.append(v)
            nxt = [x for x in v.link_edges if x in left]
            if not nxt:
                break
            left.discard(nxt[0])
            v = nxt[0].other_vert(v)
        if v is not loop[0] or len(loop) < 3:
            continue
        mid = bm.verts.new(sum((x.co for x in loop), Vector()) / len(loop))
        for a, b in zip(loop, loop[1:] + loop[:1]):
            try:
                caps.append(bm.faces.new((b, a, mid)))
            except ValueError:
                pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    caps = [f for f in caps if f.is_valid]
    if not any(e.is_boundary or len(e.link_faces) > 2 for e in bm.edges):
        break
print("open edges left", sum(1 for e in bm.edges if e.is_boundary))
cap_set = set(caps)
for f in caps:
    for lp in f.loops:
        near = [o for o in lp.vert.link_loops if o.face not in cap_set]
        if near:
            lp[uv].uv = near[0][uv].uv
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.to_mesh(me)
bm.free()

# The guest's own size: seated, the top of the head `sit` m above the seat (about half the
# standing height). Meshy's furniture is not to scale, so its table and floor are only references.
k = SIT / (head_z - seat_z)
M = Matrix.Diagonal((k, k, k, 1))
if toward > 0:
    M = Matrix.Rotation(np.pi, 4, "Z") @ M
body.data.transform(M)
P = np.array([v.co[:] for v in me.vertices])
body.data.transform(Matrix.Translation(Vector((-(P[:, 0].min() + P[:, 0].max()) / 2, 0, SEAT - seat_z * k))))
P = np.array([v.co[:] for v in me.vertices])
# Back and jacket clear of the backrest: its fronts are 0.21 m or more behind the chair's place.
torso = (P[:, 2] > SEAT) & (P[:, 2] < SEAT + 0.5)
P[:, 1] += BACKREST - P[torso, 1].max()
# Feet on our floor: below the seat, heights are rescaled (the shins a little longer or shorter).
low = P[:, 2].min()
legs = P[:, 2] < SEAT
P[legs, 2] = (P[legs, 2] - low) / (SEAT - low) * SEAT
# Palms on our tabletop: the forearms are raised smoothly, from where they leave the body to the
# table's edge, and nothing above the chest moves: a gentle tilt, no joint bent.
smooth = lambda t: (lambda c: c * c * (3 - 2 * c))(np.clip(t, 0, 1))
start = BACKREST - 0.32
# The generated tabletop, where the forearms rested: the lift brings it to ours. Only what is over
# the thighs behind the edge, and over the tabletop beyond it, moves: the knees under the table stay.
gen_top = (top_z - seat_z) * k + SEAT
lift = TABLE + 0.005 - gen_top
floor_line = np.where(P[:, 1] < -EDGE, gen_top - 0.04, SEAT + 0.13)
w = smooth((start - P[:, 1]) / (start + EDGE)) * smooth((SEAT + 0.5 - P[:, 2]) / 0.15) * smooth((P[:, 2] - floor_line) / 0.02)
P[:, 2] += lift * w
me.vertices.foreach_set("co", P.ravel())
me.update()
print("scale", round(k, 3), "shins", round(SEAT / (SEAT - low), 3), "forearm lift", round(lift, 3),
      "back", round(P[:, 1].max(), 3), "front", round(P[:, 1].min(), 3), "head", round(P[:, 2].max(), 3))
# The furniture's texture left on the shins where a chair rail met them: below the seat, faces far
# from the legs' usual colour take that colour.
uvd = me.uv_layers.active.data
cent = np.array([p.center[:] for p in me.polygons])
col = []
for p in me.polygons:
    u = sum((uvd[i].uv for i in p.loop_indices), Vector((0, 0))) / len(p.loop_indices)
    col.append(pixels[min(H - 1, int((u.y % 1) * H)), min(W - 1, int((u.x % 1) * W)), :3])
col = np.array(col)
shins = np.flatnonzero((cent[:, 2] > 0.15) & (cent[:, 2] < SEAT + 0.02) & (cent[:, 1] < -0.1))
usual = np.median(col[shins], axis=0)
odd = shins[np.linalg.norm(col[shins] - usual, axis=1) > 0.12]
# All of them take the legs' usual colour: the uv of the face closest to it.
best = me.polygons[int(shins[np.argmin(np.linalg.norm(col[shins] - usual, axis=1))])]
for f in odd:
    for i in me.polygons[int(f)].loop_indices:
        uvd[i].uv = uvd[best.loop_indices[0]].uv
print("shin faces recoloured", len(odd), "of", len(shins))
body.name = "guest"
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True, export_image_format="JPEG",
                          export_jpeg_quality=92)
