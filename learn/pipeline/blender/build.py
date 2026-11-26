"""Generates the Modifiers examples with bpy. Run through `npm run learn:examples`, not directly."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402

import truth  # noqa: E402
from lesson import Lesson, column, open_cylinder, reset  # noqa: E402

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


def ui_truth():
    reset()
    probe = open_cylinder('Probe', 1, 1, 8)
    data = {
        'blenderVersion': bpy.app.version_string,
        'propertiesTabs': truth.properties_tabs(),
        'objectPanels': truth.object_panels(),
        'addModifierMenu': truth.add_modifier_menu(),
        'modifiers': truth.modifier_definitions(probe),
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


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    ui_truth()
    cup()
    bowl()
    twisted_column()
    twisted_candle()
    print('Drafty3D Learn: examples generated in', OUT)
