# Drafty3D Learn: mapa de módulos de Blender

Lo esencial para pasar de cero a hacer y mostrar un modelo propio en Blender 5.3, en el orden en que conviene aprenderlo. Los nombres de Blender van en inglés, como en la app.

**Marcadores:** ✅ ya está en la app (con lección Ver + Your turn verificada contra Blender) · 🟡 parcial (aparece en la app pero no se enseña completo) · ⬜ pendiente.

La columna "Qué pide a la app" dice qué hay que construir además de grabar lecciones; si está vacía, basta con el pipeline actual.

## Resumen

| # | Módulo | Estado | Lecciones hoy |
| --- | --- | --- | --- |
| 1 | Interfaz y navegación | 🟡 | (dentro de las otras) |
| 2 | Object Mode: crear y transformar | ⬜ | — |
| 3 | Edit Mode: modelado | ⬜ | — |
| 4 | Modifiers | 🟡 | Low-poly cup, bowl, twisted column, twisted candle |
| 5 | Sculpting | 🟡 | Pebble buddy, sleepy buddy, horned buddy, antenna bug, craggy rock, split boulder |
| 6 | Materials y shading | ⬜ | — |
| 7 | UV y texturas | ⬜ | — |
| 8 | Luces, cámara y render | ⬜ | — |
| 9 | Animación | ⬜ | — |
| 10 | Rigging y Weight Paint | ⬜ | — |
| 11 | Curves y Text | ⬜ | — |
| 12 | Geometry Nodes (introducción) | ⬜ | — |
| 13 | Archivos, import / export | ⬜ | — |

Módulos 1 a 8 son el núcleo para un principiante; 9 a 13 vienen después.

## 1. Interfaz y navegación

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ✅ | Girar, mover y hacer zoom en la vista (con el dedo; en Blender, ratón) | |
| ✅ | Properties editor y sus pestañas (Modifier) | |
| ✅ | Selector de modo (Object / Sculpt) | |
| ✅ | Atajos del keymap por defecto mostrados en cada paso | |
| ⬜ | Vistas numpad (Front, Top, Side) y perspectiva / ortográfica | Botones de vista en el viewport |
| ⬜ | Outliner: ver, ocultar y seleccionar objetos | Panel Outliner leído de Blender |
| ⬜ | Workspaces y editores (Layout, Modeling, Sculpting, Shading…) | Pestañas de workspace |
| ⬜ | Viewport shading: Wireframe, Solid, Material Preview, Rendered | Modos de sombreado en three.js |
| ⬜ | 3D cursor y pivot point | Mostrar el cursor 3D |
| ⬜ | Header menus (View, Select, Add, Object) | Hoy solo se muestran, no se abren |

## 2. Object Mode: crear y transformar

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Add → Mesh: Cube, UV Sphere, Cylinder, Plane… y el panel "Adjust Last Operation" | Acción `add_object`, panel de operador |
| ⬜ | Seleccionar uno y varios objetos, objeto activo | Selección en three.js (acción `select_object` ya reservada en el contrato) |
| ⬜ | Move / Rotate / Scale (G, R, S) con eje (X, Y, Z) y valores escritos | Gizmo y panel N (Transform) |
| ⬜ | Apply Transforms (Ctrl A) y origen del objeto | |
| ⬜ | Duplicate (Shift D) y Linked Duplicate (Alt D) | |
| ⬜ | Snapping (incremento, vértice, cara) | |
| ⬜ | Parent (Ctrl P) y Collections | Outliner |
| ⬜ | Shade Smooth / Shade Auto Smooth | |

## 3. Edit Mode: modelado

El módulo más grande y el más pedido para modelar piezas. La app hoy no edita componentes.

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Modos de selección: vértice, arista, cara (1, 2, 3) | Dibujar y tocar vértices / aristas / caras sobre la malla |
| ⬜ | Seleccionar loops (Alt clic), todo, invertir | |
| ⬜ | Extrude (E) | Grabar operadores de Edit Mode; malla con topología cambiante (sin morph vértice a vértice) |
| ⬜ | Inset (I) | |
| ⬜ | Bevel de aristas (Ctrl B) | |
| ⬜ | Loop Cut and Slide (Ctrl R) | |
| ⬜ | Knife (K) | Trazo sobre la malla (ya existe para escultura) |
| ⬜ | Merge (M), Fill (F), Bridge Edge Loops | |
| ⬜ | Proportional Editing (O) | |
| ⬜ | Normales: ver y recalcular (Shift N) | |
| ⬜ | Delete / Dissolve | |

## 4. Modifiers

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ✅ | Add Modifier (menú leído de Blender) | |
| ✅ | Orden del stack (Solidify → Bevel → Subdivision; Bevel → Simple Deform) | |
| ✅ | **Solidify**: Thickness | |
| ✅ | **Bevel**: Amount, Segments | |
| ✅ | **Subdivision Surface**: Levels Viewport | |
| ✅ | **Simple Deform**: Twist, Axis, Angle | |
| 🟡 | Campos que se ven pero aún no se enseñan (Offset, Limit Method, Render levels, Bend / Taper / Stretch…) | |
| ⬜ | **Mirror**: eje, Clipping, Bisect | Fila de botones booleanos X Y Z |
| ⬜ | **Array**: Count, Relative Offset, Merge | Subpaneles abiertos (Relative Offset) |
| ⬜ | **Boolean**: Difference, Union, Intersect con otro objeto | Escenas con dos objetos y selector de objeto |
| ⬜ | **Decimate** (Collapse, Planar) | |
| ⬜ | **Displace**, **Cast**, **Smooth** | Texturas para Displace |
| ⬜ | **Curve**, **Lattice**, **Shrinkwrap** | Objetos de control en escena |
| ⬜ | **Screw**, **Skin**, **Remesh**, **Weld** | |
| ⬜ | **Wireframe** | Probado y descartado por ahora: con el grosor por defecto la verificación no distingue error de antialiasing. Hace falta otra forma de verificar piezas delgadas |
| ⬜ | Apply, duplicar, mover y desactivar modificadores (ojo / pantalla) | Acción `apply_modifier` ya reservada |

## 5. Sculpting

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ✅ | Entrar a Sculpt Mode | |
| ✅ | Brush asset shelf con todos los pinceles de Blender | |
| ✅ | Size, Strength, + / −, simetría X | |
| ✅ | **Grab**, **Draw**, **Smooth** | |
| ✅ | **Snake Hook**, **Inflate/Deflate**, **Crease Polish** | |
| ✅ | **Clay Strips**, **Scrape/Fill**, **Draw Sharp** | |
| 🟡 | Simetría Y y Z (botones visibles, sin lección) | |
| ⬜ | **Mask** (M) y operaciones de máscara (invertir, limpiar) | Mostrar la máscara sobre la malla |
| ⬜ | **Pinch/Magnify**, **Flatten/Contrast**, **Layer**, **Blob**, **Clay**, **Clay Thumb** | |
| ⬜ | **Elastic Deform**, **Pose**, **Thumb**, **Rotate**, **Boundary** | Ya soportados como pinceles de arrastre en el grabador |
| ⬜ | Falloff (curva), Stroke Method (Space, Dots, Line) | Más campos del header / panel de herramienta |
| ⬜ | Face Sets | Colores de face sets en la vista |
| ⬜ | **Remesh** (voxel, R) y **Dyntopo** | Cambian la topología: la app tendría que cortar en vez de animar vértice a vértice |
| ⬜ | **Multiresolution** (modificador) | |
| ⬜ | Matcaps y cavity en la vista de escultura | Shading en three.js |

## 6. Materials y shading

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Material Properties: nuevo material, varios materiales por objeto, asignar a caras | Pestaña Material; color en three.js |
| ⬜ | **Principled BSDF**: Base Color, Metallic, Roughness, Alpha, Emission | Verificación por color, no solo normales |
| ⬜ | Shader Editor: nodos básicos (Image Texture, ColorRamp, Mix) | Editor de nodos (grande) |
| ⬜ | Material Preview vs Rendered | |

## 7. UV y texturas

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Marcar seams y Unwrap | Edit Mode (módulo 3) |
| ⬜ | UV Editor: mover islas, escala | Segundo editor 2D |
| ⬜ | Smart UV Project | |
| ⬜ | Image Texture en el material | Módulo 6 |
| ⬜ | Texture Paint | |

## 8. Luces, cámara y render

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Tipos de luz: Point, Sun, Spot, Area; potencia y color | Luces en three.js comparables |
| ⬜ | World: color o HDRI | |
| ⬜ | Cámara: poner, apuntar, ver por la cámara (Numpad 0), focal length | |
| ⬜ | Render Engine: EEVEE vs Cycles, samples | |
| ⬜ | Resolución y salida; Render Image (F12) y guardar | Mostrar el render de Blender como imagen |

## 9. Animación

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Keyframes (I) sobre Location / Rotation / Scale | Timeline y reproducción |
| ⬜ | Timeline: frames, rango, reproducir | |
| ⬜ | Graph Editor: interpolación y easing | Editor de curvas |
| ⬜ | Dope Sheet | |

## 10. Rigging y Weight Paint

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Armature: huesos, Edit / Pose Mode | Esqueleto en three.js |
| ⬜ | Parent con pesos automáticos | |
| ⬜ | Weight Paint | Pintar pesos con trazo |
| ⬜ | Inverse Kinematics | |

## 11. Curves y Text

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Bezier: puntos y handles | |
| ⬜ | Bevel / Extrude de la curva | |
| ⬜ | Text: escribir, fuente, Extrude | |

## 12. Geometry Nodes (introducción)

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Modificador Geometry Nodes y editor de nodos | Editor de nodos (compartido con módulo 6) |
| ⬜ | Distribute Points on Faces + Instance on Points | |
| ⬜ | Set Position, Transform Geometry | |

## 13. Archivos, import / export

| Estado | Tema | Qué pide a la app |
| --- | --- | --- |
| ⬜ | Guardar, Save As, autosave y recuperar | Solo explicación (no hay archivos en la app) |
| ⬜ | Append / Link desde otro .blend | |
| ⬜ | Export glTF, FBX, OBJ, STL (impresión 3D) | |
| ⬜ | Import de referencias e imágenes | |

## La app (no son módulos de Blender)

| Estado | Tema |
| --- | --- |
| ✅ | Ver: paso a paso con cursor, resaltado, atajos, autoplay y deslizador |
| ✅ | Your turn: candado de combinación con "Show me" y progreso guardado |
| ✅ | Trazos que se repasan con el dedo sobre una guía |
| ✅ | Verificación Blender vs three.js en cada paso de cada lección |
| ✅ | Funciona sin conexión; APK de Android por workflow manual |
| ⬜ | Recorrido de módulos con requisitos (no abrir Edit Mode antes de Object Mode) |
| ⬜ | Textos de la app en español (hoy en inglés, como la interfaz de Blender) |
| ⬜ | Verificación para piezas delgadas (alambres) y para materiales / color |
| ⬜ | Topología cambiante (Edit Mode, Remesh, Dyntopo) en la reproducción |
