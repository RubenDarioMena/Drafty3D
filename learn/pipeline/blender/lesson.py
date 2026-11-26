"""Records a lesson: performs each step with real Blender operators and exports what Blender computed."""
import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

import truth

RENDER_SIZE = 384


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def open_cylinder(name, radius, height, vertices):
    """Starting object of the modifier lessons: a cylinder without its top face, shaded smooth by angle."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=height, end_fill_type='NGON')
    obj = bpy.context.active_object
    obj.name = obj.data.name = name
    obj.data.transform(Matrix.Translation((0, 0, height / 2)))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    top = max(bm.faces, key=lambda face: face.calc_center_median().z)
    bmesh.ops.delete(bm, geom=[top], context='FACES_ONLY')
    bm.to_mesh(obj.data)
    bm.free()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    return obj


def _normal_material():
    """Emission of the world-space normal mapped to 0..1; three.js renders the same mapping in the verify test."""
    mat = bpy.data.materials.new('VerifyNormals')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    geometry = nodes.new('ShaderNodeNewGeometry')
    remap = nodes.new('ShaderNodeVectorMath')
    remap.operation = 'MULTIPLY_ADD'
    remap.inputs[1].default_value = (0.5, 0.5, 0.5)
    remap.inputs[2].default_value = (0.5, 0.5, 0.5)
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 1.0
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(geometry.outputs['Normal'], remap.inputs[0])
    links.new(remap.outputs['Vector'], emission.inputs['Color'])
    links.new(emission.outputs['Emission'], output.inputs['Surface'])
    return mat


def _setup_render(scene):
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'Raw'
    scene.view_settings.look = 'None'
    scene.eevee.taa_render_samples = 16
    world = bpy.data.worlds.new('Black')
    world.color = (0, 0, 0)
    scene.world = world
    scene.view_layers[0].material_override = _normal_material()


class Lesson:
    def __init__(self, *, module, example, mode, title, out_dir, obj, panel, camera, text, variant_of=None):
        self.out_dir = out_dir
        self.obj = obj
        self.scene = bpy.context.scene
        os.makedirs(os.path.join(out_dir, 'raw'), exist_ok=True)
        os.makedirs(os.path.join(out_dir, 'renders'), exist_ok=True)
        _setup_render(self.scene)
        self.camera_obj = bpy.data.objects.new('LessonCamera', bpy.data.cameras.new('LessonCamera'))
        self.scene.collection.objects.link(self.camera_obj)
        self.scene.camera = self.camera_obj
        self.camera = camera
        self.panel = panel
        self.steps = []
        self.data = {
            'blenderVersion': bpy.app.version_string,
            'module': module,
            'example': example,
            'mode': mode,
            'title': title,
            'object': obj.name,
            'initial': {'panel': f'panel.properties.{panel.lower()}', 'camera': camera, 'text': text, 'mesh': self._capture(0, camera)},
            'steps': self.steps,
        }
        if variant_of:
            self.data['variantOf'] = variant_of

    def _place_camera(self, camera):
        position, target = Vector(camera['position']), Vector(camera['target'])
        data = self.camera_obj.data
        data.sensor_fit = 'VERTICAL'
        data.angle_y = math.radians(camera['fov'])
        data.clip_start, data.clip_end = 0.01, 100
        self.camera_obj.location = position
        self.camera_obj.rotation_euler = (target - position).to_track_quat('-Z', 'Y').to_euler()

    def _capture(self, index, camera):
        name = f'step-{index:02d}'
        bpy.ops.object.select_all(action='DESELECT')
        self.obj.select_set(True)
        bpy.context.view_layer.objects.active = self.obj
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(self.out_dir, 'raw', f'{name}.glb'),
            export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
            export_materials='NONE', export_texcoords=False, export_normals=True,
            export_cameras=False, export_lights=False, export_animations=False,
            export_draco_mesh_compression_enable=False,
        )
        self._place_camera(camera)
        self.scene.render.filepath = os.path.join(self.out_dir, 'renders', f'{name}.png')
        # The app shows the viewport evaluation (what the glTF exporter applied), so the reference
        # render must use viewport subdivision levels, not the modifier's separate Render levels.
        render_levels = {mod.name: mod.render_levels for mod in self.obj.modifiers if mod.type == 'SUBSURF'}
        for mod in self.obj.modifiers:
            if mod.type == 'SUBSURF':
                mod.render_levels = mod.levels
        bpy.ops.render.render(write_still=True)
        for mod in self.obj.modifiers:
            if mod.type == 'SUBSURF':
                mod.render_levels = render_levels[mod.name]
        return f'{name}.glb'

    def _modifier(self, mod_type):
        return next(mod for mod in self.obj.modifiers if mod.type == mod_type)

    def _record(self, step, *, changes_mesh, camera):
        camera = camera or self.camera
        self.camera = camera
        step.update(camera=camera)
        index = len(self.steps) + 1
        step['mesh'] = self._capture(index, camera) if changes_mesh else None
        self.steps.append(step)

    def select_panel(self, identifier, *, text, help=None, shortcut=None, duration=1.4, camera=None):
        self.panel = identifier
        self._record({
            'id': f'panel.properties.{identifier.lower()}', 'action': 'select_panel',
            'value': None, 'value_type': None, 'shortcut': shortcut, 'duration': duration,
            'autoAdvance': True, 'text': text, 'help': help,
        }, changes_mesh=False, camera=camera)

    def add_modifier(self, mod_type, *, text, help=None, shortcut=None, duration=2.8, camera=None):
        bpy.ops.object.modifier_add(type=mod_type)
        menu_label = next(item.name for item in bpy.types.Modifier.bl_rna.properties['type'].enum_items_static if item.identifier == mod_type)
        self._record({
            'id': f'modifier.{truth.MODIFIER_SHORT[mod_type]}.add', 'action': 'add_modifier',
            'value': menu_label, 'value_type': 'string', 'modifier': mod_type, 'shortcut': shortcut,
            'duration': duration, 'autoAdvance': False, 'text': text, 'help': help,
        }, changes_mesh=True, camera=camera)

    def set_value(self, mod_type, field_id, value, *, step, text, help=None, shortcut=None, duration=2.2, camera=None):
        field = next(f for f in truth.PANELS[mod_type]['fields'] if f[0] == field_id)
        mod = self._modifier(mod_type)
        prop = mod.bl_rna.properties[field[1]]
        setattr(mod, field[1], math.radians(value) if getattr(prop, 'unit', '') == 'ROTATION' else value)
        stored = getattr(mod, field[1])
        if prop.type == 'FLOAT' and abs(stored - value) > 1e-6:
            raise ValueError(f'Blender clamped {field_id} to {stored}')
        self._record({
            'id': f'modifier.{truth.MODIFIER_SHORT[mod_type]}.{field_id}', 'action': 'set_value',
            'value': value, 'value_type': 'number', 'step': step, 'modifier': mod_type, 'shortcut': shortcut,
            'duration': duration, 'autoAdvance': False, 'text': text, 'help': help,
        }, changes_mesh=True, camera=camera)

    def finish(self, *, text):
        self.data['outro'] = text
        with open(os.path.join(self.out_dir, 'timeline.json'), 'w') as handle:
            json.dump(self.data, handle, indent=2)
            handle.write('\n')
