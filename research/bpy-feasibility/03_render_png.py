"""
Point 4 check: headless rendering of a single frame to PNG, with no
display/GPU attached. Tries Eevee (Blender 5.x renames it EEVEE_NEXT /
'BLENDER_EEVEE_NEXT') first, then falls back to Cycles with device=CPU.

Run with: .venv/bin/python 03_render_png.py
"""
import os
import sys
import bpy

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    bpy.ops.mesh.primitive_cube_add(size=2.0)
    cup = bpy.context.active_object
    cup.name = "LowPolyCup"
    cup.modifiers.new(name="Solidify", type='SOLIDIFY').thickness = 0.1
    bevel = cup.modifiers.new(name="Bevel", type='BEVEL')
    bevel.width = 0.02
    bevel.segments = 3
    subsurf = cup.modifiers.new(name="Subdivision", type='SUBSURF')
    subsurf.levels = 2

    # Basic material so the render isn't just flat grey-on-grey.
    mat = bpy.data.materials.new("CupMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.8, 0.2, 0.2, 1.0)
    cup.data.materials.append(mat)

    # Camera
    cam_data = bpy.data.cameras.new("Cam")
    cam_obj = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = (4, -4, 3)
    cam_obj.rotation_euler = (1.0, 0, 0.8)
    bpy.context.scene.camera = cam_obj

    # Light
    light_data = bpy.data.lights.new("Sun", type='SUN')
    light_data.energy = 3.0
    light_obj = bpy.data.objects.new("Sun", light_data)
    bpy.context.collection.objects.link(light_obj)
    light_obj.rotation_euler = (0.6, 0.2, 0.3)

    scene = bpy.context.scene
    scene.render.resolution_x = 320
    scene.render.resolution_y = 240
    scene.render.image_settings.file_format = 'PNG'
    return scene


def try_render(engine_name, out_filename, extra_setup=None):
    scene = build_scene()
    scene.render.filepath = os.path.join(OUT_DIR, out_filename)
    try:
        scene.render.engine = engine_name
    except Exception as e:
        print(f"Setting engine to {engine_name} raised: {e!r}")
        return False, str(e)

    if extra_setup:
        try:
            extra_setup(scene)
        except Exception as e:
            print(f"extra_setup for {engine_name} raised: {e!r}")

    try:
        bpy.ops.render.render(write_still=True)
    except Exception as e:
        print(f"render.render() with engine={engine_name} raised: {e!r}")
        return False, str(e)

    path = scene.render.filepath
    ok = os.path.exists(path) and os.path.getsize(path) > 0
    print(f"Engine={engine_name} -> wrote {path}: exists={os.path.exists(path)} "
          f"size={os.path.getsize(path) if os.path.exists(path) else 'n/a'}")
    return ok, None


results = {}

print("Available render engines:", [e.identifier for e in bpy.types.RenderEngine.bl_rna.properties['bl_idname'].enum_items] if False else "n/a (checking via scene.render.engine options below)")

# --- Attempt 1: Eevee Next (Blender 5.x default real-time engine) ---
for engine_id in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    ok, err = try_render(engine_id, f"out_render_{engine_id.lower()}.png")
    results[engine_id] = (ok, err)
    if ok:
        break

# --- Attempt 2: Cycles, forced to CPU device (no GPU attached) ---
def force_cpu(scene):
    scene.cycles.device = 'CPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    # Make sure no GPU-only compute device type is selected.
    try:
        prefs.compute_device_type = 'NONE'
    except Exception as e:
        print("Could not set compute_device_type:", e)

ok, err = try_render('CYCLES', 'out_render_cycles_cpu.png', extra_setup=force_cpu)
results['CYCLES_CPU'] = (ok, err)

print()
print("=== Summary ===")
for engine, (ok, err) in results.items():
    print(f"{engine}: {'OK' if ok else 'FAILED'}" + (f" ({err})" if err else ""))

if any(ok for ok, _ in results.values()):
    print("RESULT: OK - at least one render engine produced a PNG headless.")
else:
    print("RESULT: FAILED - no render engine produced a PNG.")
    sys.exit(1)
