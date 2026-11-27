"""Records the Level 1 and 2 examples (3D Viewport, Object and Edit Mode) in the full Blender app.
Run through `npm run learn:examples`, not directly.

build-examples.mjs starts one Blender per lesson (LEARN_SCENE_ONLY=<lesson>); LEARN_SCENE_ONLY=ui
writes the 3D Viewport's menus and panels first, which every lesson then checks its steps against.
Click points are read from Blender's own mesh while recording (a face's centre, a vertex), never guessed.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from scene import SceneLesson, rounded, scene_ui  # noqa: E402
from sculpt import mode_set, override, run  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1]
UI_FILE = os.path.join(OUT, 'scene-ui.json')


def lesson(module, example, mode, title, text, camera, variant_of=None):
    with open(UI_FILE) as handle:
        ui = json.load(handle)
    return SceneLesson(module=module, example=example, mode=mode, title=title, text=text, camera=camera, ui=ui,
                       out_dir=os.path.join(OUT, module, example), variant_of=variant_of)


def fine(value, coarse=0.1):
    """The coarsest ◀ ▶ step that lands exactly on `value` (0.75 needs 0.05; 0.275 needs 0.005)."""
    return next(step for step in (coarse, 0.05, 0.01, 0.005, 0.001) if abs(round(value / step) * step - value) < 1e-9)


# ---------------------------------------------------------------- scene set-up (before the lesson starts)

def add(kind, name, location=(0, 0, 0), scale=None, collection=None, **props):
    with override():
        getattr(bpy.ops.mesh, f'primitive_{kind}_add')(location=location, **props)
    obj = bpy.context.view_layer.objects.active
    obj.name = obj.data.name = name
    if scale:
        obj.scale = scale
    if collection:
        for user in list(obj.users_collection):
            user.objects.unlink(obj)
        collection.objects.link(obj)
    return obj


def new_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def select_only(obj=None):
    for other in bpy.context.scene.objects:
        other.select_set(False)
    if obj:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def delete_faces(obj, test):
    """Removes the faces whose world centre passes `test` (an open box, a missing floor)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    world = obj.matrix_world
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if test(world @ f.calc_center_median())], context='FACES_ONLY')
    bm.to_mesh(obj.data)
    bm.free()


# ---------------------------------------------------------------- click points, read from Blender's mesh

def _bmesh(obj):
    if obj.mode == 'EDIT':
        return bmesh.from_edit_mesh(obj.data), False
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    return bm, True


def face_point(obj, normal, near=None):
    """Centre of the face that faces `normal` (the one nearest `near` when several do)."""
    bm, own = _bmesh(obj)
    world = obj.matrix_world
    turn = world.to_3x3().inverted().transposed()
    normal = Vector(normal).normalized()
    faces = [(round((turn @ f.normal).normalized().dot(normal), 3), world @ f.calc_center_median()) for f in bm.faces]
    best = max(dot for dot, _ in faces)
    candidates = [center for dot, center in faces if dot == best]
    point = min(candidates, key=lambda c: (c - Vector(near)).length) if near else candidates[0]
    if own:
        bm.free()
    return rounded(point)


def vert_point(obj, near):
    bm, own = _bmesh(obj)
    world = obj.matrix_world
    point = min((world @ v.co for v in bm.verts), key=lambda c: (c - Vector(near)).length)
    if own:
        bm.free()
    return rounded(point)


def edge_point(obj, near, t=0.5):
    """A point along the edge nearest `near` (its middle by default)."""
    bm, own = _bmesh(obj)
    world = obj.matrix_world

    def middle(edge):
        return (world @ edge.verts[0].co).lerp(world @ edge.verts[1].co, 0.5)
    edge = min(bm.edges, key=lambda e: (middle(e) - Vector(near)).length)
    a, b = world @ edge.verts[0].co, world @ edge.verts[1].co
    point = a.lerp(b, t) if a.z <= b.z else b.lerp(a, t)
    if own:
        bm.free()
    return rounded(point)


def obj_point(obj, normal=(0, 0, 1)):
    """A click on an object in Object Mode: the middle of its face toward `normal`."""
    return face_point(obj, normal)


# ---------------------------------------------------------------- 1.1 Look around

VILLAGE = {'position': [9.5, -12.0, 7.0], 'target': [0, 0, 0.8], 'fov': 30}


def village(tower=False):
    ground = add('plane', 'Ground', size=10)
    if tower:
        add('cylinder', 'Tower', location=(0, 0, 2), radius=0.8, depth=4, vertices=12)
        add('cone', 'Spire', location=(0, 0, 4.75), radius1=1.0, depth=1.5, vertices=12)
        add('cube', 'Wall', location=(2.6, 0, 0.6), scale=(1.6, 0.25, 0.6))
    else:
        add('cube', 'House', location=(0, 0, 1))
        add('cone', 'Roof', location=(0, 0, 2.6), radius1=1.6, depth=1.2, vertices=4, rotation=(0, 0, 0.7854))
        add('uv_sphere', 'Tree', location=(3, 2, 1.4), radius=0.9, segments=16, ring_count=8)
        add('cylinder', 'Trunk', location=(3, 2, 0.3), radius=0.2, depth=0.6, vertices=8)
    select_only(None)
    return ground


def look_around():
    les = lesson('basics', 'look-around', 'watch', 'Look around',
                 'Before building anything, learn to move your view. The scene never changes here: only your point of view does.',
                 VILLAGE)
    village()
    les.start()
    yield from les.orbit((0.18, 0.0), text='Orbit: drag with the middle mouse button to circle around the scene.')
    yield from les.zoom(3, text='Zoom in with the mouse wheel. Each click brings the view closer.')
    yield from les.pan((-0.12, -0.06), text='Pan: hold Shift and drag with the middle mouse button to slide the view.')
    yield from les.menu(['View', 'Viewpoint', 'Front'], 'view3d.view_axis',
                        text='View ▸ Viewpoint ▸ Front looks straight at the front. Flat views like this are orthographic: no perspective.')
    yield from les.menu(['View', 'Viewpoint', 'Right'], 'view3d.view_axis', text='Viewpoint ▸ Right shows the right side.')
    yield from les.menu(['View', 'Viewpoint', 'Top'], 'view3d.view_axis', text='Viewpoint ▸ Top looks down from above, like a map.')
    yield from les.orbit((0.05, 0.12), text='Orbit again: Blender switches back to perspective on its own.')
    yield from les.menu(['View', 'Frame All'], 'view3d.view_all', text='View ▸ Frame All fits everything in the view. Use it whenever you get lost.')
    les.finish(text='Orbit, zoom and pan, plus the front, side and top views: that is all you need to look at any model.')


def tower_tour():
    camera = {'position': [10.0, -11.0, 6.5], 'target': [0.8, 0, 1.6], 'fov': 30}
    les = lesson('basics', 'tower-tour', 'your-turn', 'Your turn: tower tour', 'Same moves, new scene. Look at the tower from every side.',
                 camera, variant_of='look-around')
    village(tower=True)
    les.start()
    yield from les.orbit((-0.2, 0.04), text='Orbit to the other side of the tower.',
                         help='Drag with one finger (or the middle mouse button) across the view.')
    yield from les.zoom(2, text='Zoom in a little.', help='Pinch outward with two fingers, or roll the mouse wheel.')
    yield from les.pan((0.1, -0.08), text='Pan the view.', help='Drag with two fingers, or Shift and the middle mouse button.')
    yield from les.menu(['View', 'Viewpoint', 'Front'], 'view3d.view_axis', text='Look from the front.',
                        help='View menu in the header, then Viewpoint, then Front. Numpad 1 does it too.')
    yield from les.menu(['View', 'Viewpoint', 'Right'], 'view3d.view_axis', text='Now from the right.',
                        help='View ▸ Viewpoint ▸ Right. Numpad 3 does it too.')
    yield from les.menu(['View', 'Viewpoint', 'Top'], 'view3d.view_axis', text='Now from the top.',
                        help='View ▸ Viewpoint ▸ Top. Numpad 7 does it too.')
    yield from les.orbit((-0.08, 0.1), text='Orbit out of the top view.', help='Any drag in the view orbits; perspective comes back.')
    yield from les.menu(['View', 'Frame All'], 'view3d.view_all', text='Fit everything in the view.',
                        help='View ▸ Frame All. The Home key does it too.')
    les.finish(text='You can look at a model from anywhere now.')


# ---------------------------------------------------------------- 1.2 Add objects

SHAPES = {'position': [6.5, -10.0, 5.5], 'target': [0, 0, 0.2], 'fov': 30}


def add_objects():
    les = lesson('basics', 'add-objects', 'watch', 'Add objects',
                 'Every model starts from simple shapes. The Add menu puts a new object at the 3D cursor, '
                 'the red and white ring in the middle of the scene.', SHAPES)
    les.start()
    yield from les.menu(['Add', 'Mesh', 'Cube'], 'mesh.primitive_cube_add',
                        text='Add ▸ Mesh ▸ Cube. A cube appears at the 3D cursor, already selected.')
    les.redo_value('size', 1.0, step=0.1,
                   text='The Adjust Last Operation panel opens in the corner. Set Size to 1 m for a smaller cube.')
    yield from les.menu(['Add', 'Mesh', 'Cylinder'], 'mesh.primitive_cylinder_add',
                        text='Add ▸ Mesh ▸ Cylinder. It also lands on the 3D cursor, right through the cube.')
    les.redo_value('vertices', 8, step=1, text='Set Vertices to 8: fewer sides make a chunky, eight-sided cylinder.')
    les.redo_value('location.x', 2.0, step=0.1, text='Location moves the new object. Set X to 2 m: the cylinder slides to the right.')
    yield from les.menu(['Add', 'Mesh', 'UV Sphere'], 'mesh.primitive_uv_sphere_add',
                        text='Add ▸ Mesh ▸ UV Sphere, a ball made of rings and segments.')
    les.redo_value('segments', 12, step=1, text='Set Segments to 12: the slices around the ball.')
    les.redo_value('ring_count', 6, step=1, text='Set Rings to 6: the bands from top to bottom. Low numbers give a faceted gem.')
    les.redo_value('location.x', -2.0, step=0.1, text='Set Location X to −2 m to put the ball on the left.')
    les.finish(text='New objects start at the 3D cursor, and Adjust Last Operation tunes them right after adding.')


def add_shapes():
    les = lesson('basics', 'add-shapes', 'your-turn', 'Your turn: add shapes', 'Add the same three shapes with other sizes.',
                 SHAPES, variant_of='add-objects')
    les.start()
    yield from les.menu(['Add', 'Mesh', 'Cube'], 'mesh.primitive_cube_add', text='Add a cube.',
                        help='Add menu in the header, then Mesh, then Cube. Shift A opens the Add menu.')
    les.redo_value('size', 1.5, step=0.1, text='Set its Size to 1.5 m.', help='Size is the first field of the Adjust Last Operation panel.')
    yield from les.menu(['Add', 'Mesh', 'Cylinder'], 'mesh.primitive_cylinder_add', text='Add a cylinder.',
                        help='Add ▸ Mesh ▸ Cylinder.')
    les.redo_value('vertices', 6, step=1, text='Give it 6 vertices.', help='Vertices is at the top of the panel.')
    les.redo_value('location.x', -2.5, step=0.1, text='Move it to X −2.5 m.', help='Location X is under Align in the panel.')
    yield from les.menu(['Add', 'Mesh', 'UV Sphere'], 'mesh.primitive_uv_sphere_add', text='Add a UV sphere.',
                        help='Add ▸ Mesh ▸ UV Sphere.')
    les.redo_value('segments', 16, step=1, text='Set Segments to 16.', help='Segments is the first field.')
    les.redo_value('ring_count', 8, step=1, text='Set Rings to 8.', help='Rings is right under Segments.')
    les.redo_value('location.x', 2.5, step=0.1, text='Move it to X 2.5 m.', help='Location X in the panel.')
    les.finish(text='Three shapes, sized and placed by number.')


# ---------------------------------------------------------------- 1.3 Move, rotate and scale

TABLETOP = {'position': [4.6, -7.2, 4.4], 'target': [0, 0, 0.9], 'fov': 30}


def blocks(names=('Box', 'Ball')):
    box = add('cube', names[0], location=(-1.5, 0, 0.5), size=1)
    ball = add('uv_sphere', names[1], location=(1.5, 0, 0.5), radius=0.5, segments=24, ring_count=12)
    select_only(None)
    return box, ball


def move_rotate_scale():
    les = lesson('basics', 'move-rotate-scale', 'watch', 'Move, rotate and scale',
                 'Move, Rotate and Scale are the moves you will use most. Each one works on the selected object, '
                 'and Adjust Last Operation turns a rough drag into an exact number.', TABLETOP)
    box, ball = blocks()
    les.start()
    yield from les.tap(obj_point(box), text='Click the box to select it. Selected objects get an orange outline.')
    yield from les.menu(['Object', 'Transform', 'Move'], 'transform.translate',
                        {'value': (0, 0, 0.3), 'constraint_axis': (False, False, True)},
                        text='Object ▸ Transform ▸ Move, then drag. Pressing Z while moving locks it to the Z axis: straight up.')
    les.redo_value('value.z', 1.0, step=0.1, text='The drag stopped at 0.3 m. In the panel, type Move Z 1 m for an exact lift.')
    yield from les.menu(['Object', 'Transform', 'Rotate'], 'transform.rotate',
                        {'value': 20, 'orient_axis': 'Z', 'constraint_axis': (False, False, True)},
                        text='Object ▸ Transform ▸ Rotate turns it. Pressing Z first spins it around the up axis.')
    les.redo_value('value', 45, step=1, text='Set Angle to 45° to turn it exactly half of a right angle.')
    yield from les.menu(['Object', 'Transform', 'Scale'], 'transform.resize',
                        {'value': (1, 1, 1.3), 'constraint_axis': (False, False, True)},
                        text='Object ▸ Transform ▸ Scale, locked to Z: the box grows taller only.')
    les.redo_value('value.z', 2.0, step=0.1, text='Set Scale Z to 2: twice as tall.')
    yield from les.tap(obj_point(ball), text='Click the ball. The box is no longer selected.')
    yield from les.menu(['Object', 'Transform', 'Move'], 'transform.translate',
                        {'value': (0.4, 0, 0), 'constraint_axis': (True, False, False)},
                        text='Move it again, this time locked to X: left and right.')
    les.redo_value('value.x', 1.0, step=0.1, text='Set Move X to 1 m.')
    les.finish(text='Move (G), Rotate (R) and Scale (S), each locked to one axis and finished with exact numbers.')


def arrange_blocks():
    les = lesson('basics', 'arrange-blocks', 'your-turn', 'Your turn: arrange blocks',
                 'Same tools, other numbers. Stand the block up and roll the ball away.', TABLETOP, variant_of='move-rotate-scale')
    box, ball = blocks(('Block', 'Marble'))
    les.start()
    yield from les.tap(obj_point(box), text='Select the block.', help='Tap the cube on the left.')
    yield from les.menu(['Object', 'Transform', 'Move'], 'transform.translate',
                        {'value': (0, 0, 0.2), 'constraint_axis': (False, False, True)}, text='Move it up.',
                        help='Object ▸ Transform ▸ Move. G is the shortcut, then Z to go straight up.')
    les.redo_value('value.z', 0.5, step=0.1, text='Make it exactly 0.5 m up.', help='Move Z in the Adjust Last Operation panel.')
    yield from les.menu(['Object', 'Transform', 'Rotate'], 'transform.rotate',
                        {'value': 15, 'orient_axis': 'Z', 'constraint_axis': (False, False, True)}, text='Rotate it around Z.',
                        help='Object ▸ Transform ▸ Rotate. R, then Z.')
    les.redo_value('value', 30, step=1, text='Set the angle to 30°.', help='Angle is the first field of the panel.')
    yield from les.menu(['Object', 'Transform', 'Scale'], 'transform.resize',
                        {'value': (1, 1, 1.2), 'constraint_axis': (False, False, True)}, text='Scale it on Z.',
                        help='Object ▸ Transform ▸ Scale. S, then Z.')
    les.redo_value('value.z', 3.0, step=0.1, text='Make it 3 times as tall.', help='Scale Z in the panel.')
    yield from les.tap(obj_point(ball), text='Select the marble.', help='Tap the ball on the right.')
    yield from les.menu(['Object', 'Transform', 'Move'], 'transform.translate',
                        {'value': (0.3, 0, 0), 'constraint_axis': (True, False, False)}, text='Move it along X.',
                        help='Object ▸ Transform ▸ Move. G, then X.')
    les.redo_value('value.x', 1.5, step=0.1, text='Make it exactly 1.5 m.', help='Move X in the panel.')
    les.finish(text='Placed, turned and stretched by number.')


# ---------------------------------------------------------------- 1.4 Duplicate and organize

FENCE = {'position': [2.6, -4.3, 2.1], 'target': [0, 0, 0.5], 'fov': 30}


def posts(collection_name, name):
    fence = new_collection(collection_name)
    post = add('cube', name, location=(-0.6, 0, 0.5), scale=(0.1, 0.1, 0.5), size=2, collection=fence)
    select_only(None)
    return post


def fence():
    les = lesson('basics', 'fence', 'watch', 'Duplicate and organize',
                 'Many models repeat the same piece. Duplicate copies it, and the Outliner, the list on the right, '
                 'keeps the copies named and grouped in a collection.', FENCE)
    post = posts('Fence', 'Post')
    les.start()
    yield from les.tap(obj_point(post, (0, -1, 0)), text='Click the post to select it.')
    yield from les.menu(['Object', 'Duplicate Objects'], 'object.duplicate_move',
                        {'TRANSFORM_OT_translate': {'value': (0.3, 0, 0), 'constraint_axis': (True, False, False)}},
                        text='Object ▸ Duplicate Objects makes a copy and starts moving it. Pressing X keeps it on the X axis.')
    les.redo_value('TRANSFORM_OT_translate.value.x', 0.6, step=0.1, text='Set Move X to 0.6 m: one post every 60 cm.')
    yield from les.menu(['Object', 'Duplicate Objects'], 'object.duplicate_move',
                        {'TRANSFORM_OT_translate': {'value': (0.3, 0, 0), 'constraint_axis': (True, False, False)}},
                        text='Duplicate the new post the same way.')
    les.redo_value('TRANSFORM_OT_translate.value.x', 0.6, step=0.1, text='Again Move X 0.6 m. Three posts, evenly spaced.')
    les.outliner_select('Post', text='In the Outliner, click Post, the first one. The list shows every object in the Fence collection.')
    les.rename('Post', 'Corner Post', text='Double-click its name and type Corner Post. Good names save time later.')
    les.outliner_hide('Fence', True, text='Click the eye of the Fence collection: everything in it hides at once.')
    les.outliner_hide('Fence', False, text='Click the eye again to bring the fence back.')
    yield from les.menu(['Select', 'All'], 'object.select_all', text='Select ▸ All selects every object in the scene.')
    les.finish(text='Duplicate repeats a piece; the Outliner names, groups and hides them.')


def pillars():
    camera = {'position': [3.2, -5.2, 2.6], 'target': [0.3, 0, 0.6], 'fov': 30}
    les = lesson('basics', 'pillars', 'your-turn', 'Your turn: pillars', 'Make a row of pillars and tidy it up in the Outliner.',
                 camera, variant_of='fence')
    pillar = posts('Colonnade', 'Pillar')
    pillar.scale = (0.15, 0.15, 0.6)
    pillar.location.z = 0.6
    les.start()
    yield from les.tap(obj_point(pillar, (0, -1, 0)), text='Select the pillar.', help='Tap the pillar.')
    yield from les.menu(['Object', 'Duplicate Objects'], 'object.duplicate_move',
                        {'TRANSFORM_OT_translate': {'value': (0.4, 0, 0), 'constraint_axis': (True, False, False)}},
                        text='Duplicate it along X.', help='Object ▸ Duplicate Objects. Shift D is the shortcut, then X.')
    les.redo_value('TRANSFORM_OT_translate.value.x', 0.9, step=0.1, text='Space it 0.9 m away.',
                   help='Move X in the Adjust Last Operation panel.')
    yield from les.menu(['Object', 'Duplicate Objects'], 'object.duplicate_move',
                        {'TRANSFORM_OT_translate': {'value': (0.4, 0, 0), 'constraint_axis': (True, False, False)}},
                        text='Duplicate the new one.', help='Object ▸ Duplicate Objects again.')
    les.redo_value('TRANSFORM_OT_translate.value.x', 0.9, step=0.1, text='Also 0.9 m.', help='Move X in the panel.')
    les.outliner_select('Pillar.001', text='In the Outliner, select the middle pillar, Pillar.001.', help='Tap its row in the Outliner.')
    les.rename('Pillar.001', 'Middle Pillar', text='Rename it Middle Pillar.', help='Double-tap the name in the Outliner, then type.')
    les.outliner_hide('Colonnade', True, text='Hide the whole Colonnade collection.', help='The eye at the right of the collection row.')
    les.outliner_hide('Colonnade', False, text='Show it again.', help='Tap the same eye.')
    yield from les.menu(['Select', 'All'], 'object.select_all', text='Select everything.', help='Select ▸ All. A is the shortcut.')
    les.finish(text='A tidy, named colonnade.')


# ---------------------------------------------------------------- 1.5 Blender's modes

MODES = {'position': [3.6, -5.4, 3.4], 'target': [0, 0, 0.9], 'fov': 30}


def modes():
    les = lesson('basics', 'modes', 'watch', 'Object, Edit and Sculpt Mode',
                 'Object Mode moves whole objects. Edit Mode changes their shape, point by point. '
                 'Sculpt Mode shapes them like clay. The mode menu at the left of the header switches between them.', MODES)
    block = add('cube', 'Block', location=(0, 0, 0.5), size=1)
    les.start()
    les.set_mode('EDIT', text='Open the mode menu and pick Edit Mode. Now you see the points, edges and faces of the block.')
    les.select_mode('FACE', text='Click Face select in the header: clicks now pick whole faces.')
    yield from les.tap(face_point(block, (0, 0, 1)), text='Click the top face. Only that face is selected.')
    yield from les.menu(['Mesh', 'Transform', 'Move'], 'transform.translate',
                        {'value': (0, 0, 0.3), 'constraint_axis': (False, False, True)},
                        text='Mesh ▸ Transform ▸ Move, locked to Z. Only the top face moves, so the block stretches.')
    les.redo_value('value.z', 1.0, step=0.1, text='Set Move Z to 1 m. The block becomes a tall box.')
    les.set_mode('OBJECT', text='Back to Object Mode: the shape stays changed, and you move the whole object again.')
    les.set_mode('SCULPT', text='Sculpt Mode shows brushes instead. The header changes with every mode.')
    les.set_mode('OBJECT', text='And back to Object Mode. Tab toggles Edit Mode; Ctrl Tab opens a pie with all modes.')
    les.finish(text='Object Mode for whole objects, Edit Mode for their parts, Sculpt Mode for clay-like shaping.')


def modes_tower():
    les = lesson('basics', 'modes-tower', 'your-turn', 'Your turn: modes', 'Switch modes and raise a block into a tower.',
                 {'position': [4.2, -6.2, 4.4], 'target': [0, 0, 1.3], 'fov': 30}, variant_of='modes')
    block = add('cube', 'Block', location=(0, 0, 0.5), size=1)
    les.start()
    les.set_mode('EDIT', text='Go to Edit Mode.', help='The mode menu at the left of the header. Tab also works.')
    les.select_mode('FACE', text='Switch to face select.', help='The third of the three select buttons in the header. 3 on the keyboard.')
    yield from les.tap(face_point(block, (0, 0, 1)), text='Select the top face.', help='Tap the top of the block.')
    yield from les.menu(['Mesh', 'Transform', 'Move'], 'transform.translate',
                        {'value': (0, 0, 0.4), 'constraint_axis': (False, False, True)}, text='Move it up along Z.',
                        help='Mesh ▸ Transform ▸ Move. G, then Z.')
    les.redo_value('value.z', 1.8, step=0.1, text='Raise it to Move Z 1.8 m: a tower.', help='Move Z in the Adjust Last Operation panel.')
    les.set_mode('OBJECT', text='Back to Object Mode.', help='The mode menu, Object Mode.')
    les.set_mode('SCULPT', text='Peek at Sculpt Mode.', help='The mode menu, Sculpt Mode.')
    les.set_mode('OBJECT', text='Back to Object Mode.', help='The mode menu, Object Mode.')
    les.finish(text='Three modes, three ways to work.')


# ---------------------------------------------------------------- Project 1: a table and a stool

DINING = {'position': [3.4, -4.4, 2.7], 'target': [0.5, 0, 0.4], 'fov': 30}


def leg_point(leg):
    """Low on the front of a leg, below the tabletop's edge as the camera sees it."""
    x, y, _z = face_point(leg, (0, -1, 0))
    return [x, y, 0.15]


def furniture(les, top, leg, stool, texts, helps):
    """Tabletop, four legs (two duplicates) and a stool. `top`, `leg` and `stool` hold the numbers."""
    h = helps.get
    yield from les.menu(['Add', 'Mesh', 'Cube'], 'mesh.primitive_cube_add', text=texts['top'], help=h('add'))
    les.redo_value('location.z', top['z'], step=fine(top['z']), text=f'Set Location Z to {top["z"]} m: the height of the top.', help=h('location'))
    yield from les.menu(['Object', 'Transform', 'Scale'], 'transform.resize', {'value': (1.2, 1.2, 1.2)},
                        text='Object ▸ Transform ▸ Scale. The drag scales all three axes; the panel sets each one.', help=h('scale'))
    les.redo_value('value.x', top['scale'][0], step=fine(top['scale'][0]), text=f'Scale X {top["scale"][0]}: the length.', help=h('scale_x'))
    les.redo_value('value.y', top['scale'][1], step=fine(top['scale'][1]), text=f'Scale Y {top["scale"][1]}: the width.', help=h('scale_y'))
    les.redo_value('value.z', top['scale'][2], step=fine(top['scale'][2]), text=f'Scale Z {top["scale"][2]}: a thin board.', help=h('scale_z'))
    yield from les.menu(['Add', 'Mesh', 'Cube'], 'mesh.primitive_cube_add', text=texts['leg'], help=h('add'))
    les.redo_value('size', leg['size'], step=fine(leg['size']), text=f'Size {leg["size"]} m: as thick as a leg.', help=h('size'))
    les.redo_value('location.x', leg['at'][0], step=fine(leg['at'][0]), text=f'Location X {leg["at"][0]} m, under a corner.', help=h('location'))
    les.redo_value('location.y', leg['at'][1], step=fine(leg['at'][1]), text=f'Location Y {leg["at"][1]} m.', help=h('location'))
    les.redo_value('location.z', leg['at'][2], step=fine(leg['at'][2]), text=f'Location Z {leg["at"][2]} m: halfway up.', help=h('location'))
    yield from les.menu(['Object', 'Transform', 'Scale'], 'transform.resize',
                        {'value': (1, 1, 2), 'constraint_axis': (False, False, True)},
                        text='Scale it on Z only, to stretch it into a leg.', help=h('scale'))
    les.redo_value('value.z', leg['stretch'], step=fine(leg['stretch']), text=f'Scale Z {leg["stretch"]}: it now reaches the top.', help=h('scale_z'))
    yield from les.menu(['Object', 'Duplicate Objects'], 'object.duplicate_move',
                        {'TRANSFORM_OT_translate': {'value': (-0.3, 0, 0), 'constraint_axis': (True, False, False)}},
                        text='Duplicate the leg along X.', help=h('duplicate'))
    les.redo_value('TRANSFORM_OT_translate.value.x', round(-2 * leg['at'][0], 4), step=fine(round(-2 * leg['at'][0], 4)),
                   text=f'Move X {round(-2 * leg["at"][0], 4)} m, to the other front corner.', help=h('move_x'))
    yield from les.tap(leg_point(bpy.data.objects['Cube.001']), text='Click the first leg.', help=h('tap'))
    yield from les.tap(leg_point(bpy.data.objects['Cube.002']), toggle=True,
                       text='Shift-click the copy: now both legs are selected.', help=h('shift'))
    yield from les.menu(['Object', 'Duplicate Objects'], 'object.duplicate_move',
                        {'TRANSFORM_OT_translate': {'value': (0, 0.3, 0), 'constraint_axis': (False, True, False)}},
                        text='Duplicate both at once, along Y, toward the back.', help=h('duplicate'))
    les.redo_value('TRANSFORM_OT_translate.value.y', round(-2 * leg['at'][1], 4), step=fine(round(-2 * leg['at'][1], 4)),
                   text=f'Move Y {round(-2 * leg["at"][1], 4)} m: four legs.', help=h('move_y'))
    yield from les.menu(['Add', 'Mesh', 'Cylinder'], 'mesh.primitive_cylinder_add', text=texts['stool'], help=h('add_cylinder'))
    les.redo_value('radius', stool['radius'], step=fine(stool['radius']), text=f'Radius {stool["radius"]} m.', help=h('radius'))
    les.redo_value('depth', stool['depth'], step=fine(stool['depth']), text=f'Depth {stool["depth"]} m: its height.', help=h('depth'))
    les.redo_value('location.x', stool['at'][0], step=fine(stool['at'][0]), text=f'Location X {stool["at"][0]} m, beside the table.', help=h('location'))
    les.redo_value('location.z', stool['at'][2], step=fine(stool['at'][2]), text=f'Location Z {stool["at"][2]} m: half its height, so it stands on the floor.',
                   help=h('location'))


def project_table():
    les = lesson('basics', 'project-table', 'watch', 'Project: table and stool',
                 'Everything from this level together: add boxes and a cylinder, size them by number, duplicate and arrange.',
                 DINING)
    les.start()
    yield from furniture(
        les, {'z': 0.75, 'scale': (0.8, 0.5, 0.05)}, {'size': 0.1, 'at': (0.7, -0.4, 0.35), 'stretch': 7.0},
        {'radius': 0.3, 'depth': 0.45, 'at': (1.6, 0, 0.225)},
        {'top': 'Add ▸ Mesh ▸ Cube for the tabletop.', 'leg': 'Add another cube for a leg. It appears at the 3D cursor, at the floor.',
         'stool': 'Add ▸ Mesh ▸ Cylinder for a stool.'}, {})
    les.finish(text='A table and a stool from boxes and a cylinder, all measured. That is Level 1.')


def project_desk():
    les = lesson('basics', 'project-desk', 'your-turn', 'Your turn: desk and stool',
                 'Build a long, low desk and a taller stool with the same steps.', DINING, variant_of='project-table')
    les.start()
    yield from furniture(
        les, {'z': 0.7, 'scale': (1.0, 0.45, 0.04)}, {'size': 0.08, 'at': (0.9, -0.35, 0.33), 'stretch': 8.25},
        {'radius': 0.25, 'depth': 0.55, 'at': (1.8, 0, 0.275)},
        {'top': 'Add a cube for the desktop.', 'leg': 'Add a cube for a leg.', 'stool': 'Add a cylinder for the stool.'},
        {'add': 'Add ▸ Mesh ▸ Cube. Shift A opens the Add menu.', 'location': 'Location is in the Adjust Last Operation panel.',
         'scale': 'Object ▸ Transform ▸ Scale. S is the shortcut.', 'scale_x': 'Scale X in the panel.',
         'scale_y': 'Scale Y in the panel.', 'scale_z': 'Scale Z in the panel.', 'size': 'Size is the first field of the panel.',
         'duplicate': 'Object ▸ Duplicate Objects. Shift D is the shortcut.', 'move_x': 'Move X in the panel.',
         'move_y': 'Move Y in the panel.', 'tap': 'Tap the first leg you made.', 'shift': 'Turn on the ⇧ Shift key, then tap the copy.',
         'add_cylinder': 'Add ▸ Mesh ▸ Cylinder.', 'radius': 'Radius is under Vertices.', 'depth': 'Depth is under Radius.'})
    les.finish(text='Your own desk and stool. Level 1 done.')


# ---------------------------------------------------------------- Level 2 set-up

def cut_middle(obj, z=0.0):
    """A ring of edges around the middle (bisect at height z), so there is a loop to select."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def edit_obj():
    return bpy.context.view_layer.objects.active


# ---------------------------------------------------------------- 2.1 Points, lines and faces

CAN = {'position': [3.6, -5.2, 3.0], 'target': [0, 0, 0], 'fov': 30}


def select_parts_lesson(les, obj, picks, texts, helps):
    h = helps.get
    les.set_mode('EDIT', text=texts['edit'], help=h('edit'))
    yield from les.menu(['Select', 'None'], 'mesh.select_all', text=texts['none'], help=h('none'))
    yield from les.tap(vert_point(obj, picks['vert']), text=texts['vert'], help=h('vert'))
    yield from les.tap(vert_point(obj, picks['vert2']), toggle=True, text=texts['vert2'], help=h('vert2'))
    les.select_mode('EDGE', text=texts['edge_mode'], help=h('edge_mode'))
    yield from les.tap(edge_point(obj, picks['edge']), text=texts['edge'], help=h('edge'))
    yield from les.menu(['Select', 'Select Loops', 'Edge Loops'], 'mesh.select_edge_loop_multi', text=texts['loop'], help=h('loop'))
    les.select_mode('FACE', text=texts['face_mode'], help=h('face_mode'))
    yield from les.tap(face_point(obj, picks['face']), text=texts['face'], help=h('face'))


def select_parts():
    les = lesson('modeling', 'select-parts', 'watch', 'Points, lines and faces',
                 'In Edit Mode a mesh is made of vertices (points), edges (lines between them) and faces (the surfaces). '
                 'You change a shape by selecting some of them first.', CAN)
    can = add('cylinder', 'Can', vertices=8)
    cut_middle(can)
    les.start()
    yield from select_parts_lesson(les, can, {
        'vert': (0.38, -0.92, 1), 'vert2': (0.38, -0.92, 0), 'edge': (0.65, -0.65, 0), 'face': (0, 0, 1)}, {
        'edit': 'Switch to Edit Mode. Everything is selected (orange) because the cylinder was just added.',
        'none': 'Select ▸ None clears the selection, so you start fresh.',
        'vert': 'In vertex select mode, click a corner on the rim to select that vertex.',
        'vert2': 'Shift-click the vertex below it to add it. The edge between them lights up too.',
        'edge_mode': 'Switch to Edge select in the header. Now clicks pick edges.',
        'edge': 'Click an edge of the middle ring.',
        'loop': 'Select ▸ Select Loops ▸ Edge Loops grows it into the whole ring around the can. Alt-click does the same.',
        'face_mode': 'Switch to Face select: the selection keeps only whole faces.',
        'face': 'Click the top to select that one face.'}, {})
    les.finish(text='Vertices, edges and faces, one at a time, with Shift, or as a whole loop. Every edit starts here.')


def select_parts_prism():
    les = lesson('modeling', 'select-parts-prism', 'your-turn', 'Your turn: select parts',
                 'Pick parts of a six-sided prism: two corners, a ring and a face.', CAN, variant_of='select-parts')
    prism = add('cylinder', 'Prism', vertices=6)
    cut_middle(prism, 0.3)
    les.start()
    yield from select_parts_lesson(les, prism, {
        'vert': (0.87, -0.5, 1), 'vert2': (0, -1, 1), 'edge': (0.43, -0.75, 0.3), 'face': (0.43, -0.75, -0.3)}, {
        'edit': 'Go to Edit Mode.', 'none': 'Clear the selection.', 'vert': 'Select a corner of the top.',
        'vert2': 'Add the next corner along the rim.', 'edge_mode': 'Switch to edge select.', 'edge': 'Select an edge of the ring.',
        'loop': 'Select the whole ring.', 'face_mode': 'Switch to face select.', 'face': 'Select a side face below the ring.'}, {
        'edit': 'The mode menu at the left of the header. Tab also works.', 'none': 'Select ▸ None. Alt A is the shortcut.',
        'vert': 'Tap the corner on the right of the top.', 'vert2': 'Turn on ⇧ Shift, then tap the corner at the front.',
        'edge_mode': 'The middle of the three select buttons. 2 on the keyboard.', 'edge': 'Tap an edge of the ring around the middle.',
        'loop': 'Select ▸ Select Loops ▸ Edge Loops.', 'face_mode': 'The third select button. 3 on the keyboard.',
        'face': 'Tap the front face, under the ring.'})
    les.finish(text='You can grab exactly the parts you want.')


# ---------------------------------------------------------------- 2.2 Extrude

BODY = {'position': [3.6, -5.6, 3.4], 'target': [0.4, 0, 1.0], 'fov': 30}


def extrude_lesson(les, obj, first, second, texts, helps):
    h = helps.get
    les.set_mode('EDIT', text=texts['edit'], help=h('edit'))
    les.select_mode('FACE', text=texts['face_mode'], help=h('face_mode'))
    yield from les.tap(face_point(obj, (0, 0, 1)), text=texts['top'], help=h('top'))
    yield from les.menu(['Face', 'Extrude Faces'], 'mesh.extrude_region_move',
                        {'TRANSFORM_OT_translate': {'value': (0, 0, 0.3)}}, text=texts['extrude'], help=h('extrude'))
    les.redo_value('TRANSFORM_OT_translate.value.z', first, step=0.1, text=texts['first'], help=h('first'))
    yield from les.tap(face_point(obj, second['normal'], second['near']), text=texts['side'], help=h('side'))
    yield from les.menu(['Face', 'Extrude Faces'], 'mesh.extrude_region_move',
                        {'TRANSFORM_OT_translate': {'value': (0, 0, 0.2)}}, text=texts['extrude2'], help=h('extrude'))
    les.redo_value('TRANSFORM_OT_translate.value.z', second['length'], step=0.1, text=texts['second'], help=h('first'))


def extrude_arm():
    les = lesson('modeling', 'extrude-arm', 'watch', 'Extrude',
                 'Extrude pulls a face out and builds new sides behind it: the way to grow legs, arms and handles out of a shape.',
                 BODY)
    body = add('cube', 'Body', location=(0, 0, 0.5), size=1)
    les.start()
    yield from extrude_lesson(les, body, 1.0, {'normal': (1, 0, 0), 'near': (0.5, 0, 1.5), 'length': 0.8}, {
        'edit': 'Edit Mode.', 'face_mode': 'Face select mode.', 'top': 'Click the top face.',
        'extrude': 'Face ▸ Extrude Faces, then drag: the face moves out along its normal, the direction it faces, and new sides fill the gap.',
        'first': 'In Adjust Last Operation, set Move Z to 1 m. Z here means "along the face", not up in the world.',
        'side': 'Click the right side of the new part.',
        'extrude2': 'Extrude it too. This face looks to the right, so it grows to the right.',
        'second': 'Set Move Z to 0.8 m: an arm.'}, {})
    les.finish(text='Extrude grows new geometry from any face. E is its shortcut.')


def extrude_crane():
    les = lesson('modeling', 'extrude-crane', 'your-turn', 'Your turn: extrude a crane',
                 'Grow a tall column, then a long boom from its front.', {'position': [4.2, -6.2, 3.8], 'target': [0, -0.4, 1.2], 'fov': 30},
                 variant_of='extrude-arm')
    body = add('cube', 'Base', location=(0, 0, 0.5), size=1)
    les.start()
    yield from extrude_lesson(les, body, 1.6, {'normal': (0, -1, 0), 'near': (0, -0.5, 1.9), 'length': 1.2}, {
        'edit': 'Edit Mode.', 'face_mode': 'Face select mode.', 'top': 'Select the top face.', 'extrude': 'Extrude it.',
        'first': 'Make it 1.6 m tall.', 'side': 'Select the front face at the top of the column.', 'extrude2': 'Extrude it.',
        'second': 'Make the boom 1.2 m long.'}, {
        'edit': 'The mode menu, or Tab.', 'face_mode': 'The third select button, or 3.', 'top': 'Tap the top of the cube.',
        'extrude': 'Face ▸ Extrude Faces. E is the shortcut.', 'first': 'Move Z in the Adjust Last Operation panel.',
        'side': 'Tap the face looking at you, at the top of the new column.'})
    les.finish(text='A crane, all from one cube.')


# ---------------------------------------------------------------- 2.3 Inset and extrude inward

BOX = {'position': [3.6, -5.0, 4.2], 'target': [0, 0, 0.8], 'fov': 30}


def inset_lesson(les, obj, face, thickness, depth, texts, helps):
    h = helps.get
    les.set_mode('EDIT', text=texts['edit'], help=h('edit'))
    les.select_mode('FACE', text=texts['face_mode'], help=h('face_mode'))
    yield from les.tap(face_point(obj, face), text=texts['face'], help=h('face'))
    yield from les.menu(['Face', 'Inset Faces'], 'mesh.inset', {'thickness': 0.1}, text=texts['inset'], help=h('inset'))
    les.redo_value('thickness', thickness, step=0.01, text=texts['thickness'], help=h('thickness'))
    yield from les.menu(['Face', 'Extrude Faces'], 'mesh.extrude_region_move',
                        {'TRANSFORM_OT_translate': {'value': (0, 0, -0.3)}}, text=texts['extrude'], help=h('extrude'))
    les.redo_value('TRANSFORM_OT_translate.value.z', depth, step=0.1, text=texts['depth'], help=h('depth'))


def inset_planter():
    les = lesson('modeling', 'inset-planter', 'watch', 'Inset and extrude inward',
                 'Inset makes a smaller face inside a face, leaving a frame around it. Extrude that face inward and you get a hole: '
                 'a box, a window, a drawer.', BOX)
    box = add('cube', 'Planter', location=(0, 0, 0.8), scale=(1, 1, 0.8))
    les.start()
    yield from inset_lesson(les, box, (0, 0, 1), 0.15, -1.2, {
        'edit': 'Edit Mode.', 'face_mode': 'Face select mode.', 'face': 'Click the top face.',
        'inset': 'Face ▸ Inset Faces, then drag: a smaller face appears inside, with a frame around it.',
        'thickness': 'Set Thickness to 0.15 m: the width of the frame, so the walls are 15 cm thick.',
        'extrude': 'Face ▸ Extrude Faces and drag inward: the inner face sinks into the box.',
        'depth': 'Set Move Z to −1.2 m: a negative distance goes against the face, into the box.'}, {})
    les.finish(text='Inset then extrude inward: the recipe for every hollow, from a planter to a mug.')


def inset_drawer():
    les = lesson('modeling', 'inset-drawer', 'your-turn', 'Your turn: a niche',
                 'Open a niche in the front of a cabinet.', {'position': [3.2, -5.6, 2.6], 'target': [0, 0, 0.8], 'fov': 30},
                 variant_of='inset-planter')
    box = add('cube', 'Cabinet', location=(0, 0, 0.8), scale=(1, 0.6, 0.8))
    les.start()
    yield from inset_lesson(les, box, (0, -1, 0), 0.2, -0.8, {
        'edit': 'Edit Mode.', 'face_mode': 'Face select mode.', 'face': 'Select the front face.', 'inset': 'Inset it.',
        'thickness': 'Make the frame 0.2 m wide.', 'extrude': 'Extrude it inward.', 'depth': 'Sink it 0.8 m.'}, {
        'edit': 'The mode menu, or Tab.', 'face_mode': 'The third select button, or 3.', 'face': 'Tap the face looking at you.',
        'inset': 'Face ▸ Inset Faces. I is the shortcut.', 'thickness': 'Thickness in the Adjust Last Operation panel.',
        'extrude': 'Face ▸ Extrude Faces.', 'depth': 'Move Z −0.8 in the panel (negative goes inward).'})
    les.finish(text='A cabinet with a niche.')


# ---------------------------------------------------------------- 2.4 Loop cut

BARREL = {'position': [3.4, -5.2, 2.8], 'target': [0, 0, 1.0], 'fov': 30}


def loop_cut_lesson(les, obj, cuts, scale, texts, helps):
    h = helps.get
    les.set_mode('EDIT', text=texts['edit'], help=h('edit'))
    les.select_mode('EDGE', text=texts['edge_mode'], help=h('edge_mode'))
    les.start_tool(['Edge', 'Loop Cut and Slide'], 'mesh.loopcut_slide', text=texts['tool'], help=h('tool'))
    yield from les.loop_cut(edge_point(obj, (0.4, -0.7, 1.0)), text=texts['cut'], help=h('cut'))
    les.redo_value('MESH_OT_loopcut.number_cuts', cuts, step=1, text=texts['cuts'], help=h('cuts'))
    yield from les.menu(['Mesh', 'Transform', 'Scale'], 'transform.resize',
                        {'value': (1.1, 1.1, 1), 'constraint_axis': (True, True, False)}, text=texts['scale'], help=h('scale'))
    les.redo_value('value.x', scale, step=fine(scale), text=texts['x'], help=h('x'))
    les.redo_value('value.y', scale, step=fine(scale), text=texts['y'], help=h('y'))


def loop_cut_barrel():
    les = lesson('modeling', 'loop-cut-barrel', 'watch', 'Loop cut',
                 'A mesh can only bend where it has edges. Loop Cut adds a ring of edges all the way around, '
                 'exactly where you need more detail.', BARREL)
    barrel = add('cylinder', 'Barrel', location=(0, 0, 1), vertices=12, radius=0.8)
    les.start()
    yield from loop_cut_lesson(les, barrel, 2, 1.25, {
        'edit': 'Edit Mode.', 'edge_mode': 'Edge select mode: a loop cut is made of edges.',
        'tool': 'Edge ▸ Loop Cut and Slide. Now Blender waits for a click on an edge.',
        'cut': 'Click a side edge. A new ring of edges goes around the barrel, across that edge.',
        'cuts': 'In Adjust Last Operation, set Number of Cuts to 2: two evenly spaced rings.',
        'scale': 'Both new rings are selected. Mesh ▸ Transform ▸ Scale them, with Shift Z so only X and Y change.',
        'x': 'Set Scale X to 1.25.', 'y': 'And Scale Y to 1.25: the middle bulges into a barrel.'}, {})
    les.finish(text='Loop cuts add detail exactly where a shape needs to bend.')


def loop_cut_vase():
    les = lesson('modeling', 'loop-cut-vase', 'your-turn', 'Your turn: a vase', 'Add three rings and pinch them into a vase.',
                 BARREL, variant_of='loop-cut-barrel')
    vase = add('cylinder', 'Vase', location=(0, 0, 1), vertices=12, radius=0.7)
    les.start()
    yield from loop_cut_lesson(les, vase, 3, 0.6, {
        'edit': 'Edit Mode.', 'edge_mode': 'Edge select mode.', 'tool': 'Start Loop Cut and Slide.', 'cut': 'Cut across a side edge.',
        'cuts': 'Make it 3 cuts.',
        'scale': 'Scale the new rings, X and Y only.', 'x': 'Scale X 0.6.', 'y': 'Scale Y 0.6: a pinched waist.'}, {
        'edit': 'The mode menu, or Tab.', 'edge_mode': 'The middle select button, or 2.',
        'tool': 'Edge ▸ Loop Cut and Slide. Ctrl R is the shortcut.',
        'cut': 'Tap one of the vertical edges on the side.', 'cuts': 'Number of Cuts in the Adjust Last Operation panel.',
        'scale': 'Mesh ▸ Transform ▸ Scale.', 'x': 'Scale X in the panel.', 'y': 'Scale Y in the panel.'})
    les.finish(text='A vase from a cylinder and three loop cuts.')


# ---------------------------------------------------------------- 2.5 Bevel edges

BLOCK = {'position': [3.8, -5.4, 4.0], 'target': [0, 0, 0.8], 'fov': 30}


def bevel_lesson(les, obj, edges, width, segments, texts, helps):
    h = helps.get
    les.set_mode('EDIT', text=texts['edit'], help=h('edit'))
    les.select_mode('EDGE', text=texts['edge_mode'], help=h('edge_mode'))
    yield from les.tap(edge_point(obj, edges[0]), text=texts['edge'], help=h('edge'))
    yield from les.tap(edge_point(obj, edges[1]), toggle=True, text=texts['edge2'], help=h('edge2'))
    yield from les.menu(['Edge', 'Bevel Edges'], 'mesh.bevel', {'offset': 0.05}, text=texts['bevel'], help=h('bevel'))
    les.redo_value('offset', width, step=0.01, text=texts['width'], help=h('width'))
    les.redo_value('segments', segments, step=1, text=texts['segments'], help=h('segments'))


def bevel_edges():
    les = lesson('modeling', 'bevel-edges', 'watch', 'Bevel edges',
                 'Real objects rarely have razor-sharp edges. Bevel rounds off just the edges you pick, '
                 'unlike the Bevel modifier, which works on the whole object.', BLOCK)
    block = add('cube', 'Block', location=(0, 0, 0.8), scale=(1, 0.8, 0.8))
    les.start()
    yield from bevel_lesson(les, block, [(0, -0.8, 1.6), (1, 0, 1.6)], 0.3, 4, {
        'edit': 'Edit Mode.', 'edge_mode': 'Edge select mode.', 'edge': 'Click the top front edge.',
        'edge2': 'Shift-click the top right edge to add it.',
        'bevel': 'Edge ▸ Bevel Edges, then drag: the edges split into a flat strip.',
        'width': 'Set Width to 0.3 m: a wide chamfer.', 'segments': 'Set Segments to 4: more strips make a smooth round.'}, {})
    les.finish(text='Bevel only where you choose: Ctrl B is the shortcut.')


def bevel_corner():
    les = lesson('modeling', 'bevel-corner', 'your-turn', 'Your turn: round a corner', 'Round the front corner of a tall block.',
                 BLOCK, variant_of='bevel-edges')
    block = add('cube', 'Pillar', location=(0, 0, 0.8), scale=(0.8, 0.8, 0.8))
    les.start()
    yield from bevel_lesson(les, block, [(0.8, -0.8, 0.8), (0.8, 0, 1.6)], 0.2, 3, {
        'edit': 'Edit Mode.', 'edge_mode': 'Edge select mode.', 'edge': 'Select the vertical front-right edge.',
        'edge2': 'Add the top edge on the right.', 'bevel': 'Bevel them.', 'width': 'Width 0.2 m.', 'segments': 'Segments 3.'}, {
        'edit': 'The mode menu, or Tab.', 'edge_mode': 'The middle select button, or 2.',
        'edge': 'Tap the edge where the front and right faces meet.', 'edge2': 'Turn on ⇧ Shift and tap the top right edge.',
        'bevel': 'Edge ▸ Bevel Edges. Ctrl B is the shortcut.', 'width': 'Width in the Adjust Last Operation panel.',
        'segments': 'Segments, under Width.'})
    les.finish(text='A softly rounded corner.')


# ---------------------------------------------------------------- 2.6 Cut and join

PYRAMID = {'position': [3.8, -5.6, 3.6], 'target': [0, 0, 0.9], 'fov': 30}


def cut_join_lesson(les, obj, cut, hole, texts, helps):
    h = helps.get
    les.set_mode('EDIT', text=texts['edit'], help=h('edit'))
    les.select_mode('FACE', text=texts['face_mode'], help=h('face_mode'))
    yield from les.tap(face_point(obj, (0, 0, 1)), text=texts['top'], help=h('top'))
    yield from les.menu(['Mesh', 'Merge', 'At Center'], 'mesh.merge', text=texts['merge'], help=h('merge'))
    les.start_tool(['Mesh', 'Knife Topology Tool'], 'mesh.knife_tool', text=texts['knife'], help=h('knife'))
    yield from les.knife([edge_point(edit_obj(), near) for near in cut], text=texts['cut'], help=h('cut'))
    yield from les.tap(hole, text=texts['hole'], help=h('hole'))
    yield from les.menu(['Mesh', 'Delete', 'Faces'], 'mesh.delete', text=texts['delete'], help=h('delete'))
    yield from les.menu(['Select', 'All'], 'mesh.select_all', text=texts['all'], help=h('all'))
    yield from les.menu(['Select', 'Select Loops', 'Boundary Loops'], 'mesh.select_boundary_loop_multi', text=texts['boundary'],
                        help=h('boundary'))
    yield from les.menu(['Vertex', 'New Edge/Face from Vertices'], 'mesh.edge_face_add', text=texts['fill'], help=h('fill'))


def cut_and_join():
    les = lesson('modeling', 'cut-and-join', 'watch', 'Cut and join',
                 'Three repair tools: Merge joins points into one, Knife cuts new edges by hand, and New Edge/Face (F) fills a hole.',
                 PYRAMID)
    block = add('cube', 'Block', location=(0, 0, 0.8), scale=(1, 1, 0.8))
    les.start()
    yield from cut_join_lesson(les, block, [(-0.5, -0.5, 0.8), (0.5, -0.5, 0.8)], [0, -0.3333, 1.0667], {
        'edit': 'Edit Mode.', 'face_mode': 'Face select mode.', 'top': 'Click the top face.',
        'merge': 'Mesh ▸ Merge ▸ At Center joins its four corners into one point: the cube becomes a pyramid.',
        'knife': 'Mesh ▸ Knife Topology Tool. Now each click adds a point of the cut.',
        'cut': 'Click the middle of the left edge of the front, then the middle of the right edge, and press Enter. '
               'The front face is cut in two.',
        'hole': 'Click the small triangle above the cut.', 'delete': 'Mesh ▸ Delete ▸ Faces. Now the pyramid has a hole.',
        'all': 'Select ▸ All.', 'boundary': 'Select ▸ Select Loops ▸ Boundary Loops keeps only the edges around the hole.',
        'fill': 'Vertex ▸ New Edge/Face from Vertices fills the hole with a new face. F is its shortcut.'}, {})
    les.finish(text='Merge to join, Knife to cut, F to fill: the everyday clean-up tools.')


def cut_and_patch():
    les = lesson('modeling', 'cut-and-patch', 'your-turn', 'Your turn: cut and patch', 'Make a pyramid, cut its side, open it and patch it.',
                 PYRAMID, variant_of='cut-and-join')
    block = add('cube', 'Stone', location=(0, 0, 0.8), scale=(1, 1, 0.8))
    les.start()
    yield from cut_join_lesson(les, block, [(0.5, -0.5, 0.8), (0.5, 0.5, 0.8)], [0.75, 0, 0.4], {
        'edit': 'Edit Mode.', 'face_mode': 'Face select mode.', 'top': 'Select the top face.', 'merge': 'Merge it at its center.',
        'knife': 'Start the Knife.', 'cut': 'Cut across the right side, then confirm.', 'hole': 'Select the lower part of the right side.',
        'delete': 'Delete it.', 'all': 'Select everything.', 'boundary': 'Keep only the edges around the hole.', 'fill': 'Fill the hole.'}, {
        'edit': 'The mode menu, or Tab.', 'face_mode': 'The third select button, or 3.', 'top': 'Tap the top of the block.',
        'merge': 'Mesh ▸ Merge ▸ At Center. M opens the Merge menu.', 'knife': 'Mesh ▸ Knife Topology Tool. K is the shortcut.',
        'cut': 'Tap the middle of the front-right edge, then of the back-right edge, then ⏎ Enter.',
        'hole': 'Tap the right side below the cut.', 'delete': 'Mesh ▸ Delete ▸ Faces. X opens the Delete menu.',
        'all': 'Select ▸ All, or A.', 'boundary': 'Select ▸ Select Loops ▸ Boundary Loops.',
        'fill': 'Vertex ▸ New Edge/Face from Vertices, or F.'})
    les.finish(text='Opened and patched.')


# ---------------------------------------------------------------- 2.7 Proportional editing

FIELD = {'position': [3.0, -4.2, 3.0], 'target': [0, 0, 0.3], 'fov': 30}


def proportional_lesson(les, subdivisions, pick, height, size, texts, helps):
    h = helps.get
    yield from les.menu(['Add', 'Mesh', 'Grid'], 'mesh.primitive_grid_add', text=texts['grid'], help=h('grid'))
    les.redo_value('x_subdivisions', subdivisions, step=1, text=texts['x'], help=h('x'))
    les.redo_value('y_subdivisions', subdivisions, step=1, text=texts['y'], help=h('y'))
    les.set_mode('EDIT', text=texts['edit'], help=h('edit'))
    yield from les.menu(['Select', 'None'], 'mesh.select_all', text=texts['none'], help=h('none'))
    yield from les.tap(vert_point(edit_obj(), pick), text=texts['vert'], help=h('vert'))
    les.proportional(True, text=texts['proportional'], help=h('proportional'))
    yield from les.menu(['Mesh', 'Transform', 'Move'], 'transform.translate',
                        {'value': (0, 0, 0.3 if height > 0 else -0.3), 'constraint_axis': (False, False, True)},
                        text=texts['move'], help=h('move'))
    les.redo_value('value.z', height, step=0.1, text=texts['height'], help=h('height'))
    les.redo_value('proportional_size', size, step=0.1, text=texts['size'], help=h('size'))


def proportional_hill():
    les = lesson('modeling', 'proportional-hill', 'watch', 'Proportional editing',
                 'With Proportional Editing on, moving one point drags its neighbours along, less and less with distance, '
                 'like pulling up a cloth.', FIELD)
    les.start()
    yield from proportional_lesson(les, 16, (0, 0, 0), 1.0, 0.6, {
        'grid': 'Add ▸ Mesh ▸ Grid: a flat sheet made of many small squares.',
        'x': 'Set X Subdivisions to 16.', 'y': 'And Y Subdivisions to 16: more points make a smoother hill.',
        'edit': 'Edit Mode.', 'none': 'Select ▸ None.', 'vert': 'Click the vertex in the middle.',
        'proportional': 'Turn on Proportional Editing, the circle icon in the header.',
        'move': 'Mesh ▸ Transform ▸ Move it up on Z. The neighbours follow, the closer the more.',
        'height': 'Set Move Z to 1 m.', 'size': 'Set Proportional Size to 0.6 m: only points within that distance follow, so the hill gets narrower.'}, {})
    les.finish(text='Proportional Editing turns one point into a smooth hill. O toggles it.')


def proportional_dent():
    les = lesson('modeling', 'proportional-dent', 'your-turn', 'Your turn: a dent', 'Push a wide, soft dent into a sheet.', FIELD,
                 variant_of='proportional-hill')
    les.start()
    yield from proportional_lesson(les, 12, (0.5, 0.5, 0), -0.6, 1.2, {
        'grid': 'Add a grid.', 'x': 'X Subdivisions 12.', 'y': 'Y Subdivisions 12.', 'edit': 'Edit Mode.', 'none': 'Clear the selection.',
        'vert': 'Select a vertex halfway to the back-right corner.', 'proportional': 'Turn on Proportional Editing.',
        'move': 'Move it down on Z.', 'height': 'Push it to −0.6 m.', 'size': 'Widen the effect to 1.2 m.'}, {
        'grid': 'Add ▸ Mesh ▸ Grid.', 'x': 'X Subdivisions in the Adjust Last Operation panel.', 'y': 'Y Subdivisions, right under it.',
        'edit': 'The mode menu, or Tab.', 'none': 'Select ▸ None, or Alt A.',
        'vert': 'Tap the point halfway between the middle and the back-right corner.',
        'proportional': 'The circle button in the header. O on the keyboard.', 'move': 'Mesh ▸ Transform ▸ Move, then Z.',
        'height': 'Move Z −0.6 in the panel.', 'size': 'Proportional Size in the panel.'})
    les.finish(text='A soft dent, pushed in one move.')


# ---------------------------------------------------------------- Project 2: a mug with a handle

MUG = {'position': [3.8, -5.4, 3.2], 'target': [0.3, 0, 0.1], 'fov': 30}


def mug_lesson(les, n, radius, rim, handle, bevel, texts, helps):
    h = helps.get
    yield from les.menu(['Add', 'Mesh', 'Cylinder'], 'mesh.primitive_cylinder_add', text=texts['add'], help=h('add'))
    les.redo_value('vertices', n, step=1, text=f'Vertices {n}: smooth enough for a round mug.', help=h('vertices'))
    les.redo_value('radius', radius, step=0.1, text=f'Radius {radius} m.', help=h('radius'))
    les.set_mode('EDIT', text='Edit Mode.', help=h('edit'))
    les.select_mode('FACE', text='Face select mode.', help=h('face_mode'))
    mug = edit_obj()
    yield from les.tap(face_point(mug, (0, 0, 1)), text='Click the top face.', help=h('top'))
    yield from les.menu(['Face', 'Inset Faces'], 'mesh.inset', {'thickness': 0.05}, text='Face ▸ Inset Faces for the rim.', help=h('inset'))
    les.redo_value('thickness', rim, step=0.01, text=f'Thickness {rim} m: the wall of the mug.', help=h('thickness'))
    yield from les.menu(['Face', 'Extrude Faces'], 'mesh.extrude_region_move', {'TRANSFORM_OT_translate': {'value': (0, 0, -0.3)}},
                        text='Face ▸ Extrude Faces, inward.', help=h('extrude'))
    les.redo_value('TRANSFORM_OT_translate.value.z', -1.8, step=0.1, text='Move Z −1.8 m: deep, leaving a 20 cm bottom.', help=h('depth'))
    les.select_mode('EDGE', text='Edge select mode, for the loop cut.', help=h('edge_mode'))
    les.start_tool(['Edge', 'Loop Cut and Slide'], 'mesh.loopcut_slide', text='Edge ▸ Loop Cut and Slide: the handle needs more rings.',
                   help=h('loopcut'))
    yield from les.loop_cut(edge_point(mug, (radius * 0.7, -radius * 0.7, 0)), text='Click a side edge on the outside.', help=h('cut'))
    les.redo_value('MESH_OT_loopcut.number_cuts', 3, step=1, text='Number of Cuts 3: four bands up the side.', help=h('cuts'))
    les.select_mode('FACE', text='Back to Face select.', help=h('face_mode'))
    yield from les.tap(face_point(mug, (1, 0, 0), (radius, -0.1, 0.75)), text='Click the top band on the right side.', help=h('upper'))
    yield from les.tap(face_point(mug, (1, 0, 0), (radius, -0.1, -0.75)), toggle=True, text='Shift-click the bottom band below it.',
                       help=h('lower'))
    yield from les.menu(['Face', 'Extrude Faces'], 'mesh.extrude_region_move', {'TRANSFORM_OT_translate': {'value': (0, 0, 0.2)}},
                        text='Extrude both faces outward.', help=h('extrude'))
    les.redo_value('TRANSFORM_OT_translate.value.z', handle, step=0.1, text=f'Move Z {handle} m: two stubs.', help=h('handle'))
    yield from les.menu(['Edge', 'Bridge Edge Loops'], 'mesh.bridge_edge_loops',
                        text='Edge ▸ Bridge Edge Loops joins the two stubs with a bar: the handle.', help=h('bridge'))
    les.select_mode('EDGE', text='Edge select mode again.', help=h('edge_mode'))
    yield from les.tap(edge_point(mug, (radius * 0.5, -radius * 0.86, 1)), text='Click an edge of the outer rim.', help=h('rim'))
    yield from les.menu(['Select', 'Select Loops', 'Edge Loops'], 'mesh.select_edge_loop_multi', text='Select ▸ Select Loops ▸ Edge Loops: the whole rim.',
                        help=h('loop'))
    yield from les.menu(['Edge', 'Bevel Edges'], 'mesh.bevel', {'offset': 0.02}, text='Edge ▸ Bevel Edges to soften the rim.', help=h('bevel'))
    les.redo_value('offset', bevel[0], step=0.01, text=f'Width {bevel[0]} m.', help=h('width'))
    les.redo_value('segments', bevel[1], step=1, text=f'Segments {bevel[1]}: a rounded lip.', help=h('segments'))


def project_mug():
    les = lesson('modeling', 'project-mug', 'watch', 'Project: a mug',
                 'All of Level 2 in one object: a cylinder hollowed with Inset and Extrude, a handle from two extruded faces '
                 'bridged together, and a beveled rim.', MUG)
    les.start()
    yield from mug_lesson(les, 16, 0.8, 0.08, 0.5, (0.04, 3), {'add': 'Add ▸ Mesh ▸ Cylinder.'}, {})
    les.finish(text='A mug with a handle, from one cylinder. That is Level 2.')


def project_jug():
    les = lesson('modeling', 'project-jug', 'your-turn', 'Your turn: a jug', 'Build a wider jug with a chunkier handle.', MUG,
                 variant_of='project-mug')
    les.start()
    yield from mug_lesson(les, 20, 0.9, 0.06, 0.6, (0.03, 2), {'add': 'Add a cylinder.'}, {
        'add': 'Add ▸ Mesh ▸ Cylinder.', 'vertices': 'Vertices in the Adjust Last Operation panel.', 'radius': 'Radius, under Vertices.',
        'edit': 'The mode menu, or Tab.', 'face_mode': 'The third select button, or 3.', 'top': 'Tap the top of the cylinder.',
        'inset': 'Face ▸ Inset Faces, or I.', 'thickness': 'Thickness in the panel.', 'extrude': 'Face ▸ Extrude Faces, or E.',
        'depth': 'Move Z in the panel.', 'loopcut': 'Edge ▸ Loop Cut and Slide, or Ctrl R.', 'cut': 'Tap a vertical edge on the outside.',
        'cuts': 'Number of Cuts in the panel.', 'upper': 'Tap the top band on the right.', 'lower': 'Turn on ⇧ Shift, tap the bottom band.',
        'handle': 'Move Z in the panel.', 'bridge': 'Edge ▸ Bridge Edge Loops.', 'edge_mode': 'The middle select button, or 2.',
        'rim': 'Tap an outer edge of the top rim.', 'loop': 'Select ▸ Select Loops ▸ Edge Loops.', 'bevel': 'Edge ▸ Bevel Edges, or Ctrl B.',
        'width': 'Width in the panel.', 'segments': 'Segments in the panel.'})
    les.finish(text='Your own jug. Level 2 done.')


LESSONS = ('look_around', 'tower_tour', 'add_objects', 'add_shapes', 'move_rotate_scale', 'arrange_blocks', 'fence', 'pillars',
           'modes', 'modes_tower', 'project_table', 'project_desk',
           'select_parts', 'select_parts_prism', 'extrude_arm', 'extrude_crane', 'inset_planter', 'inset_drawer',
           'loop_cut_barrel', 'loop_cut_vase', 'bevel_edges', 'bevel_corner', 'cut_and_join', 'cut_and_patch',
           'proportional_hill', 'proportional_dent', 'project_mug', 'project_jug')


def main():
    only = os.environ.get('LEARN_SCENE_ONLY')
    if only == 'ui':
        os.makedirs(OUT, exist_ok=True)
        with open(UI_FILE, 'w') as handle:
            json.dump(scene_ui(), handle, indent=2)
            handle.write('\n')
        print('Drafty3D Learn: 3D Viewport menus written to', UI_FILE, flush=True)
        return
    for name in LESSONS:
        if not only or only == name:
            yield from globals()[name]()
    print('Drafty3D Learn: scene examples recorded in', OUT, flush=True)


run(main)
