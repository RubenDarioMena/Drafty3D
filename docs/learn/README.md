# Drafty3D Learn: guía de prueba y decisiones

Prototipo con dos módulos y cinco parejas de lecciones (una para ver y su práctica). **Modificadores**: *Low-poly cup* → *Your turn: bowl*, y *Twisted column* → *Your turn: twisted candle*. **Sculpting**: *Pebble buddy* → *Your turn: sleepy buddy*, *Horned buddy* → *Your turn: antenna bug*, y *Craggy rock* → *Your turn: split boulder*. Todo funciona sin conexión: en el navegador y en el APK.

La ruta de aprendizaje (de principiante a intermedio, con lo que ya está y lo que falta) está en [ROADMAP.md](ROADMAP.md).

> La app está en inglés, como Blender. Esta guía está en español porque es para revisar el producto.

## Cómo probarlo

| Dónde | Enlace |
| --- | --- |
| Navegador (celular o PC), mismos archivos que el APK | https://raw.githack.com/RubenDarioMena/Drafty3D/preview/learn/index.html |
| APK (descarga directa en el celular) | https://github.com/RubenDarioMena/Drafty3D/releases/download/learn-preview/drafty3d-learn.apk |
| Página del release (notas, commit de origen) | https://github.com/RubenDarioMena/Drafty3D/releases/tag/learn-preview |

githack guarda en caché el enlace de la rama `preview` durante un rato, así que después de un cambio puede seguir mostrando la versión anterior. Cada ejecución de Actions publica en su resumen un enlace fijado al commit (`https://raw.githack.com/RubenDarioMena/Drafty3D/<commit>/learn/index.html`), que siempre está al día.

La primera vez, githack muestra su propia página "One more step": toca **Open the page**. Es un aviso de githack, no de la app. En el navegador la app se descarga de internet; sin conexión solo funciona el APK.

Cada push a `codex/portal-diseno` que toque `/learn/` o `android/` actualiza la vista previa de githack en GitHub Actions (gratis en repos públicos). El APK solo se genera a mano: Actions → "Drafty3D Learn · APK + preview" → **Run workflow**. No se gasta ningún build de Vercel: la rama `preview` lleva su propio `vercel.json` con el `ignoreCommand`.

### Instalar el APK

1. En el celular, abre el enlace del APK y descárgalo.
2. Android pedirá permitir **instalar apps desconocidas** para el navegador. Acéptalo solo para esa app.
3. Si aparece Play Protect, elige **Instalar de todas formas**. El APK no tiene permiso de Internet: no puede enviar nada.
4. Pon el teléfono en modo avión y ábrelo. Debe funcionar igual.

### Llave de firma (una sola vez, en tu PC)

Mientras no existan los secretos, Actions genera un **APK de depuración**. Cada uno se firma con una llave distinta, así que para instalar el siguiente hay que **desinstalar el anterior, y se pierde el progreso**. Con tu llave fija, cada APK nuevo se instala encima.

1. Genera la llave (necesitas Java, que trae `keytool`). La contraseña la eliges tú y **no** pasa por el chat:

   ```bash
   keytool -genkeypair -v -keystore drafty3d-learn.jks -alias drafty3d-learn -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12
   ```

2. Guarda `drafty3d-learn.jks` y su contraseña en un lugar seguro (gestor de contraseñas y una copia aparte). Si se pierden, el siguiente APK obliga a desinstalar.
3. Sube los secretos al repo. Con [GitHub CLI](https://cli.github.com/), desde la carpeta de la llave:

   ```bash
   base64 -w0 drafty3d-learn.jks | gh secret set LEARN_KEYSTORE_BASE64 --repo RubenDarioMena/Drafty3D
   ```

   ```bash
   gh secret set LEARN_KEYSTORE_PASSWORD --repo RubenDarioMena/Drafty3D
   ```

   ```bash
   gh secret set LEARN_KEY_ALIAS --repo RubenDarioMena/Drafty3D --body drafty3d-learn
   ```

   En macOS cambia `base64 -w0` por `base64 -i`. En Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("drafty3d-learn.jks")) | gh secret set LEARN_KEYSTORE_BASE64 --repo RubenDarioMena/Drafty3D`. También puedes pegarlos en GitHub → Settings → Secrets and variables → Actions. `LEARN_KEY_PASSWORD` es opcional; con PKCS12 es la misma contraseña.
4. Vuelve a ejecutar el workflow (Actions → "Drafty3D Learn · APK + preview" → Re-run) o espera al siguiente push. Desinstala el APK de depuración una última vez; desde ahí, cada versión se instala encima.

## Qué probar

**Ver (Low-poly cup).** Pulsa **Start**. Cada paso mueve el cursor al control real, lo resalta y muestra el atajo de Blender como teclas. Un paso solo de navegación (abrir la pestaña de la llave) avanza solo; los demás esperan **Next**. **Autoplay** encadena los pasos. El deslizador permite parar en cualquier paso, también en los de navegación. Los botones **‹ ›** avanzan o retroceden una sola acción dentro del paso (por ejemplo, con el menú Add Modifier abierto) y se quedan quietos ahí. Con la reproducción detenida puedes girar la vista: un dedo gira, dos dedos mueven, pellizcar hace zoom. Al continuar, la cámara vuelve a la de Blender.

**Your turn (bowl).** Es un candado de combinación: haz cada paso con los controles de verdad. Nada cuenta como error. Cuando aciertas aparece una pista verde (por ejemplo `✓ Thickness: 0.06 m.`), una vibración corta en Android y la malla cambia a lo que Blender calculó. Los números se cambian con ◀ ▶, arrastrando sobre el valor o tocándolo para escribirlo. **Show me** (amarillo) hace el paso por ti y explica dónde estaba. El progreso queda guardado en el dispositivo. **Restart** vuelve a empezar.

**Sculpting · Ver (Pebble buddy).** Un guijarro liso se vuelve un personaje con tres pinceles: **Grab** estira la cabeza, **Draw** en modo resta (−) con simetría X talla los ojos y la sonrisa, y **Smooth** redondea la punta. Arriba de la vista 3D está el *tool header* de Sculpt Mode: modo, pincel, Size, Strength, + / − y espejo X Y Z. Debajo está la repisa de pinceles (*asset shelf*) con las pestañas de Blender. Cada trazo se reproduce con el aro del pincel siguiendo el recorrido mientras la malla se convierte, poco a poco, en la que Blender esculpió. Con **‹ ›** puedes pararte antes de un trazo: se ve la línea punteada que va a seguir y el cursor en su inicio.

**Sculpting · Your turn (sleepy buddy).** Los mismos pinceles en el mismo orden, con otra cara: ojos cerrados, boca redonda y la cabeza inclinada. Los ajustes funcionan como en el bowl: menú de modo, pincel en la repisa, Size y Strength con ◀ ▶, arrastre o escribiendo, + / −, espejo. Un pincel o un modo que no toca muestra "Not this one yet" y no cambia nada. En un paso de trazo aparece una **línea punteada** con un punto naranja en el inicio y una flecha al final. Repásala con un dedo empezando en el punto. Si te sales, empiezas al revés o solo tocas, aparece un aviso ("Follow the dotted line", "Start at the dot", "Drag along the whole line") y puedes reintentar. En los círculos (boca, punta de la cabeza) puedes empezar en cualquier parte. Mientras haya un trazo pendiente, un dedo dibuja en vez de girar la vista.

**Modificadores · Twisted column / twisted candle.** Una columna cuadrada (el cirio es hexagonal) con **Bevel** para suavizar las aristas y **Simple Deform** en Twist. Simple Deform tuerce por defecto alrededor de X, así que la columna se dobla de lado: el paso siguiente pone **Axis** en Z (una fila de botones X Y Z, como en Blender) y luego sube **Angle** (de 5° en 5°). En el cirio: 0.02 m, 2 segmentos, Z y 180°.

**Sculpting · Horned buddy / antenna bug.** Tres pinceles nuevos: **Snake Hook** estira cuernos (o antenas) desde la cabeza y sigue jalando mientras arrastras, así que la guía sale de la superficie hacia el aire; **Inflate/Deflate** infla los ojos con círculos; **Crease Polish** con Strength 1.0 corta la sonrisa (o una boca pequeña) yendo y volviendo sobre la línea.

**Sculpting · Craggy rock / split boulder.** **Clay Strips** pone dos franjas de arcilla (estratos), **Scrape/Fill** con Strength 1.0 aplana una cara yendo y viniendo, y **Draw Sharp** talla una grieta en zigzag. Draw Sharp ya empieza en Subtract (−), así que no hay paso de + / −: lo dice el texto del pincel.

**Modificadores · nivel 3.** **Mirror** (botones X Y Z y casillas) para hacer media mesa o media banca; **Array** apila un escalón; **Boolean** corta una puerta o una ventana con un objeto de ayuda (se elige en una lista desplegable); **Curve** dobla un camino sobre una guía; y en *Order in the stack* se usan el menú de la cabecera (**Move to First**, **Apply**) y el interruptor **Realtime**. El proyecto es una escalera de mano (y un librero) hecha con media pieza: Array, Mirror y Bevel.

**Sculpting · nivel 4.**
- **Belted pebble / seamed pebble.** **Mask** pinta una franja que se oscurece; luego Inflate (o Blob) hincha todo menos la franja.
- **Leaning buddy / peeking buddy.** **Pose** inclina la cabeza en el cuello; **Elastic Grab** saca bracitos.
- **Remesh an antenna / side antenna.** Snake Hook estira una antena larga y delgada, el botón **Remesh** del header (popover con **Voxel Size**) rehace la malla con vértices parejos, y Blob redondea la punta.
- **Fine wrinkles / scarred pebble.** **Multiresolution** se agrega en Properties: la app muestra el editor Properties en los pasos de modificador y el header de escultura en los demás. Se usa **Subdivide** dos veces, luego **Crease Sharp** para arrugas o cicatrices, y **Levels Viewport** 0 → 2 para ver que la malla base sigue intacta.
- **Project: troll head / imp head.** Todo el nivel junto: Grab para la barbilla (o un pico), Snake Hook para orejas (o cuernos), Mask sobre ellas, Inflate llena la cabeza sin engordarlas, Multires y al final ojos con Draw y boca con Crease Sharp.

## Decisiones que tomé por ti

Tomadas con los principios del registro de decisiones. Para el modo práctica, la regla del candado la decidiste tú.

| Tema | Decisión | Principio |
| --- | --- | --- |
| Contenido de la taza | Cilindro abierto → **Solidify** 0.08 m → **Bevel** 0.02 m, 2 segmentos → **Subdivision Surface** nivel 2. Solidify va primero para que el bevel redondee también el borde nuevo. El bevel va antes que la subdivisión porque, al revés, el bevel no hace nada o dispara la cantidad de vértices (#11). | 6 |
| Variante (bowl) | Mismas herramientas y orden. Valores: 0.06 m, 0.02 m, 3 segmentos, nivel 2. Amount está por debajo de 0.03 m porque Blender recorta el bevel ("Clamp Overlap") a media pared y un valor mayor no cambiaría nada. Una prueba automática exige que cada paso cambie el resultado. | 2, 6 |
| Objeto inicial | Cilindro sin tapa y con *Shade Smooth by Angle*. Ya viene hecho, porque crearlo es Edit Mode (otro módulo). | 3 |
| Textos, menús y valores por defecto | Se leen del propio Blender 5.3 al generar los ejemplos (`learn/public/examples/blender-ui.json`): pestañas de Properties, menú Add Modifier → Generate completo, etiquetas y valores por defecto de cada campo. Nada se escribió a mano. | 2 |
| Atajos | Solo los del keymap por defecto de Blender 5.3, leídos de su código: `Ctrl Tab` (siguiente pestaña), `Shift A` (Add Modifier sobre Properties), `Ctrl 2` (nivel 2 en el 3D Viewport). Si Blender los cambia, el pipeline falla en vez de mentir. | 2 |
| Candado | Se valida al **confirmar**: al soltar el arrastre, al tocar ◀ ▶ o al escribir un valor. Un control resuelto queda bloqueado, para que la malla mostrada siempre sea la real. | 2, 3 |
| Modificador equivocado en el menú | Se cierra el menú, no se agrega nada y aparece "Not this one yet". three.js nunca inventa un resultado que Blender no calculó. Lo que el módulo no usa (Boolean, Array…) aparece en el menú pero deshabilitado. | 2 |
| Campos que la lección no usa | Se ven con los valores por defecto de Blender, atenuados. Así se aprende dónde está cada cosa. | 4 |
| Cámara | Q6/Q7 de #8. Además, Blender guarda el ángulo de un render cuadrado; en pantallas verticales se abre el ángulo para que la pieza no se corte. | 4 |
| Sin Internet en Android | Quité el permiso `INTERNET` del APK. Las pruebas fallan si la app pide algo fuera de `/learn/`. | 1 |
| Icono y splash | Icono propio (rombo naranja con ▶). Splash oscuro liso en vez del logo de Capacitor. | Marca |
| `/workspace/` | Sigue funcionando para enlaces viejos, pero ahora sale del mismo `index.html` en el build: ya no hay dos archivos iguales. El espacio de diseño tiene una tarjeta hacia Drafty3D Learn. | 3 |
| Grabar los trazos de escultura | **No usé "computer use"**: no estaba disponible en esta conversación. Hice el equivalente reproducible: la app completa de Blender 5.3 en una pantalla virtual (Xvfb de 1920×1080) y trazos con el ratón real vía `xdotool` (botón abajo → movimientos → botón arriba). Probé antes `sculpt.brush_stroke` desde un script: Blender responde "FINISHED" pero no mueve ni un vértice. Por eso el trazo tiene que pasar por el bucle de eventos, igual que un arrastre de ratón. Cada lección se graba en su propio proceso de Blender, porque los ajustes de pincel persisten dentro de una sesión. | 2 |
| Qué guarda un trazo | El recorrido en 3D (puntos sobre la superficie, ~24), el radio del pincel en metros y cuántos vértices movió Blender. El pipeline falla si un trazo no mueve nada. La malla de antes y la de después tienen los mismos vértices en el mismo orden (lo comprueba el pipeline después de Draco). Así la app reproduce el trazo como una transición vértice a vértice entre dos mallas reales de Blender. three.js no esculpe nada. | 2 |
| Animación del trazo | Grab se mueve de forma uniforme. Los demás pinceles se revelan según el punto del recorrido más cercano a cada vértice, con el mismo tiempo para el vértice espejo en X. El resultado final siempre es exactamente la malla de Blender. | 2, 4 |
| Contenido de escultura | Guijarro (ico sphere de 10 242 vértices, escala 1 × 0.9 × 0.85). Ver: Grab a 300 px, Draw 60 px con Strength 1.0, Subtract y espejo X para ojos (dos vueltas) y media sonrisa, y Smooth a 200 px en tres círculos sobre la punta. Your turn: Grab hacia la izquierda, Draw 50 px, ojos cerrados (línea curva) y boca redonda (un círculo), y Smooth en dos círculos. La primera versión de Smooth (una pasada encima de la cabeza) casi no cambiaba nada; la prueba Blender vs three.js lo detectó y lo cambié. | 6 |
| Cámara de escultura | Frontal y centrada en X, para que la simetría X se vea como espejo. Se usa la misma cámara para grabar en Blender y para mostrar en la app, así la línea punteada cae donde Blender pintó. | 4 |
| Tolerancia del trazo | El trazo vale si cubre ≥ 80 % de la guía, ≥ 75 % de tu recorrido está cerca, mide al menos la mitad de la guía y empieza más cerca del inicio que del final (no se pide en círculos). "Cerca" es el mayor entre 28 px y 1.2 × el radio del aro del pincel en pantalla. Pensado para dedo, no para precisión de ratón. | 3, 4 |
| Repisa de pinceles | Los 70+ pinceles de Blender 5.3, con las pestañas y grupos leídos de sus catálogos. Todos se pueden tocar (para aprender dónde están), pero solo el correcto avanza. Los puntos de color por grupo son propios, no los iconos de Blender. | 2, 4 |
| + / − en Smooth | Blender no muestra + / − para Smooth (su dirección es "Smooth"), así que la app tampoco. | 2 |
| Layout de escultura | En celular, la vista 3D va arriba y el header y la repisa abajo. En PC van en la columna derecha, donde están los Properties en los modificadores. En Blender el header está encima de la vista y la repisa abajo de ella; lo reacomodé para el pulgar. | 4 |
| Inicio | Las lecciones se agrupan por módulo (Modifiers, Sculpting). Dentro de cada módulo van de la más fácil a la más nueva, cada Ver seguida de su Your turn (`WATCH_ORDER` en `build-examples.mjs`). | 4 |
| Más ejemplos de modificadores | Agregué **Simple Deform** (Twist) sobre **Bevel**. Probé también **Wireframe** (lámpara de alambre) y lo descarté: con el grosor por defecto de Blender (0.02 m) los alambres miden unos pocos píxeles y la comparación Blender vs three.js no puede distinguir un error real del antialiasing de los bordes. Aflojar la prueba la dejaba ciega para pasos que sí cambian (bowl, boulder), así que preferí quitar la lección antes que publicar algo sin verificar. | 2 |
| Botones de opción (Axis, Mode) | Los enums que Blender dibuja expandidos son una fila de botones. En Your turn solo la fila del paso actual es tocable; al acertar se queda iluminada la opción elegida. El valor se compara como texto (`"Z"`), sin `step`. | 2, 4 |
| Ángulos | Se muestran y se cambian en grados, como en Blender, y los límites también (±360°). Antes los límites venían en radianes (±6.28) y ◀ ▶ se habría detenido en 6°; la nueva prueba del cirio lo cubre. | 2 |
| Pinceles de arrastre | Snake Hook (y Grab, Elastic, Thumb, Pose, Rotate, Boundary) se graban sobre el plano de profundidad inicial y se animan de forma uniforme; el timeline lo marca con `stroke.drag`. | 2 |
| Trazos de ida y vuelta | Crease Polish, Scrape/Fill y Draw Sharp casi no cambiaban nada con una pasada y la fuerza por defecto; la prueba Blender vs three.js lo detectó ("must look different"). Ahora suben Strength a 1.0 y repasan la línea. | 2, 6 |
| Máscara visible | La máscara de Blender viaja en cada malla (`_MASK`) y la app la oscurece solo en Sculpt Mode, como Blender. Un trazo de Mask no cambia la forma, así que no se le pide "verse distinto"; una prueba unitaria exige en cambio que su malla tenga más máscara que la anterior. Pinté la máscara antes de Multires: comprobé que Blender la pasa a los niveles subdivididos. | 2 |
| Remesh y Multires en la app | Rehacen la malla entera, así que la app cambia de malla en vez de interpolar. La comprobación de topología compartida ahora solo mira los pares de trazo. Multires Subdivide sobre una superficie lisa casi no cambia lo que se ve: no se le pide "verse distinto", y una prueba unitaria exige que la malla gane el nivel nuevo de Blender. | 2 |
| Un editor por paso | En Blender, el workspace Sculpting muestra Properties junto a la vista 3D. En un celular solo cabe un panel, así que una lección de escultura con Multires muestra Properties en los pasos de modificador y el header y la repisa en los demás. | 4 |
| Triángulos fijos | El exportador de glTF corta cada cuadrado por su diagonal más corta; un trazo podía voltear algunas y romper la animación vértice a vértice. Ahora se triangula con diagonal fija antes de exportar y de renderizar la referencia. | 2 |
| Textos que dicen lo que pasa | Cuando Blender no hizo lo que el texto prometía, cambié el texto: Blob solo forma una bolita en la antena; Subdivide acorta un poco las puntas delgadas (las orejas del troll, los cuernos del imp); el jalón de arriba del imp hace un pico, no una cabeza alta. | 6 |
| Releases | Un release fijo `learn-preview` que se reemplaza en cada build. El `versionCode` es el número de ejecución del workflow, así cada APK es más nuevo que el anterior. | 5 |

## Cómo se verifica

- `npm test`: comprueba el contrato pipeline ↔ UI. Cada ID de los timelines existe en lo que se leyó de Blender (también modo, pinceles y campos del header de escultura), cada malla existe, los valores caen en su paso fijo, cada trazo movió vértices de verdad y cada Your turn usa las mismas herramientas que su Ver. También prueba la lógica del candado y la regla del trazo. Una prueba exige que **ningún paso llegue ya resuelto**, en Ver y en Your turn: así encontré que Blender arrastraba Strength y Subtract de la primera lección a la segunda, y que Draw Sharp ya empieza en Subtract. Cada Ver debe tener exactamente un Your turn, y cada valor debe poder alcanzarse con ◀ ▶ dentro de los límites de Blender.
- `npm run test:browser` (después de `npm run build`):
  - **Blender vs three.js por paso** (`tests/browser/learn-verify.spec.mjs`). Blender renderiza las normales del objeto como colores; three.js dibuja lo mismo con el cargador y la cámara de la app. Umbrales: IoU ≥ 0.99, diferencia media ≤ 0.006, píxeles malos ≤ 1 %. Los pasos correctos dan ≤ 0.004 y la malla del paso anterior da ≥ 0.009, así que la prueba sí puede fallar. Esta prueba encontró dos errores reales que ya están corregidos: los niveles Render vs Viewport de Subdivision y el Amount del bowl que no cambiaba nada.
    La prueba recorre todas las lecciones de `index.json`. Las de escultura pasan con los mismos umbrales en todos sus pasos, incluida la condición de que cada trazo cambie lo que se ve.
  - Recorridos completos de Ver y Your turn en tamaño celular, sin peticiones fuera de `/learn/` y sin errores de página. En escultura, la prueba dibuja cada trazo con el ratón sobre la guía proyectada, incluidos un trazo fuera de la línea y uno al revés.

## Regenerar los ejemplos

Solo hace falta si cambian los scripts de `learn/pipeline/`. Se hace en el entorno del agente, no en tu PC:

```bash
python3.13 -m venv learn/pipeline/.venv && learn/pipeline/.venv/bin/pip install -r learn/pipeline/requirements.txt
```

```bash
npm run learn:examples
```

Esto graba cada lección con `bpy==5.3.0`, comprime las mallas con Draco (`gltf-transform`, verificando que de verdad se aplicó) y actualiza los renders de referencia de `tests/fixtures/learn/`. El contrato de datos está en [PIPELINE_CONTRACT.md](PIPELINE_CONTRACT.md).

Escultura necesita además la app completa de Blender (no `bpy`), Xvfb y xdotool:

```bash
sudo apt-get install -y xvfb xdotool
```

```bash
learn/pipeline/get-blender.sh
```

```bash
npm run learn:examples -- --only=sculpt
```

`get-blender.sh` descarga Blender 5.3.0 de download.blender.org a `learn/pipeline/.blender/` (ignorado por git) y verifica su sha256. `--only=modifiers` o `--only=sculpt` graba un solo módulo; `--skip-blender` solo vuelve a empaquetar lo que ya está en `.out`. Con `LEARN_DEBUG=1` el grabador guarda una captura de la ventana de Blender después de cada trazo. Los scripts son `learn/pipeline/blender/sculpt.py` (grabador) y `build_sculpt.py` (lecciones). Cada nombre de la tupla `LESSONS` de `build_sculpt.py` se graba en su propio proceso de Blender; `LEARN_SCULPT_ONLY=rock` graba solo esa y conserva las demás que ya están en `.out/sculpt`. No corras `--only=modifiers` al mismo tiempo que una grabación de escultura: los dos reescriben `learn/public/examples/`.

## Limitaciones conocidas

- **Orden de los campos en los paneles de modificadores.** Blender los dibuja en C y ese código no viene en `bpy`. El orden y unos pocos textos ("Amount", "Levels Viewport", "Render", "Rim / Fill") salen de ese código fuente, no de una extracción automática. Lo mismo pasa con el orden de las pestañas de Properties; omití la pestaña nueva "Compositor & Effects" porque no pude confirmar su posición. Vale la pena compararlos con Blender 5.3 real.
- **Vista 3D.** No hay contorno naranja de selección ni wireframe: es sombreado tipo *Solid*.
- **Tamaño.** El build pesa unos 2.2 MB. Vite incluye las tres variantes del decodificador Draco que referencia three.js (~1 MB que no se usa).
- **Android 7.x.** En esas versiones aún se ve el icono por defecto de Capacitor; desde Android 8 sale el icono propio.
- **Escultura: posición del pincel.** El trazo se graba en una ventana de 1920×1080. Size está en píxeles de pantalla, como en Blender, así que el mismo número en otra pantalla daría otro radio en metros. La app muestra el radio grabado, no lo recalcula.
- **Escultura: más pinceles.** Tienen lección Grab, Draw, Smooth, Snake Hook, Inflate/Deflate, Crease Polish, Crease Sharp, Clay Strips, Scrape/Fill, Draw Sharp, Mask, Blob, Pose y Elastic Grab. Los demás se pueden tocar en la repisa, pero no hacen nada fuera de la lección.
- **Escultura: popover de Remesh y panel de Multires.** Solo los controles que usa la lección hacen algo; los demás (Fix Poles, Unsubdivide, Delete Higher…) se ven pero están desactivados.
- **Escultura: la rejilla.** El guijarro está centrado en el origen, así que la rejilla del suelo lo corta por la mitad, igual que en Blender.
- **Escritorio.** El diseño está pensado primero para celular. En PC funciona, pero está menos pulido.
- **Builds de Vercel.** Las tres ramas `research/*` del mapa salieron de un commit sin `ignoreCommand` y gastaron tres builds de preview. Desde entonces, toda rama nueva lo incluye.
