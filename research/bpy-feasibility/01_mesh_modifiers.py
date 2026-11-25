"""
Point 2 check: build a simple mesh (cube), apply Subdivision Surface,
Solidify and Bevel modifiers via bpy.data.objects[...].modifiers.new(...),
then evaluate the result headless via a depsgraph (object.evaluated_get).

Run with: .venv/bin/python 01_mesh_modifiers.py
"""
import bpy

# Start from a clean default scene.
bpy.ops.wm.read_factory_settings(use_empty=True)

# Build a simple cube mesh via bpy.ops (as a real content pipeline would).
bpy.ops.mesh.primitive_cube_add(size=2.0)
cup = bpy.context.active_object
cup.name = "LowPolyCup"
print("Created object:", cup.name, "type:", cup.type)
print("Base mesh verts/edges/polys:", len(cup.data.vertices), len(cup.data.edges), len(cup.data.polygons))

# --- Modifier 1: Solidify (give the cup wall thickness) ---
solidify = cup.modifiers.new(name="Solidify", type='SOLIDIFY')
solidify.thickness = 0.1
print("Added modifier:", solidify.name, solidify.type)

# --- Modifier 2: Bevel (round the rim/edges) ---
bevel = cup.modifiers.new(name="Bevel", type='BEVEL')
bevel.width = 0.02
bevel.segments = 3
print("Added modifier:", bevel.name, bevel.type)

# --- Modifier 3: Subdivision Surface (smooth the low-poly base) ---
subsurf = cup.modifiers.new(name="Subdivision", type='SUBSURF')
subsurf.levels = 2
subsurf.render_levels = 2
print("Added modifier:", subsurf.name, subsurf.type)

print("Modifier stack order:", [m.name for m in cup.modifiers])

# --- Evaluate the result headless, with no display/GPU attached ---
depsgraph = bpy.context.evaluated_depsgraph_get()
eval_obj = cup.evaluated_get(depsgraph)
eval_mesh = eval_obj.to_mesh()

print("Evaluated mesh verts:", len(eval_mesh.vertices))
print("Evaluated mesh edges:", len(eval_mesh.edges))
print("Evaluated mesh polys:", len(eval_mesh.polygons))

assert len(eval_mesh.vertices) > len(cup.data.vertices), (
    "Expected the evaluated (modified) mesh to have more vertices than the base cube "
    "due to Subdivision + Bevel"
)

eval_obj.to_mesh_clear()

print("RESULT: OK - cube built, Solidify+Bevel+Subsurf applied and evaluated headless with no crash.")
