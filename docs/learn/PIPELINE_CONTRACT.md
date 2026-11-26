# Drafty3D Learn — contrato pipeline ↔ UI

Contrato entre los scripts de Blender (`bpy==5.3.0`, en `learn/pipeline/`) que generan cada ejemplo y la app `/learn/` (three.js + GSAP). Lo decidió el grilling del ticket [#7](https://github.com/RubenDarioMena/Drafty3D/issues/7) y lo ajustó el [#8](https://github.com/RubenDarioMena/Drafty3D/issues/8) al implementarlo (ver "Cambios" al final). `tests/learn.test.mjs` comprueba el contrato en cada `npm test`.

## Archivos

| Archivo | Lo genera | Contenido |
| --- | --- | --- |
| `learn/public/examples/index.json` | pipeline | Lista de lecciones: `module`, `example`, `mode`, `title`, `variantOf`, `timeline`. |
| `learn/public/examples/blender-ui.json` | pipeline, leyendo Blender | Pestañas de Properties, menú Add Modifier completo, campos de cada modificador (etiqueta, tipo, valor por defecto, unidad, rango), paneles del Object tab. En `sculpt`: menú de modo, campos del tool header de Sculpt Mode y repisa de pinceles (sección 5). |
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
- `object.mode`, `object.mode.<modo>`: el menú de modo del 3D Viewport y sus elementos (ej. `object.mode.sculpt`).
- `sculpt.brush`: nombre del pincel activo en el header. `sculpt.brush.<slug>`: el pincel en la repisa (`Inflate/Deflate` → `sculpt.brush.inflate_deflate`).
- `sculpt.size`, `sculpt.strength`: campos del header. `sculpt.direction.add|subtract`, `sculpt.symmetry.x|y|z`.
- `sculpt.shelf`, `sculpt.shelf.<pestaña>`: la repisa y sus pestañas. `sculpt.stroke`: un trazo (no es un control).
- `object.*` (otros): reservado para seleccionar objetos.

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
| `action` | enum | `select_panel`, `add_modifier`, `set_value`, `set_mode`, `select_brush`, `set_direction`, `set_symmetry`, `stroke` (en uso); `apply_modifier`, `select_object` (reservados). |
| `modifier` | string | Tipo RNA del modificador (`SOLIDIFY`, `BEVEL`, `SUBSURF`, `SIMPLE_DEFORM`) en `add_modifier` y `set_value` de modificadores. Un `set_value` sin `modifier` cambia un campo del header de escultura. |
| `value` / `value_type` | `number`/`string`/`boolean`/`null` | `add_modifier` lleva el texto del menú (ej. `"Subdivision Surface"`); `set_value` el número (`value_type: "number"`) o, en un enum, el identificador RNA de la opción (`value_type: "enum"`, ej. `"Z"`); `select_panel` lleva `null`. |
| `step` | number | Solo en `set_value` numérico (un enum no lleva `step`). Es el paso fijo del slider: la UI lo usa para ◀ ▶ y el arrastre, y la validación compara `round(valor/step)`. |
| `shortcut` | `{ keys, context }` o `null` | Atajo del keymap por defecto de Blender 5.3 (ej. `{"keys": ["Shift", "A"], "context": "Properties editor · Modifiers tab"}`). Solo se muestra. |
| `duration` | number (s) | En autoplay, el tiempo que el paso queda en pantalla después de su animación. |
| `autoAdvance` | boolean | `true` en pasos de navegación pura: avanzan solos hacia adelante, pero el scrubber puede pararse en ellos. |
| `camera` | objeto | `position` y `target` en coordenadas de Blender (Z arriba). `fov` es el ángulo vertical en grados de un render cuadrado. La UI convierte a Y arriba y abre el ángulo en pantallas verticales. |
| `text` | string (inglés) | En Ver: qué pasa y por qué. En Your turn: la tarea. |
| `help` | string o `null` | Explicación breve de "Show me" en Your turn. |
| `mesh` | string o `null` | `step-NN.glb` si el paso cambia la malla. Si es `null`, se reutiliza la última malla. |

### Pasos de escultura

`module: "sculpt"`. `initial` lleva `mode: "OBJECT"` y `tool: null`, sin `panel`.

| Acción | `value` | Notas |
| --- | --- | --- |
| `set_mode` | `"SCULPT"` | `autoAdvance: true`. |
| `select_brush` | nombre del pincel (`"Grab"`) | |
| `set_value` | número | `id` `sculpt.size` (px) o `sculpt.strength`; con `step`. |
| `set_direction` | `"ADD"` / `"SUBTRACT"` | |
| `set_symmetry` | `true` / `false` | El eje sale del `id`. |
| `stroke` | `null` | Lleva `stroke` y `mesh`. |

- `tool` (todos los pasos en Sculpt Mode): `{ brush, size, strength, direction, symmetry }` tal como Blender los reporta **después** del paso. `direction` es `null` si el pincel no tiene + / − (Grab), y vale `"SMOOTH"` en Smooth. `symmetry` es una lista de ejes (`["X"]`). Los valores son los efectivos del header: si el pincel usa tamaño unificado, `size` es el unificado.
- `stroke`: `{ brush, brushType, drag, path, points, radius, movedVertices }`.
  - `drag`: `true` en pinceles de arrastre (Grab, Snake Hook, Elastic Deform, Thumb, Pose, Rotate, Boundary). Sus `points` van sobre el plano de la profundidad inicial y la app anima el trazo de forma uniforme.
  - `path`: el recorrido en unidades de la vista de la lección: (0, 0) es el `target` de la cámara y 1 es media altura de la región.
  - `points`: el mismo recorrido en coordenadas de Blender (~24 puntos sobre la superficie; en pinceles de arrastre, sobre el plano de la profundidad inicial).
  - `radius`: radio del pincel en metros a esa profundidad.
  - `movedVertices`: vértices que Blender movió. El pipeline falla si es 0.
- El `camera` de un trazo es la vista con la que Blender lo grabó. La app la usa para que la guía caiga en el mismo lugar.

## 3. Malla por paso

- Un `.glb` por paso que cambia la geometría (`step-NN.glb`, NN = índice del paso; `00` es el inicial). Es un snapshot completo, nunca un delta.
- El pipeline exporta en dos pasos: `bpy` exporta glTF sin comprimir y `gltf-transform` aplica Draco. El pipeline vuelve a leer cada archivo y falla si no tiene `KHR_draco_mesh_compression` (`bpy` reporta éxito aunque no comprima).
- En escultura, todas las mallas de una lección tienen los mismos vértices en el mismo orden, también después de Draco (el pipeline lo comprueba). La app anima un trazo interpolando vértice a vértice de la malla anterior a la nueva.
- three.js solo muestra la malla; nunca recalcula modificadores. Se usa la evaluación de viewport (`Levels Viewport`), que es la que aplica el exportador.

## 4. Mapeo de ID a control

- Cada elemento lleva `data-control="<id>"` (misma convención que `data-copy`/`data-editor` en el repo).
- GSAP localiza el elemento con `querySelector('[data-control="<id>"]')` + `getBoundingClientRect()`. Nunca se graban coordenadas de pantalla.

## 5. `blender-ui.json` → `sculpt`

- `modeMenu`: `{ id: "object.mode", shortcut, items: [{ id, value, label }] }` con Object, Edit, Sculpt, Vertex Paint, Weight Paint y Texture Paint.
- `header`: `brush`, `size` y `strength` (`label`, `kind`, `unit`, `precision`, `softMin`, `softMax`, `shortcut`), `direction.items` y `symmetry.items`.
- `shelf`: `{ id, tabs, groups, brushes: [{ id, name, tab, group, shortcut }] }`, leído de los catálogos de los pinceles de Blender (`essentials_brushes-mesh_sculpt.blend`). Los atajos salen del keymap "Sculpt" (`brush.asset_activate`).

## Campos de modificador en `blender-ui.json`

- `kind`: `float`, `int`, `bool`, `enum` o `pointer` (selector de objeto, como Origin; siempre vacío en las lecciones).
- Los enums con `display: "expand"` se dibujan como fila de botones con `data-control="<id>.<opción en minúsculas>"`. Su etiqueta se oculta, salvo si el campo trae `labelled: true` (Axis de Simple Deform).
- Los campos de ángulo (`unit: "°"`) traen `default`, `softMin` y `softMax` en grados.

## Cambios desde #7

- Se quitó `fallable`: con el candado de combinación de #8 ya no se cuentan intentos.
- Se agregaron `step`, `help`, `modifier`, `initial`, `outro`, `mode`, `title`, `object` y `variantOf`.
- `shortcut` pasó de string a `{ keys, context }`, porque el atajo depende del editor donde está el ratón en Blender.
- Se definió qué significan `fov` y `duration`.
- Nuevo `blender-ui.json`: la UI no escribe a mano etiquetas, menús ni valores por defecto.
- Escultura: acciones `set_mode`, `select_brush`, `set_direction`, `set_symmetry` y `stroke`; campos `tool` y `stroke`; `initial.mode` e `initial.tool`; sección `sculpt` en `blender-ui.json`; topología compartida entre mallas.
- Más ejemplos: `set_value` de enum (`value_type: "enum"`, sin `step`), campos `pointer` y `labelled`, límites de ángulo en grados y `stroke.drag`.
