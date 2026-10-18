# Selección local y modos de Atlas

La barra de modos presenta Croquis, Diseño paramétrico, Ensamblaje y Malla, en ese orden. Ensamblaje es un espacio reservado y no añade operaciones. Cambiar de modo no convierte la geometría. La edición libre de caras y vértices poligonales corresponde a Malla; esta entrega permite inspeccionar sus puntos, pero todavía no deformarlos.

## Mover una pieza

Sin otra herramienta activa, pulsar una pieza sólida o una malla activa Mover. El mismo gesto permite arrastrarla; un clic sin desplazamiento no modifica el proyecto. La previsualización reutiliza los buffers y solo al soltar se confirma una operación. Deshacer revierte el gesto completo y Esc cancela un movimiento pendiente. Un clic con Ctrl/Mayús conserva la selección múltiple. Las herramientas de croquis, elección de planos/caras y los formularios de operación tienen prioridad.

## Redondear una selección

1. Seleccionar una pieza visible en Documento.
2. Elegir Aristas o Vértices / puntos en el selector del visor.
3. Pulsar elementos visibles; Ctrl o Mayús añade o quita elementos. Arrastrar sigue girando la cámara.
4. Pulsar Redondear selección y elegir el radio. Para un vértice se utilizan las aristas que llegan a él, indicadas en Operación y resaltadas en el visor.
5. Aplicar. Un radio incompatible conserva el proyecto anterior. Deshacer, rehacer y el archivo JSON conservan el alcance local del redondeo.

Las aristas son curvas BRep reales, no diagonales de triangulación. OpenCascade puede propagar el redondeo por una cadena tangente y no admite todos los radios ni todas las combinaciones de aristas. Los puntos de un croquis se modifican con Editar perfil; los vértices de una malla solo muestran sus coordenadas y no ofrecen redondeos BRep. El comando de redondeo sin una selección local mantiene su alcance sobre todas las aristas compatibles.

## Referencias y rendimiento

La topología se solicita al worker al activar la selección detallada. Se conserva una sola descripción en caché por lado, reutilizada mientras coincide la revisión. La selección y su resaltado no reconstruyen el sólido ni sustituyen sus buffers. No se añade un bucle de render ni búsqueda continua de elementos durante el movimiento del puntero. Se aplican límites a las descripciones de geometría muy densa y los overlays se liberan al salir del modo.

Un redondeo local guarda `params.edges` (índice y firma geométrica normalizada) y `params.edgeCount`. La normalización permite conservar referencias al trasladar o redimensionar primitivas compatibles. El motor verifica recuento y firmas antes de aplicar el redondeo; si dejan de coincidir, pide volver a seleccionar y conserva el documento anterior. Es una comprobación conservadora, no un sistema general de nombres topológicos para cualquier modificación de una BRep importada. Los redondeos antiguos sin estos campos siguen siendo válidos.
