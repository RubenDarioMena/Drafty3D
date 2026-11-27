# Drafty3D Learn — contrato pipeline ↔ UI

Contrato entre los scripts de Blender (`bpy==5.3.0`, en `learn/pipeline/`) que generan cada ejemplo y la app `/learn/` (three.js + GSAP). Lo decidió el grilling del ticket [#7](https://github.com/RubenDarioMena/Drafty3D/issues/7) y lo ajustó el [#8](https://github.com/RubenDarioMena/Drafty3D/issues/8) al implementarlo (ver "Cambios" al final). `tests/learn.test.mjs` comprueba el contrato en cada `npm test`.

## Archivos

| Archivo | Lo genera | Contenido |
| --- | --- | --- |
| `learn/public/examples/index.json` | pipeline | Lista de lecciones: `module`, `example`, `mode`, `title`, `variantOf`, `timeline`. |
| `learn/public/examples/blender-ui.json` | pipeline, leyendo Blender | Pestañas de Properties, menú Add Modifier completo, campos de cada modificador (etiqueta, tipo, valor por defecto, unidad, rango), paneles del Object tab. En `sculpt`: menú de modo, campos del tool header de Sculpt Mode y repisa de pinceles (sección 5). En `view3d`: header y menús del 3D Viewport, campos de Adjust Last Operation, Outliner (sección 6). |
| `learn/public/examples/<module>/<example>/timeline.json` | pipeline | El timeline de la lección (abajo). |
| `learn/public/examples/<module>/<example>/step-NN.glb` | pipeline + `gltf-transform draco` | Malla evaluada de cada paso que cambia la geometría. En los niveles 1 y 2, todos los objetos visibles de la escena, cada uno con su nombre. |
| `tests/fixtures/learn/<module>/<example>/step-NN.png` | pipeline | Render de Blender de las normales de cada malla, para la prueba Blender vs three.js. No se publica. `view-NN.png`: la escena sin cambios desde la cámara de un paso que solo mueve la vista. |

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
- `menu.<menú>` y `menu.<menú>.<elemento>`: un menú del header del 3D Viewport y sus elementos (ej. `menu.object.duplicate_objects`, `menu.mesh_add.uv_sphere`). Los elementos de un submenú se nombran con la clave del submenú: View ▸ Viewpoint ▸ Front es `menu.view.viewpoint` → `menu.view_viewpoint.front`.
- `redo.<operador>.<campo>`: un campo de Adjust Last Operation (ej. `redo.mesh.inset.thickness`); los vectores van por eje (`…location.x`) y los de una macro llevan el operador interno (`redo.object.duplicate_move.TRANSFORM_OT_translate.value.x`).
- `mesh.select_mode.vert|edge|face`, `tool.proportional_edit`: botones del header en Edit Mode.
- `view3d.select`, `view3d.knife`, `view3d.loopcut`, `view3d.rotate`, `view3d.zoom`, `view3d.move`: acciones dentro de la vista 3D (no son controles).
- `outliner.row.<nombre>`, `outliner.hide.<nombre>`: una fila del Outliner y su ojo. `outliner.select`, `outliner.rename`, `outliner.hide`: los ids de los pasos.

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
| `action` | enum | `select_panel`, `add_modifier`, `set_value`, `move_modifier`, `toggle_modifier`, `apply_modifier`, `multires_subdivide`, `set_mode`, `select_brush`, `set_direction`, `set_symmetry`, `stroke`, `remesh` (en uso); `select_object` (reservado). |
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

`module: "sculpt"`. `initial` lleva `mode: "OBJECT"` y `tool: null`. Solo lleva `panel` si la lección tiene pasos de modificador (Multires): entonces la app muestra el editor Properties en esos pasos y el header de escultura en los demás.

| Acción | `value` | Notas |
| --- | --- | --- |
| `set_mode` | `"SCULPT"` | `autoAdvance: true`. |
| `select_brush` | nombre del pincel (`"Grab"`) | |
| `set_value` | número | `id` `sculpt.size` (px), `sculpt.strength` o `sculpt.voxel_size` (m, en el popover Remesh del header); con `step`. |
| `set_direction` | `"ADD"` / `"SUBTRACT"` | |
| `set_symmetry` | `true` / `false` | El eje sale del `id`. |
| `stroke` | `null` | Lleva `stroke` y `mesh`. |
| `remesh` | `null` | `id` `sculpt.remesh.apply`. Lleva `remesh: { before, vertices }` (vértices antes y después) y `mesh`. |

Una lección de escultura también puede tener pasos de modificador (`select_panel`, `add_modifier`, `multires_subdivide`, `set_value` con `modifier`). Fuera de Sculpt Mode su `tool` es `null`.

- `tool` (todos los pasos en Sculpt Mode): `{ brush, size, strength, direction, symmetry }` tal como Blender los reporta **después** del paso. `direction` es `null` si el pincel no tiene + / − (Grab), y vale `"SMOOTH"` en Smooth. `symmetry` es una lista de ejes (`["X"]`). Los valores son los efectivos del header: si el pincel usa tamaño unificado, `size` es el unificado.
- `stroke`: `{ brush, brushType, drag, path, points, radius, movedVertices }`.
  - `drag`: `true` en pinceles de arrastre (Grab, Snake Hook, Elastic Deform, Thumb, Pose, Rotate, Boundary). Sus `points` van sobre el plano de la profundidad inicial y la app anima el trazo de forma uniforme.
  - `path`: el recorrido en unidades de la vista de la lección: (0, 0) es el `target` de la cámara y 1 es media altura de la región.
  - `points`: el mismo recorrido en coordenadas de Blender (~24 puntos sobre la superficie; en pinceles de arrastre, sobre el plano de la profundidad inicial).
  - `radius`: radio del pincel en metros a esa profundidad.
  - `movedVertices`: vértices que Blender movió. El pipeline falla si es 0.
  - En un trazo de Mask (`brushType: "MASK"`) va `maskedVertices` en vez de `movedVertices`: los vértices cuya máscara cambió. La forma no cambia.
- Una lección con Mask (`mask=True` en el grabador) exporta la máscara de Blender (0 libre, 1 protegido) en el atributo `_MASK` de cada malla. La app la oscurece en Sculpt Mode, como Blender.
- El `camera` de un trazo es la vista con la que Blender lo grabó. La app la usa para que la guía caiga en el mismo lugar.

### Pasos de escena (niveles 1 y 2)

`module: "basics"` o `"modeling"`, `object: null`. `initial` y el `after` de cada paso guardan el estado que Blender reporta:

- `scene`: `{ objects: [{ name, collection, location, rotation, scale, hidden }], collections: [{ name, parent, hidden }], active, selected }`.
- `mode` (`"OBJECT"`, `"EDIT"`, `"SCULPT"`), `selectMode` (`["VERT"]`…), `proportional` (booleano), `tool` (el modal que espera clics: `"mesh.knife_tool"`, o `null`).
- `redo`: `{ operator, values }` del panel Adjust Last Operation, o `null` si Blender no lo muestra.
- `selection`: en Edit Mode, `{ verts, edges, faces }` con índices de `edit`.
- `edit` (en el paso, no en `after`, y solo cuando cambia): `{ object, verts, edges, faces }` de la malla en Edit Mode, en coordenadas del mundo.

| Acción | `value` | Notas |
| --- | --- | --- |
| `menu` | `null` | Lleva `path` (los ids desde el botón del header hasta el elemento) y `operator`. El `id` es el último del `path`. |
| `redo_value` | número, texto o booleano | Lleva `operator` y, si es número, `step`. Blender vuelve a ejecutar el operador con el valor nuevo. |
| `tap` | punto en coordenadas de Blender | Donde Blender hizo clic. `toggle: true` si fue con Shift. |
| `select_mode` | `"VERT"` / `"EDGE"` / `"FACE"` | |
| `proportional` | booleano | |
| `set_mode` | `"EDIT"`, `"OBJECT"`, `"SCULPT"` | Lleva `id` `object.mode.<modo>`. |
| `loop_cut` | punto de la arista tocada | Lleva `ring`: los índices de `edit.edges` que cruza el anillo. Cualquiera hace el mismo corte. |
| `knife` | lista de puntos | Lleva `knife: { points }`. Se confirma con Enter. |
| `orbit`, `zoom`, `pan` | `null` | Solo cambian la cámara. Llevan `verify` con el render de la escena desde la cámara nueva. |
| `outliner_select` | nombre | |
| `rename` | nombre nuevo | Lleva `target` (el nombre de antes). |
| `outliner_hide` | nombre | Lleva `hidden`. Oculta un objeto o una collection completa. |

- `camera` es la vista de Blender **después** del paso. En `orbit`, `zoom` y `pan` la app juzga el gesto del alumno contra ella: giro de al menos 20°, zoom de un cuarto en la misma dirección, o deslizar sin girar al menos 15 % de la distancia.
- Los pasos de vista y de `menu` de View ▸ Viewpoint llevan `verify` (`view-NN.png`) y `mesh: null`.

## 3. Malla por paso

- Un `.glb` por paso que cambia la geometría (`step-NN.glb`, NN = índice del paso; `00` es el inicial). Es un snapshot completo, nunca un delta.
- El pipeline exporta en dos pasos: `bpy` exporta glTF sin comprimir y `gltf-transform` aplica Draco. El pipeline vuelve a leer cada archivo y falla si no tiene `KHR_draco_mesh_compression` (`bpy` reporta éxito aunque no comprima).
- En escultura, la malla de un trazo tiene los mismos vértices en el mismo orden que la malla anterior, también después de Draco (el pipeline lo comprueba en cada par de trazo). La app anima un trazo interpolando vértice a vértice de una a otra. Remesh y Multires Subdivide rehacen la malla a propósito: la app cambia de una malla a la otra sin interpolar.
- Las mallas se triangulan con diagonal fija (`TRIANGULATE`, `quad_method='FIXED'`) antes de exportar y de renderizar la referencia. El exportador de glTF corta cada cuadrado por su diagonal más corta, y un trazo podía voltear triángulos y romper la topología compartida.
- Con Multires, el grabador mide la malla evaluada en Object Mode: el detalle esculpido vive en los niveles del modificador, no en la malla base.
- three.js solo muestra la malla; nunca recalcula modificadores. Se usa la evaluación de viewport (`Levels Viewport`), que es la que aplica el exportador.
- En los niveles 1 y 2 el glb lleva los objetos visibles en la vista (`use_visible`). El render de referencia también deja fuera lo que el ojo del Outliner oculta, porque el render de Blender lo ignora. Si no queda nada visible, el glb va vacío.

## 4. Mapeo de ID a control

- Cada elemento lleva `data-control="<id>"` (misma convención que `data-copy`/`data-editor` en el repo).
- GSAP localiza el elemento con `querySelector('[data-control="<id>"]')` + `getBoundingClientRect()`. Nunca se graban coordenadas de pantalla.

## 5. `blender-ui.json` → `sculpt`

- `modeMenu`: `{ id: "object.mode", shortcut, items: [{ id, value, label }] }` con Object, Edit, Sculpt, Vertex Paint, Weight Paint y Texture Paint.
- `header`: `brush`, `size` y `strength` (`label`, `kind`, `unit`, `precision`, `softMin`, `softMax`, `shortcut`), `direction.items` y `symmetry.items`.
- `shelf`: `{ id, tabs, groups, brushes: [{ id, name, tab, group, shortcut }] }`, leído de los catálogos de los pinceles de Blender (`essentials_brushes-mesh_sculpt.blend`). Los atajos salen del keymap "Sculpt" (`brush.asset_activate`).

## 6. `blender-ui.json` → `view3d`

- `header`: por modo (`OBJECT`, `EDIT`, `SCULPT`), los botones de menú `{ id, menu, label, shortcut }`.
- `menus`: cada menú `{ id, key, label, items }`; un elemento lleva `id`, `kind` (`operator`, `menu` si abre un submenú, `toggle`), `label` y, según el caso, `operator`, `menu` (la clave del submenú; `null` si Blender lo tiene pero las lecciones no lo abren), `shortcut` y `enabled`; `{ separator: true }` es una línea entre grupos. Leído de las clases de menú de Blender 5.3.
- `operators`: los campos de Adjust Last Operation de cada operador que usan las lecciones (`label`, `flags`, `sections[].fields[]` con `id`, `kind`, `unit`, `default`, rangos), como Blender los dibuja.
- `selectModes`, `proportional`, `navigation` (`orbit`, `zoom`, `pan`), `select`, `knife.confirm`, `outliner` (`root`, `hide`, `rename`) y `hud`: etiquetas, descripciones y atajos de esos controles.

## Campos de modificador en `blender-ui.json`

- `kind`: `float`, `int`, `bool`, `enum` o `pointer` (selector de objeto, como Origin; siempre vacío en las lecciones).
- Los enums con `display: "expand"` se dibujan como fila de botones con `data-control="<id>.<opción en minúsculas>"`. Su etiqueta se oculta, salvo si el campo trae `labelled: true` (Axis de Simple Deform).
- Los campos de ángulo (`unit: "°"`) traen `default`, `softMin` y `softMax` en grados.

- `modifiers[TIPO].toggles`: los interruptores que ese modificador muestra en su cabecera (Multires no tiene Edit Mode).
- Un subpanel puede traer `operators`: filas de botones `{ id, label }` (`modifier.multires.subdivide`); `null` es un hueco entre filas. Solo el botón del paso actual es tocable.

## Cambios desde #7

- Se quitó `fallable`: con el candado de combinación de #8 ya no se cuentan intentos.
- Se agregaron `step`, `help`, `modifier`, `initial`, `outro`, `mode`, `title`, `object` y `variantOf`.
- `shortcut` pasó de string a `{ keys, context }`, porque el atajo depende del editor donde está el ratón en Blender.
- Se definió qué significan `fov` y `duration`.
- Nuevo `blender-ui.json`: la UI no escribe a mano etiquetas, menús ni valores por defecto.
- Escultura: acciones `set_mode`, `select_brush`, `set_direction`, `set_symmetry` y `stroke`; campos `tool` y `stroke`; `initial.mode` e `initial.tool`; sección `sculpt` en `blender-ui.json`; topología compartida entre mallas.
- Más ejemplos: `set_value` de enum (`value_type: "enum"`, sin `step`), campos `pointer` y `labelled`, límites de ángulo en grados y `stroke.drag`.
- Niveles 1 y 2: acciones `menu`, `redo_value`, `tap`, `select_mode`, `proportional`, `loop_cut`, `knife`, `orbit`, `zoom`, `pan`, `outliner_select`, `rename` y `outliner_hide`; campos `after`, `edit`, `path`, `operator`, `ring`, `knife`, `toggle`, `target`, `hidden` y `verify`; glb con la escena completa; sección `view3d` en `blender-ui.json`; render de referencia sin lo oculto en la vista.
- Niveles 3 y 4: acciones `move_modifier` (`value: "FIRST"`), `toggle_modifier` (`value` booleano del toggle de cabecera), `apply_modifier`, `multires_subdivide` (lleva `values` con los tres niveles después de Subdivide) y `remesh`; `sculpt.voxel_size`; `maskedVertices` y el atributo `_MASK`; `initial.panel` en escultura con modificadores; topología compartida solo entre pares de trazo; triangulación con diagonal fija; `toggles` y `operators` en `blender-ui.json`.
