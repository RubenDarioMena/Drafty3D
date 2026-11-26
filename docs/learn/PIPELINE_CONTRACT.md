# Drafty3D Learn — contrato pipeline ↔ UI

Contrato entre los scripts de Blender (`bpy==5.3.0`, en `learn/pipeline/`) que generan cada ejemplo y la app `/learn/` (three.js + GSAP). Lo decidió el grilling del ticket [#7](https://github.com/RubenDarioMena/Drafty3D/issues/7) y lo ajustó el [#8](https://github.com/RubenDarioMena/Drafty3D/issues/8) al implementarlo (ver "Cambios" al final). `tests/learn.test.mjs` comprueba el contrato en cada `npm test`.

## Archivos

| Archivo | Lo genera | Contenido |
| --- | --- | --- |
| `learn/public/examples/index.json` | pipeline | Lista de lecciones: `module`, `example`, `mode`, `title`, `variantOf`, `timeline`. |
| `learn/public/examples/blender-ui.json` | pipeline, leyendo Blender | Pestañas de Properties, menú Add Modifier completo, campos de cada modificador (etiqueta, tipo, valor por defecto, unidad, rango), paneles del Object tab. |
| `learn/public/examples/<module>/<example>/timeline.json` | pipeline | El timeline de la lección (abajo). |
| `learn/public/examples/<module>/<example>/step-NN.glb` | pipeline + `gltf-transform draco` | Malla evaluada de cada paso que cambia la geometría. |
| `tests/fixtures/learn/<module>/<example>/step-NN.png` | pipeline | Render de Blender de las normales de cada malla, para la prueba Blender vs three.js. No se publica. |

## 1. IDs semánticos

Cada control o acción que se puede tocar tiene un ID único: un string plano con puntos, `<namespace>.<objetivo>.<propiedad>`.

- `panel.properties.<pestaña>`: pestañas de Properties (ej. `panel.properties.modifier`).
- `modifier.add_menu`, `modifier.add_menu.<categoría>`: el botón Add Modifier y sus categorías.
- `modifier.<tipo>.add`: elemento del menú que agrega ese modificador.
- `modifier.<tipo>`: la tarjeta del modificador en la pila.
- `modifier.<tipo>.<campo>`: un campo (ej. `modifier.bevel.amount`, que en RNA es `width`).
- `object.*`: reservado para seleccionar objetos.

No hay índice de instancia: cada tipo de modificador aparece una vez por ejemplo.

## 2. Timeline JSON

```json
{
  "blenderVersion": "5.3.0",
  "module": "modifiers",
  "example": "cup",
  "mode": "watch",
  "title": "Low-poly cup",
  "object": "Cup",
  "initial": { "panel": "panel.properties.object", "camera": { "...": "..." }, "text": "…", "mesh": "step-00.glb" },
  "steps": [ { "...": "..." } ],
  "outro": "Done: Solidify → Bevel → Subdivision Surface…"
}
```

- `mode`: `watch` (Ver) o `your-turn`. Una práctica lleva `variantOf` con el ejemplo que imita.
- `initial`: el estado antes del primer paso: pestaña activa, cámara, texto y malla.

Cada paso:

```json
{
  "id": "modifier.bevel.amount",
  "action": "set_value",
  "modifier": "BEVEL",
  "value": 0.02,
  "value_type": "number",
  "step": 0.01,
  "shortcut": null,
  "duration": 2.2,
  "autoAdvance": false,
  "camera": { "position": [0.95, -1.25, 1.3], "target": [0.12, -0.18, 0.78], "fov": 30 },
  "text": "Lower Amount to 0.02 m for a thin, clean edge.",
  "help": "Amount is right below Width Type in the Bevel panel.",
  "mesh": "step-05.glb"
}
```

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | Ver sección 1. |
| `action` | enum | `select_panel`, `add_modifier`, `set_value` (en uso); `apply_modifier`, `select_object` (reservados). |
| `modifier` | string | Tipo RNA del modificador (`SOLIDIFY`, `BEVEL`, `SUBSURF`) en `add_modifier` y `set_value`. |
| `value` / `value_type` | `number`/`string`/`boolean`/`null` | `add_modifier` lleva el texto del menú (ej. `"Subdivision Surface"`); `set_value` el número; `select_panel` lleva `null`. |
| `step` | number | Solo en `set_value`. Es el paso fijo del slider: la UI lo usa para ◀ ▶ y el arrastre, y la validación compara `round(valor/step)`. |
| `shortcut` | `{ keys, context }` o `null` | Atajo del keymap por defecto de Blender 5.3 (ej. `{"keys": ["Shift", "A"], "context": "Properties editor · Modifiers tab"}`). Solo se muestra. |
| `duration` | number (s) | En autoplay, el tiempo que el paso queda en pantalla después de su animación. |
| `autoAdvance` | boolean | `true` en pasos de navegación pura: avanzan solos hacia adelante, pero el scrubber puede pararse en ellos. |
| `camera` | objeto | `position` y `target` en coordenadas de Blender (Z arriba). `fov` es el ángulo vertical en grados de un render cuadrado. La UI convierte a Y arriba y abre el ángulo en pantallas verticales. |
| `text` | string (inglés) | En Ver: qué pasa y por qué. En Your turn: la tarea. |
| `help` | string o `null` | Explicación breve de "Show me" en Your turn. |
| `mesh` | string o `null` | `step-NN.glb` si el paso cambia la malla. Si es `null`, se reutiliza la última malla. |

## 3. Malla por paso

- Un `.glb` por paso que cambia la geometría (`step-NN.glb`, NN = índice del paso; `00` es el inicial). Es un snapshot completo, nunca un delta.
- El pipeline exporta en dos pasos: `bpy` exporta glTF sin comprimir y `gltf-transform` aplica Draco. El pipeline vuelve a leer cada archivo y falla si no tiene `KHR_draco_mesh_compression` (`bpy` reporta éxito aunque no comprima).
- three.js solo muestra la malla; nunca recalcula modificadores. Se usa la evaluación de viewport (`Levels Viewport`), que es la que aplica el exportador.

## 4. Mapeo de ID a control

- Cada elemento lleva `data-control="<id>"` (misma convención que `data-copy`/`data-editor` en el repo).
- GSAP localiza el elemento con `querySelector('[data-control="<id>"]')` + `getBoundingClientRect()`. Nunca se graban coordenadas de pantalla.

## Cambios desde #7

- Se quitó `fallable`: con el candado de combinación de #8 ya no se cuentan intentos.
- Se agregaron `step`, `help`, `modifier`, `initial`, `outro`, `mode`, `title`, `object` y `variantOf`.
- `shortcut` pasó de string a `{ keys, context }`, porque el atajo depende del editor donde está el ratón en Blender.
- Se definió qué significan `fov` y `duration`.
- Nuevo `blender-ui.json`: la UI no escribe a mano etiquetas, menús ni valores por defecto.
