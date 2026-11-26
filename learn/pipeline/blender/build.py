"""Generates the Modifiers examples with bpy. Run through `npm run learn:examples`, not directly."""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402

import truth  # noqa: E402
from lesson import Lesson, bezier_curve, blocks, column, curve_length, open_cylinder, prism, reset, strip  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else sys.argv[-1]

NEXT_TAB = truth.shortcut('Screen', 'screen.space_context_cycle', 'Properties editor · next tab', direction='NEXT')
ADD_MENU = truth.shortcut('Property Editor', 'object.add_modifier_menu', 'Properties editor · Modifiers tab')
SUBSURF_2 = truth.shortcut('Object Mode', 'object.subdivision_set', '3D Viewport · Object Mode', level=2)

CUP_CAMERAS = {
    'overview': {'position': [1.55, -1.85, 1.3], 'target': [0, 0, 0.45], 'fov': 30},
    'inside': {'position': [0.8, -0.95, 1.95], 'target': [0, 0, 0.5], 'fov': 34},
    'rim': {'position': [0.95, -1.25, 1.3], 'target': [0.12, -0.18, 0.78], 'fov': 30},
}
BOWL_CAMERAS = {
    'overview': {'position': [1.6, -1.9, 1.35], 'target': [0, 0, 0.15], 'fov': 30},
    'inside': {'position': [0.85, -1.05, 1.85], 'target': [0, 0, 0.1], 'fov': 40},
    'rim': {'position': [1.1, -1.35, 0.85], 'target': [0.2, -0.3, 0.28], 'fov': 30},
}

COLUMN_CAMERAS = {
    'overview': {'position': [2.25, -2.75, 1.4], 'target': [0, 0, 0.7], 'fov': 30},
    'edge': {'position': [1.0, -1.3, 1.75], 'target': [0, 0, 1.2], 'fov': 30},
}
CANDLE_CAMERAS = {
    'overview': {'position': [1.6, -1.95, 1.05], 'target': [0, 0, 0.48], 'fov': 30},
    'edge': {'position': [0.8, -1.0, 1.25], 'target': [0, 0, 0.85], 'fov': 30},
}

TABLE_CAMERAS = {
    'overview': {'position': [2.0, -2.45, 1.75], 'target': [0, 0, 0.38], 'fov': 30},
    'corner': {'position': [1.3, -1.35, 1.2], 'target': [0.45, -0.28, 0.6], 'fov': 30},
}
BENCH_CAMERAS = {
    'overview': {'position': [1.6, -1.95, 1.15], 'target': [0, 0, 0.22], 'fov': 30},
    'corner': {'position': [1.45, -1.0, 0.85], 'target': [0.62, -0.12, 0.36], 'fov': 30},
}
STAIRS_CAMERAS = {
    'start': {'position': [1.1, -2.6, 1.3], 'target': [0.35, 0, 0.2], 'fov': 30},
    'overview': {'position': [0.2, -3.6, 1.6], 'target': [0.9, 0, 0.58], 'fov': 30},
}
FLOATING_CAMERAS = {
    'start': {'position': [1.0, -2.3, 1.1], 'target': [0.35, 0, 0.15], 'fov': 30},
    'overview': {'position': [2.1, -3.3, 1.95], 'target': [1.05, 0, 0.65], 'fov': 30},
}

HOUSE_CAMERAS = {
    'overview': {'position': [0.95, -2.0, 0.95], 'target': [0, 0, 0.36], 'fov': 30},
}
LANTERN_CAMERAS = {
    'overview': {'position': [0.95, -1.9, 1.0], 'target': [0, 0, 0.3], 'fov': 30},
}
PATH_CAMERAS = {
    'start': {'position': [1.0, -2.6, 4.3], 'target': [0.8, -0.6, 0], 'fov': 40},
    'overview': {'position': [0.9, -1.9, 2.1], 'target': [0.9, 0.3, 0], 'fov': 34},
}
TRACK_CAMERAS = {
    'start': {'position': [0.5, -3.6, 5.8], 'target': [0.25, -1.55, 0], 'fov': 44},
    'overview': {'position': [0, -1.9, 2.0], 'target': [0, 0, 0], 'fov': 34},
}

BLOCK_CAMERAS = {
    'overview': {'position': [2.1, -2.7, 1.95], 'target': [0, 0, 0.5], 'fov': 30},
}
CUSHION_CAMERAS = {
    'overview': {'position': [1.6, -2.0, 1.25], 'target': [0, 0, 0.12], 'fov': 30},
}
LADDER_CAMERAS = {
    'piece': {'position': [0.55, -0.95, 0.32], 'target': [0.14, 0, 0.12], 'fov': 30},
    'start': {'position': [0.95, -1.5, 0.5], 'target': [0.28, 0, 0.25], 'fov': 30},
    'overview': {'position': [0.6, -1.9, 0.55], 'target': [0, 0, 0.38], 'fov': 30},
    'corner': {'position': [0.42, -0.85, 0.62], 'target': [0.15, 0, 0.55], 'fov': 30},
}
SHELF_CAMERAS = {
    'start': {'position': [1.05, -1.7, 0.55], 'target': [0.38, 0, 0.3], 'fov': 30},
    'overview': {'position': [0.55, -2.55, 0.75], 'target': [0, 0, 0.48], 'fov': 30},
    'corner': {'position': [0.5, -1.0, 0.8], 'target': [0.2, 0, 0.66], 'fov': 30},
}
APPLY = truth.shortcut('Property Editor', 'object.modifier_apply', 'Properties editor · Modifiers tab')


def ui_truth():
    reset()
    probe = open_cylinder('Probe', 1, 1, 8)
    data = {
        'blenderVersion': bpy.app.version_string,
        'propertiesTabs': truth.properties_tabs(),
        'objectPanels': truth.object_panels(),
        'addModifierMenu': truth.add_modifier_menu(),
        'modifiers': truth.modifier_definitions(probe),
        'modifierHeader': truth.modifier_header(),
    }
    with open(os.path.join(OUT, 'blender-ui.json'), 'w') as handle:
        json.dump(data, handle, indent=2)
        handle.write('\n')


def cup():
    reset()
    obj = open_cylinder('Cup', 0.4, 0.9, 16)
    lesson = Lesson(
        module='modifiers', example='cup', mode='watch', title='Low-poly cup',
        out_dir=os.path.join(OUT, 'modifiers', 'cup'), obj=obj, panel='OBJECT', camera=CUP_CAMERAS['overview'],
        text='This open cylinder becomes a cup with three modifiers. Modifiers change the result without touching the original mesh.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB,
                        text='Open the Modifier Properties tab, the wrench. Every modifier of the selected object lives here.')
    lesson.add_modifier('SOLIDIFY', shortcut=ADD_MENU,
                        text='Add Modifier → Generate → Solidify. It gives the paper-thin walls real thickness.')
    lesson.set_value('SOLIDIFY', 'thickness', 0.08, step=0.01, camera=CUP_CAMERAS['inside'],
                     text='Set Thickness to 0.08 m. With Offset at -1 the wall grows inward, so the cup keeps its outer size.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU, camera=CUP_CAMERAS['overview'],
                        text='Add Modifier → Generate → Bevel. It rounds the hard edges: the rim and the base.')
    lesson.set_value('BEVEL', 'amount', 0.02, step=0.01, camera=CUP_CAMERAS['rim'],
                     text='Lower Amount to 0.02 m for a thin, clean edge.')
    lesson.set_value('BEVEL', 'segments', 2, step=1,
                     text='Raise Segments to 2 so each rounded edge gets two bands instead of one flat cut.')
    lesson.add_modifier('SUBSURF', shortcut=ADD_MENU, camera=CUP_CAMERAS['overview'],
                        text='Add Modifier → Generate → Subdivision Surface. It smooths the whole surface; the bevel bands keep the edges from melting. In the 3D Viewport, Ctrl 1 adds it in one keystroke.')
    lesson.set_value('SUBSURF', 'levels', 2, step=1, shortcut=SUBSURF_2,
                     text='Raise Levels Viewport to 2 for a smooth cup. Render already defaults to 2.')
    lesson.finish(text='Done: Solidify → Bevel → Subdivision Surface. The order of the stack matters. Now try a bowl yourself.')


def bowl():
    reset()
    obj = open_cylinder('Bowl', 0.6, 0.36, 16)
    lesson = Lesson(
        module='modifiers', example='bowl', mode='your-turn', title='Your turn: bowl', variant_of='cup',
        out_dir=os.path.join(OUT, 'modifiers', 'bowl'), obj=obj, panel='OBJECT', camera=BOWL_CAMERAS['overview'],
        text='Same three modifiers, new values. Turn this open cylinder into a bowl.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB,
                        text='Open the Modifier Properties tab.',
                        help="It's the wrench icon in the Properties tab column, right below the orange Object square.")
    lesson.add_modifier('SOLIDIFY', shortcut=ADD_MENU,
                        text='Give the walls thickness: add a Solidify modifier.',
                        help='Add Modifier → Generate → Solidify.')
    lesson.set_value('SOLIDIFY', 'thickness', 0.06, step=0.01, camera=BOWL_CAMERAS['inside'],
                     text='Set the wall Thickness to 0.06 m.',
                     help='Thickness is the first number in the Solidify panel. ◀ ▶ step it by 0.01 m.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU, camera=BOWL_CAMERAS['overview'],
                        text='Round the hard edges: add a Bevel modifier.',
                        help='Add Modifier → Generate → Bevel. It goes below Solidify, so it rounds the new walls too.')
    # Clamp Overlap limits a bevel to about half the wall: keep Amount below 0.03 m or nothing changes.
    lesson.set_value('BEVEL', 'amount', 0.02, step=0.01, camera=BOWL_CAMERAS['rim'],
                     text='Set the bevel Amount to 0.02 m.',
                     help='Amount is right below Width Type in the Bevel panel.')
    lesson.set_value('BEVEL', 'segments', 3, step=1,
                     text='Use 3 Segments for a softer edge.',
                     help='Segments is right below Amount.')
    lesson.add_modifier('SUBSURF', shortcut=ADD_MENU, camera=BOWL_CAMERAS['overview'],
                        text='Smooth everything: add a Subdivision Surface modifier.',
                        help='Add Modifier → Generate → Subdivision Surface. Keep it last in the stack.')
    lesson.set_value('SUBSURF', 'levels', 2, step=1, shortcut=SUBSURF_2,
                     text='Set Levels Viewport to 2.',
                     help='First number in the Subdivision panel. In the 3D Viewport, Ctrl 2 does the same.')
    lesson.finish(text='Bowl finished: Solidify → Bevel → Subdivision Surface, the same stack as the cup.')


def twisted_column():
    reset()
    obj = column('Column', 0.26, 1.4, 4, 27)
    lesson = Lesson(
        module='modifiers', example='twisted-column', mode='watch', title='Twisted column',
        out_dir=os.path.join(OUT, 'modifiers', 'twisted-column'), obj=obj, panel='OBJECT', camera=COLUMN_CAMERAS['overview'],
        text='A plain square column becomes a twisted one. Two modifiers: Bevel softens the corners, Simple Deform twists the whole shape.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab, the wrench.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU,
                        text='Add Modifier → Generate → Bevel. Only the four corner edges are sharp enough to be beveled.')
    lesson.set_value('BEVEL', 'amount', 0.04, step=0.01, camera=COLUMN_CAMERAS['edge'],
                     text='Set Amount to 0.04 m: a soft corner, not a cut-off one.')
    lesson.set_value('BEVEL', 'segments', 3, step=1, text='Raise Segments to 3 to round each corner.')
    lesson.add_modifier('SIMPLE_DEFORM', shortcut=ADD_MENU, camera=COLUMN_CAMERAS['overview'],
                        text='Add Modifier → Deform → Simple Deform. It starts as a 45° Twist around X, so the column folds sideways.')
    lesson.set_value('SIMPLE_DEFORM', 'axis', 'Z',
                     text='Set Axis to Z, the column\'s length. Now it twists around itself; the rings along it keep the twist smooth.')
    lesson.set_value('SIMPLE_DEFORM', 'angle', 90, step=5,
                     text='Set Angle to 90°: the top turns a quarter turn relative to the base.')
    lesson.finish(text='Done: Bevel first, then Simple Deform, so the rounded corners twist too. Now twist a candle yourself.')


def twisted_candle():
    reset()
    obj = column('Candle', 0.17, 0.95, 6, 23)
    lesson = Lesson(
        module='modifiers', example='twisted-candle', mode='your-turn', title='Your turn: twisted candle', variant_of='twisted-column',
        out_dir=os.path.join(OUT, 'modifiers', 'twisted-candle'), obj=obj, panel='OBJECT', camera=CANDLE_CAMERAS['overview'],
        text='Same two modifiers on a six-sided candle: round the edges, then twist it half a turn.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab.',
                        help='The wrench icon, right below the orange Object square.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU, text='Round the six edges: add a Bevel modifier.',
                        help='Add Modifier → Generate → Bevel.')
    lesson.set_value('BEVEL', 'amount', 0.02, step=0.01, camera=CANDLE_CAMERAS['edge'],
                     text='Set the bevel Amount to 0.02 m.', help='Amount is right below Width Type.')
    lesson.set_value('BEVEL', 'segments', 2, step=1, text='Use 2 Segments.', help='Segments is right below Amount.')
    lesson.add_modifier('SIMPLE_DEFORM', shortcut=ADD_MENU, camera=CANDLE_CAMERAS['overview'],
                        text='Twist it: add a Simple Deform modifier.',
                        help='Add Modifier → Deform → Simple Deform. Keep it below Bevel.')
    lesson.set_value('SIMPLE_DEFORM', 'axis', 'Z', text='Twist around the candle\'s length: set Axis to Z.',
                     help='The X Y Z buttons at the bottom of the Simple Deform panel.')
    lesson.set_value('SIMPLE_DEFORM', 'angle', 180, step=5, text='Set Angle to 180° for half a turn.',
                     help='Angle is right below the Twist / Bend / Taper / Stretch buttons.')
    lesson.finish(text='Twisted candle finished: Bevel → Simple Deform, the same stack as the column.')


def mirror_table():
    reset()
    # One corner of a table: a quarter of the top, open where it touches the two mirror planes, and one leg.
    obj = blocks('Table', [((0, 0, 0.7), (0.55, 0.35, 0.76), ('-x', '-y')),
                           ((0.45, 0.25, 0), (0.51, 0.31, 0.7), ('+z',))])
    lesson = Lesson(
        module='modifiers', example='mirror-table', mode='watch', title='Table from one corner',
        out_dir=os.path.join(OUT, 'modifiers', 'mirror-table'), obj=obj, panel='OBJECT', camera=TABLE_CAMERAS['overview'],
        text='Only one corner of this table is modeled. Mirror copies it across X and Y; whatever you change in the corner, the other three follow.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab, the wrench.')
    lesson.add_modifier('MIRROR', shortcut=ADD_MENU,
                        text='Add Modifier → Generate → Mirror. Axis X is on: the corner is copied across the red X axis, so you see two legs.')
    lesson.set_value('MIRROR', 'axis_y', True,
                     text='Turn on Axis Y too. Each half is copied across Y: four legs, one whole top. Merge joins the copies along the seams.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU, camera=TABLE_CAMERAS['corner'],
                        text='Add a Bevel below Mirror. It rounds the whole mirrored table, and its 0.1 m default is far too big for a 6 cm top.')
    lesson.set_value('BEVEL', 'amount', 0.02, step=0.01, text='Set Amount to 0.02 m: a soft edge on the top and the legs.')
    lesson.set_value('BEVEL', 'segments', 3, step=1, text='Raise Segments to 3 to round it.')
    lesson.finish(text='Done: model a quarter, Mirror the rest, Bevel after Mirror so every copy gets the same edge. Now build a bench yourself.')


def mirror_bench():
    reset()
    obj = blocks('Bench', [((0, 0, 0.4), (0.7, 0.2, 0.47), ('-x', '-y')),
                           ((0.56, 0.07, 0), (0.64, 0.15, 0.4), ('+z',))])
    lesson = Lesson(
        module='modifiers', example='mirror-bench', mode='your-turn', title='Your turn: bench', variant_of='mirror-table',
        out_dir=os.path.join(OUT, 'modifiers', 'mirror-bench'), obj=obj, panel='OBJECT', camera=BENCH_CAMERAS['overview'],
        text='One corner of a long bench. Mirror it on X and Y, then soften its edges.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab.',
                        help='The wrench icon, right below the orange Object square.')
    lesson.add_modifier('MIRROR', shortcut=ADD_MENU, text='Copy the corner: add a Mirror modifier.',
                        help='Add Modifier → Generate → Mirror.')
    lesson.set_value('MIRROR', 'axis_y', True, text='Mirror on Y as well, for all four legs.',
                     help='The Axis row has X Y Z buttons. X is already on; tap Y.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU, camera=BENCH_CAMERAS['corner'],
                        text='Soften the edges: add a Bevel modifier below Mirror.', help='Add Modifier → Generate → Bevel.')
    lesson.set_value('BEVEL', 'amount', 0.01, step=0.01, text='Set the bevel Amount to 0.01 m.',
                     help='Amount is right below Width Type.')
    lesson.set_value('BEVEL', 'segments', 2, step=1, text='Use 2 Segments.', help='Segments is right below Amount.')
    lesson.finish(text='Bench finished: Mirror → Bevel, the same stack as the table.')


def array_stairs():
    reset()
    obj = blocks('Step', [((0, -0.5, 0), (0.3, 0.5, 0.18), ())])
    lesson = Lesson(
        module='modifiers', example='array-stairs', mode='watch', title='Staircase from one step',
        out_dir=os.path.join(OUT, 'modifiers', 'array-stairs'), obj=obj, panel='OBJECT', camera=STAIRS_CAMERAS['start'],
        text='One step, six steps. Array repeats an object; Relative Offset moves each copy by the object\'s own size.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab, the wrench.')
    lesson.add_modifier('ARRAY', shortcut=ADD_MENU,
                        text='Add Modifier → Generate → Array. Two copies, the second one step-depth further along X: Factor X is 1.')
    lesson.set_value('ARRAY', 'factor_z', 1, step=0.1,
                     text='Set Factor Z to 1: each copy also rises one step height. Now it climbs.')
    lesson.set_value('ARRAY', 'count', 6, step=1, camera=STAIRS_CAMERAS['overview'],
                     text='Raise Count to 6. Same offset, six steps.')
    lesson.finish(text='Done: Count says how many, the offset says where the next one goes. Now make floating steps yourself.')


def array_floating_steps():
    reset()
    obj = blocks('Slab', [((0, -0.3, 0), (0.35, 0.3, 0.08), ())])
    lesson = Lesson(
        module='modifiers', example='array-floating-steps', mode='your-turn', title='Your turn: floating steps',
        variant_of='array-stairs',
        out_dir=os.path.join(OUT, 'modifiers', 'array-floating-steps'), obj=obj, panel='OBJECT', camera=FLOATING_CAMERAS['start'],
        text='A thin slab. Stack copies with a gap between them, like steps fixed to a wall.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab.',
                        help='The wrench icon, right below the orange Object square.')
    lesson.add_modifier('ARRAY', shortcut=ADD_MENU, text='Repeat the slab: add an Array modifier.',
                        help='Add Modifier → Generate → Array.')
    lesson.set_value('ARRAY', 'factor_z', 2.5, step=0.1,
                     text='Set Factor Z to 2.5: each copy rises two and a half slab heights, leaving a gap.',
                     help='Factor X, Y, Z are in the Relative Offset subpanel. Z is the third.')
    lesson.set_value('ARRAY', 'count', 5, step=1, camera=FLOATING_CAMERAS['overview'],
                     text='Set Count to 5.', help='Count is right below Fit Type.')
    lesson.finish(text='Floating steps finished: one Array, with a bigger Z offset than the slab is tall.')


def boolean_birdhouse():
    reset()
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.1, depth=0.3, location=(0, -0.25, 0.36), rotation=(math.pi / 2, 0, 0))
    door = bpy.context.active_object
    door.name = door.data.name = 'Door'
    house = prism('Birdhouse', [(-0.3, 0), (0.3, 0), (0.3, 0.5), (0, 0.75), (-0.3, 0.5)], 0.5)
    lesson = Lesson(
        module='modifiers', example='boolean-birdhouse', mode='watch', title='Birdhouse door',
        out_dir=os.path.join(OUT, 'modifiers', 'boolean-birdhouse'), obj=house, panel='OBJECT', camera=HOUSE_CAMERAS['overview'],
        helpers=[door],
        text='A birdhouse and a cylinder named Door, drawn as a wireframe. Boolean uses one object to cut another, and you can still move the cutter later.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab, the wrench.')
    lesson.add_modifier('BOOLEAN', shortcut=ADD_MENU, changes_mesh=False,
                        text='Add Modifier → Generate → Boolean. Nothing changes yet: Boolean needs an object to work with.')
    lesson.set_value('BOOLEAN', 'object', 'Door',
                     text='Set Object to Door. Difference is selected, so the cylinder\'s volume is removed: a round door.')
    lesson.set_value('BOOLEAN', 'operation', 'INTERSECT',
                     text='Try Intersect: only the volume inside both objects stays. That is the plug the door removed.')
    lesson.set_value('BOOLEAN', 'operation', 'DIFFERENCE',
                     text='Back to Difference for the door. Union, the third button, would add the cylinder instead.')
    lesson.finish(text='Done: Difference cuts, Union adds, Intersect keeps the overlap. Now cut a window yourself.')


def boolean_lantern():
    reset()
    window = blocks('Window', [((-0.11, -0.36, 0.2), (0.11, -0.08, 0.44), ())])
    lantern = blocks('Lantern', [((-0.2, -0.2, 0), (0.2, 0.2, 0.62), ())])
    lesson = Lesson(
        module='modifiers', example='boolean-lantern', mode='your-turn', title='Your turn: lantern window', variant_of='boolean-birdhouse',
        out_dir=os.path.join(OUT, 'modifiers', 'boolean-lantern'), obj=lantern, panel='OBJECT', camera=LANTERN_CAMERAS['overview'],
        helpers=[window],
        text='A lantern box and a box named Window. Cut the window with a Boolean, compare it with Union, then cut again.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab.',
                        help='The wrench icon, right below the orange Object square.')
    lesson.add_modifier('BOOLEAN', shortcut=ADD_MENU, changes_mesh=False, text='Add a Boolean modifier.',
                        help='Add Modifier → Generate → Boolean.')
    lesson.set_value('BOOLEAN', 'object', 'Window', text='Point it at the Window box.',
                     help='Tap the empty Object field and pick Window.')
    lesson.set_value('BOOLEAN', 'operation', 'UNION', text='Switch to Union to see the box added instead.',
                     help='Union is the middle of the Intersect / Union / Difference buttons.')
    lesson.set_value('BOOLEAN', 'operation', 'DIFFERENCE', text='Back to Difference: the window is cut out.',
                     help='Difference is the last of the three buttons.')
    lesson.finish(text='Lantern window finished: one Boolean, three ways to combine two objects.')


def curve_garden_path():
    reset()
    path = bezier_curve('Path', [(0, 0), (0.6, 0.55), (1.2, 0.05), (1.8, 0.6)])
    board = strip('Paving', round(curve_length(path), 3), 0.3, 0.04, 47)
    lesson = Lesson(
        module='modifiers', example='curve-garden-path', mode='watch', title='Garden path',
        out_dir=os.path.join(OUT, 'modifiers', 'curve-garden-path'), obj=board, panel='OBJECT', camera=PATH_CAMERAS['start'],
        helpers=[path],
        text='A straight paving strip and a curve named Path. The Curve modifier bends a mesh along a curve, as long as you tell it which way the mesh runs.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab, the wrench.')
    lesson.add_modifier('CURVE', shortcut=ADD_MENU, changes_mesh=False,
                        text='Add Modifier → Deform → Curve. Nothing happens until it has a curve to follow.')
    lesson.set_value('CURVE', 'object', 'Path',
                     text='Set Curve Object to Path. The strip jumps onto the curve, but crumpled: Deform Axis is X, and the strip runs along -Y.')
    lesson.set_value('CURVE', 'deform_axis', 'NEG_Y', camera=PATH_CAMERAS['overview'],
                     text='Set Deform Axis to -Y, the way the strip runs. Now its length follows the path; the rings along it let it bend smoothly.')
    lesson.finish(text='Done: Curve Object says where, Deform Axis says which way the mesh runs. Now lay a ring track yourself.')


def curve_ring_track():
    reset()
    bpy.ops.curve.primitive_bezier_circle_add(radius=0.6)
    ring = bpy.context.active_object
    ring.name = ring.data.name = 'Ring'
    track = strip('Track', round(curve_length(ring), 3), 0.22, 0.05, 63)
    lesson = Lesson(
        module='modifiers', example='curve-ring-track', mode='your-turn', title='Your turn: ring track', variant_of='curve-garden-path',
        out_dir=os.path.join(OUT, 'modifiers', 'curve-ring-track'), obj=track, panel='OBJECT', camera=TRACK_CAMERAS['start'],
        helpers=[ring],
        text='A straight track exactly as long as the circle named Ring. Bend it all the way around.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab.',
                        help='The wrench icon, right below the orange Object square.')
    lesson.add_modifier('CURVE', shortcut=ADD_MENU, changes_mesh=False, text='Add a Curve modifier.',
                        help='Add Modifier → Deform → Curve.')
    lesson.set_value('CURVE', 'object', 'Ring', camera=TRACK_CAMERAS['overview'], text='Set its Curve Object to Ring.',
                     help='Tap the empty Curve Object field and pick Ring.')
    lesson.set_value('CURVE', 'deform_axis', 'NEG_Y',
                     text='The track runs along -Y: set Deform Axis to -Y.',
                     help='Deform Axis is the dropdown right below Curve Object.')
    lesson.finish(text='Ring track finished: the same two settings as the garden path.')


def stack_block():
    reset()
    obj = blocks('Block', [((-0.5, -0.5, 0), (0.5, 0.5, 1), ())])
    lesson = Lesson(
        module='modifiers', example='stack-block', mode='watch', title='Order in the stack',
        out_dir=os.path.join(OUT, 'modifiers', 'stack-block'), obj=obj, panel='OBJECT', camera=BLOCK_CAMERAS['overview'],
        text='Modifiers run from top to bottom, each one on the result of the one above. Same two modifiers, two orders, two different shapes.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab, the wrench.')
    lesson.add_modifier('SUBSURF', shortcut=ADD_MENU, text='Add Modifier → Generate → Subdivision Surface. The cube melts into a blob.')
    lesson.set_value('SUBSURF', 'levels', 2, step=1, shortcut=SUBSURF_2, text='Set Levels Viewport to 2: a smoother blob.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU,
                        text='Add a Bevel. It goes below Subdivision and works on its smooth result, where no edge is sharp enough to bevel.')
    lesson.move_modifier('BEVEL', 'FIRST',
                         text='Open Bevel\'s menu, the small arrow in its header, and choose Move to First. Now Bevel runs on the cube, then Subdivision smooths it: a rounded block.')
    lesson.set_value('BEVEL', 'amount', 0.2, step=0.01, text='Set Amount to 0.2 m for rounder edges.')
    lesson.toggle_modifier('SUBSURF', False,
                           text='Hide Subdivision with its Realtime toggle, the screen icon in its header. You see what Bevel made on its own.')
    lesson.toggle_modifier('SUBSURF', True, text='Turn it back on. Hiding never deletes a modifier or its settings.')
    lesson.apply_modifier('BEVEL', shortcut=APPLY,
                          text='Apply Bevel from its menu. The shape stays the same, but the bevel is now part of the mesh and the modifier is gone.')
    lesson.finish(text='Done: order changes the result, Realtime hides without losing anything, Apply makes it permanent. Now round a cushion yourself.')


def stack_cushion():
    reset()
    obj = blocks('Cushion', [((-0.5, -0.35, 0), (0.5, 0.35, 0.25), ())])
    lesson = Lesson(
        module='modifiers', example='stack-cushion', mode='your-turn', title='Your turn: cushion', variant_of='stack-block',
        out_dir=os.path.join(OUT, 'modifiers', 'stack-cushion'), obj=obj, panel='OBJECT', camera=CUSHION_CAMERAS['overview'],
        text='A flat box. Put Bevel above Subdivision to turn it into a cushion, check each one, then apply the Bevel.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab.',
                        help='The wrench icon, right below the orange Object square.')
    lesson.add_modifier('SUBSURF', shortcut=ADD_MENU, text='Add a Subdivision Surface modifier.',
                        help='Add Modifier → Generate → Subdivision Surface.')
    lesson.set_value('SUBSURF', 'levels', 2, step=1, text='Set Levels Viewport to 2.', help='First number in the Subdivision panel.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU, text='Add a Bevel modifier.', help='Add Modifier → Generate → Bevel.')
    lesson.move_modifier('BEVEL', 'FIRST', text='Bevel must run first: move it to the top of the stack.',
                         help='The small arrow in the Bevel header opens its menu: Move to First.')
    lesson.set_value('BEVEL', 'amount', 0.08, step=0.01, text='Set the bevel Amount to 0.08 m.', help='Amount is right below Width Type.')
    lesson.toggle_modifier('SUBSURF', False, text='Hide Subdivision to see the bevel alone.',
                           help='The screen icon in the Subdivision header is its Realtime toggle.')
    lesson.toggle_modifier('SUBSURF', True, text='Show Subdivision again.', help='Tap the same screen icon.')
    lesson.apply_modifier('BEVEL', shortcut=APPLY, text='Apply the Bevel.', help='Bevel\'s header menu → Apply.')
    lesson.finish(text='Cushion finished: Bevel → Subdivision, then Bevel applied into the mesh.')



def project_ladder():
    reset()
    # Half a rung and one rail section. The rail is open top and bottom, so the copies stack into one long rail;
    # the rung's end is sunk into the rail so no open edge shows once Bevel cuts the rail's corners.
    obj = blocks('Ladder', [((0, -0.045, 0.08), (0.2, 0.045, 0.16), ('-x',)),
                            ((0.18, -0.06, 0), (0.3, 0.06, 0.25), ('-z', '+z'))])
    lesson = Lesson(
        module='modifiers', example='project-ladder', mode='watch', title='Project: wooden ladder',
        out_dir=os.path.join(OUT, 'modifiers', 'project-ladder'), obj=obj, panel='OBJECT', camera=LADDER_CAMERAS['piece'],
        text='Project 3. A whole ladder from half a rung and one piece of rail: Array stacks it, Mirror closes it, Bevel finishes it.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab, the wrench.')
    lesson.add_modifier('ARRAY', shortcut=ADD_MENU, camera=LADDER_CAMERAS['start'],
                        text='Add Modifier → Generate → Array. The copy lands beside the piece: Factor X is 1.')
    lesson.set_value('ARRAY', 'factor_z', 1, step=0.1,
                     text='Set Factor Z to 1: the copy also rises one rail piece. It goes up and to the side.')
    lesson.set_value('ARRAY', 'factor_x', 0, step=0.1,
                     text='Set Factor X to 0: no sideways move, so the copy sits right on top. The rail pieces line up.')
    lesson.set_value('ARRAY', 'count', 3, step=1, camera=LADDER_CAMERAS['overview'],
                     text='Raise Count to 3: three rungs, one long rail.')
    lesson.add_modifier('MIRROR', shortcut=ADD_MENU,
                        text='Add a Mirror below Array. It copies the whole stack across X: the second rail, and the rungs meet in the middle.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU, camera=LADDER_CAMERAS['corner'],
                        text='Add a Bevel at the bottom of the stack. Its 0.1 m default eats the 12 cm rails.')
    lesson.set_value('BEVEL', 'amount', 0.02, step=0.01, text='Set Amount to 0.02 m.')
    lesson.set_value('BEVEL', 'segments', 2, step=1,
                     text='Use 2 Segments for a rounded edge on every rung and rail.')
    lesson.finish(text='Project done: Array → Mirror → Bevel. Repeat, copy, then finish the edges of everything at once. '
                       'Now build a bookshelf the same way.')


def project_bookshelf():
    reset()
    obj = blocks('Bookshelf', [((0, -0.14, 0), (0.32, 0.14, 0.06), ('-x',)),
                               ((0.3, -0.15, 0), (0.38, 0.15, 0.32), ('-z', '+z'))])
    lesson = Lesson(
        module='modifiers', example='project-bookshelf', mode='your-turn', title='Your turn: bookshelf',
        variant_of='project-ladder',
        out_dir=os.path.join(OUT, 'modifiers', 'project-bookshelf'), obj=obj, panel='OBJECT', camera=SHELF_CAMERAS['start'],
        text='Half a shelf and one piece of the side. Stack it, mirror it and round its edges.',
    )
    lesson.select_panel('MODIFIER', shortcut=NEXT_TAB, text='Open the Modifier Properties tab.',
                        help='The wrench icon, right below the orange Object square.')
    lesson.add_modifier('ARRAY', shortcut=ADD_MENU, text='Repeat the piece: add an Array modifier.',
                        help='Add Modifier → Generate → Array.')
    lesson.set_value('ARRAY', 'factor_z', 1, step=0.1, text='Lift the copy: set Factor Z to 1.',
                     help='Factor Z is the third field in Relative Offset.')
    lesson.set_value('ARRAY', 'factor_x', 0, step=0.1, text='Stop the sideways move: set Factor X to 0. The shelves stack.',
                     help='Factor X is the first field in Relative Offset.')
    lesson.set_value('ARRAY', 'count', 3, step=1, camera=SHELF_CAMERAS['overview'], text='Set Count to 3 shelves.',
                     help='Count is right below Fit Type.')
    lesson.add_modifier('MIRROR', shortcut=ADD_MENU, text='Close the shelf: add a Mirror modifier below Array.',
                        help='Add Modifier → Generate → Mirror. Axis X is already on.')
    lesson.add_modifier('BEVEL', shortcut=ADD_MENU, camera=SHELF_CAMERAS['corner'],
                        text='Round the edges: add a Bevel modifier at the bottom.', help='Add Modifier → Generate → Bevel.')
    lesson.set_value('BEVEL', 'amount', 0.02, step=0.01,
                     text='Set the bevel Amount to 0.02 m.', help='Amount is right below Width Type.')
    lesson.set_value('BEVEL', 'segments', 3, step=1, text='Use 3 Segments for a round edge.',
                     help='Segments is right below Amount.')
    lesson.finish(text='Bookshelf finished: the same Array → Mirror → Bevel stack as the ladder.')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    ui_truth()
    cup()
    bowl()
    twisted_column()
    twisted_candle()
    mirror_table()
    mirror_bench()
    array_stairs()
    array_floating_steps()
    boolean_birdhouse()
    boolean_lantern()
    curve_garden_path()
    curve_ring_track()
    stack_block()
    stack_cushion()
    project_ladder()
    project_bookshelf()
    print('Drafty3D Learn: examples generated in', OUT)
