"""Generates the Modifiers examples with bpy. Run through `npm run learn:examples`, not directly."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402

import truth  # noqa: E402
from lesson import Lesson, open_cylinder, reset  # noqa: E402

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


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    ui_truth()
    cup()
    bowl()
    print('Drafty3D Learn: examples generated in', OUT)
