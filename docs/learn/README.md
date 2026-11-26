# Drafty3D Learn: guía de prueba y decisiones

Prototipo del módulo **Modificadores**. Incluye una lección para ver (la taza, *Low-poly cup*) y una práctica (*Your turn: bowl*). Todo funciona sin conexión: en el navegador y en el APK.

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
| Releases | Un release fijo `learn-preview` que se reemplaza en cada build. El `versionCode` es el número de ejecución del workflow, así cada APK es más nuevo que el anterior. | 5 |

## Cómo se verifica

- `npm test`: comprueba el contrato pipeline ↔ UI. Cada ID de los timelines existe en lo que se leyó de Blender, cada malla existe, los valores caen en su paso fijo y el bowl usa las mismas herramientas que la taza. También prueba la lógica del candado.
- `npm run test:browser` (después de `npm run build`):
  - **Blender vs three.js por paso** (`tests/browser/learn-verify.spec.mjs`). Blender renderiza las normales del objeto como colores; three.js dibuja lo mismo con el cargador y la cámara de la app. Umbrales: IoU ≥ 0.99, diferencia media ≤ 0.006, píxeles malos ≤ 1 %. Los pasos correctos dan ≤ 0.004 y la malla del paso anterior da ≥ 0.009, así que la prueba sí puede fallar. Esta prueba encontró dos errores reales que ya están corregidos: los niveles Render vs Viewport de Subdivision y el Amount del bowl que no cambiaba nada.
  - Recorridos completos de Ver y Your turn en tamaño celular, sin peticiones fuera de `/learn/` y sin errores de página.

## Regenerar los ejemplos

Solo hace falta si cambian los scripts de `learn/pipeline/`. Se hace en el entorno del agente, no en tu PC:

```bash
python3.13 -m venv learn/pipeline/.venv && learn/pipeline/.venv/bin/pip install -r learn/pipeline/requirements.txt
```

```bash
npm run learn:examples
```

Esto graba cada lección con `bpy==5.3.0`, comprime las mallas con Draco (`gltf-transform`, verificando que de verdad se aplicó) y actualiza los renders de referencia de `tests/fixtures/learn/`. El contrato de datos está en [PIPELINE_CONTRACT.md](PIPELINE_CONTRACT.md).

## Limitaciones conocidas

- **Orden de los campos en los paneles de modificadores.** Blender los dibuja en C y ese código no viene en `bpy`. El orden y unos pocos textos ("Amount", "Levels Viewport", "Render", "Rim / Fill") salen de ese código fuente, no de una extracción automática. Lo mismo pasa con el orden de las pestañas de Properties; omití la pestaña nueva "Compositor & Effects" porque no pude confirmar su posición. Vale la pena compararlos con Blender 5.3 real.
- **Vista 3D.** No hay contorno naranja de selección ni wireframe: es sombreado tipo *Solid*.
- **Tamaño.** El build pesa unos 2.2 MB. Vite incluye las tres variantes del decodificador Draco que referencia three.js (~1 MB que no se usa).
- **Android 7.x.** En esas versiones aún se ve el icono por defecto de Capacitor; desde Android 8 sale el icono propio.
- **Escritorio.** El diseño está pensado primero para celular. En PC funciona, pero está menos pulido.
- **Builds de Vercel.** Las tres ramas `research/*` del mapa salieron de un commit sin `ignoreCommand` y gastaron tres builds de preview. Desde entonces, toda rama nueva lo incluye.
