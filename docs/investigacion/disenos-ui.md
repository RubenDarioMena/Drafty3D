# Drafty3D · Cinco propuestas de interfaz

Documento de investigación · 16 de octubre de 2026.

**Actualización:** el usuario eligió Atlas, con Operación debajo de Documento a la izquierda. La primera integración real y su alcance están en [Atlas CAD](../cad/ATLAS.md). Las cinco variantes que siguen son antecedentes del laboratorio; no implican cinco editores en producción.

Prototipo: [propuestas-ui.html](propuestas-ui.html). Investigación previa: [comparativa-cad.html](comparativa-cad.html). Respuesta del usuario: [drafty3d-seleccion-funciones-1.json](drafty3d-seleccion-funciones-1.json).

## 1. Qué cambió con tu respuesta provisional

La nota de «Selección y acceso a herramientas» propone una barra superior con buena parte del catálogo y pestañas para las distintas disciplinas. Esta propuesta toma esa preferencia como hipótesis principal, aunque la petición original criticara la barra anterior. El problema a resolver pasa a ser la organización, legibilidad y capacidad de operar con el ratón, además de la cantidad de herramientas visibles.

Las decisiones del JSON siguen siendo provisionales: 12 familias para incluir, 6 para explorar y 4 para posponer. Ningún diseño implica que todas las funciones estén implementadas o aprobadas para la primera versión.

Interpreto «5 posibles soluciones de AI» como cinco propuestas de interfaz para evaluar. No se incorpora un asistente generativo ni un servicio de IA al producto: ese comportamiento requeriría un objetivo y alcance propios.

### Vocabulario propuesto

| Espacio | Finalidad | Tratamiento inicial |
| --- | --- | --- |
| Croquis | Perfiles, cotas y restricciones en planos | Sustituye el ambiguo «draft»; conserva la relación con el sólido. |
| CAD paramétrico | Crear y modificar con operaciones y dependencias | Cinta de crear, modificar e inspeccionar. |
| CAD directo | Editar caras sin depender de un croquis conductor | Unifica «CAD menos restrictivo» y «modelado directo» cuando se refieran a caras CAD. Una edición directa puede registrarse como operación. |
| Superficies | Construir y revisar superficies abiertas | Espacio exploratorio; no promete continuidad avanzada. |
| Malla | Vértices, aristas, caras y conectividad poligonal | Distingue explícitamente la representación de CAD. |
| Ensamblajes | Instancias, relaciones y movimiento entre piezas | Pospuesto. Visible como futuro en el laboratorio, no requisito de lanzamiento. |

Inspeccionar, medir, guardar y buscar son capacidades transversales. Chapa, planos y extensiones quedan pospuestos. Esculpido puede ser una sección de Malla al explorarlo, sin crear otra pestaña desde el principio.

## 2. Qué puede probar el tester

Abrir `http://127.0.0.1:4187/docs/investigacion/propuestas-ui.html` o el archivo HTML directamente. El documento es autónomo; no usa dependencias remotas.

El selector de cinco diseños permanece en la cabecera en escritorio y se puede usar en cualquier momento. En pantallas estrechas la cabecera deja de ser fija para no cubrir el editor; se vuelve a ella desplazando la página. Cambiar diseño conserva en la sesión la selección, pestaña de disciplina, operación, altura, posición, vista previa pendiente, orientación, historial de deshacer y evaluaciones. Las herramientas que cambian de lugar ejecutan el mismo flujo.

El prototipo permite:

- Seleccionar el soporte desde el lienzo o desde el árbol; quitar la selección.
- Cambiar entre disciplinas y buscar herramientas por nombre.
- Editar altura de 30 a 100 mm mediante campo o control naranja, y posición X de −40 a 40 mm mediante campo o control naranja.
- Aplicar, cancelar, deshacer y rehacer los cambios confirmados del ejemplo.
- Arrastrar el lienzo para cambiar su orientación ilustrativa y recuperar la orientación inicial.
- Consultar medidas y fichas de herramientas conceptuales.
- Evaluar cada diseño con puntuación y notas; descargar las cinco evaluaciones como JSON.

La pieza es una ilustración vectorial proyectada, no un sólido calculado por OpenCascade. Su geometría simplificada permite comprobar el flujo y la conservación del estado. No se debe usar para evaluar precisión geométrica, calidad de fillets, cámara CAD, selección de caras o rendimiento del motor.

«Extruir» y «Mover» son simulaciones editables del soporte existente. No crean operaciones CAD reales. Las otras herramientas abren una ficha conceptual y deshabilitan Aplicar. Cambiar a Malla conserva la pieza CAD e informa que sería necesaria una copia de malla; no simula una conversión invisible. La banda de historial de Secuencia consulta operaciones, pero no las reordena ni reconstruye el modelo.

Las medidas confirmadas, diseño, disciplina y notas se conservan en almacenamiento local si está disponible. Los borradores y deshacer/rehacer se conservan al alternar diseños durante la sesión, pero no al recargar. Los orígenes `file://` y `http://127.0.0.1:4187` pueden tener almacenes distintos; para evaluar de forma continua conviene usar siempre la misma URL. El JSON exportado es el registro portable de la evaluación; este prototipo no incluye importación de evaluaciones.

## 3. Diseño 01 · Atlas

**Idea:** cinta completa por disciplinas, árbol a la izquierda, lienzo central e inspector estable a la derecha.

Es la interpretación más próxima a tu nota: las pestañas superiores cambian un catálogo visible, organizado por intención y con nombres. La interfaz usa fondos claros, contraste suave y verde para estado activo. Los controles principales mantienen posiciones previsibles.

**Recorrido de ejemplo:** CAD paramétrico → Crear → Extruir → ajustar altura en el inspector o arrastrar el control del lienzo → Aplicar. Las acciones junto a la selección son un acceso adicional al mismo comando.

**Qué resuelve:** descubrimiento del catálogo, acceso a medidas mientras se trabaja y previsibilidad. Permite aprender los grupos sin memorizar iconos ni depender de un popup.

**Coste y riesgo:** la cinta y los paneles consumen espacio. Al crecer las funciones, las filas no deben convertirse en una colección uniforme de botones diminutos. Priorizar grupos, etiquetas y un mecanismo de desbordamiento accesible. El prototipo usa desplazamiento horizontal en la cinta cuando no cabe.

**Primer paso real:** conservar la estructura de tres zonas del editor de origen; introducir pestañas y un registro de comandos antes de cambiar los gestos existentes. Conectar primero las herramientas que ya funcionan.

**Qué decidir en la prueba:** ¿se encuentra Extruir sin buscar?, ¿el inspector se siente demasiado lejos?, ¿los nombres evitan dudas?, ¿el tamaño del lienzo sigue siendo suficiente?

## 4. Diseño 02 · Foco

**Idea:** cinta compacta y panel de operación visualmente flotante sobre un espacio oscuro y amplio.

Mantiene las disciplinas arriba, pero reduce la altura de los grupos. El árbol tiene menos peso visual, las acciones próximas a la pieza ganan protagonismo y el inspector se presenta como una tarjeta de trabajo.

**Recorrido de ejemplo:** seleccionar soporte → Mover junto a la pieza → arrastrar o introducir X → confirmar en el panel de operación.

**Qué resuelve:** desplazamientos frecuentes del cursor y competencia visual entre controles y pieza. Es una opción para quien ya conoce las herramientas y dedica más tiempo al lienzo.

**Coste y riesgo:** una cinta compacta comunica peor la jerarquía y los catálogos grandes requieren más búsqueda. En una implementación real, el panel flotante debe evitar cubrir la selección y ofrecer acoplamiento. El prototipo lo coloca en una columna reservada: no implementa colocación automática ni arrastre del panel.

**Primer paso real:** compartir el registro de comandos de Atlas y ofrecer densidad compacta; reutilizar las interacciones y el inspector sin duplicar lógica. Evaluar el menú contextual sobre selecciones reales antes de ampliar su tamaño.

**Qué decidir en la prueba:** ¿se prefiere la acción contextual o la cinta?, ¿se pierde descubrimiento?, ¿el panel ayuda a concentrarse?, ¿las etiquetas siguen siendo legibles?

## 5. Diseño 03 · Taller

**Idea:** las disciplinas permanecen arriba y despliegan un catálogo detallado lateral, con propiedades a la derecha.

Esta variante contrasta explícitamente la preferencia provisional por concentrar herramientas arriba. Su apuesta es dedicar la altura de la izquierda a grupos con etiquetas, liberar la altura central y mantener las pestañas como navegación común. Usa acento azul y superficies claras.

**Recorrido de ejemplo:** Croquis → Dibujar en catálogo lateral → Rectángulo; volver a CAD paramétrico → Extruir → editar en propiedades.

**Qué resuelve:** catálogos extensos y agrupación vertical. Las etiquetas no compiten por una única fila superior. Es especialmente útil para comparar cómo se exploran funciones poco conocidas.

**Coste y riesgo:** ocupa ancho, separa la herramienta y sus propiedades y obliga a convivir con el árbol. En la aplicación real, catálogo y árbol necesitarían secciones plegables y tamaños ajustables. No conviene ocultar la pieza para dar cabida a una lista creciente.

**Primer paso real:** reutilizar el registro de herramientas en un segundo componente de navegación. La misma selección y el mismo inspector deben funcionar con independencia de dónde se active el comando.

**Qué decidir en la prueba:** ¿se descubre más fácilmente una herramienta?, ¿se pierde demasiado ancho?, ¿se confunde catálogo con árbol?, ¿resulta más cómodo que la cinta?

## 6. Diseño 04 · Secuencia

**Idea:** cinta superior y árbol de cuerpos, con una banda inferior para la secuencia de construcción.

El historial recibe una región propia. La interfaz oscura hace visibles los pasos sin mezclarlos con los objetos finales. Se prioriza entender qué operación produce cada resultado y volver a ella para editar.

**Recorrido de ejemplo:** pulsar Extrusión en el historial → cambiar altura → revisar → aplicar. Consultar Taladro abre su ficha, diferenciando consulta y edición disponible.

**Qué resuelve:** descubrir el origen de una pieza y orientar la edición paramétrica. La secuencia puede convertirse en un punto de entrada más claro que una lista que mezcla cuerpos, croquis y operaciones.

**Coste y riesgo:** pierde altura y una banda horizontal escala peor con cientos de operaciones. Deberá permitir búsqueda y agrupación. Reordenar, suprimir o retroceder exige un modelo de dependencias fiable, referencias persistentes y recuperación de errores; una línea de tiempo bonita no proporciona estas garantías.

**Primer paso real:** mostrar el historial actual en lectura y permitir editar solo parámetros ya soportados. Después incorporar estados pendiente, reconstruyendo, válido y fallido. No empezar por arrastrar pasos para reordenarlos.

**Qué decidir en la prueba:** ¿se entiende cómo fue creada la pieza?, ¿se distingue cuerpo de operación?, ¿se pierde demasiado lienzo?, ¿el historial mejora tareas de revisión?

## 7. Diseño 05 · Guía

**Idea:** una secuencia de tarea visible junto al catálogo completo: elegir geometría, dar volumen y revisar.

Acompaña sin bloquear la navegación. El usuario puede saltar pasos, usar la cinta o cambiar de diseño. Colores cálidos, instrucciones breves y verbos concretos hacen explícita la siguiente acción.

**Recorrido de ejemplo:** Elegir geometría → Dar volumen → ajustar altura → Revisar y confirmar → Aplicar. Antes de confirmar se puede cambiar a Foco y mantener el borrador.

**Qué resuelve:** dudas sobre qué seleccionar y cuándo confirmar. Es una hipótesis útil para principiantes y tareas con requisitos previos.

**Coste y riesgo:** puede añadir texto y pasos a una tarea que un usuario experto resuelve directamente. La guía debe ser opcional y responder al estado real, con requisitos claros; no debe duplicar una máquina de estados distinta a la del editor.

**Primer paso real:** introducir ayuda contextual para el flujo ya existente de elegir plano, dibujar perfil y extruir. El prototipo simplifica esto a la edición de un soporte y no prueba aún dibujo de croquis ni diagnóstico de restricciones.

**Qué decidir en la prueba:** ¿reduce preguntas?, ¿se interpreta como obligación?, ¿cuándo conviene ocultarla?, ¿se puede continuar por la cinta sin perder orientación?

## 8. Comparación para decidir

Las siguientes son hipótesis de diseño, no resultados medidos.

| Diseño | Prioridad | Coste visual | Integración relativa sobre el origen | Mejor pregunta de evaluación |
| --- | --- | --- | --- | --- |
| Atlas | Descubrir y acceder al catálogo | Altura de cinta y dos paneles | Menor: conserva estructura actual | ¿Una cinta bien organizada resuelve el problema? |
| Foco | Manipular con menos distracción | Menos jerarquía explícita | Medio: densidad y contexto | ¿El acceso junto a la pieza reduce viajes? |
| Taller | Explorar herramientas por familia | Ancho del catálogo | Medio: segunda navegación | ¿La verticalidad es más cómoda que la barra completa? |
| Secuencia | Comprender y revisar el historial | Altura de la banda inferior | Mayor si incluye reconstrucción avanzada | ¿Se entiende mejor la intención paramétrica? |
| Guía | Aprender y completar tareas | Texto y acompañamiento | Medio para flujo actual; alto para diagnóstico avanzado | ¿La ayuda reduce incertidumbre sin estorbar? |

**Recomendación inicial:** empezar con Atlas como estructura de integración por su coincidencia con tu nota y con el editor de origen. Incorporar accesos contextuales de Foco y ayuda opcional de Guía si la prueba los favorece. Mantener Secuencia como experimento de historial y Taller como contraste de navegación. Evitar construir cinco aplicaciones con lógica independiente: el selector es una preferencia de presentación de un documento compartido.

## 9. Primeros pasos para la nueva versión

### Paso 1 · Extraer una base reproducible

Trasladar el CAD de origen a Drafty3D con entradas, assets, worker, distribución WASM y licencias. Preparar la carga del motor, dependencias, scripts de desarrollo y producción y recuperación de proyectos. Mantener una escena y archivos de referencia para comprobar que crear, editar, guardar y exportar siguen funcionando antes de cambiar la interfaz.

Evidencia consultada: `Cursos-templates/cad/index.html` define topbar, toolbar, árbol, viewport, inspector y diálogos; `cad/app.js` contiene selección, `renderPanels`, `openTool`, operaciones y handlers ligados al DOM. El informe anterior documenta `document.js`, `interactions.js`, `sketch.js`, `viewport.js` y el worker geométrico. Esta propuesta no ejecuta la migración.

### Paso 2 · Unificar comandos y selección

Definir un registro que describa identificador, etiqueta, disciplina, grupo, selección requerida, disponibilidad, parámetros, preview y commit/cancelación. Cinta, catálogo, paleta y menú contextual deben invocar el mismo comando.

Distinguir cuerpo, cara/arista CAD y vértice/arista/cara de malla. Mostrar el motivo cuando una operación no sea aplicable. Un comando de malla no puede actuar silenciosamente sobre los triángulos de visualización del BRep.

Primer corte: caja/cilindro/esfera, croquis actual, extrusión, booleanas, redondeo existente y transformación. Cotas conductoras, revolución, chaflán y edición poligonal deben mostrar su estado real hasta que exista implementación.

### Paso 3 · Separar documento, sesión de edición y preferencias de UI

- Documento: geometría, operaciones, parámetros, unidades y dependencias.
- Sesión: selección, cámara, comando activo, parámetros pendientes y resultados temporales.
- Presentación: diseño elegido, disciplina, densidad, paneles y ayudas.

El cambio de diseño modifica solo la presentación; no desmonta el motor, no reconstruye por sí mismo ni confirma un borrador. Preservar el foco de teclado en un control equivalente cuando sea posible. Las operaciones activas y sus parámetros deben permanecer accesibles tras el cambio.

En producción, una operación tendría estados claros: inactiva → selección requerida → preview → aplicando → válida/error. Cambiar de diseño puede ocurrir en cualquiera de ellos y debe mantener acceso a cancelar y al diagnóstico. La cancelación real del worker necesita diseño específico; no basta con ocultar el panel.

### Paso 4 · Implementar Atlas con interacción directa

Separar archivo/deshacer/estado de la cinta geométrica. Introducir pestañas de disciplina, grupos etiquetados e inspector acoplado. Conectar el preview y commit del sistema de interacción existente a los campos numéricos. Dar a selección, operación activa y error señales distintas; confirmar y cancelar siempre deben ser visibles.

Primer recorrido completo: seleccionar cuerpo → mover con gizmo → introducir valor → confirmar → deshacer → guardar/reabrir. Después, plano/cara → croquis → extruir con profundidad modificable. Una barra nueva que mantenga diálogos desconectados del gesto no cumple el objetivo.

### Paso 5 · Incorporar variantes con el mismo estado

Crear adaptadores de layout y componentes compartidos de herramientas, árbol, inspector e historial. El selector del tester debe permanecer accesible; más adelante puede alojarse en Preferencias → Espacio de trabajo. Guardar la elección local sin incorporarla como geometría del archivo CAD.

Empezar por Atlas y Foco conectados al mismo editor; continuar con Taller, Secuencia y Guía cuando el contrato de comandos y sesión sea estable. El laboratorio ya permite comparar las cinco, pero portar todas a producción simultáneamente ampliaría el trabajo sin una preferencia validada.

### Paso 6 · Validar antes de ampliar el catálogo

Comprobar cambios de diseño durante selección, arrastre, preview, cálculo, error y edición numérica. Guardar y abrir documentos entre sesiones; verificar que no se pierden medidas ni referencias por cambiar de interfaz. Probar teclado, escalado de texto, pantalla pequeña y uso prolongado. Conectar pruebas geométricas a operaciones reales, diferenciándolas de las pruebas de navegación.

Los problemas más duros siguen siendo referencias topológicas, solver de croquis, robustez geométrica y edición de malla. No se resuelven con un layout. Usar la comparativa previa para condicionar cuándo se activan nuevas herramientas.

## 10. Sesión sugerida con el tester

Usar el mismo soporte y una tarea equivalente en cada diseño. Alternar el orden de presentación entre testers para reducir aprendizaje por repetición. No convertir las puntuaciones de una sola persona en conclusiones estadísticas.

1. Encontrar Extruir, llevar la altura a 80 mm y aplicar.
2. Iniciar Mover a X = 15, cambiar de diseño antes de aplicar y confirmar allí.
3. Deshacer y rehacer; comprobar medidas.
4. Consultar Croquis y Malla; explicar qué cree que ocurre con la pieza al cambiar de pestaña.
5. Localizar una función por búsqueda y distinguir una ficha conceptual de una herramienta operativa.
6. Dejar puntuación y notas en cada diseño, y descargar la evaluación.

Registrar observaciones sobre descubrimiento, viajes del cursor, dudas de representación y visibilidad de confirmar/cancelar. Si se quiere medir tiempos o errores, el observador debe anotarlos: el prototipo no instrumenta telemetría ni afirma que un diseño sea más rápido.

## 11. Entregables y límites

- `propuestas-ui.html`: cinco layouts en una aplicación local con estado compartido, controles ilustrativos y evaluación por diseño.
- `disenos-ui.md`: este documento de explicación, comparación y pasos de implementación.
- `drafty3d-seleccion-funciones-1.json`: referencia provisional del usuario, conservada intacta.
- `comparativa-cad.html`: investigación anterior, conservada con sus notas y selectores.

La evaluación se guarda bajo una clave propia y no altera las decisiones ni notas de la comparativa. El prototipo no incluye motor CAD, edición real de malla, importación geométrica, exportación STEP, llamadas a IA ni comunicación con servidores. La vista previa local solo sirve archivos.
