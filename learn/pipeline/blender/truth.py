"""Reads Blender's own UI definitions so the app never invents labels, menus or shortcuts."""
import math
import os
import sys
from types import SimpleNamespace

import bpy

MODIFIER_SHORT = {'SOLIDIFY': 'solidify', 'BEVEL': 'bevel', 'SUBSURF': 'subsurf',
                  'SIMPLE_DEFORM': 'simple_deform', 'MIRROR': 'mirror', 'ARRAY': 'array'}


def _axis_row(field_prefix, rna, heading, labels=('X', 'Y', 'Z')):
    """One element of a vector property per field: Mirror's X Y Z toggles, Array's Factor X / Y / Z."""
    return [(f'{field_prefix}_{axis.lower()}', rna, {'index': i, 'label': label, 'row': heading})
            for i, (axis, label) in enumerate(zip('XYZ', labels))]


def _toggles(field_prefix, rna, heading):
    return [(id_, rna, {**overrides, 'display': 'toggle'}) for id_, rna, overrides in _axis_row(field_prefix, rna, heading)]


def _vector(field_prefix, rna, label):
    # Blender labels a split vector column "Factor X", then "Y", "Z".
    return [(id_, rna, {'index': overrides['index'], 'label': overrides['label'] if overrides['index'] else f'{label} X',
                        'title': f'{label} {overrides["label"]}'})
            for id_, rna, overrides in _axis_row(field_prefix, rna, label)]

# Main-panel field order per modifier, then its subpanels: a plain label for a
# closed subpanel the lessons never open, or {label, open, header, fields}. Blender draws these panels in C
# (MOD_*.cc panel_draw), which the bpy wheel does not ship, so the order and
# the few label overrides below come from that source. Everything else
# (RNA names, types, defaults, enum items, units) is read from bpy at runtime.
PANELS = {
    'SOLIDIFY': {
        'fields': [
            ('mode', 'solidify_mode', {'display': 'dropdown'}),
            ('thickness', 'thickness', {}),
            ('offset', 'offset', {}),
            ('even_thickness', 'use_even_offset', {}),
            ('rim_fill', 'use_rim', {'label': 'Fill', 'heading': 'Rim'}),
            ('rim_only', 'use_rim_only', {}),
        ],
        'subpanels': ['Normals', 'Materials', 'Edge Data', 'Thickness Clamp', 'Output Vertex Groups'],
    },
    'BEVEL': {
        'fields': [
            ('affect', 'affect', {'display': 'expand'}),
            ('width_type', 'offset_type', {'display': 'dropdown'}),
            ('amount', 'width', {'label': 'Amount'}),
            ('segments', 'segments', {}),
            ('limit_method', 'limit_method', {'display': 'expand'}),
            ('angle', 'angle_limit', {}),
        ],
        'subpanels': ['Profile', 'Geometry', 'Shading'],
    },
    'SUBSURF': {
        'fields': [
            ('type', 'subdivision_type', {'display': 'expand'}),
            ('levels', 'levels', {'label': 'Levels Viewport'}),
            ('render', 'render_levels', {'label': 'Render'}),
            ('optimal_display', 'show_only_control_edges', {}),
        ],
        'subpanels': ['Advanced'],
    },
    # MOD_simpledeform.cc at the v5.3.0 tag.
    'SIMPLE_DEFORM': {
        'fields': [
            ('mode', 'deform_method', {'display': 'expand'}),
            ('angle', 'angle', {}),
            ('origin', 'origin', {}),
            ('axis', 'deform_axis', {'display': 'expand', 'labelled': True}),
        ],
        'subpanels': ['Restrictions'],
    },
    # MOD_mirror.cc: three rows of X Y Z toggles, then Merge as a checkbox and its distance on one row.
    'MIRROR': {
        'fields': [
            *_toggles('axis', 'use_axis', 'Axis'),
            *_toggles('bisect', 'use_bisect_axis', 'Bisect'),
            *_toggles('flip', 'use_bisect_flip_axis', 'Flip'),
            ('mirror_object', 'mirror_object', {}),
            ('clipping', 'use_clip', {'label': 'Clipping'}),
            ('merge', 'use_mirror_merge', {'label': '', 'row': 'Merge'}),
            ('merge_distance', 'merge_threshold', {'label': '', 'title': 'Merge Distance', 'row': 'Merge'}),
            ('bisect_distance', 'bisect_threshold', {'label': 'Bisect Distance'}),
        ],
        'subpanels': ['Data'],
    },
    # MOD_array.cc: Relative Offset is the one subpanel open by default (ui_expand_flag SUBPANEL_1).
    'ARRAY': {
        'fields': [
            ('fit_type', 'fit_type', {'display': 'dropdown'}),
            ('count', 'count', {}),
        ],
        'subpanels': [
            {'label': 'Relative Offset', 'open': True, 'header': ('relative', 'use_relative_offset', {}),
             'fields': _vector('factor', 'relative_offset_displace', 'Factor')},
            {'label': 'Constant Offset', 'header': ('constant', 'use_constant_offset', {}),
             'fields': _vector('distance', 'constant_offset_displace', 'Distance')},
            {'label': 'Object Offset', 'header': ('object', 'use_object_offset', {}),
             'fields': [('offset_object', 'offset_object', {'label': 'Object'})]},
            {'label': 'Merge', 'header': ('merge', 'use_merge_vertices', {'label': 'Merge'}),
             'fields': [('merge_distance', 'merge_threshold', {'label': 'Distance'}),
                        ('first_last', 'use_merge_vertices_cap', {'label': 'First and Last Copies'})]},
            'UVs',
            'Caps',
        ],
    },
}


def panel_fields(mod_type):
    """Every field of a modifier panel as (id, rna, overrides, subpanel index or None): main panel first."""
    panel = PANELS[mod_type]
    fields = [(*field, None) for field in panel['fields']]
    for index, sub in enumerate(panel['subpanels']):
        if isinstance(sub, dict):
            fields += [(*field, index) for field in ([sub['header']] if sub.get('header') else []) + sub['fields']]
    return fields

# Tab column of the Properties editor for a selected mesh object. The order is
# drawn in C (buttons_context.cc); labels come from RNA below.
TAB_ORDER = ['TOOL', None, 'RENDER', 'OUTPUT', 'VIEW_LAYER', 'SCENE', 'WORLD', 'COLLECTION', None,
             'OBJECT', 'MODIFIER', 'PARTICLES', 'PHYSICS', 'CONSTRAINT', 'DATA', 'MATERIAL', None, 'TEXTURE']

KEY_NAMES = {'ZERO': '0', 'ONE': '1', 'TWO': '2', 'THREE': '3', 'FOUR': '4', 'FIVE': '5',
             'TAB': 'Tab', 'DEL': 'Delete', 'LEFTMOUSE': 'Drag', 'WHEELUPMOUSE': 'Wheel Up', 'WHEELDOWNMOUSE': 'Wheel Down'}


def _keymaps():
    path = os.path.join(bpy.utils.system_resource('SCRIPTS'), 'presets', 'keyconfig', 'keymap_data')
    if path not in sys.path:
        sys.path.insert(0, path)
    import blender_default
    return blender_default.generate_keymaps(blender_default.Params())


_KEYMAPS = None


def shortcut(keymap, operator, context, **props):
    """Returns the default keymap binding for an operator, or fails if Blender no longer has it."""
    global _KEYMAPS
    _KEYMAPS = _KEYMAPS or _keymaps()
    for name, _args, content in _KEYMAPS:
        if name != keymap:
            continue
        for item in content.get('items', []):
            if item[0] != operator:
                continue
            item_props = dict((item[2] or {}).get('properties', []) if len(item) > 2 else [])
            if any(item_props.get(key) != value for key, value in props.items()):
                continue
            event = item[1]
            keys = [mod for mod in ('ctrl', 'alt', 'shift') if event.get(mod)]
            keys = [mod.capitalize() for mod in keys] + [KEY_NAMES.get(event['type'], event['type'].title())]
            return {'keys': keys, 'context': context}
    raise LookupError(f'No default shortcut for {operator} {props} in {keymap}')


def _rna_field(mod_type, field_id, rna_id, overrides, instance, subpanel=None):
    prop = instance.bl_rna.properties[rna_id]
    value = getattr(instance, rna_id)
    field = {
        'id': f'modifier.{MODIFIER_SHORT.get(mod_type, mod_type.lower())}.{field_id}',
        'rna': rna_id,
        'label': overrides.get('label', prop.name),
    }
    if 'index' in overrides:
        value = value[overrides['index']]
        field['index'] = overrides['index']
    for key in ('heading', 'row', 'title', 'display'):
        if key in overrides:
            field[key] = overrides[key]
    if subpanel is not None:
        field['subpanel'] = subpanel
    if overrides.get('labelled'):
        field['labelled'] = True
    if prop.type == 'ENUM':
        field.update(kind='enum', display=overrides.get('display', 'dropdown'), default=value,
                     items=[{'value': item.identifier, 'label': item.name} for item in prop.enum_items])
    elif prop.type == 'POINTER':
        # An object picker (Origin, Axis Object): always empty in the lessons.
        field.update(kind='pointer', default=None)
    elif prop.type == 'BOOLEAN':
        field.update(kind='bool', default=bool(value))
    elif prop.type in ('FLOAT', 'INT'):
        unit = getattr(prop, 'unit', 'NONE')
        field.update(kind='float' if prop.type == 'FLOAT' else 'int',
                     unit={'LENGTH': 'm', 'ROTATION': '°'}.get(unit, ''),
                     softMin=prop.soft_min, softMax=prop.soft_max)
        if unit == 'ROTATION':
            # The app shows and steps angles in degrees, like Blender's UI: the limits too.
            field.update(default=round(math.degrees(value), 4),
                         softMin=round(math.degrees(prop.soft_min), 4), softMax=round(math.degrees(prop.soft_max), 4))
        else:
            field['default'] = round(value, 6) if prop.type == 'FLOAT' else value
        if prop.type == 'FLOAT' and unit == 'NONE':
            # Plain factors show Blender's own number of decimals (Array's Factor: 2.500).
            field['precision'] = prop.precision
    return field


class _FakeLayout:
    def __init__(self):
        self.items = []
        self.operator_context = 'INVOKE_REGION_WIN'

    def operator(self, op, text=None, icon='NONE', **_kwargs):
        record = SimpleNamespace()
        self.items.append(('operator', op, text, record))
        return record

    def menu(self, name, **_kwargs):
        self.items.append(('menu', name))

    def separator(self, **_kwargs):
        self.items.append(('separator',))

    def menu_contents(self, name):
        self.items.append(('menu_contents', name))

    def template_modifier_asset_menu_items(self, **_kwargs):
        pass


def _draw(menu_cls):
    layout = _FakeLayout()
    fake = SimpleNamespace(layout=layout, bl_label=menu_cls.bl_label,
                           operator_modifier_add=menu_cls.operator_modifier_add,
                           operator_modifier_add_asset=menu_cls.operator_modifier_add_asset)
    menu_cls.draw(fake, SimpleNamespace(object=SimpleNamespace(type='MESH')))
    return layout.items


def add_modifier_menu():
    import bl_ui.properties_data_modifier as pdm
    categories = []
    for kind, *rest in _draw(pdm.OBJECT_MT_modifier_add):
        if kind != 'menu':
            continue
        menu_cls = getattr(pdm, rest[0])
        items = []
        for entry in _draw(menu_cls):
            if entry[0] != 'operator':
                continue
            _, op, text, record = entry
            mod_type = getattr(record, 'type', None) if op == 'object.modifier_add' else 'NODES'
            short = MODIFIER_SHORT.get(mod_type, (mod_type or 'nodes').lower())
            item_id = f'modifier.{short}.add' if op == 'object.modifier_add' else f'modifier.asset.{text.lower().replace(" ", "_")}.add'
            items.append({'id': item_id, 'label': text, 'type': mod_type if op == 'object.modifier_add' else None})
        categories.append({'id': f'modifier.add_menu.{menu_cls.bl_label.lower()}', 'label': menu_cls.bl_label, 'items': items})
    return {
        'id': 'modifier.add_menu',
        'label': pdm.OBJECT_MT_modifier_add.bl_label,
        'shortcut': shortcut('Property Editor', 'object.add_modifier_menu', 'Properties editor · Modifiers tab'),
        'categories': categories,
    }


def properties_tabs():
    enum = {item.identifier: item.name for item in bpy.types.SpaceProperties.bl_rna.properties['context'].enum_items_static}
    tabs = []
    for identifier in TAB_ORDER:
        if identifier is None:
            tabs.append({'separator': True})
            continue
        tabs.append({'id': f'panel.properties.{identifier.lower()}', 'identifier': identifier, 'label': enum[identifier]})
    return tabs


def object_panels():
    """Top-level panels of the Object tab, in Blender's registration order."""
    import bl_ui.properties_object as po
    return [cls.bl_label for cls in po.classes
            if getattr(cls, 'bl_context', None) == 'object' and not getattr(cls, 'bl_parent_id', None) and cls.bl_label]


def _subpanel(mod_type, sub):
    if isinstance(sub, str):
        return {'label': sub, 'open': False, 'header': None}
    header = sub.get('header')
    return {'label': sub['label'], 'open': bool(sub.get('open')),
            'header': f'modifier.{MODIFIER_SHORT[mod_type]}.{header[0]}' if header else None}


def modifier_definitions(obj):
    """Adds each modifier through the real operator to read its true defaults, then removes it."""
    menu_labels = {item.identifier: item.name for item in bpy.types.Modifier.bl_rna.properties['type'].enum_items_static}
    definitions = {}
    for mod_type, panel in PANELS.items():
        bpy.ops.object.modifier_add(type=mod_type)
        mod = obj.modifiers[-1]
        definitions[mod_type] = {
            'short': MODIFIER_SHORT[mod_type],
            'menuLabel': menu_labels[mod_type],
            'defaultName': mod.name,
            'fields': [_rna_field(mod_type, *field[:3], mod, field[3]) for field in panel_fields(mod_type)],
            'subpanels': [_subpanel(mod_type, sub) for sub in panel['subpanels']],
        }
        obj.modifiers.remove(mod)
    return definitions
