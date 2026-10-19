"""A Meshy chair made ready for the app (visual stage V4).

venv/bin/python chair_from_meshy.py <meshy.glb> <out.glb> <width> <depth> <height> <front>

- Repairs the remesher's fins (edges shared by three or more faces) and the pin holes beside them:
  the faces on such edges are removed and the holes filled; UVs come back from the source mesh.
- Fits the chair to its size in metres, centred on x, feet at 0, the seat front `front` m ahead
  (the app's chairs face +z, Blender's -y).
- Splits it into `frame` and `seat` by the texture's two colours (the prompts ask for dark wood or
  paint and pale fabric), so the app tints each part per library entry.
- Replaces the colour map with a grey detail map at half strength (0.5 = the part's own average; the
  app doubles the tint) and keeps a 1K normal map. Roughness and metalness are set by the app.
"""
import bpy
import bmesh
import sys

import numpy as np

src, out = sys.argv[1], sys.argv[2]
W, D, H, FRONT = (float(x) for x in sys.argv[3:7])
SIDE = 1024

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
normal_img = bsdf.inputs["Normal"].links[0].from_node.inputs["Color"].links[0].from_node.image

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
    filled = fill_holes(bm)
    bmesh.ops.triangulate(bm, faces=filled)
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

# Fit: centred on x, feet at z 0, seat front at -FRONT on y.
me = obj.data
co = np.array([v.co[:] for v in me.vertices])
lo, hi = co.min(0), co.max(0)
scale = np.array([W, D, H]) / (hi - lo)
co = (co - [(lo[0] + hi[0]) / 2, lo[1], lo[2]]) * scale
co[:, 1] -= FRONT
me.vertices.foreach_set("co", co.ravel())
me.update()

# Frame or seat per face, from the colour map's luminance under the face (Otsu split, then a few
# rounds of neighbour majority so stray faces follow their surroundings).
w, h = colour_img.size
px = np.array(colour_img.pixels[:]).reshape(h, w, 4)[:, :, :3]
lum = px @ [0.2126, 0.7152, 0.0722]
uv = me.uv_layers.active.data


def sample(u, v):
    return lum[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w)))]


face_lum = np.array(
    [np.mean([sample(*uv[i].uv) for i in p.loop_indices]) for p in me.polygons]
)
# Otsu over the faces, weighted by area (the texture atlas's unused background would skew texels).
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
seat = face_lum > split
neighbours = [[] for _ in me.polygons]
by_edge = {}
for p in me.polygons:
    for ek in p.edge_keys:
        by_edge.setdefault(ek, []).append(p.index)
for fs in by_edge.values():
    for a in fs:
        neighbours[a] += [b for b in fs if b != a]
for _ in range(3):
    seat = np.array([np.mean(seat[n]) > 0.5 if n else s for s, n in zip(seat, neighbours)])

# Detail map: each texel against its part's average, softened and clamped, at half strength.
part = lum > split
detail = np.empty_like(lum)
for m in (part, ~part):
    detail[m] = np.clip((lum[m] / max(lum[m].mean(), 1e-3)) ** 0.7, 0.55, 1.6)
grey = np.clip(detail * 0.5, 0, 1)
k = w // SIDE
grey = grey[: SIDE * k, : SIDE * k].reshape(SIDE, k, SIDE, k).mean(axis=(1, 3))
img = bpy.data.images.new("detail", SIDE, SIDE)
img.pixels.foreach_set(np.dstack([grey, grey, grey, np.ones_like(grey)]).astype(np.float32).ravel())
nw = normal_img.size[0]
n = np.array(normal_img.pixels[:], dtype=np.float32).reshape(nw, nw, 4)
n = n.reshape(SIDE, nw // SIDE, SIDE, nw // SIDE, 4).mean(axis=(1, 3))
normal_img = bpy.data.images.new("normal", SIDE, SIDE, is_data=True)
normal_img.pixels.foreach_set(n.ravel())


def material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    t = m.node_tree.nodes.new("ShaderNodeTexImage")
    t.image = img
    m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    n = m.node_tree.nodes.new("ShaderNodeTexImage")
    n.image = normal_img
    nm = m.node_tree.nodes.new("ShaderNodeNormalMap")
    m.node_tree.links.new(n.outputs["Color"], nm.inputs["Color"])
    m.node_tree.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


me.materials.clear()
me.materials.append(material("frame"))
me.materials.append(material("seat"))
me.polygons.foreach_set("material_index", seat.astype(np.int32))
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="MATERIAL")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        o.name = o.data.materials[0].name
        o.data.name = o.name
        # Slivers folded against their smooth normals (any corner facing away) are drawn flat.
        for _ in range(4):
            cn = o.data.corner_normals
            folded = [
                p
                for p in o.data.polygons
                if p.use_smooth and min(cn[i].vector.dot(p.normal) for i in p.loop_indices) <= 0
            ]
            for p in folded:
                p.use_smooth = False
            o.data.update()
print("faces", len(seat), "seat share", round(float(seat.mean()), 3), "split", round(float(split), 3))
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
