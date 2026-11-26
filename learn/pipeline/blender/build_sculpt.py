"""Records the Sculpting examples in the full Blender app. Run through `npm run learn:examples`, not directly.

Blender must run with a window (a virtual X display is enough): brush strokes go through
its event loop, the same path a mouse drag takes.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402

from sculpt import SculptLesson, clear_scene, pebble, run, sculpt_ui  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1]

FRONT = {'position': [0, -2.6, 0.62], 'target': [0, 0, 0.04], 'fov': 30}


def loop(center, radius, turns=1.0, points=14):
    """A small closed loop in lesson view coordinates (eye sockets, a round mouth)."""
    cx, cy = center
    return [(cx + radius * math.cos(2 * math.pi * turns * i / points), cy + radius * math.sin(2 * math.pi * turns * i / points))
            for i in range(points + 1)]


def buddy():
    clear_scene()
    obj = pebble('Pebble')
    lesson = SculptLesson(
        module='sculpt', example='pebble-buddy', mode='watch', title='Pebble buddy',
        out_dir=os.path.join(OUT, 'sculpt', 'pebble-buddy'), obj=obj, camera=FRONT,
        text='A smooth pebble becomes a little character. Sculpt Mode shapes the mesh like clay, one brush stroke at a time.',
    )
    lesson.set_mode('SCULPT', text='Switch the 3D Viewport to Sculpt Mode. The header now shows the brush and its settings.')
    lesson.select_brush('Grab', text='Pick the Grab brush. It moves a whole region of the surface, like pulling soft clay.')
    lesson.set_tool_value('size', 300, step=10,
                          text='Grab works best with a big brush. Set Size to 300 px. Size is shared by all brushes.')
    yield from lesson.stroke([(0, 0.3), (0.01, 0.5), (0.03, 0.72)], seconds=1.5,
                             text='Drag the top upward. The pebble stretches into a head.')
    lesson.select_brush('Draw', text='Pick the Draw brush. It raises the surface under the stroke.')
    lesson.set_tool_value('size', 60, step=10, text='Details need a small brush: set Size to 60 px.')
    lesson.set_tool_value('strength', 1.0, step=0.1, text='Set Strength to 1.0 so each stroke cuts deep enough to read.')
    lesson.set_direction('SUBTRACT', text='Switch the direction to Subtract (−): Draw now carves into the surface.')
    lesson.set_symmetry('X', True, text='Turn on X symmetry. Every stroke is mirrored to the other side.')
    yield from lesson.stroke(loop((0.19, 0.12), 0.025, turns=2, points=24), seconds=1.2,
                             text='Circle twice for the right eye. Symmetry carves the left eye too.')
    yield from lesson.stroke([(-0.03, -0.17), (0.08, -0.16), (0.16, -0.12), (0.23, -0.05)], seconds=1.2,
                             text='Now half a smile, from the middle to the right. The mirror draws the other half.')
    lesson.select_brush('Smooth', text='Pick the Smooth brush. It evens out bumps without changing the overall shape.')
    lesson.set_tool_value('size', 200, step=10, text='Set Size to 200 px to smooth a wide area.')
    # One pass of Smooth barely shows; small circles over the pointy tip round it off visibly.
    yield from lesson.stroke(loop((0.0, 0.42), 0.06, turns=3, points=36), seconds=2.2,
                             text='Circle over the pointy tip a few times. Smooth rounds it off without changing the overall shape.')
    lesson.finish(text='Done: Grab for the big shape, Draw for details, Smooth to clean up. Now sculpt a sleepy buddy yourself.')


def sleepy():
    clear_scene()
    obj = pebble('Pebble')
    lesson = SculptLesson(
        module='sculpt', example='sleepy-buddy', mode='your-turn', title='Your turn: sleepy buddy', variant_of='pebble-buddy',
        out_dir=os.path.join(OUT, 'sculpt', 'sleepy-buddy'), obj=obj, camera=FRONT,
        text='Same brushes, new face. Sculpt a sleepy buddy: closed eyes and a small round mouth.',
    )
    lesson.set_mode('SCULPT', text='Switch to Sculpt Mode.',
                    help='The mode menu is at the left of the 3D Viewport header. Ctrl Tab opens the mode pie.')
    lesson.select_brush('Grab', text='Pick the Grab brush.',
                        help='Grab is in the asset shelf under General. G selects it.')
    lesson.set_tool_value('size', 300, step=10, text='Set Size to 300 px.',
                          help='Size is in the header, right of the brush. F changes it in the viewport.')
    yield from lesson.stroke([(0, 0.3), (-0.08, 0.48), (-0.16, 0.64)], seconds=1.5,
                             text='Pull the top up and to the left: a sleepy, tilted head.',
                             help='Start on the top of the pebble and drag up and to the left.')
    lesson.select_brush('Draw', text='Pick the Draw brush.', help='Draw is in the shelf under General. V selects it.')
    lesson.set_tool_value('size', 50, step=10, text='Set Size to 50 px.', help='Same Size field in the header.')
    lesson.set_tool_value('strength', 1.0, step=0.1, text='Set Strength to 1.0.', help='Strength is right of Size. Shift F changes it.')
    lesson.set_direction('SUBTRACT', text='Switch the direction to Subtract.',
                         help='The − button next to Strength. Holding Ctrl while sculpting does the same.')
    lesson.set_symmetry('X', True, text='Turn on X symmetry.', help='The X button with the butterfly, right side of the header.')
    yield from lesson.stroke([(0.11, 0.12), (0.18, 0.09), (0.25, 0.12)], seconds=1.0,
                             text='Draw a closed right eye: a short curved line. Symmetry adds the left one.',
                             help='A short line right of the middle, at eye height, dipping in the middle.')
    yield from lesson.stroke(loop((0.0, -0.15), 0.05, turns=1, points=16), seconds=1.2,
                             text='Draw a small round mouth: one circle in the middle.',
                             help='A small circle centered on the middle line, below the eyes.')
    lesson.select_brush('Smooth', text='Pick the Smooth brush.', help='Smooth is under General. S selects it.')
    lesson.set_tool_value('size', 200, step=10, text='Set Size to 200 px.', help='The Size field again.')
    yield from lesson.stroke(loop((-0.08, 0.42), 0.06, turns=2, points=24), seconds=1.8,
                             text='Round off the tip of the tuft: circle over it twice.',
                             help='Small circles on the tuft, just left of the middle. Start anywhere on the loop.')
    lesson.finish(text='Sleepy buddy finished with the same three brushes as before.')


def main():
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'sculpt-ui.json'), 'w') as handle:
        json.dump(sculpt_ui(), handle, indent=2)
        handle.write('\n')
    # build-examples.mjs starts one Blender per lesson (LEARN_SCULPT_ONLY): brush settings persist within a session.
    only = os.environ.get('LEARN_SCULPT_ONLY')
    for lesson in (buddy, sleepy):
        if not only or only == lesson.__name__:
            yield from lesson()
    print('Drafty3D Learn: sculpt examples recorded in', OUT, flush=True)


run(main)
