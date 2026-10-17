# Drafty3D · Atlas

CAD básico en el navegador: sólidos paramétricos, croquis, edición directa con controles, STEP/STL y conversión controlada a malla. El motor OpenCascade.js funciona en un worker local; Three.js dibuja con WebGL2. No requiere cuenta, claves ni servidor de geometría.

## Probar en local

Requisitos: **Node.js 22.23.3 o posterior**, npm y `tar` (Git Bash incluye tar en Windows).

```sh
npm ci
npm run dev
```

Abrir `http://127.0.0.1:4187/cad/`. `PORT=4190 npm run dev` cambia el puerto. Para probar el paquete que se publicaría:

```sh
npm run build
npm run preview
```

La vista compilada usa el puerto **4188**. El primer build descarga archivos fuente de OpenCascade desde GitHub y verifica sus SHA-256; las descargas posteriores reutilizan `.cad-source-cache/`. En el entorno cloud con proxy, activar `NODE_USE_ENV_PROXY=1` con Node 22.23.3 y conservar la configuración de certificados del entorno. En una máquina local sin proxy no hace falta esa variable.

## Qué se puede hacer

- **Atlas:** cinta superior por disciplinas, Documento y Operación a la izquierda, paneles plegables y tamaños ajustables con ratón o flechas sobre los separadores. La búsqueda (`Ctrl+K`) y la cinta activan los mismos comandos.
- **CAD:** crear bloques, cilindros y esferas; editar dimensiones, posición y color; combinar sólidos y redondear. Las herramientas se configuran en Operación, sin tapar el modelo con un diálogo.
- **Croquis:** dibujar en XY/XZ/YZ o en una cara plana, arrastrar puntos y radios, extruir, añadir o cortar. Mover puntos de un croquis conserva el modelo paramétrico.
- **Manipulación:** G para mover y R para girar; arrastrar el cuerpo o sus ejes/anillos, ajuste de 1 mm / 15°, Esc para cancelar. F encuadra; Ctrl+Z / Ctrl+Y deshacen y rehacen.
- **Malla:** seleccionar un sólido visible y pulsar Convertir a malla. Revisar la advertencia, guardar el proyecto CAD si se desea, ajustar la resolución y previsualizar. Al confirmar, se crea una copia independiente y el CAD original queda oculto y editable en Documento. Se puede deshacer. Cambiar de pestaña nunca convierte una pieza.
- **Archivos:** guardar/reabrir proyectos JSON, importar STEP y STL, exportar los sólidos visibles como STEP o el conjunto visible como STL. Una malla no recupera automáticamente sus operaciones CAD ni se puede exportar como sólido STEP.

La resolución controla la desviación geométrica y el muestreo angular. Se muestra el número real de triángulos y se mide dibujo y selección en la escena actual para estimar el máximo recomendado. Un límite de 250.000 triángulos visibles en la conversión contiene el coste de memoria, guardado y selección. No es una garantía de FPS para cualquier equipo o proyecto; el sistema puede recomendar menos resolución. Las piezas planas pueden necesitar los mismos triángulos en varios niveles.

El proyecto se guarda localmente en el navegador. Si el almacenamiento está lleno, el editor avisa y ofrece guardar un archivo. Los proyectos del editor de origen se pueden abrir como JSON; los almacenes de ambos sitios son independientes.

## Rendimiento

El viewport dibuja bajo demanda y agrupa solicitudes en un solo frame. No mantiene un bucle permanente al estar quieto. Girar la cámara y previsualizar un movimiento no llaman a OpenCascade; soltar el gesto confirma una operación geométrica. Los cambios de nombre, visibilidad o color reutilizan la geometría. El worker devuelve buffers solo de las piezas modificadas y sus dependencias; los demás objetos conservan sus buffers y aristas en GPU. En mallas densas se evita construir una red adicional de aristas. Los croquis agrupan sus actualizaciones por frame.

WebGL2 ya utiliza la GPU. OpenCascade se ejecuta en CPU/WASM; cambiar a WebGPU no lo aceleraría automáticamente. La medición de conversión sincroniza brevemente la GPU para obtener una muestra de trabajo real; la navegación normal no lo hace.

## Comprobaciones

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

La suite de navegador inicia su propio preview en el puerto 4193 y utiliza un worker. Para usar un Chromium ya instalado, establecer `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` a su ejecutable. Los informes, trazas de fallos y descargas quedan en `artifacts/browser/`.

## Publicación aplazada

**No desplegar hasta la revisión local del usuario.** Los commits de esta entrega llevan `[skip netlify] [skip ci]`. Mantener ambos indicadores en cualquier commit que se suba durante esta fase:

```sh
git commit -m "Descripción del cambio [skip netlify] [skip ci]"
git push origin HEAD
```

`[skip netlify]` evita el build automático de Netlify asociado al commit; `[skip ci]` omite los workflows compatibles de CI. No ejecutar deploys manuales, hooks de build ni un nuevo commit sin esos indicadores durante la revisión. La configuración futura de Netlify compila con `npm run build`, publica `dist`, usa Node 22 y abre `/cad/` desde la portada.

## Límites y procedencia

La primera versión no incluye un editor poligonal de vértices/aristas, paneles desacoplables, solver de restricciones, identificación topológica general, ensamblajes o WebGPU. La referencia a una cara CAD utiliza índice y número de caras, y puede requerir redefinir el apoyo si cambia la topología. Los controles directos editan parámetros y croquis; no deforman arbitrariamente cualquier sólido BRep.

La base geométrica procede de `RubenDarioMena/Courses-RDM`, commit `2e5c5e318d20f1378058dfb9e91447322083dfbd`. Se conservan sus operaciones, pruebas y avisos upstream. [Arquitectura y decisiones de esta entrega](docs/cad/ATLAS.md). [Documentación de origen](docs/cad/ORIGEN_CAD.md). Las fuentes y licencias de las bibliotecas se publican junto al WASM en `/cad/legal.html`.

El [laboratorio de cinco interfaces](docs/investigacion/propuestas-ui.html) y la [investigación de funciones](docs/investigacion/comparativa-cad.html) siguen disponibles como antecedentes.
