# Atlas · Primera integración CAD

Decisiones aceptadas: Atlas, Documento sobre Operación en el panel izquierdo, conversión explícita por pieza con posibilidad de guardar antes y conservar el CAD original, resolución ajustable según la escena y edición directa limitada a parámetros/croquis compatibles. La primera integración se mantuvo en revisión local; la segunda entrega cuenta con autorización para publicar en `main` y Netlify.

## Separación de responsabilidades

- `document.js`: documento declarativo, validación, historial y archivos. El tipo `mesh` almacena una instantánea STL binaria en base64 y la resolución elegida. No referencia al sólido original: editarlo o eliminarlo no altera la malla. Los documentos CAD versión 1 existentes siguen siendo legibles.
- `kernel.js` y `kernel-worker.js`: OpenCascade completo, BRep, caché de dependencias, triangulación, conversión y STEP/STL. Cada geometría obtiene una revisión que cambia también al cambiar una dependencia; un motor reiniciado usa un identificador nuevo.
- `mesh-quality.js`: niveles de resolución, límite de triángulos, estimación conservadora y serialización STL. La conversión copia profundamente la BRep sin malla previa, de modo que bajar resolución no reutiliza una triangulación fina ni modifica el sólido original. Una lectura STL intermedia elimina degenerados y verifica la representación que se reabrirá.
- `viewport.js`: Three.js, cámara, selección, preview y render bajo demanda. No calcula booleanas ni confirma parámetros durante los eventos pointermove.
- `interactions.js`, `sketch.js`, `placement.js`: gestos, edición de perfiles y un commit por gesto terminado; Esc restaura el estado anterior.
- `ui.js`: catálogo de comandos compartido por cinta/búsqueda, disciplina y paneles. Sus preferencias de tamaño usan una clave local independiente del documento.
- `app.js`: sesión, transacciones, persistencia, panel de operación y mensajes. Un error conserva el documento anterior. Convertir requiere una previsualización válida de la resolución actual.

## Conversión y rendimiento

La conversión afecta solo a la pieza elegida. El sólido original se oculta y permanece editable; otros sólidos y sus dependencias no cambian. Deshacer revierte la creación y la ocultación juntas. El botón Guardar archivo antes descarga la versión CAD previa. Cancelar no modifica el documento.

La teselación ajusta desviación en mm y tolerancia angular. Se limita el número de triángulos antes de materializar los arrays de la nueva malla. Se mide el dibujo de la escena y una selección mediante rayos en ocho frames con pequeñas variaciones de cámara; se usa el percentil 75 para estimar el nivel recomendado. Esta muestra incluye las demás piezas visibles y no sustituye mediciones prolongadas en hardware real. Una escena que excede el tiempo o el presupuesto conservador pide ocultar piezas/reducir resolución.

El render se solicita con requestAnimationFrame y no se repite si nada cambia. Los parámetros geométricos se comparan antes de evaluar: nombre/color/visibilidad no invocan el worker. Las revisiones del kernel permiten evitar copiar buffers y recrear geometría/aristas de piezas sin cambios. Las previsualizaciones de croquis se agrupan por frame; el resaltado de una misma cara conserva su buffer.

La renderización real de una cámara que se mueve sigue siendo necesaria: el encuadre cambia. La optimización consiste en conservar la geometría y dibujar una vez por frame, sin reconstruir sólidos. WebGPU no forma parte de esta entrega.

## Verificación y continuación

Las pruebas unitarias ejercitan el motor WASM real, perfiles, dependencias, transformación, persistencia, conversión, límites y caché. Las de navegador prueban la disposición izquierda, herramientas inline, búsqueda, manipulación, croquis, recuperación, STEP/STL, conversión/cancelación/guardado/deshacer/recarga y ausencia de trabajo geométrico al cambiar la cámara o la apariencia. Linux Chromium con render por software es la comprobación cloud; las pruebas del antiguo repositorio en Windows no certifican esta interfaz nueva.

Revisar localmente a escala 100 % y en un portátil antes de publicar. El arrastre libre de paneles, edición poligonal y referencias topológicas persistentes quedan para entregas posteriores. La migración conserva las páginas de investigación y no modifica el sitio de cursos.

## Segunda entrega: croquis independientes

El documento ya distingue perfiles guardados (`sketch`) y extrusiones que los referencian (`params.sketch`). La navegación de cámara se mantiene activa al dibujar y los rectángulos/círculos admiten medidas exactas. [Detalle, compatibilidad y continuación](CROQUIS.md).
