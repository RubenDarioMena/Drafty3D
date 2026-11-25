"""
Builds a low-poly "cup" (base cube -> Subdivision Surface -> Solidify -> Bevel)
using the pip bpy==5.3.0 wheel, evaluating the mesh after each modifier is
added (mirroring the per-step glTF export this pipeline will eventually do),
and exports each step as a plain (uncompressed) GLB.

Run with: python3 export_cup_steps.py <output_dir>

This is a fresh minimal script (not a copy of the #5 branch's script) written
for ticket #11, to get real uncompressed glTF/GLB files to Draco-compress and
to get real file-size numbers for the "do nothing" option.
"""
import sys
import os

import bpy  # noqa: E402


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def new_cube(name="Cup"):
    bpy.ops.mesh.primitive_cube_add(size=2.0)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def export_step(obj, out_dir, step_name):
    path = os.path.join(out_dir, f"{step_name}.glb")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        export_format="GLB",
        export_apply=True,  # bake modifiers into exported mesh data
        export_draco_mesh_compression_enable=False,
    )
    size = os.path.getsize(path)
    verts = len(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh().vertices)
    print(f"{step_name:>24s}: {size:8d} bytes  ({size/1024:7.2f} KiB)  verts={verts}")
    return path, size, verts


def main():
    out_dir = sys.argv[-1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    reset_scene()
    obj = new_cube()

    results = []

    # Step 1: base cube, no modifiers yet.
    results.append(("01_base_cube", *export_step(obj, out_dir, "01_base_cube")[1:]))

    # Step 2: Bevel the cube's edges first, while the mesh is still simple
    # (this is the order that stays in a sane vert-count range: beveling
    # *after* a Subdivision Surface bevels every micro-edge of an already
    # dense mesh and blows up combinatorially -- tried that first, see the
    # note in the findings doc).
    bevel = obj.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = 0.05
    bevel.segments = 2
    results.append(("02_bevel_seg2", *export_step(obj, out_dir, "02_bevel_seg2")[1:]))

    # Step 3: bump Bevel segments to 4 (rounder rim).
    bevel.segments = 4
    results.append(("03_bevel_seg4", *export_step(obj, out_dir, "03_bevel_seg4")[1:]))

    # Step 4: add Solidify (wall thickness, makes it cup-like/hollow-able).
    solidify = obj.modifiers.new(name="Solidify", type="SOLIDIFY")
    solidify.thickness = 0.08
    results.append(("04_solidify", *export_step(obj, out_dir, "04_solidify")[1:]))

    # Step 5: add Subdivision Surface on top, levels=1 (first smoothing pass).
    subsurf = obj.modifiers.new(name="Subdivision", type="SUBSURF")
    subsurf.levels = 1
    subsurf.render_levels = 1
    results.append(("05_subsurf_lvl1", *export_step(obj, out_dir, "05_subsurf_lvl1")[1:]))

    # Step 6: bump Subdivision to levels=2.
    subsurf.levels = 2
    subsurf.render_levels = 2
    results.append(("06_subsurf_lvl2", *export_step(obj, out_dir, "06_subsurf_lvl2")[1:]))

    # Step 7: bump Subdivision to levels=3 (final polish / smooth-cup step).
    subsurf.levels = 3
    subsurf.render_levels = 3
    results.append(("07_subsurf_lvl3", *export_step(obj, out_dir, "07_subsurf_lvl3")[1:]))

    print("\n--- summary (uncompressed GLB) ---")
    total = 0
    for name, size, verts in results:
        total += size
        print(f"{name:>24s}: {size:8d} bytes  verts={verts}")
    print(f"{'TOTAL (8 steps)':>24s}: {total:8d} bytes ({total/1024:.2f} KiB)")


if __name__ == "__main__":
    main()
