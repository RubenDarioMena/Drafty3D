"""Sculpt lessons need real brush strokes, which only Blender's windowed event loop can run.

This module runs inside the full Blender app (not the bpy wheel) on a virtual X display.
Each lesson is a generator: it yields xdotool commands, Blender's own event loop processes
the synthetic mouse drag exactly as it would a person's, and the recorder exports what
Blender computed after every step. Nothing about the result is simulated.
"""
import math
import os
import subprocess
import sys
import traceback

import bpy
import numpy as np
from bpy_extras import view3d_utils
from mathutils import Vector

import truth
from lesson import Lesson

BRUSH_FILE = 'essentials_brushes-mesh_sculpt.blend'
CONTEXT = '3D Viewport · Sculpt Mode'
# Room left around a stroke so it never lands on the toolbar, header or asset shelf
# that overlap the 3D Viewport's main region in Sculpt Mode.
SAFE_MARGIN = {'left': 90, 'right': 140, 'top': 110, 'bottom': 170}
# Brushes that carry the surface along with the cursor instead of acting on what lies under it.
# Their trail follows the cursor on a plane at the start depth, and the app moves them as one piece.
DRAG_BRUSHES = {'GRAB', 'SNAKE_HOOK', 'ELASTIC_DEFORM', 'THUMB', 'POSE', 'ROTATE', 'BOUNDARY'}


# ---------------------------------------------------------------- Blender window helpers

def window_parts():
    win = bpy.context.window_manager.windows[0]
    area = max((a for a in win.screen.areas if a.type == 'VIEW_3D'), key=lambda a: a.width * a.height)
    region = next(r for r in area.regions if r.type == 'WINDOW')
    return win, area, region


def override(**extra):
    win, area, region = window_parts()
    return bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region, **extra)


def mode_set(obj, mode):
    if obj.mode != mode:
        with override(active_object=obj, object=obj):
            bpy.ops.object.mode_set(mode=mode)


def clear_scene():
    """Between lessons: empty the file without reloading the UI (a reload would reopen the splash)."""
    win, area, region = window_parts()
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        mode_set(bpy.context.object, 'OBJECT')
    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.cameras, bpy.data.lights,
                       bpy.data.materials, bpy.data.worlds):
        for item in list(collection):
            collection.remove(item)


def pebble(name, scale=(1.0, 0.9, 0.85), subdivisions=6):
    """Starting object of the sculpt lessons: an even, dense ico sphere squashed into a pebble."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=0.5)
    obj = bpy.context.active_object
    obj.name = obj.data.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = (0, 0, 0)
    bpy.ops.object.shade_smooth()
    return obj


def asset_id(brush_name):
    return f'brushes/{BRUSH_FILE}/Brush/{brush_name}'


def brush_slug(name):
    return name.lower().replace(' & ', '_').replace('/', '_').replace(' ', '_')


# ---------------------------------------------------------------- UI truth

def _catalogs():
    path = os.path.join(bpy.utils.system_resource('DATAFILES'), 'assets', 'blender_assets.cats.txt')
    catalogs = {}
    with open(path) as handle:
        for line in handle:
            if line.strip() and not line.startswith(('#', 'VERSION')):
                uid, catalog_path, _ = line.strip().split(':', 2)
                catalogs[uid] = catalog_path
    return catalogs


def brush_shortcut(name):
    try:
        return truth.shortcut('Sculpt', 'brush.asset_activate', CONTEXT, relative_asset_identifier=asset_id(name))
    except LookupError:
        return None


def sculpt_ui():
    """Mode menu, tool header and brush asset shelf as Blender 5.3 defines them."""
    catalogs = _catalogs()
    path = os.path.join(bpy.utils.system_resource('DATAFILES'), 'assets', 'brushes', BRUSH_FILE)
    with bpy.data.libraries.load(path, assets_only=True, link=True) as (_src, linked):
        linked.brushes = _src.brushes
    root = 'Brushes/Mesh Sculpt/'
    brushes = []
    for brush in sorted(linked.brushes, key=lambda b: b.name.lower()):
        catalog = catalogs.get(brush.asset_data.catalog_id, '')
        if not catalog.startswith(root):
            continue
        parts = catalog[len(root):].split('/')
        brushes.append({
            'id': f'sculpt.brush.{brush_slug(brush.name)}', 'name': brush.name,
            'tab': parts[0], 'group': parts[1] if len(parts) > 1 else None,
            'shortcut': brush_shortcut(brush.name),
        })
    for brush in list(linked.brushes):
        bpy.data.brushes.remove(brush)
    # Shelf tabs and groups follow the catalog file's order, as Blender's asset shelf does.
    order = [path[len(root):].split('/') for path in catalogs.values() if path.startswith(root)]
    tabs = list(dict.fromkeys(parts[0] for parts in order))
    groups = list(dict.fromkeys(parts[1] for parts in order if len(parts) > 1))
    mode_items = {item.identifier: item.name for item in bpy.types.Object.bl_rna.properties['mode'].enum_items_static}
    # Modes a mesh object offers in the 3D Viewport header (Grease Pencil and curve modes are other object types).
    mesh_modes = ['OBJECT', 'EDIT', 'SCULPT', 'VERTEX_PAINT', 'WEIGHT_PAINT', 'TEXTURE_PAINT']
    size_prop = bpy.types.UnifiedPaintSettings.bl_rna.properties['size']
    strength_prop = bpy.types.Brush.bl_rna.properties['strength']
    direction = bpy.types.Brush.bl_rna.properties['direction']
    return {
        'modeMenu': {
            'id': 'object.mode',
            'shortcut': truth.shortcut('Object Non-modal', 'view3d.object_mode_pie_or_toggle', '3D Viewport · mode pie'),
            'items': [{'id': f'object.mode.{mode.lower()}', 'value': mode, 'label': mode_items[mode]} for mode in mesh_modes],
        },
        'header': {
            'brush': {'id': 'sculpt.brush'},
            'size': {'id': 'sculpt.size', 'label': size_prop.name, 'kind': 'int', 'unit': 'px', 'precision': 0,
                     'softMin': size_prop.soft_min, 'softMax': size_prop.soft_max,
                     'shortcut': truth.shortcut('Sculpt', 'wm.radial_control', CONTEXT, data_path_primary='tool_settings.sculpt.brush.size')},
            'strength': {'id': 'sculpt.strength', 'label': strength_prop.name, 'kind': 'float', 'unit': '',
                         'precision': strength_prop.precision,
                         'softMin': strength_prop.soft_min, 'softMax': strength_prop.soft_max,
                         'shortcut': truth.shortcut('Sculpt', 'wm.radial_control', CONTEXT, data_path_primary='tool_settings.sculpt.brush.strength')},
            'direction': {'id': 'sculpt.direction', 'items': [
                {'id': f'sculpt.direction.{item.identifier.lower()}', 'value': item.identifier, 'label': item.name}
                for item in direction.enum_items_static if item.identifier in ('ADD', 'SUBTRACT')],
                'shortcut': truth.shortcut('Sculpt', 'sculpt.brush_stroke', 'hold while sculpting', mode='INVERT')},
            'remesh': remesh_ui(),
            'symmetry': {'id': 'sculpt.symmetry', 'items': [
                {'id': f'sculpt.symmetry.{axis.lower()}', 'axis': axis, 'label': axis} for axis in 'XYZ']},
        },
        'shelf': {'id': 'sculpt.shelf', 'tabs': ['All', *tabs], 'groups': groups, 'brushes': brushes},
    }


def remesh_ui():
    """The tool header's Remesh popover (VIEW3D_PT_sculpt_voxel_remesh in bl_ui/space_view3d_toolbar.py)."""
    mesh = bpy.types.Mesh.bl_rna.properties

    def field(rna, kind, text=None, heading=None):
        prop = mesh[rna]
        entry = {'id': f"sculpt.{rna.replace('use_remesh_', '').replace('remesh_', '')}", 'rna': rna, 'label': text or prop.name, 'description': prop.description,
                 'kind': kind, 'default': prop.default}
        if heading:
            entry['heading'] = heading
        if kind == 'float':
            entry.update(unit='m' if prop.subtype == 'DISTANCE' else '', precision=prop.precision,
                         softMin=prop.soft_min, softMax=prop.soft_max)
        return entry

    return {
        'id': 'sculpt.remesh', 'label': 'Remesh',
        'fields': [field('remesh_voxel_size', 'float'), field('remesh_voxel_adaptivity', 'float'),
                   field('use_remesh_fix_poles', 'bool'),
                   field('use_remesh_preserve_volume', 'bool', 'Volume', 'Preserve'),
                   field('use_remesh_preserve_attributes', 'bool', 'Attributes')],
        'button': {'id': 'sculpt.remesh.apply', 'label': 'Remesh',
                   'shortcut': truth.shortcut('Sculpt', 'object.voxel_remesh', '3D Viewport · Sculpt Mode')},
    }


# ---------------------------------------------------------------- the recorder

MASK = '_MASK'


def mask_values(mesh):
    """Blender's sculpt mask per vertex (0 = free, 1 = protected); zeros before anything is masked."""
    values = np.zeros(len(mesh.vertices))
    if '.sculpt_mask' in mesh.attributes:
        mesh.attributes['.sculpt_mask'].data.foreach_get('value', values)
    return values


class SculptLesson(Lesson):
    def __init__(self, *, mask=False, **kwargs):
        # A lesson that uses the Mask brush exports the mask with every mesh, so the app can shade it.
        self.export_attributes = mask
        super().__init__(panel='TOOL', **kwargs)
        self.data['initial'].pop('panel')
        self.data['initial']['mode'] = 'OBJECT'
        self.data['initial']['tool'] = None

    # The glTF exporter and the renderer read the object's mesh, which Sculpt Mode keeps
    # in its own buffers until the mode is left: capture always happens in Object Mode.
    def _capture(self, index, camera):
        mode = self.obj.mode
        mode_set(self.obj, 'OBJECT')
        mesh = self.obj.data
        if self.export_attributes:
            mesh.attributes.new(MASK, 'FLOAT', 'POINT').data.foreach_set('value', mask_values(mesh))
        # The glTF exporter splits each quad along its shorter diagonal, so a stroke can flip a
        # few triangles and break the shared topology the app morphs across. A fixed diagonal
        # (export and reference render alike) keeps every step's triangles the same.
        triangulate = self.obj.modifiers.new('Export triangles', 'TRIANGULATE')
        triangulate.quad_method = 'FIXED'
        try:
            return super()._capture(index, camera)
        finally:
            self.obj.modifiers.remove(triangulate)
            if self.export_attributes:
                mesh.attributes.remove(mesh.attributes[MASK])
            mode_set(self.obj, mode)

    def _signature(self):
        signature = super()._signature()
        return (*signature, tuple(np.round(self._mask(), 3))) if self.export_attributes else signature

    def _tool_state(self):
        paint = bpy.context.tool_settings.sculpt
        brush = paint.brush
        ups = paint.unified_paint_settings
        size_owner = ups if brush.use_unified_size else brush
        strength_owner = ups if brush.use_unified_strength else brush
        return {
            'brush': brush.name,
            'size': int(round(size_owner.size)),
            'strength': round(strength_owner.strength, 3),
            'direction': brush.direction if brush.sculpt_capabilities.has_direction else None,
            'symmetry': [axis for axis in 'XYZ' if getattr(self.obj.data, f'use_mirror_{axis.lower()}')],
            # The Remesh popover's Voxel Size lives on the mesh, not the brush.
            'voxel_size': round(self.obj.data.remesh_voxel_size, 4),
        }

    def _step(self, step, *, changes_mesh=False, camera=None):
        step.setdefault('shortcut', None)
        step.setdefault('help', None)
        step['tool'] = self._tool_state() if self.obj.mode == 'SCULPT' else None
        self._record(step, changes_mesh=changes_mesh, camera=camera)

    def set_mode(self, mode, *, text, help=None, camera=None):
        mode_set(self.obj, mode)
        # A new sculpt session starts from Blender's defaults, like a fresh install.
        self._step({'id': f'object.mode.{mode.lower()}', 'action': 'set_mode', 'value': mode, 'value_type': 'enum',
                    'shortcut': truth.shortcut('Object Non-modal', 'view3d.object_mode_pie_or_toggle', '3D Viewport · mode pie'),
                    'duration': 1.6, 'autoAdvance': True, 'text': text, 'help': help}, camera=camera)

    def select_brush(self, name, *, text, help=None, camera=None):
        with override():
            result = bpy.ops.brush.asset_activate(asset_library_type='ESSENTIALS', relative_asset_identifier=asset_id(name))
        if result != {'FINISHED'} or bpy.context.tool_settings.sculpt.brush.name != name:
            raise RuntimeError(f'Could not activate the {name} brush')
        self._step({'id': f'sculpt.brush.{brush_slug(name)}', 'action': 'select_brush', 'value': name, 'value_type': 'string',
                    'shortcut': brush_shortcut(name), 'duration': 2.0, 'autoAdvance': False, 'text': text, 'help': help},
                   camera=camera)

    def set_tool_value(self, field, value, *, step, text, help=None, camera=None):
        paint = bpy.context.tool_settings.sculpt
        brush = paint.brush
        unified = getattr(brush, f'use_unified_{field}')
        owner = paint.unified_paint_settings if unified else brush
        setattr(owner, field, value)
        if abs(getattr(owner, field) - value) > 1e-6:
            raise ValueError(f'Blender clamped {field} to {getattr(owner, field)}')
        shortcut = truth.shortcut('Sculpt', 'wm.radial_control', CONTEXT, data_path_primary=f'tool_settings.sculpt.brush.{field}')
        self._step({'id': f'sculpt.{field}', 'action': 'set_value', 'value': value, 'value_type': 'number', 'step': step,
                    'shortcut': shortcut, 'duration': 2.0, 'autoAdvance': False, 'text': text, 'help': help}, camera=camera)

    def set_direction(self, direction, *, text, help=None, camera=None):
        bpy.context.tool_settings.sculpt.brush.direction = direction
        self._step({'id': f'sculpt.direction.{direction.lower()}', 'action': 'set_direction', 'value': direction,
                    'value_type': 'enum',
                    'shortcut': truth.shortcut('Sculpt', 'sculpt.brush_stroke', 'hold while sculpting', mode='INVERT'),
                    'duration': 1.6, 'autoAdvance': False, 'text': text, 'help': help}, camera=camera)

    def set_symmetry(self, axis, enabled, *, text, help=None, camera=None):
        setattr(self.obj.data, f'use_mirror_{axis.lower()}', enabled)
        self._step({'id': f'sculpt.symmetry.{axis.lower()}', 'action': 'set_symmetry', 'value': enabled, 'value_type': 'bool',
                    'duration': 1.6, 'autoAdvance': False, 'text': text, 'help': help}, camera=camera)

    def set_voxel_size(self, value, *, step, text, help=None, camera=None):
        self.obj.data.remesh_voxel_size = value
        if abs(self.obj.data.remesh_voxel_size - value) > 1e-6:
            raise ValueError(f'Blender clamped Voxel Size to {self.obj.data.remesh_voxel_size}')
        self._step({'id': 'sculpt.voxel_size', 'action': 'set_value', 'value': value, 'value_type': 'number', 'step': step,
                    'shortcut': truth.shortcut('Sculpt', 'object.voxel_size_edit', '3D Viewport · Sculpt Mode'),
                    'duration': 2.0, 'autoAdvance': False, 'text': text, 'help': help}, camera=camera)

    def remesh(self, *, text, help=None, camera=None):
        """The Remesh button: Blender rebuilds the surface from voxels, so every vertex is new."""
        before = len(self.obj.data.vertices)
        with override():
            result = bpy.ops.object.voxel_remesh()
        mode_set(self.obj, 'OBJECT')
        mode_set(self.obj, 'SCULPT')
        if result != {'FINISHED'} or len(self.obj.data.vertices) == before:
            raise RuntimeError(f'Voxel Remesh did not rebuild the mesh ({result})')
        self._step({'id': 'sculpt.remesh.apply', 'action': 'remesh', 'value': None, 'value_type': None,
                    'shortcut': truth.shortcut('Sculpt', 'object.voxel_remesh', '3D Viewport · Sculpt Mode'),
                    'duration': 2.0, 'autoAdvance': False, 'text': text, 'help': help,
                    'remesh': {'vertices': len(self.obj.data.vertices), 'before': before}}, changes_mesh=True, camera=camera)

    # -------------------------------------------------------- strokes

    def frame(self, camera):
        """Points Blender's 3D Viewport through the lesson camera, so strokes land where the app shows them.

        The viewport derives its field of view from a lens and only recomputes its projection
        when it redraws, so the lens is solved against the drawn projection over a few redraws.
        """
        win, area, region = window_parts()
        space = area.spaces.active
        r3d = space.region_3d
        position, target = Vector(camera['position']), Vector(camera['target'])
        r3d.view_perspective = 'PERSP'
        r3d.view_location = target
        r3d.view_distance = (position - target).length
        r3d.view_rotation = (target - position).to_track_quat('-Z', 'Y')
        for _ in range(6):
            area.tag_redraw()
            yield None
            win, area, region = window_parts()
            up = (r3d.view_rotation @ Vector((0, 1, 0))).normalized()
            edge = target + up * r3d.view_distance * math.tan(math.radians(camera['fov']) / 2)
            shown = view3d_utils.location_3d_to_region_2d(region, r3d, edge).y - region.height / 2
            error = shown / (region.height / 2)
            if abs(error - 1) < 1e-3:
                return
            space.lens /= error
        raise RuntimeError(f'Could not match the viewport to the lesson camera (off by {error:.4f})')

    def _view_point(self, uv):
        """Lesson stroke coordinates: (0, 0) is the camera target, 1 is half the view height."""
        win, area, region = window_parts()
        half = region.height / 2
        x = region.width / 2 + uv[0] * half
        y = region.height / 2 + uv[1] * half
        if not (SAFE_MARGIN['left'] < x < region.width - SAFE_MARGIN['right']
                and SAFE_MARGIN['bottom'] < y < region.height - SAFE_MARGIN['top']):
            raise ValueError(f'Stroke point {uv} falls under a toolbar or the asset shelf')
        return x, y

    def _surface(self, region, r3d, xy):
        origin = view3d_utils.region_2d_to_origin_3d(region, r3d, xy)
        direction = view3d_utils.region_2d_to_vector_3d(region, r3d, xy)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        hit, location, *_ = bpy.context.scene.ray_cast(depsgraph, origin, direction)
        return location if hit else None

    def stroke(self, path, *, text, help=None, camera=None, samples_per_unit=260, seconds=1.6):
        """Drags the mouse along `path` (lesson view coordinates) with the left button held."""
        camera = camera or self.camera
        yield from self.frame(camera)
        win, area, region = window_parts()
        r3d = area.spaces.active.region_3d
        brush = bpy.context.tool_settings.sculpt.brush
        tool = self._tool_state()

        # Densify the authored polyline into screen pixels.
        points = [Vector(self._view_point(uv)) for uv in path]
        dense = [points[0]]
        for a, b in zip(points, points[1:]):
            count = max(1, int((b - a).length / 3))
            dense += [a.lerp(b, (i + 1) / count) for i in range(count)]

        start = self._surface(region, r3d, dense[0])
        if start is None:
            raise ValueError(f'The stroke starts off the {self.obj.name}')
        radius_px = tool['size'] / 2
        depth = start
        world = [view3d_utils.region_2d_to_location_3d(region, r3d, p, depth) for p in dense]
        edge = view3d_utils.region_2d_to_location_3d(region, r3d, dense[0] + Vector((radius_px, 0)), depth)
        radius = (edge - start).length
        drag = brush.sculpt_brush_type in DRAG_BRUSHES
        on_surface = [] if drag else [self._surface(region, r3d, p) for p in dense]
        trail = [s if s is not None else w for s, w in zip(on_surface, world)] if on_surface else world

        masking = brush.sculpt_brush_type == 'MASK'
        before = self._mask() if masking else self._positions()
        if os.environ.get('LEARN_DEBUG'):
            shot = os.path.join(self.out_dir, f'debug-{len(self.steps) + 1:02d}.png')
            subprocess.run(['import', '-window', 'root', shot], check=False)
            print('DEBUG stroke', screen_debug := [(round(region.x + p.x), round(win.height - (region.y + p.y))) for p in dense[:1]],
                  'region', region.x, region.y, region.width, region.height, 'win', win.width, win.height, flush=True)
        # Screen coordinates for X: region origin is bottom-left of the window.
        screen = [(round(region.x + p.x), round(win.height - (region.y + p.y))) for p in dense]
        pause = max(0.004, seconds / len(screen))
        command = ['mousemove', str(screen[0][0]), str(screen[0][1]), 'sleep', '0.25', 'mousedown', '1']
        for x, y in screen[1:]:
            command += ['mousemove', str(x), str(y), 'sleep', f'{pause:.3f}']
        command += ['sleep', '0.1', 'mouseup', '1', 'sleep', '0.4']
        yield command
        yield None
        if masking:
            moved = np.abs(self._mask() - before)
        else:
            moved = np.linalg.norm(self._positions() - before, axis=1)
        if moved.max() < 1e-5:
            raise RuntimeError('Blender did not change the mesh: the stroke missed or was not delivered')
        keep = max(2, len(trail) // 24)
        self._step({
            'id': 'sculpt.stroke', 'action': 'stroke', 'value': None, 'value_type': None,
            'duration': round(seconds + 0.8, 2), 'autoAdvance': False, 'text': text, 'help': help,
            'stroke': {
                'brush': brush.name, 'brushType': brush.sculpt_brush_type, 'drag': drag,
                'path': [[round(c, 4) for c in uv] for uv in path],
                'points': [[round(c, 4) for c in p] for p in trail[::keep] + [trail[-1]]],
                'radius': round(radius, 4), ('maskedVertices' if masking else 'movedVertices'): int((moved > 1e-5).sum()),
            },
        }, changes_mesh=True, camera=camera)

    def _mask(self):
        mode = self.obj.mode
        mode_set(self.obj, 'OBJECT')
        values = mask_values(self.obj.data)
        mode_set(self.obj, mode)
        return values

    def _positions(self):
        mode = self.obj.mode
        mode_set(self.obj, 'OBJECT')
        mesh = self.obj.data
        positions = np.empty(len(mesh.vertices) * 3)
        mesh.vertices.foreach_get('co', positions)
        mode_set(self.obj, mode)
        return positions.reshape(-1, 3)


# ---------------------------------------------------------------- driving Blender's event loop

def run(script):
    """Steps a generator from a timer; xdotool commands run while Blender keeps processing events."""
    state = {'process': None}

    def fail():
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)

    def tick():
        try:
            process = state['process']
            if process is not None:
                if process.poll() is None:
                    return 0.05
                state['process'] = None
                if process.returncode:
                    raise RuntimeError(f'xdotool failed with {process.returncode}')
                return 0.3
            command = next(generator)
        except StopIteration:
            sys.stdout.flush()
            os._exit(0)
        except Exception:  # noqa: BLE001 - any failure must end the recording with an error
            fail()
        if command:
            state['process'] = subprocess.Popen(['xdotool', *command])
            return 0.05
        return 0.3

    def startup():
        # Blender opens with its splash screen even for a file given on the command line;
        # a click outside it closes it, exactly as it would for a person.
        win, area, region = window_parts()
        yield ['mousemove', str(region.x + 40), str(win.height - region.y - 40), 'click', '1', 'sleep', '0.5']
        yield from script()

    generator = startup()
    bpy.app.timers.register(tick, first_interval=2.0)
