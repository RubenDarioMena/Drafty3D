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


def horned():
    clear_scene()
    obj = pebble('Pebble')
    lesson = SculptLesson(
        module='sculpt', example='horned-buddy', mode='watch', title='Horned buddy',
        out_dir=os.path.join(OUT, 'sculpt', 'horned-buddy'), obj=obj, camera=FRONT,
        text='Three new brushes turn the pebble into a little monster: Snake Hook pulls horns, Inflate blows up the eyes, Crease cuts a grin.',
    )
    lesson.set_mode('SCULPT', text='Switch to Sculpt Mode.')
    lesson.select_brush('Snake Hook', text='Pick Snake Hook. Like Grab, it drags the surface, but it keeps pulling as you go, so it can draw out long shapes.')
    lesson.set_tool_value('size', 140, step=10, text='Set Size to 140 px: the width of the horn at its base.')
    lesson.set_symmetry('X', True, text='Turn on X symmetry so both horns grow at once.')
    yield from lesson.stroke([(0.2, 0.36), (0.26, 0.52), (0.3, 0.66), (0.33, 0.76)], seconds=1.6,
                             text='Drag from the top of the head up and outward. The mirror pulls the left horn.')
    lesson.select_brush('Inflate/Deflate', text='Pick Inflate/Deflate. It pushes the surface out along its normals, like blowing into a balloon.')
    lesson.set_tool_value('size', 90, step=10, text='Set Size to 90 px.')
    yield from lesson.stroke(loop((0.3, -0.1), 0.04, turns=3, points=30), seconds=1.6,
                             text='Circle on the right eye spot a few times: the eye swells up. Symmetry makes the other one.')
    lesson.select_brush('Crease Polish', text='Pick Crease Polish. It cuts a sharp groove and pinches the sides together.')
    lesson.set_tool_value('size', 50, step=10, text='Set Size to 50 px for a thin line.')
    lesson.set_tool_value('strength', 1.0, step=0.1, text='Set Strength to 1.0 so the groove cuts deep.')
    yield from lesson.stroke([(0.0, -0.26), (0.1, -0.25), (0.19, -0.2), (0.25, -0.12), (0.19, -0.2), (0.1, -0.25), (0.0, -0.26),
                              (0.1, -0.25), (0.19, -0.2), (0.25, -0.12)], seconds=2.4,
                             text='Draw half a wide grin from the middle to the right and go over it again; the mirror completes it.')
    lesson.finish(text='Done: Snake Hook for horns, Inflate for volume, Crease for sharp lines. Now sculpt a bug with antennae.')


def bug():
    clear_scene()
    obj = pebble('Pebble')
    lesson = SculptLesson(
        module='sculpt', example='antenna-bug', mode='your-turn', title='Your turn: antenna bug', variant_of='horned-buddy',
        out_dir=os.path.join(OUT, 'sculpt', 'antenna-bug'), obj=obj, camera=FRONT,
        text='Same brushes, new creature: thin antennae, big round eyes and a small mouth.',
    )
    lesson.set_mode('SCULPT', text='Switch to Sculpt Mode.', help='The mode menu at the left of the 3D Viewport header.')
    lesson.select_brush('Snake Hook', text='Pick the Snake Hook brush.', help='Snake Hook is in the shelf under General. K selects it.')
    lesson.set_tool_value('size', 70, step=10, text='Set Size to 70 px: thin antennae.', help='Size is in the header, right of the brush.')
    lesson.set_symmetry('X', True, text='Turn on X symmetry.', help='The X button with the butterfly, right side of the header.')
    yield from lesson.stroke([(0.1, 0.42), (0.13, 0.58), (0.2, 0.7), (0.28, 0.76)], seconds=1.6,
                             text='Pull a thin antenna up and out from the top of the head.',
                             help='Start just right of the middle on top, drag up, then curve outward.')
    lesson.select_brush('Inflate/Deflate', text='Pick the Inflate/Deflate brush.', help='Inflate/Deflate is under General. I selects it.')
    lesson.set_tool_value('size', 120, step=10, text='Set Size to 120 px.', help='The Size field again.')
    yield from lesson.stroke(loop((0.2, 0.12), 0.04, turns=3, points=30), seconds=1.6,
                             text='Circle over the right eye spot to blow up a big round eye.',
                             help='Small circles right of the middle, a little above the center. Start anywhere on the loop.')
    lesson.select_brush('Crease Polish', text='Pick the Crease Polish brush.', help='Crease Polish is under General. Shift C selects it.')
    lesson.set_tool_value('size', 40, step=10, text='Set Size to 40 px.', help='The Size field again.')
    lesson.set_tool_value('strength', 1.0, step=0.1, text='Set Strength to 1.0.', help='Strength is right of Size. Shift F changes it.')
    yield from lesson.stroke([(0.0, -0.18), (0.07, -0.2), (0.13, -0.16), (0.07, -0.2), (0.0, -0.18), (0.07, -0.2), (0.13, -0.16)],
                             seconds=1.8, text='A small mouth: a short line from the middle to the right, back and forth.',
                             help='Below the eyes, from the middle line to the right and back, twice.')
    lesson.finish(text='Antenna bug finished with the same three brushes as the horned buddy.')


def rock():
    clear_scene()
    obj = pebble('Rock', scale=(1.05, 0.9, 0.8))
    lesson = SculptLesson(
        module='sculpt', example='rock', mode='watch', title='Craggy rock',
        out_dir=os.path.join(OUT, 'sculpt', 'rock'), obj=obj, camera=FRONT,
        text='A smooth pebble becomes a weathered rock: layers of clay, flat chipped faces and a deep crack.',
    )
    lesson.set_mode('SCULPT', text='Switch to Sculpt Mode.')
    lesson.select_brush('Clay Strips', text='Pick Clay Strips. It lays down flat strips, like adding slabs of clay.')
    lesson.set_tool_value('size', 120, step=10, text='Set Size to 120 px: wide strips.')
    yield from lesson.stroke([(-0.42, -0.12), (-0.15, 0.02), (0.15, 0.12), (0.4, 0.2)], seconds=1.6,
                             text='Drag one strip across the front. It builds a ledge, not a bump.')
    yield from lesson.stroke([(-0.4, -0.36), (-0.1, -0.26), (0.2, -0.2), (0.42, -0.08)], seconds=1.6,
                             text='Add a second strip below it: rock strata.')
    lesson.select_brush('Scrape/Fill', text='Pick Scrape/Fill. It shaves off whatever sticks out above a plane, leaving a flat face.')
    lesson.set_tool_value('size', 200, step=10, text='Set Size to 200 px.')
    lesson.set_tool_value('strength', 1.0, step=0.1, text='Set Strength to 1.0 to shave hard.')
    yield from lesson.stroke([(0.3, 0.3), (0.32, 0.0), (0.3, -0.3), (0.32, 0.0), (0.3, 0.3), (0.32, 0.0), (0.3, -0.3)], seconds=2.6,
                             text='Scrape up and down the right side. It shaves the strips and the bulge into one chipped, flat face.')
    lesson.select_brush('Draw Sharp', text='Pick Draw Sharp. Like Draw, but with a hard edge, and it starts on Subtract (−): it carves a cut.')
    lesson.set_tool_value('size', 40, step=10, text='Set Size to 40 px.')
    lesson.set_tool_value('strength', 1.0, step=0.1, text='Set Strength to 1.0.')
    yield from lesson.stroke([(-0.18, 0.4), (-0.12, 0.26), (-0.2, 0.12), (-0.12, -0.02), (-0.18, -0.16), (-0.12, -0.02),
                              (-0.2, 0.12), (-0.12, 0.26), (-0.18, 0.4)], seconds=2.2,
                             text='Zigzag down the left side and back up: a crack through the layers.')
    lesson.finish(text='Done: Clay Strips to build, Scrape to chip flat faces, Draw Sharp to crack. Now shape a boulder yourself.')


def boulder():
    clear_scene()
    obj = pebble('Rock', scale=(1.05, 0.9, 0.8))
    lesson = SculptLesson(
        module='sculpt', example='boulder', mode='your-turn', title='Your turn: split boulder', variant_of='rock',
        out_dir=os.path.join(OUT, 'sculpt', 'boulder'), obj=obj, camera=FRONT,
        text='Same brushes, another rock: a boulder with a flat left face and a crack down the middle.',
    )
    lesson.set_mode('SCULPT', text='Switch to Sculpt Mode.', help='The mode menu at the left of the 3D Viewport header.')
    lesson.select_brush('Clay Strips', text='Pick the Clay Strips brush.', help='Clay Strips is under General. C selects it.')
    lesson.set_tool_value('size', 150, step=10, text='Set Size to 150 px.', help='Size is in the header, right of the brush.')
    yield from lesson.stroke([(0.42, -0.2), (0.15, -0.05), (-0.15, 0.05), (-0.4, 0.12)], seconds=1.6,
                             text='Lay one strip across the front, from right to left.',
                             help='Start on the right side, a little below the middle, and drag to the left.')
    yield from lesson.stroke([(0.4, 0.18), (0.12, 0.3), (-0.15, 0.32), (-0.35, 0.26)], seconds=1.6,
                             text='Lay a second strip above it, also from right to left.',
                             help='Same direction, higher up.')
    lesson.select_brush('Scrape/Fill', text='Pick the Scrape/Fill brush.', help='Scrape/Fill is under General. Shift T selects it.')
    lesson.set_tool_value('size', 250, step=10, text='Set Size to 250 px.', help='The Size field again.')
    lesson.set_tool_value('strength', 1.0, step=0.1, text='Set Strength to 1.0.', help='Strength is right of Size. Shift F changes it.')
    yield from lesson.stroke([(-0.44, 0.3), (-0.52, 0.05), (-0.44, -0.2), (-0.52, 0.05), (-0.44, 0.3), (-0.52, 0.05), (-0.44, -0.2)],
                             seconds=2.4, text='Scrape up and down the left side to cut a flat face.',
                             help='Start on the upper left edge, drag down, up and down again.')
    lesson.select_brush('Draw Sharp', text='Pick the Draw Sharp brush. It already carves (Subtract).', help='Draw Sharp is in the shelf, right after Draw.')
    lesson.set_tool_value('size', 50, step=10, text='Set Size to 50 px.', help='The Size field again.')
    lesson.set_tool_value('strength', 1.0, step=0.1, text='Set Strength to 1.0.', help='Strength is right of Size. Shift F changes it.')
    yield from lesson.stroke([(0.02, 0.46), (0.08, 0.3), (-0.02, 0.15), (0.06, 0.0), (-0.01, -0.2), (0.06, 0.0), (-0.02, 0.15),
                              (0.08, 0.3), (0.02, 0.46)], seconds=2.2,
                             text='Crack it down the middle with a zigzag, down and back up.',
                             help='From the top center down, zigzagging a little, then back up the same way.')
    lesson.finish(text='Split boulder finished with the same three brushes as the rock.')


LESSONS = ('buddy', 'sleepy', 'horned', 'bug', 'rock', 'boulder')


def main():
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'sculpt-ui.json'), 'w') as handle:
        json.dump(sculpt_ui(), handle, indent=2)
        handle.write('\n')
    # build-examples.mjs starts one Blender per lesson (LEARN_SCULPT_ONLY): brush settings persist within a session.
    only = os.environ.get('LEARN_SCULPT_ONLY')
    for name in LESSONS:
        if not only or only == name:
            yield from globals()[name]()
    print('Drafty3D Learn: sculpt examples recorded in', OUT, flush=True)


run(main)
