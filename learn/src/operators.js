// Blender 5.3 Adjust Last Operation fields, in panel units (including degrees).
const origin = [0, 0, 0];
const axes = ['x', 'y', 'z'];
const components = (name, vector) => Object.fromEntries(axes.map((axis, i) => [name + '.' + axis, vector[i]]));
const nested = (name, fields) => Object.fromEntries(Object.entries(fields).map(([key, v]) => [name + '.' + key, v]));

const primitive = { calc_uvs: true, align: 'WORLD', ...components('location', origin), ...components('rotation', origin) };
const transform = {
  orient_type: 'GLOBAL', mirror: false, use_proportional_edit: false, proportional_edit_falloff: 'SMOOTH',
  proportional_size: 1, use_proportional_connected: false, use_proportional_projected: false,
};
const translate = { ...transform, ...components('value', origin) };
const defaults = {
  'mesh.primitive_cube_add': { ...primitive, size: 2 },
  'mesh.primitive_plane_add': { ...primitive, size: 2 },
  'mesh.primitive_grid_add': { ...primitive, size: 2, x_subdivisions: 10, y_subdivisions: 10 },
  'mesh.primitive_cylinder_add': { ...primitive, vertices: 32, radius: 1, depth: 2, end_fill_type: 'NGON' },
  'mesh.primitive_uv_sphere_add': { ...primitive, segments: 32, ring_count: 16, radius: 1 },
  'transform.translate': translate,
  'transform.rotate': { ...transform, value: 0, orient_axis: 'Z' },
  'transform.resize': { ...transform, ...components('value', [1, 1, 1]) },
  'object.duplicate_move': { 'OBJECT_OT_duplicate.linked': false, ...nested('TRANSFORM_OT_translate', translate) },
  'mesh.extrude_region_move': {
    'MESH_OT_extrude_region.use_normal_flip': false, 'MESH_OT_extrude_region.use_dissolve_ortho_edges': false,
    ...nested('TRANSFORM_OT_translate', { ...translate, orient_type: 'NORMAL' }),
  },
  'mesh.inset': {
    use_boundary: true, use_even_offset: true, use_relative_offset: false, use_edge_rail: false,
    thickness: 0, depth: 0, use_outset: false, use_select_inset: false, use_individual: false, use_interpolate: true,
  },
  'mesh.bevel': {
    affect: 'EDGES', offset_type: 'OFFSET', offset_pct: 0, offset: 0, segments: 1, profile: 0.5,
    'profile.miter_profile_shape': 0.5, material: -1, harden_normals: false, clamp_overlap: false,
    loop_slide: true, mark_seam: false, mark_sharp: false, miter_outer: 'SHARP', miter_inner: 'SHARP',
    spread: 0.1, vmesh_method: 'ADJ', face_strength_mode: 'NONE', profile_type: 'SUPERELLIPSE',
  },
  'mesh.loopcut_slide': {
    ...nested('MESH_OT_loopcut', { number_cuts: 1, smoothness: 0, falloff: 'INVERSE_SQUARE' }),
    ...nested('TRANSFORM_OT_edge_slide', { value: 0, use_even: false, flipped: false,
      use_clamp: true, mirror: false, correct_uv: true }),
  },
  'mesh.bridge_edge_loops': {
    type: 'SINGLE', use_merge: false, merge_factor: 0.5, twist_offset: 0, number_cuts: 0,
    interpolation: 'PATH', smoothness: 1, profile_shape_factor: 0, profile_shape: 'SMOOTH',
  },
  'mesh.merge': { type: 'CENTER', uvs: false },
  'mesh.select_boundary_loop_multi': { extend: true },
  'object.select_all': null,
  'mesh.delete': null,
  'mesh.select_all': null,
  'mesh.edge_face_add': null,
  'mesh.select_edge_loop_multi': null,
  'mesh.knife_tool': null,
  'view3d.view_all': null,
  'view3d.view_axis': null,
};

// Return the visible panel. Starting an interactive tool keeps the previous
// panel until the viewport click. A confirmed drag supplies value in operator
// coordinates (a vector for translation/scale, degrees for rotation).
export function invoke(operator, { cursor = origin, proportional = false, previous = null,
  confirmed = false, value, thickness, offset } = {}) {
  if (!Object.hasOwn(defaults, operator)) throw new Error('Unknown operator ' + operator);
  if (operator === 'mesh.knife_tool' || (operator === 'mesh.loopcut_slide' && !confirmed)
      || operator.startsWith('view3d.')) return previous;
  if (!defaults[operator]) return null;

  const fields = { ...defaults[operator] };
  if (operator.startsWith('mesh.primitive_')) Object.assign(fields, components('location', cursor));
  const prefix = Object.hasOwn(fields, 'TRANSFORM_OT_translate.value.z') ? 'TRANSFORM_OT_translate.' : '';
  if (Object.hasOwn(fields, prefix + 'use_proportional_edit')) {
    fields[prefix + 'use_proportional_edit'] = proportional;
    if (value !== undefined) {
      if (operator === 'transform.rotate') fields.value = value;
      else Object.assign(fields, components(prefix + 'value', value));
    }
  }
  if (operator === 'mesh.inset' && thickness !== undefined) fields.thickness = thickness;
  if (operator === 'mesh.bevel' && offset !== undefined) fields.offset = offset;
  return nested('redo.' + operator, fields);
}

export function adjust(params, stepId, value) {
  if (!params || !Object.hasOwn(params, stepId)) throw new Error('Unknown redo field ' + stepId);
  return { ...params, [stepId]: value };
}
