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


def column(name, radius, height, sides, cuts, caps=True):
    """A prism standing on the floor with evenly spaced rings, so a deform modifier bends it smoothly."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=height,
                                        end_fill_type='NGON' if caps else 'NOTHING')
    obj = bpy.context.active_object
    obj.name = obj.data.name = name
    # A square stands on its side, not on a corner.
    turn = Matrix.Rotation(math.pi / sides, 4, 'Z') if sides == 4 else Matrix.Identity(4)
    obj.data.transform(Matrix.Translation((0, 0, height / 2)) @ turn)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for i in range(1, cuts + 1):
        z = height * i / (cuts + 1)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(obj.data)
    bm.free()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    return obj


def blocks(name, boxes):
    """A flat-shaded mesh of axis-aligned boxes. Each box is (min, max, open): `open` names the sides
    left without a face ('-x', '+z', ...), such as the cut faces on a Mirror plane."""
    bm = bmesh.new()
    for low, high, open_sides in boxes:
        corner = {}
        for i in (0, 1):
            for j in (0, 1):
                for k in (0, 1):
                    corner[i, j, k] = bm.verts.new(((low, high)[i][0], (low, high)[j][1], (low, high)[k][2]))
        sides = {
            '-x': [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)], '+x': [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)],
            '-y': [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)], '+y': [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
            '-z': [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)], '+z': [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],
        }
        for side, loop in sides.items():
            if side not in open_sides:
                bm.faces.new([corner[key] for key in loop])
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
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

    def set_value(self, mod_type, field_id, value, *, text, step=None, help=None, shortcut=None, duration=2.2, camera=None):
        """A number (with its fixed slider `step`), an enum identifier such as 'Z', or a checkbox / toggle (bool)."""
        _id, rna, overrides, _sub = next(f for f in truth.panel_fields(mod_type) if f[0] == field_id)
        mod = self._modifier(mod_type)
        prop = mod.bl_rna.properties[rna]
        target = math.radians(value) if getattr(prop, 'unit', '') == 'ROTATION' else value
        if 'index' in overrides:
            vector = getattr(mod, rna)
            vector[overrides['index']] = target
            stored = getattr(mod, rna)[overrides['index']]
        else:
            setattr(mod, rna, target)
            stored = getattr(mod, rna)
        if prop.type == 'FLOAT' and abs(stored - target) > 1e-6:
            raise ValueError(f'Blender clamped {field_id} to {stored}')
        if prop.type in ('ENUM', 'BOOLEAN', 'INT') and stored != target:
            raise ValueError(f'Blender kept {field_id} at {stored}')
        value_type = {'ENUM': 'enum', 'BOOLEAN': 'bool'}.get(prop.type, 'number')
        if value_type == 'number' and not step:
            raise ValueError(f'{field_id} needs its slider step')
        record = {
            'id': f'modifier.{truth.MODIFIER_SHORT[mod_type]}.{field_id}', 'action': 'set_value',
            'value': value, 'value_type': value_type, 'modifier': mod_type, 'shortcut': shortcut,
            'duration': duration, 'autoAdvance': False, 'text': text, 'help': help,
        }
        if value_type == 'number':
            record['step'] = step
        self._record(record, changes_mesh=True, camera=camera)

    def finish(self, *, text):
        self.data['outro'] = text
        with open(os.path.join(self.out_dir, 'timeline.json'), 'w') as handle:
            json.dump(self.data, handle, indent=2)
            handle.write('\n')
