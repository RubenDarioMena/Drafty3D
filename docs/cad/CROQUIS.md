# Croquis independientes y construcción desde cero

## Alcance de esta entrega

- Navegación durante el dibujo: derecho gira, Mayús + derecho o central desplaza y rueda acerca. Los eventos de cámara no añaden puntos ni cambian el perfil. Una captura de dibujo interrumpida restaura el gesto anterior.
- Dos pasos visibles: dibujar el perfil y crear volumen. Terminar guarda el croquis sin extruir; continuar a volumen confirma croquis y operación juntos. Cancelar conserva el documento anterior.
- Medidas exactas de rectángulos (esquina U/V, ancho/alto) y círculos (centro U/V, radio), con decimales, límites y errores recuperables. Redimensionar conserva la esquina inicial y el cuadrante.
- Croquis seleccionables en el lienzo y Documento, con acceso a editar y extruir. La extrusión enlaza con su croquis; su inspector permite editar profundidad o abrir el perfil fuente. Las fuentes tienen enlaces en Operación.

## Modelo y compatibilidad

El documento mantiene la versión 1. El nuevo nodo `sketch` contiene `points` o `profile`, su plano, el apoyo opcional y posición. Una extrusión nueva contiene `sketch`, `height`, `reverse` y posición. El perfil se conserva una sola vez, y los cambios invalidan la caché de las operaciones que dependen de él. Los documentos existentes con extrusiones de perfil inline siguen siendo válidos y editables sin migración destructiva.

El núcleo representa el croquis como una cara plana para visualizarlo; no se interpreta como sólido. No entra en la exportación STEP/STL, conversión a malla, booleanas, redondeos ni transformaciones de sólidos. La posición de un croquis puede editarse en sus propiedades. Guardar el proyecto conserva todos los nodos y las fuentes ocultas.

Un croquis apoyado sigue la cara de su sólido fuente. Se conserva la limitación anterior de referencias por índice y número de caras: no hay identificación topológica persistente ni reparación de apoyos en esta entrega.

## Validación

Las pruebas del documento y del motor real comprueban persistencia, historial, reconstrucción de perfiles y apoyos, extrusión y corte, exclusión de croquis de exportación/conversión, rechazo de referencias incompatibles y recuperación tras errores. Las pruebas del navegador recorren dibujo, navegación, medidas exactas, guardado sin volumen, extrusión, corte, edición del origen, deshacer/rehacer, descarga/reapertura y compatibilidad con perfiles antiguos.

## Continuación acordada

1. Ajustes al origen, extremos y centros; cotas y restricciones básicas persistentes (horizontal, vertical, coincidencia e igualdad).
2. Dependencias más visibles y recuperación de referencias de caras cuando cambie la topología.
3. Revolución, simetría, patrones lineales/circulares, chaflán y redondeo de aristas seleccionadas.
4. Edición poligonal de vértices, aristas y caras, seguida de extrusión de caras. Ensamblajes y superficies avanzadas quedan después.

El usuario autorizó integrar esta entrega en `main` y desplegarla en Netlify después de completar la validación.
