# Investigación de producto · Drafty3D

Abrir `comparativa-cad.html` en cualquier navegador. Es un documento autónomo, sin dependencias ni peticiones de red; los enlaces de fuentes sí requieren internet. Las selecciones de alcance y notas opcionales por función se guardan en este navegador cuando está disponible el almacenamiento local y se pueden descargar como JSON.

Consulta: 16 de octubre de 2026, fecha del usuario en America/Mexico_City.

Alcance: Plasticity, Onshape y 3D Modeling App: Sculpt & Draw. FreeCAD y Blender se usan como referencias secundarias. El análisis técnico se contrastó con la aplicación existente en `/Users/rubenmena/Documents/Dev/Cursos-templates/cad`, sus tipos instalados de OpenCascade.js y `docs/CAD_WEB.md`, `docs/cad/README.md`, `PROGRESO.md`, `PLAN_PROVISIONAL.md` y `SEPARACION_PROVISIONAL.md` del mismo proyecto.

Las recomendaciones son propuestas para decidir el producto, no requisitos aceptados. Este entregable corresponde a la investigación: la extracción de la aplicación, el rediseño del editor y la publicación tienen sus propios pasos posteriores. Los documentos heredados se trataron como antecedentes, incluidas sus propuestas provisionales.

Verificación del entregable: Chromium local en macOS, anchos de 1440, 390 y 320 px, temas claro y oscuro, apertura directa del archivo, filtros, búsqueda, persistencia, restauración, exportación JSON y expansión de riesgos. Sin errores de JavaScript ni desbordamiento horizontal en los anchos comprobados. No se ejecutaron pruebas geométricas ni se reprodujo la matriz Windows del editor de origen.

Para regenerar el HTML tras editar su contenido: `python3 docs/investigacion/generar_informe.py` desde la raíz de Drafty3D. El generador solo utiliza la biblioteca estándar de Python.

## Laboratorio de UI · cinco propuestas

Abrir [propuestas-ui.html](propuestas-ui.html) para alternar entre Atlas, Foco, Taller, Secuencia y Guía. El prototipo conserva la sesión al cambiar de diseño y permite evaluar cada variante con notas y descargar un JSON. Explicaciones, límites y primeros pasos: [disenos-ui.md](disenos-ui.md). Se basa en la respuesta provisional [drafty3d-seleccion-funciones-1.json](drafty3d-seleccion-funciones-1.json).

Vista previa: `http://127.0.0.1:4187/docs/investigacion/propuestas-ui.html`. El soporte es una ilustración interactiva, sin conexión al motor CAD.

Comprobaciones del laboratorio: alternancia de las cinco variantes, borrador entre diseños, aplicar/cancelar, deshacer/rehacer, persistencia de notas tras recargar, búsqueda de herramientas y exportación de cinco evaluaciones. Revisión visual a 1440 px y 390 px; sin desbordamiento global a 390 px en las variantes comprobadas ni errores JavaScript observados. Las pruebas del prototipo no validan operaciones CAD.
