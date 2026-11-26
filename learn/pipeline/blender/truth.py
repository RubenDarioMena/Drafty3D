"""Reads Blender's own UI definitions so the app never invents labels, menus or shortcuts."""
import math
import os
import sys
from types import SimpleNamespace

import bpy

MODIFIER_SHORT = {'SOLIDIFY': 'solidify', 'BEVEL': 'bevel', 'SUBSURF': 'subsurf'}

# Main-panel field order per modifier. Blender draws these panels in C
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
}

# Tab column of the Properties editor for a selected mesh object. The order is
# drawn in C (buttons_context.cc); labels come from RNA below.
TAB_ORDER = ['TOOL', None, 'RENDER', 'OUTPUT', 'VIEW_LAYER', 'SCENE', 'WORLD', 'COLLECTION', None,
             'OBJECT', 'MODIFIER', 'PARTICLES', 'PHYSICS', 'CONSTRAINT', 'DATA', 'MATERIAL', None, 'TEXTURE']

KEY_NAMES = {'ZERO': '0', 'ONE': '1', 'TWO': '2', 'THREE': '3', 'FOUR': '4', 'FIVE': '5',
             'TAB': 'Tab', 'DEL': 'Delete', 'WHEELUPMOUSE': 'Wheel Up', 'WHEELDOWNMOUSE': 'Wheel Down'}


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


def _rna_field(mod_type, field_id, rna_id, overrides, instance):
    prop = instance.bl_rna.properties[rna_id]
    value = getattr(instance, rna_id)
    field = {
        'id': f'modifier.{MODIFIER_SHORT.get(mod_type, mod_type.lower())}.{field_id}',
        'rna': rna_id,
        'label': overrides.get('label', prop.name),
    }
    if 'heading' in overrides:
        field['heading'] = overrides['heading']
    if prop.type == 'ENUM':
        field.update(kind='enum', display=overrides.get('display', 'dropdown'), default=value,
                     items=[{'value': item.identifier, 'label': item.name} for item in prop.enum_items])
    elif prop.type == 'BOOLEAN':
        field.update(kind='bool', default=bool(value))
    elif prop.type in ('FLOAT', 'INT'):
        unit = getattr(prop, 'unit', 'NONE')
        field.update(kind='float' if prop.type == 'FLOAT' else 'int',
                     unit={'LENGTH': 'm', 'ROTATION': '°'}.get(unit, ''),
                     softMin=prop.soft_min, softMax=prop.soft_max)
        if unit == 'ROTATION':
            field['default'] = round(math.degrees(value), 4)
        else:
            field['default'] = round(value, 6) if prop.type == 'FLOAT' else value
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
            'fields': [_rna_field(mod_type, field_id, rna, overrides, mod) for field_id, rna, overrides in panel['fields']],
            'subpanels': panel['subpanels'],
        }
        obj.modifiers.remove(mod)
    return definitions
