"""
Point 3 check: export the evaluated mesh (cube + Solidify/Bevel/Subsurf,
same as 01_mesh_modifiers.py) to glTF with Draco compression, from inside
the same bpy session, using bpy.ops.export_scene.gltf.

Run with: .venv/bin/python 02_gltf_export_draco.py
"""
import os
import sys
import bpy

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PATH_DRACO = os.path.join(OUT_DIR, "out_cup_draco.glb")
OUT_PATH_PLAIN = os.path.join(OUT_DIR, "out_cup_plain.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)

# Make sure the glTF 2.0 I/O addon is enabled (it ships bundled with bpy,
# but we enable it explicitly as the ticket calls for, since a from-scratch
# bpy session should not rely on it being pre-registered).
try:
    bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    print("addon_enable(io_scene_gltf2) succeeded")
except Exception as e:
    print("addon_enable(io_scene_gltf2) raised:", repr(e))

print("io_scene_gltf2 in addons after enable:", "io_scene_gltf2" in bpy.context.preferences.addons.keys())
print("export_scene.gltf operator available:", hasattr(bpy.ops.export_scene, "gltf"))

# Rebuild the same low-poly-cup mesh + modifier stack as step 1.
bpy.ops.mesh.primitive_cube_add(size=2.0)
cup = bpy.context.active_object
cup.name = "LowPolyCup"
cup.modifiers.new(name="Solidify", type='SOLIDIFY').thickness = 0.1
bevel = cup.modifiers.new(name="Bevel", type='BEVEL')
bevel.width = 0.02
bevel.segments = 3
subsurf = cup.modifiers.new(name="Subdivision", type='SUBSURF')
subsurf.levels = 2
subsurf.render_levels = 2

bpy.context.view_layer.objects.active = cup
cup.select_set(True)

# --- Export WITHOUT Draco first, as a baseline ---
result_plain = bpy.ops.export_scene.gltf(
    filepath=OUT_PATH_PLAIN,
    export_format='GLB',
    use_selection=True,
    export_apply=True,      # bake modifiers into exported mesh
    export_draco_mesh_compression_enable=False,
)
print("Plain GLB export result:", result_plain)
print("Plain GLB exists:", os.path.exists(OUT_PATH_PLAIN), "size:", os.path.getsize(OUT_PATH_PLAIN) if os.path.exists(OUT_PATH_PLAIN) else None)

# --- Export WITH Draco mesh compression ---
try:
    result_draco = bpy.ops.export_scene.gltf(
        filepath=OUT_PATH_DRACO,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    print("Draco GLB export result:", result_draco)
    print("Draco GLB exists:", os.path.exists(OUT_PATH_DRACO), "size:", os.path.getsize(OUT_PATH_DRACO) if os.path.exists(OUT_PATH_DRACO) else None)
    draco_ok = os.path.exists(OUT_PATH_DRACO) and os.path.getsize(OUT_PATH_DRACO) > 0
except Exception as e:
    print("Draco export raised an exception:", repr(e))
    draco_ok = False

if os.path.exists(OUT_PATH_PLAIN) and draco_ok:
    plain_size = os.path.getsize(OUT_PATH_PLAIN)
    draco_size = os.path.getsize(OUT_PATH_DRACO)
    print(f"Plain size: {plain_size} bytes, Draco size: {draco_size} bytes, "
          f"ratio: {draco_size/plain_size:.3f}" if plain_size else "n/a")

if draco_ok:
    print("RESULT: OK - glTF export with Draco compression succeeded from inside the bpy session.")
else:
    print("RESULT: FAILED - Draco glTF export did not produce a valid file.")
    sys.exit(1)
