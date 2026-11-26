// Blender-style value text for number fields.
export function formatValue(field, value) {
  if (field.kind === 'int') return String(Math.round(value));
  if (field.unit === '°') return `${Math.round(value)}°`;
  if (field.unit === 'm') return `${trim(value, 3)} m`;
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
