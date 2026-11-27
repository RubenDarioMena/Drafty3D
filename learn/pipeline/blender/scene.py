"""Levels 1 and 2: the 3D Viewport in Object Mode and Edit Mode, recorded in the full Blender app.

Like sculpt.py this runs inside Blender's windowed event loop on a virtual X display. Menu
items run their operator through bpy.ops in the 3D Viewport's context; orbiting, zooming,
panning and knife cuts are real mouse and key events sent with xdotool, and clicks select
with Blender's own picking at the pixel the app later shows. After every step the recorder
exports what Blender computed: the visible meshes, the Edit Mode mesh and its selection,
the viewport's camera and the Adjust Last Operation panel. Nothing about the result is simulated.
"""
import json
import math
import os
import re
import shutil
import struct

import bmesh
import bpy
from bpy_extras import view3d_utils
from mathutils import Matrix, Vector

import truth
from lesson import _setup_render
from sculpt import SAFE_MARGIN, mode_set, override, window_parts

EDIT_CONTEXT = '3D Viewport · Edit Mode'
OBJECT_CONTEXT = '3D Viewport · Object Mode'
# Keymaps searched for a menu item's shortcut, most specific first, as Blender's menus show them.
KEYMAPS = {
    'OBJECT': ['Object Mode', '3D View', 'Object Non-modal', '3D View Generic', 'Window', 'Screen'],
    'EDIT': ['Mesh', '3D View', 'Object Non-modal', '3D View Generic', 'Window', 'Screen'],
    'SCULPT': ['Sculpt', '3D View', 'Object Non-modal', '3D View Generic', 'Window', 'Screen'],
}
# Submenus the lessons open; their items are read too. Any other submenu shows in its parent
# menu as Blender lists it, but the app does not open it.
OPEN_MENUS = {
    'VIEW3D_MT_view_viewpoint', 'VIEW3D_MT_mesh_add', 'VIEW3D_MT_transform_object', 'VIEW3D_MT_transform',
    'VIEW3D_MT_edit_mesh_select_loops', 'VIEW3D_MT_edit_mesh_merge', 'VIEW3D_MT_edit_mesh_delete',
    'VIEW3D_MT_edit_mesh_extrude',
}
# Operators whose Adjust Last Operation panel the lessons use (and whose panel the app draws).
OPERATORS = [
    'mesh.primitive_cube_add', 'mesh.primitive_cylinder_add', 'mesh.primitive_uv_sphere_add', 'mesh.primitive_ico_sphere_add',
    'mesh.primitive_cone_add', 'mesh.primitive_grid_add', 'mesh.primitive_plane_add',
    'transform.translate', 'transform.rotate', 'transform.resize', 'object.duplicate_move', 'object.select_all',
    'object.mode_set', 'mesh.select_mode', 'mesh.select_all', 'mesh.select_edge_loop_multi', 'mesh.region_to_loop',
    'mesh.extrude_region_move', 'mesh.inset', 'mesh.bevel', 'mesh.loopcut_slide', 'mesh.merge', 'mesh.delete',
    'mesh.edge_face_add', 'mesh.bridge_edge_loops', 'mesh.knife_tool', 'view3d.select', 'mesh.select_boundary_loop_multi',
    'view3d.view_axis', 'view3d.view_all',
]
# Mode changes run these inside object.mode_set; they decide what happens to Adjust Last Operation.
MODE_TOGGLES = {'EDIT': 'object.editmode_toggle', 'SCULPT': 'sculpt.sculptmode_toggle'}
# Modal-only operators: Blender cannot run them again, so they leave no Adjust Last Operation panel.
MODAL_ONLY = {'mesh.knife_tool'}
# Transform panels hide these unless their switch is on (transform_ops.cc, transform_poll_property).
SHOWN_WITH = {'proportional_edit_falloff': 'use_proportional_edit', 'proportional_size': 'use_proportional_edit',
              'use_proportional_connected': 'use_proportional_edit', 'use_proportional_projected': 'use_proportional_edit'}
# Shown only while Snap is on, which a menu-run transform never is.
NEVER_SHOWN = {'use_snap_project'}
# Operators that draw their own panel (an `ui` callback) instead of listing every setting:
# (property, label or None for the RNA name, display, shown when another field holds one of these values).
CUSTOM_PANELS = {
    'mesh.bevel': [  # editmesh_bevel.cc, edbm_bevel_ui
        ('affect', None, 'expand', None), ('offset_type', None, 'dropdown', None),
        ('offset_pct', None, None, ('offset_type', ['PERCENT'])),
        ('offset', None, None, ('offset_type', ['OFFSET', 'WIDTH', 'DEPTH', 'ABSOLUTE'])),
        ('segments', None, None, None), ('profile', 'Profile Shape', 'slider', ('profile_type', ['SUPERELLIPSE'])),
        ('profile', 'Miter Profile Shape', 'slider', ('profile_type', ['CUSTOM'])),
        ('material', None, None, None), ('harden_normals', None, None, None), ('clamp_overlap', None, None, None),
        ('loop_slide', None, None, None), ('mark_seam', 'Seams', None, None), ('mark_sharp', 'Sharp', None, None),
        ('miter_outer', 'Miter Outer', 'dropdown', None), ('miter_inner', 'Inner', 'dropdown', None),
        ('spread', None, None, ('miter_inner', ['ARC'])), ('vmesh_method', 'Intersection Type', 'dropdown', None),
        ('face_strength_mode', 'Face Strength', 'dropdown', None), ('profile_type', None, 'expand', None),
    ],
}
SELECT_MODES = ('VERT', 'EDGE', 'FACE')
# Menu items whose Python operator only starts another one: Blender's panel then shows the inner operator.
# view3d.edit_mesh_extrude_move_normal (bl_operators/view3d.py) extrudes selected faces along their normal.
WRAPPERS = {
    'view3d.edit_mesh_extrude_move_normal': ('mesh.extrude_region_move', {
        'TRANSFORM_OT_translate': {'orient_type': 'NORMAL', 'constraint_axis': [False, False, True]}}),
}
PROPORTIONAL = ('use_proportional_edit', 'proportional_edit_falloff', 'proportional_size',
                'use_proportional_connected', 'use_proportional_projected')


def slug(text):
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')


def natural(name):
    """Outliner order: Blender sorts names alphabetically, numbers by value (Post, Post.001, Post.002)."""
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r'(\d+)', name)]


def rounded(vector, digits=4):
    return [0.0 if abs(round(c, digits)) == 0 else round(c, digits) for c in vector]


def finite(value):
    return max(-1e9, min(1e9, value))


def op_function(idname):
    module, name = idname.split('.')
    return getattr(getattr(bpy.ops, module), name)


def op_rna(idname):
    return op_function(idname).get_rna_type()


def sub_idname(pointer):
    """MESH_OT_extrude_region → mesh.extrude_region (a macro's step)."""
    module, name = pointer.split('_OT_')
    return f'{module.lower()}.{name}'


def find_shortcut(operator, props, keymaps, context, event_type=None):
    """The default key Blender shows next to a menu item: same operator, no property that disagrees."""
    for keymap in keymaps:
        for idname, event, item_props in truth.keymap_items(keymap):
            if idname != operator or event.get('value') not in ('PRESS', 'CLICK', None):
                continue
            if event_type and event['type'] != event_type:
                continue
            if any(key in item_props and item_props[key] != value for key, value in props.items()):
                continue
            if any(key not in props for key in item_props if key not in ('release_confirm', 'toggle')):
                continue
            return {'keys': truth.key_names(event), 'context': context}
    return None


def modal_key(keymap, action, context):
    for idname, event, _props in truth.keymap_items(keymap):
        if idname == action:
            return {'keys': truth.key_names(event), 'context': context}
    raise LookupError(f'{action} is not in {keymap}')


# ---------------------------------------------------------------- UI truth: the 3D Viewport's menus

class _Props:
    """What a menu's draw() sets on an operator button (props.type = 'FRONT'), nested for macros."""

    def __init__(self):
        object.__setattr__(self, 'values', {})

    def __setattr__(self, key, value):
        self.values[key] = value

    def __getattr__(self, key):
        nested = _Props()
        self.values[key] = nested
        return nested

    def plain(self):
        return {key: (value.plain() if isinstance(value, _Props) else _plain(value)) for key, value in self.values.items()
                if not isinstance(value, _Props) or value.values}


def _plain(value):
    if isinstance(value, (bool, int, float, str)) or value is None:
        return value
    try:
        return [_plain(item) for item in value]
    except TypeError:
        return str(value)


class _Layout:
    """Stands in for UILayout while a Blender menu draws: it records the entries instead of drawing them."""

    def __init__(self, entries):
        object.__setattr__(self, 'entries', entries)

    def __setattr__(self, key, value):
        pass

    def __getattr__(self, name):
        def call(*args, **kwargs):
            if name in ('row', 'column', 'box', 'split', 'column_flow', 'grid_flow', 'menu_pie'):
                return self
            props = _Props()
            self.entries.append((name, args, kwargs, props))
            return props
        return call


def _proxy(cls, layout):
    """An instance-like object for cls.draw(): the menu's own Python methods, with our layout."""
    namespace = {}
    for klass in reversed(cls.__mro__):
        if klass is object or klass.__module__.startswith('bpy'):
            continue
        namespace.update({key: value for key, value in klass.__dict__.items() if not key.startswith('__')})
    proxy = type('MenuProxy', (), namespace)()
    proxy.layout = layout
    proxy.bl_label = cls.bl_label
    return proxy


def draw_menu(name):
    cls = getattr(bpy.types, name)
    entries = []
    with override():
        cls.draw(_proxy(cls, _Layout(entries)), bpy.context)
    return entries


def menu_key(name):
    return name.replace('VIEW3D_MT_', '').lower()


def _poll(idname):
    try:
        with override():
            return bool(op_function(idname).poll())
    except (AttributeError, RuntimeError, KeyError):
        return False


def _menu_items(name, mode, queue):
    key = menu_key(name)
    items = []
    used = {}

    def add(entry):
        if 'label' in entry:
            base = f'menu.{key}.{slug(entry["label"]) or "item"}'
            used[base] = used.get(base, 0) + 1
            entry['id'] = base if used[base] == 1 else f'{base}_{used[base]}'
        items.append(entry)

    for kind, args, kwargs, props in draw_menu(name):
        if kind == 'separator':
            if items and not items[-1].get('separator'):
                items.append({'separator': True})
        elif kind == 'operator':
            idname = args[0]
            values = props.plain()
            rna = op_rna(idname)
            label = kwargs.get('text') or rna.name
            add({'kind': 'operator', 'label': label, 'operator': idname, 'props': values, 'enabled': _poll(idname),
                 'shortcut': find_shortcut(idname, values, KEYMAPS[mode], f'3D Viewport · {MODE_LABELS[mode]}')})
        elif kind == 'operator_enum':
            idname, prop = args[0], args[1] if len(args) > 1 else kwargs['property']
            enum = op_rna(idname).properties[prop]
            for item in enum.enum_items:
                # Merge ▸ At First / At Last need a selection history, which a click selection leaves empty.
                if idname == 'mesh.merge' and item.identifier in ('FIRST', 'LAST'):
                    continue
                values = {prop: item.identifier}
                add({'kind': 'operator', 'label': item.name, 'operator': idname, 'props': values, 'enabled': _poll(idname),
                     'shortcut': find_shortcut(idname, values, KEYMAPS[mode], f'3D Viewport · {MODE_LABELS[mode]}')})
        elif kind == 'menu':
            sub = args[0]
            cls = getattr(bpy.types, sub, None)
            label = kwargs.get('text') or (cls.bl_label if cls else sub)
            opens = sub in OPEN_MENUS
            if opens:
                queue.append(sub)
            add({'kind': 'menu', 'label': label, 'menu': menu_key(sub) if opens else None,
                 'shortcut': find_shortcut('wm.call_menu', {'name': sub}, KEYMAPS[mode], f'3D Viewport · {MODE_LABELS[mode]}')})
        elif kind == 'operator_menu_enum':
            idname, prop = args[0], args[1] if len(args) > 1 else kwargs['property']
            label = kwargs.get('text') or op_rna(idname).properties[prop].name
            add({'kind': 'menu', 'label': label, 'menu': None, 'shortcut': None})
        elif kind == 'prop':
            data, prop = args[0], args[1]
            rna_prop = data.bl_rna.properties.get(prop) if hasattr(data, 'bl_rna') else None
            if rna_prop is not None:
                add({'kind': 'toggle', 'label': kwargs.get('text') or rna_prop.name, 'enabled': False})
        elif kind == 'label' and kwargs.get('text'):
            items.append({'heading': kwargs['text']})
    while items and items[-1].get('separator'):
        items.pop()
    cls = getattr(bpy.types, name)
    return {'id': f'menu.{key}', 'key': key, 'label': cls.bl_label, 'items': items}


MODE_LABELS = {'OBJECT': 'Object Mode', 'EDIT': 'Edit Mode', 'SCULPT': 'Sculpt Mode'}


def _header_and_menus(mode, menus):
    header = []
    queue = []
    for kind, args, kwargs, _props in draw_menu('VIEW3D_MT_editor_menus'):
        if kind != 'menu':
            continue
        name = args[0]
        key = menu_key(name)
        header.append({'id': f'menu.{key}', 'menu': key, 'label': kwargs.get('text') or getattr(bpy.types, name).bl_label,
                       'shortcut': find_shortcut('wm.call_menu', {'name': name}, KEYMAPS[mode], f'3D Viewport · {MODE_LABELS[mode]}')})
        queue.append(name)
    while queue:
        name = queue.pop(0)
        if menu_key(name) not in menus:
            menus[menu_key(name)] = _menu_items(name, mode, queue)
    return header


def _hud_field(prefix, prop, sub):
    """One Adjust Last Operation field; vectors become one field per axis, as Blender draws them."""
    base = {'rna': prop.identifier, 'description': prop.description}
    if sub:
        base['sub'] = sub
    name = prop.name
    if prop.identifier in SHOWN_WITH:
        base['shownWith'] = SHOWN_WITH[prop.identifier]
    length = getattr(prop, 'array_length', 0)
    fields = []
    if prop.type == 'ENUM':
        fields.append({**base, 'id': f'{prefix}.{prop.identifier}', 'label': name, 'kind': 'enum', 'display': 'dropdown',
                       'default': prop.default, 'items': [{'value': item.identifier, 'label': item.name} for item in prop.enum_items]})
    elif prop.type == 'BOOLEAN' and length:
        for i in range(length):
            fields.append({**base, 'id': f'{prefix}.{prop.identifier}.{"xyz"[i]}', 'index': i, 'label': 'XYZ'[i], 'row': name,
                           'kind': 'bool', 'display': 'toggle', 'default': bool(prop.default_array[i])})
    elif prop.type == 'BOOLEAN':
        fields.append({**base, 'id': f'{prefix}.{prop.identifier}', 'label': name, 'kind': 'bool', 'default': bool(prop.default)})
    elif prop.type in ('FLOAT', 'INT'):
        unit = getattr(prop, 'unit', 'NONE')
        rotation = unit == 'ROTATION'
        convert = math.degrees if rotation else (lambda v: v)
        common = {**base, 'kind': 'float' if prop.type == 'FLOAT' else 'int',
                  'unit': {'LENGTH': 'm', 'ROTATION': '°'}.get(unit, '%' if prop.subtype == 'PERCENTAGE' else ''),
                  'softMin': finite(round(convert(prop.soft_min), 4)), 'softMax': finite(round(convert(prop.soft_max), 4))}
        if prop.type == 'FLOAT' and unit == 'NONE':
            common['precision'] = prop.precision
        defaults = list(prop.default_array) if length else [prop.default]
        for i, default in enumerate(defaults):
            field = {**common, 'default': round(convert(default), 6) if prop.type == 'FLOAT' else default}
            if length:
                field.update(id=f'{prefix}.{prop.identifier}.{"xyz"[i]}', index=i, label=f'{name} {"XYZ"[i]}' if i == 0 else 'XYZ'[i],
                             title=f'{name} {"XYZ"[i]}')
            else:
                field.update(id=f'{prefix}.{prop.identifier}', label=name)
            fields.append(field)
    return fields


def operator_ui(idname):
    rna = op_rna(idname)
    flags = set(op_function(idname).bl_options)
    sections = []
    macro = 'MACRO' in flags
    structs = [(p.identifier, p.fixed_type) for p in rna.properties if p.type == 'POINTER' and '_OT_' in p.identifier]
    if not (macro and structs):
        structs = [(None, rna)]
    for sub, struct in structs:
        prefix = f'redo.{idname}' + (f'.{sub}' if sub else '')
        fields = []
        names = {prop.identifier for prop in struct.properties}
        if idname in CUSTOM_PANELS:
            for identifier, label, display, shown_when in CUSTOM_PANELS[idname]:
                for field in _hud_field(prefix, struct.properties[identifier], sub):
                    if label:
                        field['label'] = label
                    if display:
                        field['display'] = display
                    if shown_when:
                        field['shownWhen'] = {'field': f'{prefix}.{shown_when[0]}', 'values': shown_when[1]}
                        if any(f['id'] == field['id'] for f in fields):
                            field['id'] += '.' + slug(label)
                    fields.append(field)
            sections.append({'label': None, 'fields': fields})
            continue
        for prop in struct.properties:
            if prop.identifier == 'rna_type' or prop.is_hidden or prop.identifier in NEVER_SHOWN or prop.type in ('POINTER', 'COLLECTION'):
                continue
            if prop.type == 'ENUM' and prop.is_enum_flag:
                continue
            # transform_poll_property: with an orientation and a value, the constraint axes stay hidden.
            if prop.identifier.startswith('constraint') and {'orient_type', 'value'} <= names:
                continue
            fields += _hud_field(prefix, prop, sub)
        sections.append({'label': op_rna(sub_idname(sub)).name if sub else None, 'fields': fields})
    return {'operator': idname, 'label': rna.name, 'flags': sorted(flags), 'sections': sections,
            'repeatable': idname not in MODAL_ONLY}


def scene_ui():
    """Header menus per mode, the menus the lessons open, panels of the operators they use, and shortcuts."""
    with override():
        bpy.ops.mesh.primitive_cube_add()
    cube = bpy.context.active_object
    menus = {}
    header = {'OBJECT': _header_and_menus('OBJECT', menus)}
    mode_set(cube, 'EDIT')
    header['EDIT'] = _header_and_menus('EDIT', menus)
    select_mode = op_rna('mesh.select_mode').properties['type']
    edit = {
        'selectModes': [{'id': f'mesh.select_mode.{item.identifier.lower()}', 'value': item.identifier, 'label': item.name,
                         'shortcut': find_shortcut('mesh.select_mode', {'type': item.identifier}, ['Mesh'], EDIT_CONTEXT)}
                        for item in select_mode.enum_items if item.identifier in SELECT_MODES],
    }
    mode_set(cube, 'SCULPT')
    header['SCULPT'] = _header_and_menus('SCULPT', menus)
    mode_set(cube, 'OBJECT')
    tool_settings = bpy.types.ToolSettings.bl_rna.properties
    proportional = tool_settings['use_proportional_edit']
    hide = bpy.types.LayerCollection.bl_rna.properties['hide_viewport']
    view = '3D View'
    return {
        'header': header,
        'menus': menus,
        'operators': {idname: operator_ui(idname) for idname in OPERATORS},
        'selectModes': edit['selectModes'],
        'proportional': {'id': 'tool.proportional_edit', 'label': proportional.name, 'description': proportional.description,
                         'shortcut': find_shortcut('wm.context_toggle', {'data_path': 'tool_settings.use_proportional_edit'},
                                                   ['3D View Generic', 'Mesh', 'Object Mode', '3D View'], '3D Viewport')},
        'navigation': {
            'orbit': {'id': 'view3d.rotate', 'label': op_rna('view3d.rotate').name, 'shortcut': find_shortcut('view3d.rotate', {}, [view], '3D Viewport', 'MIDDLEMOUSE')},
            'zoom': {'id': 'view3d.zoom', 'label': op_rna('view3d.zoom').name, 'shortcut': find_shortcut('view3d.zoom', {'delta': 1}, [view], '3D Viewport', 'WHEELINMOUSE')},
            'pan': {'id': 'view3d.move', 'label': op_rna('view3d.move').name, 'shortcut': find_shortcut('view3d.move', {}, [view], '3D Viewport', 'MIDDLEMOUSE')},
        },
        'select': {'id': 'view3d.select', 'label': op_rna('view3d.select').name},
        'knife': {'confirm': {'id': 'view3d.knife.confirm', 'label': 'Confirm',
                              'shortcut': modal_key('Knife Tool Modal Map', 'CONFIRM', 'Knife Topology Tool')}},
        'outliner': {'root': bpy.context.scene.collection.name, 'hide': {'label': hide.name, 'description': hide.description},
                     'rename': find_shortcut('wm.call_panel', {'name': 'TOPBAR_PT_name', 'keep_open': False}, ['Window', 'Screen'], '3D Viewport')},
        # The floating panel's header shows the operator's name; the View menu names the panel itself.
        'hud': {'label': next(item['label'] for item in menus['view']['items'] if item.get('id') == 'menu.view.adjust_last_operation')},
    }


# ---------------------------------------------------------------- cameras

def view_rotation(position, target, up=None):
    forward = (target - position).normalized()
    if up is None:
        return forward.to_track_quat('-Z', 'Y')
    z = -forward
    y = (Vector(up) - z * Vector(up).dot(z)).normalized()
    return Matrix((y.cross(z), y, z)).transposed().to_quaternion()


def read_view():
    """The 3D Viewport's camera as the app records cameras: eye, orbit target, up and its vertical framing."""
    win, area, region = window_parts()
    r3d = area.spaces.active.region_3d
    forward = r3d.view_rotation @ Vector((0, 0, -1))
    up = r3d.view_rotation @ Vector((0, 1, 0))
    target = r3d.view_location.copy()
    width, height = region.width, region.height
    record = {'target': rounded(target), 'up': rounded(up)}
    if not r3d.is_perspective:
        center = view3d_utils.region_2d_to_location_3d(region, r3d, (width / 2, height / 2), target)
        top = view3d_utils.region_2d_to_location_3d(region, r3d, (width / 2, height), target)
        record['position'] = rounded(target - forward * r3d.view_distance)
        record['ortho'] = round((top - center).length, 4)
    else:
        ray = view3d_utils.region_2d_to_vector_3d(region, r3d, (width / 2, height))
        record['position'] = rounded(r3d.view_matrix.inverted().translation)
        record['fov'] = round(math.degrees(2 * forward.angle(ray)), 3)
    return {key: record[key] for key in ('position', 'target', 'up', 'fov', 'ortho') if key in record}


def _empty_glb(path):
    """A glTF file of an empty scene (everything hidden, or nothing added yet)."""
    document = json.dumps({'asset': {'version': '2.0', 'generator': 'Drafty3D Learn'}, 'scene': 0, 'scenes': [{'nodes': []}]}).encode()
    document += b' ' * (-len(document) % 4)
    with open(path, 'wb') as handle:
        handle.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(document)))
        handle.write(struct.pack('<I4s', len(document), b'JSON'))
        handle.write(document)


# ---------------------------------------------------------------- the recorder

class SceneLesson:
    def __init__(self, *, module, example, mode, title, out_dir, camera, text, ui, variant_of=None):
        self.out_dir = out_dir
        self.scene = bpy.context.scene
        self.ui = ui
        shutil.rmtree(out_dir, ignore_errors=True)
        os.makedirs(os.path.join(out_dir, 'raw'), exist_ok=True)
        os.makedirs(os.path.join(out_dir, 'renders'), exist_ok=True)
        _setup_render(self.scene)
        self.camera_obj = bpy.data.objects.new('LessonCamera', bpy.data.cameras.new('LessonCamera'))
        self.scene.collection.objects.link(self.camera_obj)
        self.camera_obj.hide_viewport = True
        self.camera_obj.hide_select = True
        self.scene.camera = self.camera_obj
        win, area, region = window_parts()
        # The Adjust Last Operation region floats over the viewport's corner; the recorder keeps
        # it hidden so no click lands on it. The app draws the panel from the recorded operator.
        area.spaces.active.show_region_hud = False
        self.camera = camera
        self.framed = None
        self.redo = None
        self.snapshot = None
        self.last_props = {}
        self.tool = None
        self.steps = []
        self.data = {'blenderVersion': bpy.app.version_string, 'module': module, 'example': example, 'mode': mode,
                     'title': title, 'text': text, 'initial': None, 'steps': self.steps}
        if variant_of:
            self.data['variantOf'] = variant_of

    # -------------------------------------------------------- what Blender shows

    def _edit_object(self):
        obj = bpy.context.view_layer.objects.active
        return obj if obj is not None and obj.mode == 'EDIT' else None

    def _objects(self):
        return [obj for obj in self.scene.objects if obj is not self.camera_obj]

    def _scene_state(self):
        layer = bpy.context.view_layer
        hidden = {}

        def walk(layer_collection, parent):
            for child in layer_collection.children:
                hidden[child.name] = {'name': child.name, 'parent': parent, 'hidden': child.hide_viewport}
                walk(child, child.name)
        walk(layer.layer_collection, None)
        objects = []
        for obj in sorted(self._objects(), key=lambda o: natural(o.name)):
            collection = next((c.name for c in obj.users_collection if c is not self.scene.collection), None)
            objects.append({'name': obj.name, 'collection': collection, 'location': rounded(obj.location),
                            'rotation': rounded([math.degrees(a) for a in obj.rotation_euler], 3), 'scale': rounded(obj.scale),
                            'hidden': obj.hide_get()})
        active = layer.objects.active
        return {'objects': objects, 'collections': list(hidden.values()),
                'active': active.name if active and active is not self.camera_obj else None,
                'selected': sorted((obj.name for obj in self._objects() if obj.select_get()), key=natural)}

    def _state(self):
        obj = bpy.context.view_layer.objects.active
        mode = obj.mode if obj is not None and obj is not self.camera_obj else 'OBJECT'
        tool = bpy.context.tool_settings
        state = {
            'scene': self._scene_state(),
            'mode': mode,
            'selectMode': [name for name, on in zip(SELECT_MODES, tool.mesh_select_mode) if on],
            # Object Mode and Edit Mode keep separate Proportional Editing switches.
            'proportional': tool.use_proportional_edit if mode == 'EDIT' else tool.use_proportional_edit_objects,
            'redo': {key: self.redo[key] for key in ('operator', 'values')} if self.redo else None,
            'tool': self.tool,
            'selection': None,
        }
        edit = self._edit_object()
        if edit:
            bm = bmesh.from_edit_mesh(edit.data)
            state['selection'] = {'verts': [v.index for v in bm.verts if v.select], 'edges': [e.index for e in bm.edges if e.select],
                                  'faces': [f.index for f in bm.faces if f.select]}
        return state

    def _edit_data(self):
        """The Edit Mode mesh as Blender's overlay draws it: world-space vertices, edges and faces."""
        edit = self._edit_object()
        if not edit:
            return None
        bm = bmesh.from_edit_mesh(edit.data)
        bm.verts.index_update()
        bm.edges.index_update()
        bm.faces.index_update()
        world = edit.matrix_world
        return {'object': edit.name, 'verts': [rounded(world @ v.co) for v in bm.verts],
                'edges': [[e.verts[0].index, e.verts[1].index] for e in bm.edges],
                'faces': [[v.index for v in f.verts] for f in bm.faces]}

    def _visible_meshes(self):
        return sorted((obj for obj in self._objects() if obj.type == 'MESH' and obj.visible_get()), key=lambda o: o.name)

    def _in_object_mode(self, work):
        edit = self._edit_object()
        if edit:
            mode_set(edit, 'OBJECT')
        try:
            return work()
        finally:
            if edit:
                mode_set(edit, 'EDIT')

    def _signature(self):
        def measure():
            depsgraph = bpy.context.evaluated_depsgraph_get()
            signature = []
            for obj in self._visible_meshes():
                evaluated = obj.evaluated_get(depsgraph)
                mesh = evaluated.to_mesh()
                world = obj.matrix_world
                signature.append((obj.name, len(mesh.polygons), tuple(sorted(tuple(round(c, 4) for c in world @ v.co) for v in mesh.vertices))))
                evaluated.to_mesh_clear()
            return tuple(signature)
        return self._in_object_mode(measure)

    def _place_camera(self, camera):
        position, target = Vector(camera['position']), Vector(camera['target'])
        forward = (target - position).normalized()
        data = self.camera_obj.data
        data.sensor_fit = 'VERTICAL'
        data.clip_start, data.clip_end = 0.01, 100
        if 'ortho' in camera:
            data.type = 'ORTHO'
            data.ortho_scale = 2 * camera['ortho']
            # An orthographic view has no eye: back off far enough that nothing is clipped.
            self.camera_obj.location = target - forward * 40
        else:
            data.type = 'PERSP'
            data.angle_y = math.radians(camera['fov'])
            self.camera_obj.location = position
        self.camera_obj.rotation_mode = 'QUATERNION'
        self.camera_obj.rotation_quaternion = view_rotation(position, target, camera.get('up'))

    def _capture(self, index, camera):
        name = f'step-{index:02d}'
        glb = os.path.join(self.out_dir, 'raw', f'{name}.glb')

        def export():
            if self._visible_meshes():
                bpy.ops.export_scene.gltf(
                    filepath=glb, export_format='GLB', use_visible=True, use_selection=False, export_apply=True, export_yup=True,
                    export_materials='NONE', export_texcoords=False, export_normals=True, export_cameras=False,
                    export_lights=False, export_animations=False, export_draco_mesh_compression_enable=False,
                )
            else:
                _empty_glb(glb)
            self._place_camera(camera)
            self._render_still(os.path.join(self.out_dir, 'renders', f'{name}.png'))
        self._in_object_mode(export)
        return f'{name}.glb'

    def _render_still(self, filepath):
        """Renders what the 3D Viewport shows. A render ignores the Outliner's eye (viewport visibility),
        so objects hidden there are left out of the render too, as they are left out of the glb."""
        hidden = [obj for obj in self._objects() if obj.type == 'MESH' and not obj.visible_get() and not obj.hide_render]
        for obj in hidden:
            obj.hide_render = True
        try:
            self.scene.render.filepath = filepath
            bpy.ops.render.render(write_still=True)
        finally:
            for obj in hidden:
                obj.hide_render = False

    def _render_view(self, index, camera):
        """A reference render of an unchanged scene from a new camera (orbit, Viewpoint): checks the app's camera."""
        name = f'view-{index:02d}'

        def render():
            self._place_camera(camera)
            self._render_still(os.path.join(self.out_dir, 'renders', f'{name}.png'))
        self._in_object_mode(render)
        return f'{name}.png'

    def start(self):
        self.data['initial'] = {'camera': self.camera, **self._state(), 'edit': self._edit_data(),
                                'mesh': self._capture(0, self.camera)}
        self._last_signature = self._signature()
        self._last_edit = self.data['initial']['edit']
        self._last_camera = self.camera

    def _record(self, step):
        step.setdefault('value', None)
        step.setdefault('shortcut', None)
        step.setdefault('help', None)
        step.setdefault('duration', 2.2)
        step.setdefault('autoAdvance', False)
        index = len(self.steps) + 1
        step['camera'] = self.camera
        step['after'] = self._state()
        edit = self._edit_data()
        if edit != self._last_edit:
            step['edit'] = edit
            self._last_edit = edit
        signature = self._signature()
        changed = signature != self._last_signature
        self._last_signature = signature
        step['mesh'] = self._capture(index, self.camera) if changed else None
        if not changed and self.camera != self._last_camera:
            step['verify'] = self._render_view(index, self.camera)
        self._last_camera = self.camera
        self.steps.append(step)

    def finish(self, *, text):
        self.data['outro'] = text
        with open(os.path.join(self.out_dir, 'timeline.json'), 'w') as handle:
            json.dump(self.data, handle, indent=2)
            handle.write('\n')

    # -------------------------------------------------------- the viewport

    def frame(self, camera):
        """Points Blender's 3D Viewport through `camera`, so clicks land where the app shows them."""
        win, area, region = window_parts()
        space = area.spaces.active
        r3d = space.region_3d
        position, target = Vector(camera['position']), Vector(camera['target'])
        r3d.view_location = target
        r3d.view_rotation = view_rotation(position, target, camera.get('up'))
        r3d.view_distance = (position - target).length
        r3d.view_perspective = 'ORTHO' if 'ortho' in camera else 'PERSP'
        for _ in range(8):
            area.tag_redraw()
            yield None
            win, area, region = window_parts()
            space = area.spaces.active
            r3d = space.region_3d
            if 'ortho' in camera:
                center = view3d_utils.region_2d_to_location_3d(region, r3d, (region.width / 2, region.height / 2), target)
                top = view3d_utils.region_2d_to_location_3d(region, r3d, (region.width / 2, region.height), target)
                error = (top - center).length / camera['ortho']
                if abs(error - 1) < 1e-3:
                    break
                r3d.view_distance /= error
            else:
                up = (r3d.view_rotation @ Vector((0, 1, 0))).normalized()
                edge = target + up * r3d.view_distance * math.tan(math.radians(camera['fov']) / 2)
                error = (view3d_utils.location_3d_to_region_2d(region, r3d, edge).y - region.height / 2) / (region.height / 2)
                if abs(error - 1) < 1e-3:
                    break
                space.lens /= error
        else:
            raise RuntimeError(f'Could not match the viewport to the lesson camera (off by {error:.4f})')
        self.framed = camera

    def _ensure_view(self):
        if self.framed != self.camera:
            yield from self.frame(self.camera)

    def _pixel(self, point):
        """Region pixel of a world point, checked against the toolbar, header and gizmos."""
        win, area, region = window_parts()
        r3d = area.spaces.active.region_3d
        pixel = view3d_utils.location_3d_to_region_2d(region, r3d, Vector(point))
        if pixel is None or not (SAFE_MARGIN['left'] < pixel.x < region.width - SAFE_MARGIN['right']
                                 and SAFE_MARGIN['bottom'] < pixel.y < region.height - SAFE_MARGIN['top']):
            raise ValueError(f'{point} falls outside the free part of the 3D Viewport ({pixel})')
        return pixel

    def _screen(self, pixel):
        win, area, region = window_parts()
        return str(round(region.x + pixel.x)), str(round(win.height - (region.y + pixel.y)))

    def _settle(self, redraws=3):
        """Smooth View animates a view change over a few hundred milliseconds."""
        for _ in range(redraws):
            yield None

    def _drag(self, drag, button='2', modifier=None):
        """A drag from the middle of the viewport, `drag` in view heights (right and up are positive)."""
        win, area, region = window_parts()
        half = region.height / 2
        start = Vector((region.width / 2, region.height / 2))
        end = start + Vector((drag[0] * half * 2, drag[1] * half * 2))
        command = ['mousemove', *self._screen(start), 'sleep', '0.2']
        if modifier:
            command += ['keydown', modifier, 'sleep', '0.1']
        command += ['mousedown', button, 'sleep', '0.1']
        for i in range(1, 25):
            command += ['mousemove', *self._screen(start.lerp(end, i / 24)), 'sleep', '0.02']
        command += ['sleep', '0.1', 'mouseup', button]
        if modifier:
            command += ['keyup', modifier]
        command += ['sleep', '0.5']
        return command

    def _navigate(self, step, command):
        yield from self._ensure_view()
        before = read_view()
        yield command
        yield from self._settle()
        after = read_view()
        if after == before:
            raise RuntimeError(f'{step["action"]} did not change the view')
        self.camera = self.framed = after
        self._record(step)

    def orbit(self, drag, *, text, help=None):
        nav = self.ui['navigation']['orbit']
        yield from self._navigate({'id': nav['id'], 'action': 'orbit', 'value': list(drag), 'shortcut': nav['shortcut'],
                                   'text': text, 'help': help}, self._drag(drag))

    def pan(self, drag, *, text, help=None):
        nav = self.ui['navigation']['pan']
        yield from self._navigate({'id': nav['id'], 'action': 'pan', 'value': list(drag), 'shortcut': nav['shortcut'],
                                   'text': text, 'help': help}, self._drag(drag, modifier='Shift_L'))

    def zoom(self, clicks, *, text, help=None):
        """Mouse wheel clicks over the middle of the viewport: positive zooms in."""
        nav = self.ui['navigation']['zoom']
        win, area, region = window_parts()
        command = ['mousemove', *self._screen(Vector((region.width / 2, region.height / 2))), 'sleep', '0.2']
        for _ in range(abs(clicks)):
            command += ['click', '4' if clicks > 0 else '5', 'sleep', '0.15']
        yield from self._navigate({'id': nav['id'], 'action': 'zoom', 'value': clicks, 'shortcut': nav['shortcut'],
                                   'text': text, 'help': help}, command + ['sleep', '0.4'])

    # -------------------------------------------------------- menus and Adjust Last Operation

    def _menu_path(self, labels, operator, props):
        mode = self._state()['mode']
        entry = next((item for item in self.ui['header'][mode] if item['label'] == labels[0]), None)
        if entry is None:
            raise LookupError(f'No {labels[0]} menu in the {mode} header')
        ids = [entry['id']]
        menu = self.ui['menus'][entry['menu']]
        item = None
        for label in labels[1:]:
            item = next((candidate for candidate in menu['items'] if candidate.get('label') == label), None)
            if item is None:
                raise LookupError(f'{label} is not in Blender\'s {menu["label"]} menu')
            ids.append(item['id'])
            if item['kind'] == 'menu':
                if not item['menu']:
                    raise LookupError(f'{label} is a submenu the app does not open')
                menu = self.ui['menus'][item['menu']]
        if item is None or item['kind'] != 'operator':
            raise LookupError(f'{" ▸ ".join(labels)} is not a menu item')
        runs, fixed = WRAPPERS.get(item['operator'], (item['operator'], {}))
        if runs != operator:
            raise LookupError(f'{" ▸ ".join(labels)} runs {runs}, not {operator}')
        fixed = {**{k: v for k, v in item['props'].items() if not isinstance(v, dict)}, **fixed} if runs == item['operator'] else fixed
        for key, value in fixed.items():
            if key in props and props[key] != value and not isinstance(value, dict):
                raise ValueError(f'{" ▸ ".join(labels)} runs {operator} with {key}={value}')
        return ids, item, fixed

    def _blender_props(self, rna, props):
        """Lessons give angles in degrees, like Blender's UI; operators take radians."""
        converted = {}
        for key, value in props.items():
            prop = rna.properties[key]
            if prop.type == 'POINTER':
                converted[key] = self._blender_props(prop.fixed_type, value)
            elif getattr(prop, 'unit', '') == 'ROTATION':
                converted[key] = [math.radians(v) for v in value] if isinstance(value, (list, tuple)) else math.radians(value)
            else:
                converted[key] = value
        return converted

    def _remembered(self, operator, props):
        """Blender starts an operator from the settings it was last run with (unless a setting opts out)."""
        rna = op_rna(operator)
        merged = {}
        for key, value in self.last_props.get(operator, {}).items():
            merged[key] = dict(value) if isinstance(value, dict) else value
        for key, value in props.items():
            if isinstance(value, dict):
                merged[key] = {**merged.get(key, {}), **value}
            else:
                merged[key] = value
        remember = {}
        for key, value in merged.items():
            prop = rna.properties[key]
            if prop.type == 'POINTER':
                sub = prop.fixed_type.properties
                remember[key] = {k: v for k, v in value.items() if not sub[k].is_skip_save and not sub[k].is_hidden}
            elif not prop.is_skip_save and not prop.is_hidden:
                remember[key] = value
        return merged, remember

    def _values(self, operator, props):
        """What the Adjust Last Operation panel shows: the run's settings, Blender's defaults for the rest."""
        values = {}
        for section in self.ui['operators'][operator]['sections']:
            for field in section['fields']:
                source = props.get(field['sub'], {}) if field.get('sub') else props
                value = source.get(field['rna'], None)
                if value is None:
                    values[field['id']] = field['default']
                    continue
                if 'index' in field:
                    value = value[field['index']]
                if field.get('unit') == '°':
                    value = round(math.degrees(value), 4)
                elif isinstance(value, float):
                    value = round(value, 6)
                values[field['id']] = value
        return values

    def _take_snapshot(self):
        if self.snapshot and self.snapshot.get('bmesh'):
            self.snapshot['bmesh'].free()
        edit = self._edit_object()
        if edit:
            self.snapshot = {'edit': edit.name, 'bmesh': bmesh.from_edit_mesh(edit.data).copy()}
            return
        layer = bpy.context.view_layer
        self.snapshot = {
            'objects': {obj.name: (obj.location.copy(), obj.rotation_euler.copy(), obj.scale.copy(), obj.select_get())
                        for obj in self._objects()},
            'active': layer.objects.active.name if layer.objects.active else None,
        }

    def _restore_snapshot(self):
        """Back to just before the last operator, the way Blender's redo undoes it before running it again."""
        snapshot = self.snapshot
        if 'edit' in snapshot:
            obj = bpy.data.objects[snapshot['edit']]
            mode_set(obj, 'OBJECT')
            snapshot['bmesh'].to_mesh(obj.data)
            mode_set(obj, 'EDIT')
            return
        for obj in self._objects():
            if obj.name not in snapshot['objects']:
                mesh = obj.data
                bpy.data.objects.remove(obj)
                if mesh is not None and mesh.users == 0:
                    bpy.data.meshes.remove(mesh)
        for name, (location, rotation, scale, selected) in snapshot['objects'].items():
            obj = bpy.data.objects[name]
            obj.location, obj.rotation_euler, obj.scale = location, rotation, scale
            obj.select_set(selected)
        bpy.context.view_layer.objects.active = bpy.data.objects[snapshot['active']] if snapshot['active'] else None

    def _call(self, operator, props, invoke=False):
        obj = bpy.context.view_layer.objects.active
        extra = {'active_object': obj, 'object': obj} if obj is not None and obj is not self.camera_obj else {}
        with override(**extra):
            result = op_function(operator)('INVOKE_DEFAULT' if invoke else 'EXEC_DEFAULT', **props)
        if 'FINISHED' not in result:
            raise RuntimeError(f'{operator} {props} returned {result}')

    def _after_operator(self, operator, props, remember):
        """Blender's rule for the Adjust Last Operation panel (wm_operator_finished): an undoable operator
        hides it, then a registered, repeatable one with settings to show takes its place."""
        flags = set(op_function(operator).bl_options)
        if 'UNDO' in flags:
            self.redo = None
        info = self.ui['operators'].get(operator)
        shows = info and info['repeatable'] and any(section['fields'] for section in info['sections'])
        if {'REGISTER', 'UNDO'} <= flags and shows:
            self.redo = {'operator': operator, 'props': props, 'values': self._values(operator, props)}
        if remember is not None:
            self.last_props[operator] = remember

    def _tool_settings(self, operator, props):
        """A transform started from the UI takes Proportional Editing from the header and writes it into
        its own settings when it ends (saveTransform), so the panel shows it."""
        tool = bpy.context.tool_settings
        edit = self._edit_object() is not None
        current = {'use_proportional_edit': tool.use_proportional_edit if edit else tool.use_proportional_edit_objects,
                   'proportional_edit_falloff': tool.proportional_edit_falloff, 'proportional_size': tool.proportional_size,
                   'use_proportional_connected': tool.use_proportional_connected,
                   'use_proportional_projected': tool.use_proportional_projected}
        rna = op_rna(operator)
        targets = [(None, rna)] + [(p.identifier, p.fixed_type) for p in rna.properties
                                   if p.type == 'POINTER' and p.identifier.startswith('TRANSFORM_OT_')]
        props = json.loads(json.dumps(props))
        for sub, struct in targets:
            if 'use_proportional_edit' not in struct.properties:
                continue
            target = props.setdefault(sub, {}) if sub else props
            for key in PROPORTIONAL:
                target.setdefault(key, current[key])
        return props

    def run(self, operator, props=None, *, remember=True):
        """Runs one operator the way a menu item or key would, with Blender's remembered settings."""
        if operator not in self.ui['operators']:
            raise LookupError(f'{operator} is not in scene.OPERATORS')
        props = self._tool_settings(operator, props or {})
        props = self._blender_props(op_rna(operator), props)
        merged, kept = self._remembered(operator, props) if remember else (props, None)
        self._take_snapshot()
        self._call(operator, merged)
        self._after_operator(operator, merged, kept)

    def menu(self, path, operator, props=None, *, text, help=None, remember=True, duration=2.4):
        """A menu item from the 3D Viewport header: `path` is Blender's labels, from the header button to the item.
        `props` stand in for what the mouse does in a modal operator (how far an Extrude was dragged)."""
        ids, item, fixed = self._menu_path(path, operator, props or {})
        view = operator.startswith('view3d.')
        if view:
            yield from self._ensure_view()
        merged = json.loads(json.dumps(fixed))
        for key, value in (props or {}).items():
            merged[key] = {**merged.get(key, {}), **value} if isinstance(value, dict) else value
        self.run(operator, merged, remember=remember)
        if view:
            yield from self._settle(4)
            self.camera = self.framed = read_view()
        self._record({'id': ids[-1], 'action': 'menu', 'path': ids, 'operator': operator, 'shortcut': item['shortcut'],
                      'text': text, 'help': help, 'duration': duration})

    def start_tool(self, path, operator, *, text, help=None):
        """A menu item that starts an interactive tool (Knife, Loop Cut): Blender waits for clicks in the viewport."""
        ids, item, _fixed = self._menu_path(path, operator, {})
        self.tool = operator
        self._record({'id': ids[-1], 'action': 'menu', 'path': ids, 'operator': operator, 'shortcut': item['shortcut'],
                      'text': text, 'help': help, 'duration': 2.0})

    def redo_value(self, field, value, *, text, step=None, help=None):
        """Changes one field of the Adjust Last Operation panel: Blender runs the operator again with it."""
        if not self.redo:
            raise RuntimeError('There is no Adjust Last Operation panel to change')
        operator = self.redo['operator']
        field_id = f'redo.{operator}.{field}'
        definition = next((f for s in self.ui['operators'][operator]['sections'] for f in s['fields'] if f['id'] == field_id), None)
        if definition is None:
            raise LookupError(f'{field_id} is not in the panel')
        props = json.loads(json.dumps(self.redo['props']))
        target = props.setdefault(definition['sub'], {}) if definition.get('sub') else props
        stored = math.radians(value) if definition.get('unit') == '°' else value
        if 'index' in definition:
            rna = op_rna(sub_idname(definition['sub'])) if definition.get('sub') else op_rna(operator)
            current = target.get(definition['rna'])
            vector = list(current) if current is not None else list(rna.properties[definition['rna']].default_array)
            vector[definition['index']] = stored
            target[definition['rna']] = vector
        else:
            target[definition['rna']] = stored
        if self.redo['values'][field_id] == value:
            raise ValueError(f'{field_id} is already {value}')
        if definition['kind'] in ('float', 'int') and not step:
            raise ValueError(f'{field_id} needs its slider step')
        if step and abs(round(value / step) * step - value) > 1e-9:
            raise ValueError(f'{field_id} = {value} cannot be reached with ◀ ▶ in steps of {step}')
        self._restore_snapshot()
        self._call(operator, props)
        _merged, kept = self._remembered(operator, props)
        self._after_operator(operator, props, kept)
        if self.redo['values'][field_id] != value:
            raise ValueError(f'Blender kept {field_id} at {self.redo["values"][field_id]}')
        record = {'id': field_id, 'action': 'redo_value', 'operator': operator, 'value': value, 'text': text, 'help': help}
        if step:
            record['step'] = step
        self._record(record)

    # -------------------------------------------------------- header controls and the Outliner

    def set_mode(self, mode, *, text, help=None):
        obj = bpy.context.view_layer.objects.active
        before = obj.mode
        self.run('object.mode_set', {'mode': mode}, remember=False)
        if obj.mode != mode:
            raise RuntimeError(f'{obj.name} did not enter {mode}')
        # object.mode_set leaves undo to the toggle it runs (Tab's operator), which hides the panel.
        for toggle in {MODE_TOGGLES.get(before), MODE_TOGGLES.get(mode)} - {None}:
            if 'UNDO' in op_function(toggle).bl_options:
                self.redo = None
        shortcut = (find_shortcut('object.mode_set', {'mode': mode, 'toggle': True}, ['Object Non-modal'], '3D Viewport')
                    or truth.shortcut('Object Non-modal', 'view3d.object_mode_pie_or_toggle', '3D Viewport · mode pie'))
        self._record({'id': f'object.mode.{mode.lower()}', 'action': 'set_mode', 'value': mode, 'shortcut': shortcut,
                      'text': text, 'help': help, 'duration': 1.6})

    def select_mode(self, kind, *, text, help=None):
        entry = next(item for item in self.ui['selectModes'] if item['value'] == kind)
        self.run('mesh.select_mode', {'type': kind}, remember=False)
        self._record({'id': entry['id'], 'action': 'select_mode', 'value': kind, 'shortcut': entry['shortcut'],
                      'text': text, 'help': help, 'duration': 1.6})

    def proportional(self, enabled, *, text, help=None):
        tool = bpy.context.tool_settings
        if self._edit_object():
            tool.use_proportional_edit = enabled
        else:
            tool.use_proportional_edit_objects = enabled
        entry = self.ui['proportional']
        self._record({'id': entry['id'], 'action': 'proportional', 'value': enabled, 'shortcut': entry['shortcut'],
                      'text': text, 'help': help, 'duration': 1.6})

    def outliner_select(self, name, *, text, help=None):
        """A click on an object's row in the Outliner: it becomes the only selected object, and the active one."""
        layer = bpy.context.view_layer
        for obj in self._objects():
            obj.select_set(False)
        bpy.data.objects[name].select_set(True)
        layer.objects.active = bpy.data.objects[name]
        # outliner.item_activate pushes an undo step, which hides the 3D Viewport's panel; the Outliner has none of its own.
        if 'UNDO' in op_function('outliner.item_activate').bl_options:
            self.redo = None
        self._record({'id': 'outliner.select', 'action': 'outliner_select', 'value': name, 'text': text, 'help': help, 'duration': 1.6})

    def outliner_hide(self, name, hidden, *, text, help=None):
        """The eye of an Outliner row: hides an object, or a collection with everything in it."""
        layer_collection = bpy.context.view_layer.layer_collection.children.get(name)
        if layer_collection is not None:
            layer_collection.hide_viewport = hidden
        else:
            bpy.data.objects[name].hide_set(hidden)
        self._record({'id': 'outliner.hide', 'action': 'outliner_hide', 'value': name, 'hidden': hidden,
                      'text': text, 'help': help, 'duration': 1.6})

    def rename(self, name, new_name, *, text, help=None):
        """Double-click in the Outliner and type the new name (F2 does the same in the viewport)."""
        obj = bpy.data.objects[name]
        obj.name = new_name
        if obj.name != new_name:
            raise ValueError(f'Blender renamed {name} to {obj.name}')
        self._record({'id': 'outliner.rename', 'action': 'rename', 'value': new_name, 'target': name,
                      'shortcut': self.ui['outliner']['rename'], 'text': text, 'help': help, 'duration': 2.4})

    # -------------------------------------------------------- clicks in the viewport

    def tap(self, point, *, text, help=None, toggle=False):
        """A click at a world point (on a face, a vertex, an edge or an object); Shift toggles instead."""
        yield from self._ensure_view()
        before = self._state()
        pixel = self._pixel(point)
        with override():
            result = bpy.ops.view3d.select(location=(round(pixel.x), round(pixel.y)), toggle=toggle, deselect_all=not toggle)
        if 'FINISHED' not in result:
            raise RuntimeError(f'The click at {point} selected nothing ({result})')
        self._after_operator('view3d.select', {}, None)
        after = self._state()
        if (after['selection'], after['scene']['selected'], after['scene']['active']) == \
                (before['selection'], before['scene']['selected'], before['scene']['active']):
            raise RuntimeError(f'The click at {point} did not change the selection')
        picked = self._picked(point)
        if picked is not None and not picked:
            raise RuntimeError(f'The click at {point} picked something else (something in front of it?): {self._selected_centers()}')
        self._record({'id': self.ui['select']['id'], 'action': 'tap', 'value': rounded(point), 'toggle': toggle,
                      'text': text, 'help': help, 'duration': 1.8})

    def _selected_centers(self):
        edit = self._edit_object()
        if not edit:
            return [obj.name for obj in bpy.context.selected_objects]
        bm = bmesh.from_edit_mesh(edit.data)
        world = edit.matrix_world
        mode = bpy.context.tool_settings.mesh_select_mode
        items = bm.verts if mode[0] else bm.edges if mode[1] else bm.faces
        def center(item):
            if hasattr(item, 'co'):
                return world @ item.co
            return world @ (sum((v.co for v in item.verts), Vector()) / len(item.verts))
        return [rounded(center(item)) for item in items if item.select]

    def _picked(self, point):
        """Whether the click selected what lies at `point`: the object there, or the vertex, edge or face."""
        target = Vector(point)
        edit = self._edit_object()
        if not edit:
            active = bpy.context.view_layer.objects.active
            if active is None or not active.select_get():
                return None
            corners = [active.matrix_world @ Vector(c) for c in active.bound_box]
            low = Vector([min(c[i] for c in corners) for i in range(3)])
            high = Vector([max(c[i] for c in corners) for i in range(3)])
            return all(low[i] - 1e-3 <= target[i] <= high[i] + 1e-3 for i in range(3))
        bm = bmesh.from_edit_mesh(edit.data)
        world = edit.matrix_world
        mode = bpy.context.tool_settings.mesh_select_mode
        if mode[0]:
            element = min(bm.verts, key=lambda v: (world @ v.co - target).length)
        elif mode[1]:
            def distance(edge):
                a, b = world @ edge.verts[0].co, world @ edge.verts[1].co
                t = max(0, min(1, (target - a).dot(b - a) / max((b - a).length_squared, 1e-12)))
                return (a.lerp(b, t) - target).length
            element = min(bm.edges, key=distance)
        else:
            element = min(bm.faces, key=lambda f: (world @ f.calc_center_median() - target).length)
        return element.select

    def knife(self, points, *, text, help=None):
        """Knife Topology Tool: a click on each point (on the mesh's edges), then Enter."""
        if self.tool != 'mesh.knife_tool':
            raise RuntimeError('Start the Knife from the Mesh menu first')
        yield from self._ensure_view()
        before = self._edit_data()
        pixels = [self._pixel(point) for point in points]
        command = ['mousemove', *self._screen(pixels[0]), 'sleep', '0.3', 'key', 'k', 'sleep', '0.4']
        for pixel in pixels:
            command += ['mousemove', *self._screen(pixel), 'sleep', '0.3', 'click', '1', 'sleep', '0.3']
        command += ['key', 'Return', 'sleep', '0.6']
        yield command
        yield None
        if self._edit_data() == before:
            raise RuntimeError('The knife did not cut the mesh')
        self.tool = None
        self._after_operator('mesh.knife_tool', {}, None)
        confirm = self.ui['knife']['confirm']
        self._record({'id': 'view3d.knife', 'action': 'knife', 'value': [rounded(p) for p in points],
                      'knife': {'points': [rounded(p) for p in points]}, 'shortcut': confirm['shortcut'],
                      'text': text, 'help': help, 'duration': 3.0})

    def loop_cut(self, point, *, text, help=None):
        """Loop Cut and Slide: a click on an edge cuts a loop across the faces around it (right-click keeps it centred)."""
        if self.tool != 'mesh.loopcut_slide':
            raise RuntimeError('Start Loop Cut and Slide from the Edge menu first')
        yield from self._ensure_view()
        self._pixel(point)
        edit = self._edit_object()
        bm = bmesh.from_edit_mesh(edit.data)
        bm.edges.index_update()
        world = edit.matrix_world
        target = Vector(point)

        def distance(edge):
            a, b = world @ edge.verts[0].co, world @ edge.verts[1].co
            t = max(0, min(1, (target - a).dot(b - a) / max((b - a).length_squared, 1e-12)))
            return (a.lerp(b, t) - target).length
        edge = min(bm.edges, key=distance)
        ring = self._edge_ring(edge)
        self.tool = None
        # A right-click after the click leaves the cut in the middle (no slide); Blender keeps the last Number of Cuts.
        self.run('mesh.loopcut_slide', {'MESH_OT_loopcut': {'edge_index': edge.index, 'object_index': 0},
                                        'TRANSFORM_OT_edge_slide': {'value': 0}})
        self._record({'id': 'view3d.loopcut', 'action': 'loop_cut', 'value': rounded(point), 'ring': ring,
                      'text': text, 'help': help, 'duration': 2.0})

    @staticmethod
    def _edge_ring(start):
        """Edges across the same quads as `start`: a click on any of them makes the same cut."""
        ring = {start.index}
        for face in start.link_faces:
            edge, face_now = start, face
            while face_now is not None and len(face_now.edges) == 4:
                loop = next(l for l in face_now.loops if l.edge == edge)
                edge = loop.link_loop_next.link_loop_next.edge
                if edge.index in ring:
                    break
                ring.add(edge.index)
                face_now = next((f for f in edge.link_faces if f is not face_now), None)
        return sorted(ring)
