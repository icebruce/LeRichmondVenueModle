import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[1])
sc = bpy.context.scene
for o in sc.objects: print("OBJ", o.type, o.name, tuple(round(x,2) for x in o.rotation_euler), tuple(round(x,3) for x in o.scale))
for a in bpy.data.actions: print("ACTION", a.name, a.frame_range[:])
arm = next(o for o in sc.objects if o.type == "ARMATURE")
f0, f1 = map(int, arm.animation_data.action.frame_range)
for f in range(f0, f1 + 1, max(1, (f1 - f0) // 8)):
    sc.frame_set(f)
    h = arm.matrix_world @ arm.pose.bones["Hips"].head
    lh = arm.matrix_world @ arm.pose.bones["LeftHand"].head
    rh = arm.matrix_world @ arm.pose.bones["RightHand"].head
    print("F", f, "hips", tuple(round(x, 2) for x in h), "Lhand", tuple(round(x, 2) for x in lh), "Rhand", tuple(round(x, 2) for x in rh))
