// Blender-style value text for number fields.
export function formatValue(field, value) {
  if (field.unit === 'px') return `${Math.round(value)} px`;
  if (field.kind === 'int') return String(Math.round(value));
  // Lengths show Blender's unit text, which drops trailing zeros whatever the field's precision.
  if (field.unit === 'm') return `${trim(value, 3)} m`;
  if (Number.isInteger(field.precision)) return value.toFixed(field.precision);
  if (field.unit === '°') return `${Math.round(value)}°`;
  return value.toFixed(4);
}

function trim(value, decimals) {
  const text = value.toFixed(decimals).replace(/\.?0+$/, '');
  return text === '-0' ? '0' : text;
}

export function decimalsOf(step) {
  const text = String(step);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

export function roundToStep(value, step) {
  return Number((Math.round(value / step) * step).toFixed(decimalsOf(step)));
}
