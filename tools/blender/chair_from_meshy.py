"""A Meshy chair made ready for the app (visual stage V4).

venv/bin/python chair_from_meshy.py <meshy.glb> <out.glb> <width> <depth> <height> <front>

- Repairs the remesher's fins (edges shared by three or more faces) and the pin holes beside them:
  the faces on such edges are removed and the holes filled; UVs come back from the source mesh.
- Fits the chair to its size in metres, centred on x, feet at 0, the seat front `front` m ahead
  (the app's chairs face +z, Blender's -y).
- Replaces the colour map with a grey detail map at half strength (0.5 = the part's own average; the
  app doubles the tint), and writes `<out>-mask.png`: white where the texture shows the seat, black
  the frame (the prompts ask for dark wood or paint and pale fabric). The app tints and finishes
  each part per library entry from the mask, so one mesh draws the whole chair.
- No normal map: Meshy's was baked against the normals the repair replaces.
"""
import bpy
import bmesh
import sys

import numpy as np

src, out = sys.argv[1], sys.argv[2]
W, D, H, FRONT = (float(x) for x in sys.argv[3:7])
SIDE = 1024
MASK_SIDE = 512

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# Normals are computed from the repaired surface, not carried over from the source.
bpy.ops.mesh.customdata_custom_splitnormals_clear()
mat = obj.data.materials[0]
nodes = mat.node_tree.nodes
bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
colour_img = bsdf.inputs["Base Color"].links[0].from_node.image

# The source, kept to give repaired faces their UVs back.
source = obj.copy()
source.data = obj.data.copy()
bpy.context.scene.collection.objects.link(source)

def fill_holes(bm):
    """Closes every boundary loop with a face (holes_fill skips some); returns the new faces."""
    left, made = {e for e in bm.edges if e.is_boundary}, []
    while left:
        loop, stack = [], [left.pop()]
        while stack:
            e = stack.pop()
            loop.append(e)
            for v in e.verts:
                for x in v.link_edges:
                    if x in left:
                        left.remove(x)
                        stack.append(x)
        verts = list({v for e in loop for v in e.verts})
        if len(verts) == 3:
            try:
                made.append(bm.faces.new(verts))
            except ValueError:
                pass
        else:
            made += bmesh.ops.edgeloop_fill(bm, edges=loop)["faces"]
    return made


# Repair: weld, then drop faces on non-manifold edges and fill the holes left, until none remain.
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
patch = bm.faces.layers.int.new("patch")
for i in range(6):
    # After the first round, clear every face touching a fin's vertices: holes that meet at a
    # vertex would fill back into fins.
    bad = [e for e in bm.edges if len(e.link_faces) > 2]
    fins = {f for e in bad for f in e.link_faces}
    if i:
        fins |= {f for e in bad for v in e.verts for f in v.link_faces}
    # A vertex where two holes meet (a bowtie) cannot be filled round: clear its faces too.
    fins |= {f for v in bm.verts if sum(e.is_boundary for e in v.link_edges) > 2 for f in v.link_faces}
    if fins:
        bmesh.ops.delete(bm, geom=list(fins), context="FACES_ONLY")
    loose = [e for e in bm.edges if not e.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="EDGES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_edges], context="VERTS")
    filled = bmesh.ops.triangulate(bm, faces=fill_holes(bm))["faces"]
    for f in filled:
        f[patch] = 1
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-7)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    if not any(len(e.link_faces) != 2 for e in bm.edges):
        break
# Filled holes take whatever winding; make every face agree with its neighbours (outward).
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
print("left: non-manifold", sum(len(e.link_faces) > 2 for e in bm.edges), "open", sum(e.is_boundary for e in bm.edges))
bm.to_mesh(obj.data)
bm.free()
obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
dt = obj.modifiers.new("uv", "DATA_TRANSFER")
dt.object = source
dt.use_loop_data = True
dt.data_types_loops = {"UV"}
dt.loop_mapping = "POLYINTERP_NEAREST"
bpy.ops.object.modifier_apply(modifier=dt.name)
bpy.data.objects.remove(source)
# A filled patch has no texture of its own: it takes one texel from an untouched neighbour, so it
# matches its surroundings instead of whatever part of the atlas lies nearest.
me = obj.data
uv = me.uv_layers.active.data
patched = [a.value for a in me.attributes["patch"].data]
at_vertex = {}
for p in me.polygons:
    if not patched[p.index]:
        for v, li in zip(p.vertices, p.loop_indices):
            at_vertex.setdefault(v, uv[li].uv.copy())
for p in me.polygons:
    if patched[p.index]:
        texel = next((at_vertex[v] for v in p.vertices if v in at_vertex), None)
        if texel is not None:
            for li in p.loop_indices:
                uv[li].uv = texel
me.attributes.remove(me.attributes["patch"])

# Fit: centred on x, feet at z 0, seat front at -FRONT on y.
co = np.array([v.co[:] for v in me.vertices])
lo, hi = co.min(0), co.max(0)
scale = np.array([W, D, H]) / (hi - lo)
co = (co - [(lo[0] + hi[0]) / 2, lo[1], lo[2]]) * scale
co[:, 1] -= FRONT
me.vertices.foreach_set("co", co.ravel())
me.update()

# Frame or seat per texel, from the colour map's luminance: an Otsu split over the faces (weighted
# by area: the atlas's unused background would skew a split over texels), then a 3×3 majority to
# drop specks. Per texel, not per face, so the boundary follows the paint, not the triangles.
w, h = colour_img.size
px = np.array(colour_img.pixels[:]).reshape(h, w, 4)[:, :, :3]
lum = px @ [0.2126, 0.7152, 0.0722]
uv = me.uv_layers.active.data


def sample(u, v):
    return lum[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w)))]


face_lum = np.array([np.mean([sample(*uv[i].uv) for i in p.loop_indices]) for p in me.polygons])
area = np.array([p.area for p in me.polygons])
hist, edges = np.histogram(face_lum, bins=256, range=(0, 1), weights=area)
best, split = -1.0, 0.5
for k in range(1, 256):
    a, b = hist[:k].sum(), hist[k:].sum()
    if not a or not b:
        continue
    ma = (hist[:k] * edges[:k]).sum() / a
    mb = (hist[k:] * edges[k:256]).sum() / b
    if a * b * (ma - mb) ** 2 > best:
        best, split = a * b * (ma - mb) ** 2, edges[k]
seat = lum > split
for _ in range(2):
    padded = np.pad(seat.astype(np.float32), 1, mode="edge")
    votes = sum(padded[1 + dy : h + 1 + dy, 1 + dx : w + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    seat = votes > 4.5

# Detail map: each texel against its part's average, softened and clamped, at half strength.
detail = np.empty_like(lum)
for m in (seat, ~seat):
    detail[m] = np.clip((lum[m] / max(lum[m].mean(), 1e-3)) ** 0.7, 0.55, 1.25)


def image(name, values, side, data=False):
    k = w // side
    v = values[: side * k, : side * k].reshape(side, k, side, k).mean(axis=(1, 3))
    img = bpy.data.images.new(name, side, side, is_data=data)
    img.pixels.foreach_set(np.dstack([v, v, v, np.ones_like(v)]).astype(np.float32).ravel())
    return img


img = image("detail", np.clip(detail * 0.5, 0, 1), SIDE)
mask = image("mask", seat.astype(np.float32), MASK_SIDE, data=True)
mask.filepath_raw = out.replace(".glb", "-mask.png")
mask.file_format = "PNG"
mask.save()

mat = bpy.data.materials.new("chair")
mat.use_nodes = True
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = img
mat.node_tree.links.new(tex.outputs["Color"], mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
me.materials.clear()
me.materials.append(mat)
obj.name = me.name = "chair"
# Slivers folded against their smooth normals (any corner facing away) are drawn flat.
for _ in range(4):
    cn = me.corner_normals
    for p in me.polygons:
        if p.use_smooth and min(cn[i].vector.dot(p.normal) for i in p.loop_indices) <= 0:
            p.use_smooth = False
    me.update()
print("triangles", len(me.polygons), "seat share", round(float(seat.mean()), 3), "split", round(float(split), 3))
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_image_format="JPEG",
    export_jpeg_quality=85,
    export_normals=True,
    export_texcoords=True,
    export_tangents=False,
    export_vertex_color="NONE",
    export_animations=False,
    export_extras=False,
)
