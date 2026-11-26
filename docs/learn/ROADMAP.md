# Drafty3D Learn: ruta de principiante a intermedio en Blender

## El horizonte

Al terminar la ruta, una persona que nunca abrió Blender puede **hacer de principio a fin un objeto o un personaje sencillo**:

1. modelarlo (con piezas, editando su forma, con modificadores o esculpiendo),
2. darle materiales y colores,
3. iluminarlo, encuadrarlo con una cámara y sacar una imagen final (render),
4. animarlo un poco (que gire, rebote o se mueva),
5. guardarlo y exportarlo (por ejemplo, para imprimir en 3D o mostrarlo en la web).

Eso es lo que llamamos **intermedio**. **Principiante completo** es llegar hasta el punto 3 con objetos sencillos. Lo que queda fuera de la ruta está al final: simulaciones, pelo, rigging de personajes completo, programación y otros temas avanzados.

## Cómo leer este documento

- La ruta tiene **9 niveles**. Cada nivel tiene una meta ("al terminar puedes…"), sus **lecciones** y un **proyecto final** que junta todo lo del nivel.
- Cada lección de la lista es una **pareja**: una lección **Ver** (la app lo hace paso a paso) y su **Your turn** (la persona lo repite con otros valores). Así son las que ya existen.
- Marcadores: ✅ ya está en la app y verificada contra Blender · 🟡 parcial · ⬜ falta.
- Los nombres de Blender van en inglés y en negritas, porque así aparecen en el programa. Al lado hay una explicación en palabras simples.

## Progreso

| Nivel | Tema | Etapa | Lecciones | Hechas |
| --- | --- | --- | --- | --- |
| 1 | Moverse y crear | Principiante | 6 | 0 |
| 2 | Dar forma (modelado) | Principiante | 8 | 0 |
| 3 | Modificadores | Principiante | 8 | 8 |
| 4 | Escultura | Principiante | 8 | 3 |
| 5 | Materiales, luz y render | Principiante | 8 | 0 |
| | **Principiante completo** | | **38** | **11** |
| 6 | Texturas | Intermedio | 6 | 0 |
| 7 | Animación | Intermedio | 5 | 0 |
| 8 | Curvas, texto y nodos | Intermedio | 5 | 0 |
| 9 | Articular objetos (rigging básico) | Intermedio | 4 | 0 |
| | **Intermedio (horizonte)** | | **58** | **11 (≈ 19 %)** |

Lo hecho hasta ahora está en los niveles 3 y 4 porque eran los que la app podía enseñar con lo que ya sabía hacer. El orden de **aprendizaje** empieza en el nivel 1; el orden en que conviene **construir** está en "Qué sigue" al final.

---

## Etapa principiante

### Nivel 1 · Moverse y crear

**Al terminar puedes:** moverte por una escena 3D, crear objetos básicos (cubos, esferas, cilindros) y acomodarlos con medidas exactas para armar algo simple.

| | Lección | Qué aprendes |
| --- | --- | --- |
| 🟡 | 1.1 Mirar la escena | Girar, acercar y mover la vista; ver de frente, de arriba y de lado. La app ya deja girar la vista con el dedo, pero no hay lección. |
| ⬜ | 1.2 Crear objetos | **Add → Mesh**: crear un cubo, una esfera o un cilindro y ajustar su tamaño y número de lados justo después de crearlo. |
| ⬜ | 1.3 Mover, girar y escalar | **Move / Rotate / Scale** (G, R, S), en un solo eje y con números exactos. Es lo que más se usa en Blender. |
| ⬜ | 1.4 Duplicar y ordenar | **Duplicate**, la lista de objetos (**Outliner**) y agrupar en **Collections**. |
| 🟡 | 1.5 Los modos de Blender | **Object Mode** (mover objetos completos), **Edit Mode** (cambiar su forma) y **Sculpt Mode** (esculpir). El cambio a Sculpt Mode ya se enseña dentro de las lecciones de escultura. |
| ⬜ | **Proyecto 1: una mesa con sillas hecha de bloques** | Todo junto: crear cajas y cilindros, medirlos, duplicarlos y acomodarlos. |

### Nivel 2 · Dar forma (modelado)

**Al terminar puedes:** tomar un objeto simple y transformarlo en otro editando sus partes: puntos (vértices), líneas (aristas) y caras. Es la forma más común de modelar objetos.

| | Lección | Qué aprendes |
| --- | --- | --- |
| ⬜ | 2.1 Puntos, líneas y caras | Seleccionar vértices, aristas y caras, y anillos completos de ellas. |
| ⬜ | 2.2 Sacar volumen | **Extrude**: jalar una cara hacia afuera para que salga una pieza nueva (patas, brazos, asas). |
| ⬜ | 2.3 Huecos y marcos | **Inset** + **Extrude** hacia adentro: hacer una caja, una ventana o un cajón. |
| ⬜ | 2.4 Más detalle donde hace falta | **Loop Cut**: agregar cortes para poder doblar o dar forma a una zona. |
| ⬜ | 2.5 Bordes redondeados | **Bevel** de aristas, el mismo efecto que el modificador pero solo donde lo eliges. |
| ⬜ | 2.6 Cortar y unir | **Knife** para cortar a mano, **Merge** para juntar puntos y **Fill** para tapar huecos. |
| ⬜ | 2.7 Mover suave | **Proportional Editing**: mover un punto y que los vecinos lo sigan, como tela. |
| ⬜ | **Proyecto 2: una taza con asa** | Cilindro → hueco con Inset y Extrude → asa con Extrude → bordes con Bevel. |

### Nivel 3 · Modificadores

**Al terminar puedes:** usar efectos que se apilan sobre un objeto (grosor, bordes redondos, suavizado, torcer, repetir, espejo, cortes) y cambiarlos en cualquier momento sin rehacer el modelo. Entiendes que el **orden** de la pila cambia el resultado.

| | Lección | Qué aprendes |
| --- | --- | --- |
| ✅ | 3.1 Taza low-poly | **Solidify** (dar grosor), **Bevel** (redondear bordes), **Subdivision Surface** (suavizar), y por qué van en ese orden. *Low-poly cup* → *Your turn: bowl*. |
| ✅ | 3.2 Columna torcida | **Bevel** + **Simple Deform** (torcer) y su eje. *Twisted column* → *Your turn: twisted candle*. |
| ✅ | 3.3 Modelar solo la mitad | **Mirror**: lo que haces de un lado aparece del otro. Clave para objetos y personajes simétricos. *Table from one corner* → *Your turn: bench*. |
| ✅ | 3.4 Repetir piezas | **Array**: una escalera, una cerca o una cadena a partir de una sola pieza. *Staircase from one step* → *Your turn: floating steps*. |
| ✅ | 3.5 Cortes y agujeros | **Boolean**: restar, sumar o cruzar dos objetos (por ejemplo, el agujero de un tornillo). *Birdhouse door* → *Your turn: lantern window*. |
| ✅ | 3.6 Doblar a lo largo de una curva | **Curve**: deformar un objeto con una guía. *Garden path* → *Your turn: ring track*. **Lattice** queda para después: necesita editar puntos de la jaula, que llega con el Nivel 2. |
| ✅ | 3.7 Ordenar y aplicar | Reordenar (**Move to First**), apagar (**Realtime**) y **Apply** (volver el efecto parte fija del modelo). *Order in the stack* → *Your turn: cushion*. |
| ✅ | **Proyecto 3: una escalera de mano** | Media pieza (medio peldaño y un tramo de riel): Array la apila, Mirror la cierra y Bevel redondea todo a la vez. *Project: wooden ladder* → *Your turn: bookshelf*. |

### Nivel 4 · Escultura

**Al terminar puedes:** modelar formas orgánicas (personajes, criaturas, rocas) como si fuera barro, con pinceles, y controlar el nivel de detalle.

| | Lección | Qué aprendes |
| --- | --- | --- |
| ✅ | 4.1 Primeros pinceles | **Grab** (jalar), **Draw** (subir o tallar), **Smooth** (suavizar), con tamaño, fuerza, + / − y espejo. *Pebble buddy* → *Your turn: sleepy buddy*. |
| ✅ | 4.2 Formas que salen | **Snake Hook** (estirar cuernos o antenas), **Inflate** (inflar), **Crease** (líneas marcadas). *Horned buddy* → *Your turn: antenna bug*. |
| ✅ | 4.3 Superficies duras | **Clay Strips** (capas de barro), **Scrape** (aplanar), **Draw Sharp** (grietas). *Craggy rock* → *Your turn: split boulder*. |
| ⬜ | 4.4 Proteger zonas | **Mask**: pintar lo que no se debe tocar y esculpir solo el resto. |
| ⬜ | 4.5 Mover partes grandes | **Pose** y **Elastic Deform**: girar una cabeza o estirar un brazo sin deformarlo. |
| ⬜ | 4.6 Más detalle donde haga falta | **Remesh**: rehacer la malla para tener detalle parejo después de estirar mucho. |
| ⬜ | 4.7 Detalle fino | **Multiresolution**: arrugas y texturas finas sin perder la forma base. |
| ⬜ | **Proyecto 4: cabeza de personaje estilizado** | Forma base con Grab y Snake Hook, rasgos con Draw y Crease, protección con Mask y detalle con Multiresolution. |

### Nivel 5 · Materiales, luz y render

**Al terminar puedes:** hacer que un modelo se vea terminado: colores y materiales (plástico, metal, vidrio), luces, una cámara bien colocada, una imagen final guardada y el archivo exportado.

| | Lección | Qué aprendes |
| --- | --- | --- |
| ⬜ | 5.1 Primer material | **Principled BSDF**: color, qué tan brillante o mate (**Roughness**) y si es metal (**Metallic**). |
| ⬜ | 5.2 Varios materiales | Dos o más materiales en un solo objeto (la taza por fuera y por dentro). |
| ⬜ | 5.3 Luces | **Point**, **Sun**, **Spot** y **Area**; iluminación de tres puntos. |
| ⬜ | 5.4 Cámara | Poner la cámara, encuadrar y elegir el lente. |
| ⬜ | 5.5 La imagen final | **Render**: **EEVEE** (rápido) contra **Cycles** (realista), calidad y guardar la imagen. |
| ⬜ | 5.6 El fondo | **World**: color o foto 360° (HDRI) que ilumina la escena. |
| ⬜ | 5.7 Guardar y exportar | Guardar bien el archivo y exportar a **STL** (impresión 3D) o **glTF** (web). |
| ⬜ | **Proyecto 5: foto de producto** | La taza o la escalera con materiales, tres luces, cámara y render final. **Aquí termina la etapa principiante.** |

---

## Etapa intermedia

### Nivel 6 · Texturas

**Al terminar puedes:** poner imágenes y patrones sobre un modelo (madera, etiquetas, desgaste) y crear materiales con nodos.

| | Lección | Qué aprendes |
| --- | --- | --- |
| ⬜ | 6.1 Desdoblar el modelo | **UV Unwrap** con costuras (**seams**): extender el modelo en plano, como el patrón de una prenda. |
| ⬜ | 6.2 Poner una imagen | **Image Texture**: una etiqueta o una foto de madera sobre el modelo. |
| ⬜ | 6.3 Materiales con nodos | **Shader Editor**: conectar cajitas (nodos) para mezclar colores y patrones. |
| ⬜ | 6.4 Patrones sin imágenes | **Noise** y **ColorRamp**: manchas, mármol, óxido. |
| ⬜ | 6.5 Pintar sobre el modelo | **Texture Paint**: pintar directo en 3D. |
| ⬜ | **Proyecto 6: un cofre de madera** | UV, textura de madera, metal en las esquinas y desgaste. |

### Nivel 7 · Animación

**Al terminar puedes:** hacer animaciones cortas: un objeto que gira para mostrarse, una pelota que rebota, una cámara que se mueve.

| | Lección | Qué aprendes |
| --- | --- | --- |
| ⬜ | 7.1 Fotogramas clave | **Keyframes**: marcar dónde está algo en un momento y dejar que Blender complete el movimiento. |
| ⬜ | 7.2 La línea de tiempo | **Timeline**: duración, velocidad y reproducción. |
| ⬜ | 7.3 Movimiento natural | **Graph Editor**: acelerar y frenar suave en vez de moverse como robot. |
| ⬜ | 7.4 Animar la cámara | Un giro alrededor del objeto (*turntable*) y exportarlo como video. |
| ⬜ | **Proyecto 7: pelota que rebota** | Rebote con caída, aplastamiento al tocar el suelo y salida. |

### Nivel 8 · Curvas, texto y nodos

**Al terminar puedes:** hacer cables, tubos y letras en 3D, y repartir muchos objetos automáticamente (piedras, pasto, tornillos).

| | Lección | Qué aprendes |
| --- | --- | --- |
| ⬜ | 8.1 Curvas | **Bezier**: dibujar una curva y darle grosor para hacer un cable o un tubo. |
| ⬜ | 8.2 Texto 3D | **Text**: escribir, cambiar la fuente y darle volumen. |
| ⬜ | 8.3 Nodos de geometría | **Geometry Nodes**: repartir objetos sobre una superficie con reglas. |
| ⬜ | 8.4 Variación | Tamaños y giros al azar para que no se vea repetido. |
| ⬜ | **Proyecto 8: un letrero en un jardín** | Letras 3D sobre un poste, cable de curva y piedras repartidas con nodos. |

### Nivel 9 · Articular objetos (rigging básico)

**Al terminar puedes:** ponerle "huesos" a un objeto para moverlo por partes, como una lámpara de escritorio con brazo o una cola que se dobla.

| | Lección | Qué aprendes |
| --- | --- | --- |
| ⬜ | 9.1 Huesos | **Armature**: crear una cadena de huesos. |
| ⬜ | 9.2 Unir huesos y modelo | **Parent** con pesos automáticos y **Weight Paint** para corregir qué parte sigue a qué hueso. |
| ⬜ | 9.3 Posar y animar | **Pose Mode** y keyframes sobre los huesos. |
| ⬜ | **Proyecto 9: lámpara articulada animada** | Una lámpara de escritorio con huesos, que se asoma y mira a la cámara. **Aquí termina el horizonte.** |

---

## Fuera del horizonte (avanzado)

No entran en esta ruta: rigging de personaje completo (caras, dedos), simulaciones (tela, fluidos, fuego), pelo y partículas, **Compositing**, **Grease Pencil** (dibujo 2D en 3D), retopología profesional, bake de texturas y Python. Se pueden planear después como rutas aparte.

---

## Qué tiene que aprender a hacer la app

Algunos niveles se pueden hacer solo grabando lecciones nuevas; otros piden construir piezas nuevas en la app. Esto es lo que decide el orden de trabajo.

| Nivel | Qué falta construir | Tamaño |
| --- | --- | --- |
| 3 Modificadores | Casi nada: Mirror y Array piden botones X Y Z y subpaneles abiertos; Boolean y Curve piden escenas con dos objetos. | Chico |
| 4 Escultura | Mostrar la máscara sobre la malla. Remesh y Multiresolution cambian la malla entera, así que la app no podría animar el trazo punto por punto y tendría que cortar entre una malla y otra. | Chico a mediano |
| 1 Moverse y crear | Seleccionar objetos tocándolos, flechas para moverlos (gizmo), panel de medidas, Outliner y varios objetos en escena. | Mediano |
| 5 Materiales, luz y render | Colores y luces en la vista; la verificación contra Blender hoy compara formas, no colores. Mostrar el render de Blender como imagen. | Mediano |
| 2 Modelado | Tocar puntos, líneas y caras sobre la malla y reproducir operaciones que agregan geometría. Es la pieza más grande y la más importante. | Grande |
| 6 a 9 Intermedio | Editor de UV, editor de nodos, línea de tiempo y huesos. | Grande |

Pendiente aparte: el modificador **Wireframe** se probó y se quitó, porque con alambres tan delgados la verificación contra Blender no distingue un error real del suavizado de bordes. Hace falta otra forma de verificar piezas delgadas.

## Qué sigue

Propuesta de orden de construcción (no es el orden de aprendizaje):

1. ✅ **Terminar el nivel 3** (Mirror, Array, Boolean, Curve, Apply y su proyecto). Lattice quedó para después del nivel 2.
2. **Terminar el nivel 4** (Mask y Pose primero; Remesh y Multiresolution después del cambio de reproducción).
3. **Nivel 1** completo: es la puerta de entrada de la ruta, y su selección y gizmo se reutilizan en el nivel 2.
4. **Nivel 2** (modelado): la pieza grande.
5. **Nivel 5**: con esto queda la **etapa principiante completa**.
6. Etapa intermedia, del nivel 6 al 9.
