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
- **Idiomas:** cambia entre español e inglés desde la barra superior. La preferencia se conserva en este navegador; los nombres de piezas y proyectos permanecen como los escribió el usuario. Las traducciones se centralizan en `cad/i18n.js` y los textos de la interfaz usan claves semánticas, incluidos términos de croquis, operaciones paramétricas, BRep y malla poligonal.
- **CAD:** crear bloques, cilindros y esferas; editar dimensiones, posición y color; combinar sólidos y redondear. Las herramientas se configuran en Operación, sin tapar el modelo con un diálogo.
- **Croquis:** dibujar en XY/XZ/YZ o en una cara plana; introducir esquina, ancho y alto de rectángulos o centro y radio de círculos. **Terminar croquis** guarda un perfil independiente sin volumen. **Extruir croquis** crea una operación vinculada; editar el perfil reconstruye sus extrusiones y cortes. **Continuar a volumen** permite dibujar y extruir en un solo recorrido. Los proyectos anteriores con perfiles dentro de una extrusión siguen siendo editables.
- **Navegar al dibujar:** botón derecho para girar, Mayús + derecho o botón central para desplazar, rueda para acercar. **Mirar de frente al plano** recupera la vista de dibujo. Navegar conserva el contorno y la previa entre dos clics.
- **Manipulación:** G para mover y R para girar; arrastrar el cuerpo o sus ejes/anillos, ajuste de 1 mm / 15°, Esc para cancelar. F encuadra; Ctrl+Z / Ctrl+Y deshacen y rehacen.
- **Malla:** seleccionar un sólido visible y pulsar Convertir a malla. Revisar la advertencia, guardar el proyecto CAD si se desea, ajustar la resolución y previsualizar. Al confirmar, se crea una copia independiente y el CAD original queda oculto y editable en Documento. Se puede deshacer. Cambiar de pestaña nunca convierte una pieza.
- **Archivos:** guardar/reabrir proyectos JSON, importar STEP y STL, exportar los sólidos visibles como STEP o el conjunto visible como STL. Una malla no recupera automáticamente sus operaciones CAD ni se puede exportar como sólido STEP.

La resolución controla la desviación geométrica y el muestreo angular. Se muestra el número real de triángulos y se mide dibujo y selección en la escena actual para estimar el máximo recomendado. Un límite de 250.000 triángulos visibles en la conversión contiene el coste de memoria, guardado y selección. No es una garantía de FPS para cualquier equipo o proyecto; el sistema puede recomendar menos resolución. Las piezas planas pueden necesitar los mismos triángulos en varios niveles.

El proyecto se guarda localmente en el navegador. Si el almacenamiento está lleno, el editor avisa y ofrece guardar un archivo. Los proyectos del editor de origen se pueden abrir como JSON; los almacenes de ambos sitios son independientes.

## Construir desde cero

1. Pulsar **Nuevo → Crear mi primer croquis** y elegir un plano.
2. Dibujar un rectángulo o introducir ancho **40** y alto **30**; pulsar **Aplicar medidas**.
3. Pulsar **Terminar croquis**. El perfil queda en Documento y se guarda en el proyecto sin extrusión.
4. Seleccionarlo y pulsar **Extruir croquis**, introducir profundidad **8** y aplicar.
5. Crear un croquis sobre una cara, dibujar un círculo y continuar a volumen con resultado **Cortar una pieza**.
6. Seleccionar la extrusión original y **Editar perfil** para cambiar sus medidas. Al guardar se reconstruyen sus operaciones dependientes.

Los croquis se distinguen con la etiqueta CROQUIS en Documento. Las operaciones muestran enlaces a sus fuentes. STEP/STL exportan los sólidos y las mallas visibles; **Guardar archivo** conserva también los croquis y sus dependencias.

Esta entrega admite un contorno cerrado por croquis. Las medidas son edición exacta del perfil, todavía no un sistema de cotas y restricciones persistentes. [Alcance y continuación](docs/cad/CROQUIS.md).

## Rendimiento

El viewport dibuja bajo demanda y agrupa solicitudes en un solo frame. No mantiene un bucle permanente al estar quieto. Girar la cámara y previsualizar un movimiento no llaman a OpenCascade; soltar el gesto confirma una operación geométrica. Los cambios de nombre, visibilidad o color reutilizan la geometría. Cambiar el idioma actualiza solo texto, accesibilidad y etiquetas; no reconstruye la geometría ni solicita otro frame WebGL. El worker devuelve buffers solo de las piezas modificadas y sus dependencias; los demás objetos conservan sus buffers y aristas en GPU. En mallas densas se evita construir una red adicional de aristas. Los croquis agrupan sus actualizaciones por frame.

WebGL2 ya utiliza la GPU. OpenCascade se ejecuta en CPU/WASM; cambiar a WebGPU no lo aceleraría automáticamente. La medición de conversión sincroniza brevemente la GPU para obtener una muestra de trabajo real; la navegación normal no lo hace.

## Comprobaciones

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

La suite de navegador inicia su propio preview en el puerto 4193 y utiliza un worker. Para usar un Chromium ya instalado, establecer `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` a su ejecutable. Los informes, trazas de fallos y descargas quedan en `artifacts/browser/`.

## Publicación

El sitio de producción es [rdm-drafty3d.netlify.app](https://rdm-drafty3d.netlify.app/cad/), vinculado a la rama `main`. Netlify compila con `npm run build`, publica `dist`, usa Node 22 y abre `/cad/` desde la portada.

Antes de integrar una entrega en `main`, ejecutar las pruebas unitarias, el build y las pruebas de navegador. Verificar después que el deploy de Netlify corresponda al commit publicado y que el editor cargue el motor geométrico en producción.

Los indicadores `[skip netlify] [skip ci]` se usaron en las ramas de revisión iniciales. No deben añadirse al commit que deba iniciar un despliegue.

## Límites y procedencia

La primera versión no incluye un editor poligonal de vértices/aristas, paneles desacoplables, solver de restricciones, identificación topológica general, ensamblajes o WebGPU. La referencia a una cara CAD utiliza índice y número de caras, y puede requerir redefinir el apoyo si cambia la topología. Los controles directos editan parámetros y croquis; no deforman arbitrariamente cualquier sólido BRep.

La base geométrica procede de `RubenDarioMena/Courses-RDM`, commit `2e5c5e318d20f1378058dfb9e91447322083dfbd`. Se conservan sus operaciones, pruebas y avisos upstream. [Arquitectura y decisiones de esta entrega](docs/cad/ATLAS.md). [Documentación de origen](docs/cad/ORIGEN_CAD.md). Las fuentes y licencias de las bibliotecas se publican junto al WASM en `/cad/legal.html`.

El [laboratorio de cinco interfaces](docs/investigacion/propuestas-ui.html) y la [investigación de funciones](docs/investigacion/comparativa-cad.html) siguen disponibles como antecedentes.
