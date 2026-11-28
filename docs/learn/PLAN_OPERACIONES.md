# Plan de operaciones reales para Drafty3D Learn

La primera entrega será una extrusión sobre la pieza de `modeling/extrude-arm`. Es un buen corte vertical del producto: la persona selecciona una cara, la app calcula la extrusión, el visor dibuja la malla calculada y la prueba compara el resultado con Blender. En el paso 4 hay que pasar de 8 vértices, 12 aristas y 6 caras a 12 vértices, 20 aristas y 10 caras. En el paso 5 hay que cambiar la distancia sin crear una segunda extrusión. Estos dos pasos permiten comprobar tanto el núcleo geométrico como el comportamiento de **Adjust Last Operation**.

El alcance son las **30 parejas de lecciones** de los niveles 1–4: 6 de `basics`, 8 de `modeling`, 8 de `modifiers` y 8 de `sculpt`. Son 60 timelines y 626 pasos. Cada operación se probará con los valores de **Watch** y, por separado, con la pieza y los valores de **Your turn**. El código, los identificadores nuevos y los textos de interfaz estarán en inglés. Todos los cambios previstos caben en `learn/`, `tests/` y `docs/learn/`. La web y el APK usarán los mismos recursos locales.

## 1. Qué referencias existen

En este documento, **0** significa `initial` y **1** significa `steps[0]`. Un nombre como `modeling/extrude-arm` identifica `learn/public/examples/modeling/extrude-arm/timeline.json`. Los números de paso de las tablas se aplican a ambas variantes salvo indicación expresa.

| Módulo | Pasos, sin contar `initial` | Con `after` | Con un objeto `edit` | Con GLB nuevo |
|---|---:|---:|---:|---:|
| `basics` | 138 | 138 | 6 | 96 |
| `modeling` | 172 | 172 | 86 | 82 |
| `modifiers` | 104 | 0 | 0 | 81 |
| `sculpt` | 212 | 0 | 0 | 64 |

Los 60 estados iniciales tienen `step-00.glb`. En `basics` y `modeling`, `initial` contiene directamente el estado de escena. En cada paso posterior, `after` contiene el estado semántico, incluida la selección cuando corresponde. La topología está en `step.edit`, al mismo nivel que `after`. Si se omite `edit`, sigue vigente la última topología de ese objeto en edición. `edit: null` la desactiva explícitamente, como ocurre al salir de Edit Mode en el paso 6 de `modes` y `modes-tower`. Un `mesh` nulo indica que se reutiliza el último GLB.

### Inventario de `basics` y `modeling`

Cada fila representa dos timelines. Todos sus pasos tienen `after`. La columna GLB excluye el inicial común. Así se puede distinguir, por ejemplo, una selección que solo cambia `after` de un corte que además produce topología y superficie.

| Módulo y pareja, Watch / Your turn | Pasos con `edit` utilizable | Pasos con GLB nuevo |
|---|---|---|
| `basics/look-around` / `tower-tour` | — | —. Los pasos 1–8 tienen `verify` de cámara |
| `basics/add-objects` / `add-shapes` | — | 1–9 |
| `basics/move-rotate-scale` / `arrange-blocks` | — | 2–7, 9–10 |
| `basics/fence` / `pillars` | — | 2–5, 7–9 |
| `basics/modes` / `modes-tower` | 1, 4–5 | 4–5 |
| `basics/project-table` / `project-desk` | — | 1–15, 18–24 |
| `modeling/select-parts` / `select-parts-prism` | 1 | — |
| `modeling/extrude-arm` / `extrude-crane` | 1, 4–5, 7–8 | 4–5, 7–8 |
| `modeling/inset-planter` / `inset-drawer` | 1, 4–7 | 4–7 |
| `modeling/loop-cut-barrel` / `loop-cut-vase` | 1, 4–8 | 4–8 |
| `modeling/bevel-edges` / `bevel-corner` | 1, 5–7 | 5–7 |
| `modeling/cut-and-join` / `cut-and-patch` | 1, 4, 6, 8, 11 | 4, 6, 8, 11 |
| `modeling/proportional-hill` / `proportional-dent` | 4, 8–10 | 1–3, 8–10 |
| `modeling/project-mug` / `project-jug` | 4, 7–10, 13–14, 18–20, 24–26 | 1–3, 7–10, 13–14, 18–20, 24–26 |

### Inventario de `modifiers` y `sculpt`

Aquí el GLB es la única referencia de **geometría evaluada** en el timeline. También hay datos de la operación, como el valor de un campo, el pincel, los niveles de Multires o el recuento de remallado. En las tablas siguientes, todos los pasos fuera de la columna GLB reutilizan la última superficie. Esto incluye operaciones válidas que cambian la pila sin cambiar lo que se ve.

| Módulo y pareja, Watch / Your turn | Pasos con GLB nuevo |
|---|---|
| `modifiers/cup` / `bowl` | 2–8 |
| `modifiers/twisted-column` / `twisted-candle` | 2–7 |
| `modifiers/mirror-table` / `mirror-bench` | 2–6 |
| `modifiers/array-stairs` / `array-floating-steps` | 2–4 |
| `modifiers/boolean-birdhouse` / `boolean-lantern` | 3–5 |
| `modifiers/curve-garden-path` / `curve-ring-track` | 3–4 |
| `modifiers/stack-block` / `stack-cushion` | 2, 3, 5–8 en `stack-block`. **También 4** en `stack-cushion`. Ninguno exporta GLB en 9 |
| `modifiers/project-ladder` / `project-bookshelf` | 2–9 |
| `sculpt/pebble-buddy` / `sleepy-buddy` | 4, 10, 11, 14 |
| `sculpt/rock` / `boulder` | 4, 5, 9, 13 |
| `sculpt/horned-buddy` / `antenna-bug` | 5, 8, 12 |
| `sculpt/leaning-buddy` / `peeking-buddy` | 4, 7, 8 |
| `sculpt/belted-pebble` / `seamed-pebble` | 4, 8 |
| `sculpt/bobble-pebble` / `side-antenna` | 4, 6, 10 |
| `sculpt/wrinkled-pebble` / `scarred-pebble` | 3, 4, 9, 10, 12, 13 |
| `sculpt/troll-head` / `imp-head` | 4, 8, 11, 15, 19, 25, 28 |

## 2. Arquitectura del núcleo

### Malla, objeto y escena

El núcleo en `learn/src/` será JavaScript independiente del DOM, WebGL y los componentes de la lección. La unidad editable será un objeto con una **malla base en coordenadas locales de Blender**, una transformación de objeto y una pila ordenada de modificadores. La escena mantendrá las colecciones, visibilidad, selección y objeto activo. Renombrar un objeto conservará su identidad y las referencias de los modificadores.

La malla guardará posiciones en doble precisión, aristas explícitas y caras como ciclos orientados de vértices. Una estructura de incidencias tipo BMesh relacionará vértice, arista y esquina de cara. Debe representar n-gons, bordes abiertos, aristas sueltas y aristas con más de dos caras incidentes. La selección de vértices, aristas y caras usará identificadores internos estables durante cada operación. La máscara de escultura será un atributo escalar por vértice. Normales, triangulación, límites e índices espaciales se podrán regenerar a partir de esa malla.

Se conservarán por separado la malla base, la superficie evaluada por la pila y los buffers de dibujo. Así, editar `Array Count` reevalúa Array y los modificadores posteriores. `Apply` incorpora el resultado del modificador a la base y actualiza la pila. Ocultar un objeto conserva su geometría aunque el GLB de referencia solo incluya los objetos visibles.

### Conversión de `edit`, GLB y three.js

1. **De `edit` al núcleo.** Leer `object`, `verts`, `edges` y `faces` conservando el orden de cada contorno. Los vértices grabados están en coordenadas **de mundo** de Blender. Aplicar la inversa de la transformación del objeto para obtener coordenadas locales. Crear mapas temporales de índice grabado a identificador interno y traducir por ellos `after.selection` y, cuando corresponda, el anillo del paso. Al exportar hacia `edit`, aplicar la transformación de mundo y generar índices densos coherentes para topología y selección.
2. **Del núcleo a three.js.** Triangular una copia para dibujo con la convención del pipeline, incluida la diagonal `FIXED` para quads. Conservar en el núcleo los polígonos originales. Aplicar la conversión existente de `camera.js`, `(x, y, z) → (x, z, −y)`, una sola vez. Emitir `BufferGeometry`, normales por esquina cuando haya bordes duros, máscara y una correspondencia de triángulo dibujado a cara editable. Esa correspondencia permite tocar un n-gon sin seleccionar su diagonal de render.
3. **De three.js al núcleo.** Leer posiciones, índices o triángulos sin índice, atributos y transformación del nodo. Pasar del sistema Y-arriba a Blender y elegir explícitamente espacio local o mundo. Los cargadores actuales de `viewer.js` ya aplican `matrixWorld` a la copia de la geometría. Aplicarla de nuevo desplazaría las piezas dos veces. Un GLB Draco es apto para importar una **superficie triangular** o comparar un resultado evaluado. Las diagonales de triangulación, las divisiones por normales y la cuantización impiden deducir de forma general la jaula poligonal original.
4. **Datos de partida que faltan.** Para una pieza que empieza en Edit Mode lógico, la primera captura `edit` sirve como semilla de prueba. Si la persona creó la pieza en pasos anteriores, se debe llegar a esa captura desde la primitiva calculada. Para las piezas preconstruidas que requieren adyacencia original, exportar desde `learn/pipeline/blender/` una base poligonal local compacta por pieza. Para Boolean, incluir el cortador cerrado con su transformación. Para Curve, incluir la spline, manejadores, cierre y transformación. Los `helpers[].segments` existentes describen lo que se dibuja como guía. Por sí solos no especifican esos operandos. La generación de semillas ocurre al preparar el contenido, sin Blender en el teléfono.

### Ejecución y conexión con el visor

Una operación recibirá la escena actual, selección, sistema de orientación, pivote y parámetros efectivos. Entregará un cambio que se pueda confirmar o descartar. **Adjust Last Operation** conservará el estado inmediatamente anterior al operador y todos sus parámetros vigentes. Cambiar `Segments` después de `Width`, por ejemplo, repetirá Bevel una vez sobre esa base con ambos valores. La misma regla rige para tamaño y posición de una primitiva, componentes de escala y los operadores compuestos de Extrude o Loop Cut.

`scene-view.js` ya concentra la presentación en `showState`. Para la práctica calculada, esta función pasará a `Viewer.setObjects` las geometrías de los objetos vivos y a `Viewer.setEdit` la topología, selección y previsualización actuales. Para una pieza evaluada usará `Viewer.setGeometry`. Se conservarán `setHelpers`, las cámaras, los contornos y el indicador del pincel. Los toques se proyectarán sobre **la malla viva**, respetando la cámara elegida por la persona. `hitsRing`, `hitsPoint` y `traceMatches` podrán ayudar a mostrar una guía. La decisión de completar un paso geométrico vendrá del resultado.

`state.js` mantendrá la reconstrucción grabada para Watch, el desplazamiento a un paso y las referencias de prueba. La práctica tendrá un estado de trabajo independiente. `yourturn.js` enviará las acciones del usuario al núcleo, permitirá corregir un intento y guardará progreso después de la comparación. La integración de detección móvil será una tarea separada, como pide el handoff. Una operación todavía en reproducción seguirá identificada como tal durante la migración. Nunca se inicializará una operación con su propio resultado esperado.

## 3. Contrato de aceptación

Cada prueba unitaria partirá del último estado anterior disponible, incluidas la selección y la orientación vigentes. Para un `redo_value`, partirá de la base anterior al operador original. Además habrá una prueba encadenada por pareja que empiece en `initial` y use **la salida calculada** como entrada al paso siguiente. Así se detectan errores que desaparecerían si cada paso se reiniciara desde la captura de Blender.

Las tablas de implementación usan estos criterios. Los umbrales de imagen son los actuales del repositorio. Los umbrales de superficie comprimida y escultura que se proponen aquí deben calibrarse antes de habilitar la misión correspondiente.

| Criterio | Comparación y tolerancia |
|---|---|
| **Escena** | Contra `after.scene`, comparar objetos, colecciones, parentesco, nombres, visibilidad, activo y selección. Igualdad exacta de campos discretos. Ubicación con error máximo de `10⁻⁴ m`, escala con `10⁻⁴` por componente y rotación equivalente con error angular máximo de `10⁻⁴ rad`, convirtiendo los grados grabados. Comparar también modo, herramienta modal y modo de selección cuando los modifica el paso. |
| **Edición** | Contra `edit`, mismos números de vértices, aristas y caras. Correspondencia biyectiva con distancia euclídea máxima de `10⁻⁴ m` en mundo. Bajo esa correspondencia deben coincidir las aristas, los ciclos orientados de las caras salvo rotación del primer vértice, y la selección de `after`. Para un paso de selección sin `edit` nuevo se usa la topología vigente. |
| **Superficie** | Contra el GLB decodificado, por objeto visible y en el mismo espacio. Comparar componentes, límites y distancia bidireccional punto-superficie con muestreo determinista de vértices, bordes e interiores. Propuesta inicial: máximo de `10⁻⁴ m` más el error de cuantización Draco documentado para el recurso. Medir ese error en el pipeline frente a la exportación sin comprimir. Añadir pruebas específicas de huecos, espesor o uniones donde la superficie exterior sea insuficiente. |
| **Imagen** | Dibujar la **geometría calculada** con la cámara grabada, a 384 × 384, y comparar las normales con el PNG correspondiente de `tests/fixtures/learn/`. Usar `verify.js` y los límites de `learn-verify.spec.mjs`: `iou ≥ 0.99`, `meanDiff ≤ 0.006`, `badFraction ≤ 0.01`. El verificador actual carga un GLB por nombre. Habrá que darle una entrada de geometría calculada para que esta prueba mida el motor. |
| **Estado** | En pasos sin cambio geométrico, comprobar exactamente modo, selección, panel, tipo y orden de pila, campos discretos o ajustes de pincel pertinentes. Para campos registrados por incrementos, comparar el mismo tick del control. Verificar que la superficie sigue coincidiendo con la vigente. Si la misión trata de la forma, alcanzar el mismo resultado por otro gesto también debe resolverla. |
| **Trazo** | Con el recorrido grabado como entrada de regresión, comparar imagen y efecto local con el GLB posterior. Para los pinceles aproximados se propone un error RMS de desplazamiento local ≤ `0.10 × stroke.radius`, además de la prueba de imagen. Medir sobre la región afectada, incluidas sus copias por simetría, para que el resto de la pieza no diluya un error. El estado previo sin trazo y un trazo del signo contrario deben fallar. En práctica se evalúa la forma producida por el recorrido real. |

La búsqueda por vecino más cercano solo genera **candidatos**. Un vértice de referencia no puede satisfacer dos vértices calculados. En empates por simetría, coincidencia espacial o redondeo, se resolverá el emparejamiento mediante adyacencia, ciclos y selección. La prueba del comparador incluirá tres casos: permutar todos los índices debe pasar, cambiar una arista manteniendo posiciones y conteos debe fallar, e invertir el contorno de una cara debe fallar.

## 4. Iteraciones y pruebas por operación

Cada fila puede entregarse y probarse por separado. Cuando una fila reúne varios controles del mismo operador, cada paso citado tendrá una aserción propia. Los nombres de la segunda variante se encuentran en las tablas de inventario.

### A. Núcleo, escena y primera operación completa

| Entrega | Timeline, pasos y aceptación |
|---|---|
| Conversores y selección | `modeling/select-parts`, 1–9. Ida y vuelta de la malla del paso 1 con **Edición**. En 2–4, deseleccionar, tocar y sumar con Shift. En 5–9, cambiar a aristas, seleccionar un `Edge Loop`, cambiar a caras y seleccionar una cara. Comparar los tres conjuntos de `after.selection` en cada paso, incluido el prisma de práctica. |
| Cámara | `basics/look-around`, 1–8. En regresión reproducir orbit, zoom, pan, Front, Right, Top, segundo orbit y Frame All. Comparar cada `view-NN.png` con **Imagen** y conservar la escena. En práctica libre mantener las tolerancias de `navigationDone`: giro ≥ 20°, razón de zoom ≤ 0.8 o ≥ 1.25 según la dirección y pan ≥ 0.15 de la distancia con giro < 10°. Las vistas de menú y Frame All deben producir la proyección y encuadre correspondientes. |
| Transformación de objeto | `basics/move-rotate-scale`, 1–10. Comparar selección en 1 y 8, Move en 2–3 y 9–10, Rotate en 4–5 y Scale en 6–7 con **Escena**. Comparar **Superficie + Imagen** donde hay GLB. En Watch, el paso 5 fija 45° y el 7 escala Z a 2. Verificar que los demás objetos conservan su transformación. |
| Modos y transformación en edición | `basics/modes`, 1–8. En 1 importar el cubo de 8/12/6. En 2–3 seleccionar la cara y en 4–5 mover sus vértices con **Edición**. En 6–8 comparar **Estado** al pasar por Object, Sculpt y Object; la salida de Edit Mode conserva la forma final. |
| Primera extrusión | `modeling/extrude-arm`, 3→4→5 y 6→7→8. Extruir la cara seleccionada en su orientación `NORMAL`. Comparar **Edición + Imagen**. En Watch, 4 y 5 tienen 12/20/10 y 7 y 8 tienen 16/28/14. Una extrusión lateral comprueba que el campo denominado `value.z` puede corresponder al eje de la normal. Un segundo ajuste de distancia debe conservar los conteos. |
| Primitivas y redo | `basics/add-objects`, 1–2 cubo y tamaño, 3–5 cilindro con número de lados y ubicación, 6–9 UV Sphere con segmentos, anillos y ubicación. Comparar **Escena + Superficie + Imagen** después de cada creación y ajuste. `modeling/proportional-hill`, 1–4, añade Grid y sus subdivisiones X/Y. En 4 se pueden comprobar sus quads con **Edición**. El plano suelto y Wireframe no aparecen como operadores de estas 30 parejas. |
| Duplicación y Outliner | `basics/fence`, 1–10. Comparar duplicados y desplazamientos en 2–5, selección por fila en 6, nombre en 7, visibilidad de colección en 8–9 y Select All en 10 con **Escena**. Una copia superpuesta cuenta como objeto distinto. Ocultar y volver a mostrar debe recuperar todos sus miembros. |
| Proyecto de escena | `basics/project-table`, 1–24. Encadenar creación y dimensiones del tablero y la pata en 1–13, duplicación y selección múltiple en 14–19 y cilindro con radio, profundidad y posición en 20–24. **Escena** en los 24 pasos y **Superficie + Imagen** donde indica el inventario. Repetir desde cero para `project-desk`. |

### B. Operadores de edición sobre caras y anillos

| Entrega | Timeline, pasos y aceptación |
|---|---|
| Inset y extrusión interior | `modeling/inset-planter`, 4–5. Comparar contorno exterior, anillo nuevo, cara interior y selección con **Edición** al aplicar y cambiar `Thickness`. En 6–7 extruir hacia dentro y comparar fondo, paredes y normales con **Edición + Imagen**. |
| Merge, Delete y Fill | `modeling/cut-and-join`, 3→4 para `Merge At Center`, 7→8 para `Delete Faces`, 9–10 para Select All y `Boundary Loops`, 10→11 para `New Edge/Face from Vertices`. Aislar 7–11 usando la captura anterior del paso 6 hasta que Knife esté listo. **Edición** en cada operación y selección exacta en 9–10. En Watch, borrar la cara cambia 7/11/6 a 7/11/5. |
| Edición proporcional | `modeling/proportional-hill`, 5–10. Verificar deselección, vértice elegido y activación en 5–7 con **Estado**. En 8–10, **Edición** de toda la rejilla usando el falloff de Blender, desplazamiento y radio efectivos. Los puntos fuera del radio deben quedar dentro de `10⁻⁴ m` de su posición original. La práctica comprueba la deformación hacia el lado contrario según sus propios valores. |
| Loop Cut y escalado de anillos | `modeling/loop-cut-barrel`, 3–8. En 3 se activa el operador modal. En 4 debe servir cualquier arista del mismo `ring`. En 5 reevaluar `Number of Cuts`. En 6–8 escalar la selección en X/Y. Comparar **Edición** en 4–8, incluidas posición, continuidad y selección de todos los anillos. Probar dos aristas equivalentes y una de otro anillo. |
| Bridge Edge Loops | `modeling/project-mug`, 15–20. Seleccionar las dos caras, extruir ambas en 18–19 y unir sus extremos en 20. Comparar selección de 16–17 con `after`; comprobar **Edición + Imagen** en 18–20, incluida la conectividad y orientación del asa. La captura 19 permite aislar Bridge. |

### C. Modificadores sencillos y deformaciones

Para probar un modificador aislado se puede usar una base de prueba fiel al estado anterior. La aceptación de la lección completa exige recalcular la pila desde su malla base. El paso 1 de las ocho parejas de `modifiers` abre Properties y se comprueba con **Estado**.

| Entrega | Timeline, pasos y aceptación |
|---|---|
| Array | `modifiers/array-stairs`, 2–4. Comparar **Superficie + Imagen** al añadir Array, editar el desplazamiento relativo en Z y cambiar Count. Verificar número de copias y traslación respecto a las dimensiones de la entrada. El paso 4 tiene seis copias en Watch y cinco en `array-floating-steps`. |
| Mirror | `modifiers/mirror-table`, 2–3. Evaluar el eje inicial y añadir Y en 3. Comparar **Superficie + Imagen**, plano de reflexión, orientación de las caras reflejadas y comportamiento en la costura según los valores por defecto. Los pasos 4–6 añaden Bevel y cierran esta pareja en la siguiente iteración. |
| Solidify | `modifiers/cup`, 2–3. Dar espesor a la pared abierta y cerrar el borde según la configuración del modificador. Comparar **Superficie + Imagen** y distancia entre paredes. El espesor del paso 3 es 0.08 m en `cup` y 0.06 m en `bowl`. |
| Simple Deform | `modifiers/twisted-column`, 5–7. Comprobar Twist con el eje inicial, con Z y con el ángulo final mediante **Superficie + Imagen**. La regresión aislada parte de la salida Bevel del paso 4. La prueba encadenada incluirá 2–4 una vez disponible Bevel. El ángulo final es 90° en Watch y 180° en práctica. |
| Curve | `modifiers/curve-garden-path`, 2–4. Añadir Curve sin objetivo en 2 cambia la pila y conserva la superficie 0. En 3 asignar `Path` o `Ring` y evaluar con el eje inicial. En 4 aplicar `NEG_Y`. Comparar **Estado** en 2 y **Superficie + Imagen** en 3–4, incluidos orientación de la sección, extremos del camino abierto y cierre del anillo. |

### D. Operaciones con mayor riesgo topológico

| Entrega | Timeline, pasos y aceptación |
|---|---|
| Bevel de selección | `modeling/bevel-edges`, 3–7. Seleccionar las aristas, biselar en 5, ajustar ancho en 6 y segmentos en 7. Comparar **Edición + Imagen** en 5–7. La unión de las dos aristas debe tener la conectividad de Blender. En `modeling/project-mug`, 21–26, repetir sobre un loop completo de borde. |
| Bevel como modificador | `modifiers/mirror-table`, 4–6; `twisted-column`, 2–4; `cup`, 4–6. Evaluar sobre la entrada correspondiente, respetando límite, perfil, ancho y segmentos del modificador. **Superficie + Imagen** en cada paso de ambas variantes. Estas tres piezas ejercitan una unión reflejada, una columna y un borde con espesor. |
| Catmull-Clark y pila | `modifiers/cup`, 7–8, y `modifiers/stack-block`, 2–9. Para Subdivision Surface comparar **Superficie + Imagen** por nivel de viewport. En `stack-block`, 4 añade Bevel, 5 lo mueve al principio, 6 cambia su ancho y 7–8 apagan y encienden Subsurf. En 9, `Apply` debe incorporar Bevel a la base, retirarlo de la pila y conservar la superficie del 8. Comprobarlo reevaluando la pila restante. Comparar el GLB adicional del paso 4 de `stack-cushion`. |
| Knife | `modeling/cut-and-join`, 5–6. El 5 activa el modal y el 6 confirma los puntos de `knife.points`. Intersectar el recorrido con las caras tocadas y dividir aristas y caras en el orden geométrico. Comparar **Edición** al confirmar. En Watch, la salida es 7/11/6. Verificar que cancelar conserva la entrada y que dos recorridos que producen las mismas divisiones pasan. Encadenar después los pasos 7–11. |
| Boolean | `modifiers/boolean-birdhouse`, 2–5. En 2 añadir Boolean sin objetivo conserva la superficie 0. En 3 asignar `Door` o `Window`. En 4 Watch pide `INTERSECT` y `boolean-lantern` pide `UNION`. En 5 ambas vuelven a `DIFFERENCE`. Comparar **Estado** en 2 y **Superficie + Imagen** en 3–5. Tomar muestras dentro del hueco, en su pared y fuera de la intersección para distinguir las tres operaciones incluso desde una vista poco informativa. |
| Proyectos completos | `modeling/project-mug` / `project-jug`, 1–26: cilindro, Inset, extrusión interior, Loop Cut, selección doble, extrusión, Bridge, selección del borde y Bevel. Aplicar **Escena** al inicio y **Edición** en todos los pasos con `edit`. `modifiers/project-ladder` / `project-bookshelf`, 2–9: Array, factores Z/X y Count en 2–5, Mirror en 6 y Bevel en 7–9. Comparar **Superficie + Imagen** después de cada evaluación. En ambos proyectos, repetir un ajuste previo debe dar la misma superficie que introducir directamente su valor final. |

### E. Escultura

El primer componente compartido convertirá un recorrido sobre pantalla en muestras sobre la superficie viva. Usará el radio en metros como referencia de regresión, el tamaño efectivo del pincel, fuerza, dirección, máscara y simetría. `stroke.points` y `stroke.radius` permiten una prueba determinista. Para los pinceles con `drag`, el movimiento se mide respecto al plano de profundidad inicial. En los demás se actualiza el contacto con la superficie. Los pasos de modo, repisa, pincel, tamaño, fuerza, dirección y simetría de cada pareja se comprueban con **Estado** frente a `tool`.

| Entrega | Timeline, pasos y aceptación |
|---|---|
| Grab, Draw y Smooth | `sculpt/pebble-buddy`, 4 Grab, 10–11 Draw con Subtract y simetría X, 14 Smooth. Aplicar **Trazo** en cada salida. Comprobar además el sentido del arrastre, las dos regiones reflejadas y la disminución del relieve local al suavizar. Repetir en `sleepy-buddy`. |
| Clay Strips, Scrape/Fill y Draw Sharp | `sculpt/rock`, 4–5, 9 y 13 respectivamente. Aplicar **Trazo** a cada pasada, incluidas las dos consecutivas de Clay Strips. En 9 medir el aplanado local y en 13 la hendidura para evitar que una silueta exterior parecida apruebe el paso. Repetir en `boulder`. |
| Mask e Inflate/Deflate | `sculpt/belted-pebble`, 4 y 8. En 4 comparar la máscara calculada con `_MASK` del GLB (`_mask` tras cargarlo en three.js). Propuesta inicial de error absoluto medio ≤ 0.05 en la unión de las zonas pintadas, con geometría dentro de la tolerancia de **Superficie**. Una máscara vacía debe fallar. En 8 aplicar **Trazo** y comprobar que las zonas protegidas se desplazan menos que las libres, como en el GLB. Repetir en `seamed-pebble`. |
| Snake Hook y Crease Polish | `sculpt/horned-buddy`, 5 Snake Hook con simetría, 8 Inflate/Deflate y 12 Crease Polish. Comparar **Trazo** y el desplazamiento local de ambas puntas. Repetir con `antenna-bug`. |
| Pose y Elastic Grab | `sculpt/leaning-buddy`, 4 Pose y 7–8 Elastic Grab. Comparar **Trazo** en cada salida y posición relativa de la parte arrastrada respecto a la base. El paso 8 debe partir del resultado del 7. Repetir en `peeking-buddy`. |
| Voxel Remesh y Blob | `sculpt/bobble-pebble`, 4 Snake Hook, 5 tamaño de vóxel, 6 Remesh y 10 Blob. En 6 comprobar **Imagen**, superficie bidireccional a distancia máxima propuesta de medio vóxel y el recuento de vértices lógicos de `remesh`: 642 → 10 246 en Watch y 642 → 10 236 en `side-antenna`. La regresión exacta usa la superficie anterior de Blender para aislar el remallador. En la práctica con trazo libre, juzgar resolución y forma con la tolerancia de medio vóxel; una pequeña variación previa puede cambiar el recuento. Aplicar **Trazo** en 4 y 10. |
| Multires y Crease Sharp | `sculpt/wrinkled-pebble`, 2–4 añadir Multires y subdividir dos veces, 9–10 tallar con Crease Sharp, 12–13 bajar y restaurar el nivel de viewport. En 3–4 comparar exactamente los niveles de `values`, la resolución evaluada de cada GLB y **Imagen**. En 9–10 aplicar **Trazo**. En 12–13 verificar con las superficies grabadas que desaparece y reaparece el detalle. Repetir en `scarred-pebble`. |
| Proyecto de escultura | `sculpt/troll-head` / `imp-head`, 1–28 desde la base. Comprobar Grab en 4, Snake Hook en 8, Mask en 11, Inflate/Deflate en 15, Multires Subdivide en 19, Draw Subtract en 25 y Crease Sharp en 28. Aplicar respectivamente **Trazo**, prueba de máscara o prueba de nivel. Comprobar los cambios de modo, panel y herramienta intermedios con **Estado**. El detalle de 25 y 28 debe sobrevivir en el nivel correspondiente. |

## 5. Riesgos y condiciones de entrega

**Numeración y pérdida de topología.** Los índices de Blender, del núcleo y de Draco pueden diferir. Unir por coordenadas cercanas puede cerrar deliberadamente una costura o fusionar dos piezas superpuestas. La correspondencia geométrica pertenece al comparador. La topología de trabajo se preserva desde la semilla y las operaciones. La garantía de orden compartido del pipeline de escultura se aplica a pares de GLB de trazo validados. Remesh y Multires Subdivide necesitan una correspondencia nueva.

**Knife, Boolean, Bevel y subdivisión.** Knife necesita resolver un corte que termina sobre una arista o un vértice sin dejar caras degeneradas. Boolean necesita intersecciones robustas, interiores y orientación, especialmente con caras coplanares. Bevel concentra el riesgo en esquinas con varias aristas, segmentos y límites por solapamiento. Subdivision y Multires dependen de los quads, los bordes y el nivel de evaluación. La primera implementación cubrirá las configuraciones presentes en las piezas citadas y medirá los casos degenerados por separado. Si Boolean necesita una biblioteca, se evaluarán licencia, precisión, memoria y aumento comprimido del APK antes de incorporar una copia local dentro del alcance permitido.

**Falsos positivos de escultura.** Un trazo pequeño puede desaparecer en una métrica global. Una máscara puede cambiar mucho sin alterar ninguna normal. Cada prueba incluirá la malla anterior, una acción incorrecta y un resultado equivalente como controles. Se calibrarán los umbrales propuestos por pincel con las dos variantes. Si el paso anterior pasa o un resultado correcto falla, la misión seguirá en reproducción mientras se afina la métrica local o el operador. Las imágenes PNG de verificación pertenecen a `tests/`; la práctica offline puede comparar directamente con el GLB objetivo y sus atributos.

**Rendimiento en un Android de gama media.** Medir en un equipo físico, además del Pixel emulado de Playwright. Como objetivos iniciales: percentil 95 de cuadro ≤ 33 ms durante órbita, selección y trazo, y respuesta visual inicial ≤ 100 ms después de confirmar una operación. Medir por separado el tiempo total de Boolean, Remesh y Multires. Cargar solo la lección activa, reutilizar buffers, actualizar la vecindad del pincel y mover evaluaciones costosas a un worker local cuando el perfil lo justifique. Al cancelar o cambiar de lección se descartará cualquier resultado tardío. La prueba de memoria alternará las tres lecciones más pesadas hasta comprobar que las geometrías y buffers se liberan.

**Tamaño del APK y funcionamiento offline.** Tomar como línea base un APK y un build web del mismo commit y configuración. La cifra histórica de tamaño del README no sustituye esa medición. Registrar por iteración los bytes comprimidos añadidos por código, semillas, GLB y posibles módulos WASM. Compartir semillas entre pasos y conservar los PNG de prueba fuera del paquete. Verificar arranque en frío y una práctica completa en modo avión, ausencia del permiso `INTERNET` y cero solicitudes externas a los recursos locales de `/learn/`.

**Cierre de una pareja.** Las pruebas de Node comprobarán el operador y su comparador. Playwright ejecutará el flujo desde los controles reales, dibujará la salida calculada y probará al menos un resultado equivalente que deba pasar y uno incorrecto que deba fallar. Se conservarán las regresiones de Watch, cámara y navegación. Una pareja quedará migrada cuando su práctica llegue desde `initial` hasta el último paso con geometría propia, permita corregir un intento y conceda el progreso por el resultado obtenido.