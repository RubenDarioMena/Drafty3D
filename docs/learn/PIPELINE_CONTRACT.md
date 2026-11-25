# Drafty3D Learn — contrato pipeline ↔ UI

Resuelve el ticket [#7 del mapa de wayfinder](https://github.com/RubenDarioMena/Drafty3D/issues/7)
(decidido en grilling con Rubén Mena, 2026-11-25). Es el contrato entre los
scripts de Blender (`bpy==5.3.0`) que generan cada ejemplo y la UI de
`/learn/` (three.js + GSAP). Si cambia algo aquí, versionar este documento
y avisar en el PR correspondiente.

## 1. IDs semánticos

Cada control o acción tocable tiene un ID único: un string plano con
puntos, `<namespace>.<objetivo>.<propiedad>`.

Namespaces fijos para el módulo de Modificadores:

- `panel.*` — pestañas/paneles (ej. `panel.properties.modifier`).
- `object.*` — selección de objeto en el viewport/outliner.
- `modifier.*` — un modificador concreto (ej. `modifier.bevel.amount`).

Sin índice de instancia: cada tipo de modificador aparece como máximo una
vez por ejemplo en los tres ejemplos conocidos (taza, cadena/cerca, cabeza
simétrica). Si un ejemplo futuro necesita dos modificadores del mismo
tipo, se añade un índice (`modifier.subsurf_1.levels`) en ese momento, no
antes.

## 2. Esquema del timeline JSON

Un archivo JSON por ejemplo:

```json
{
  "blenderVersion": "5.3.0",
  "module": "modifiers",
  "example": "cup",
  "steps": [ /* ver abajo */ ]
}
```

- `blenderVersion`: versión exacta usada para grabar el ejemplo (requisito
  de la spec para saber qué regrabar si cambia Blender).
- `module` / `example`: solo organización de archivos.

Cada entrada de `steps` tiene esta forma:

```json
{
  "id": "modifier.bevel.amount",
  "action": "set_value",
  "value": 0.05,
  "value_type": "number",
  "shortcut": null,
  "duration": 1.0,
  "autoAdvance": false,
  "fallable": true,
  "camera": { "position": [0, -4, 2], "target": [0, 0, 1], "fov": 50 },
  "text": "Set the bevel amount.",
  "mesh": "step-03.glb"
}
```

Campos:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | Ver sección 1. |
| `action` | enum | `add_modifier`, `set_value`, `apply_modifier`, `select_panel`, `select_object`. |
| `value` | `number \| string \| boolean \| null` | El valor final de la acción. `null` cuando la acción no tiene valor que verificar (`apply_modifier`, `select_panel`, `select_object`). `add_modifier` lleva el nombre del modificador como string (ej. `"Bevel"`); `set_value` lleva el número (o booleano si es un toggle, ej. "Clamp Overlap" de Bevel). |
| `value_type` | `"number" \| "string" \| "boolean" \| null` | Explícito; evita que el validador de "Your turn" tenga que inferir el tipo. `null` junto con `value: null`. |
| `shortcut` | `string \| null` | Solo para mostrar (ej. `"Ctrl+1"`). Nunca se exige su uso. |
| `duration` | number (segundos) | Cuánto se queda el paso en pantalla en reproducción automática antes de avanzar al siguiente, si `autoAdvance` lo permite. En modo manual, es la duración de la animación del cursor/resaltado dentro del paso. |
| `autoAdvance` | boolean | `true` solo en pasos de navegación pura (`fallable: false`): avanzan solos hacia adelante sin esperar clic. En cualquier otro caso, el modo "Ver" espera un clic del alumno por defecto (hay una opción de autoplay que usa `duration` como temporizador para todos los pasos). |
| `fallable` | boolean | `false` en pasos de navegación pura — no cuentan como intento en "Your turn". `true` en el resto. |
| `camera` | objeto | `position` y `target` en coordenadas de Blender (eje Z arriba), más `fov` en grados. Tomados de la cámara real de Blender en ese frame. Sin roll de cámara en estos ejemplos. |
| `text` | string (inglés) | Texto explicativo mostrado al alumno. |
| `mesh` | `string \| null` | Nombre del archivo `.glb` de este paso (ver sección 3). Ausente/`null` cuando el paso no cambia la malla — el visor reusa la del último paso que sí tuvo `mesh`. |

Importante: todo paso, incluidos los de navegación pura con
`autoAdvance: true`, sigue siendo una entrada individual y direccionable
del arreglo `steps`. "Avanza solo" únicamente describe el comportamiento
en reproducción hacia adelante; al pausar y usar el scrubber, el alumno
puede detenerse exactamente en esos pasos igual que en cualquier otro.

## 3. Entrega de malla por paso

- Un archivo `.glb` por paso que cambia la malla, nombrado `step-NN.glb`
  (NN con dos dígitos, ej. `step-02.glb`), exportado por `bpy` y
  comprimido con `gltf-transform draco` (pipeline confirmado en el
  ticket [#11](https://github.com/RubenDarioMena/Drafty3D/issues/11)).
- Cada malla es un snapshot completo y acumulado del estado en ese punto,
  nunca un delta. three.js solo la muestra; nunca recalcula modificadores.
- El timeline JSON referencia el archivo explícitamente por el campo
  `mesh` de cada paso — nunca se infiere por posición en el arreglo, para
  poder reordenar pasos sin romper referencias.

## 4. Mapeo de ID a control en la UI

- Atributo dedicado `data-control="<id>"` en el elemento DOM del control
  (slider, botón, pestaña), siguiendo la misma convención ya usada en el
  repo (`data-copy` para i18n, `data-editor` para qué editor abrir) en
  vez de un `data-id` genérico.
- GSAP localiza el elemento con
  `document.querySelector('[data-control="<id>"]')` y
  `getBoundingClientRect()` para animar el cursor — nunca se registran
  coordenadas de pantalla en el pipeline.

## IDs conocidos para el ejemplo de la taza

```
panel.properties.modifier
modifier.bevel.add
modifier.bevel.amount
modifier.bevel.segments
modifier.solidify.add
modifier.solidify.thickness
modifier.subsurf.add
modifier.subsurf.levels
```

(Orden real de modificadores: Bevel → Solidify → Subdivision — confirmado
por investigación en [#11](https://github.com/RubenDarioMena/Drafty3D/issues/11):
aplicar bevel después de subdivision lo anula o explota el conteo de
vértices. El resto del timeline exacto, incluyendo si la taza aplica el
stack al final con `modifier.*.apply`, se define al escribir el script
real de Blender.)
