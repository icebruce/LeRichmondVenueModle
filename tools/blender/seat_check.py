import bpy, sys, os
from mathutils import Vector
chair, guest, out = sys.argv[1], sys.argv[2], sys.argv[3]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.samples = 32; sc.cycles.device = "CPU"
for f in (chair, guest):
    bpy.ops.import_scene.gltf(filepath=f)
# table top edge in front of the chair (cloth falls at y = -0.30 from the seat centre)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.75, 0.745)); t = bpy.context.active_object; t.scale = (1.2, 0.9, 0.04); t.hide_render = len(sys.argv) > 4
w = bpy.data.worlds.new("w"); sc.world = w; w.color = (0.5, 0.5, 0.5)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sc.collection.objects.link(sun); sun.data.energy = 2.5; sun.rotation_euler = (0.8, 0.2, 0.7)
views = [("front", (0.4, -2.6, 1.3), (0, -0.1, 0.75), 45), ("side", (2.4, 0.0, 1.0), (0, -0.1, 0.7), 45), ("face", (0.15, -1.0, 1.25), (0, 0, 1.18), 80), ("hands", (0.5, -1.25, 1.35), (0, -0.4, 0.78), 60), ("below", (0.3, -1.6, 0.35), (0, -0.2, 0.7), 40), ("waist", (1.1, -0.5, 0.75), (0, 0.05, 0.62), 45)]
for name, loc, tgt, lens in views:
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name)); sc.collection.objects.link(cam)
    cam.location = loc; cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); cam.data.lens = lens
    sc.camera = cam
    sc.render.resolution_x = sc.render.resolution_y = 500
    sc.render.filepath = os.path.join(out, name + ".png")
    bpy.ops.render.render(write_still=True)
