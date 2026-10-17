# CAD Web sobre Open CASCADE

Inicio del proyecto: 14 de octubre de 2026. Aplicación independiente en `/cad/`, dentro del sitio actual de cursos. La portada, los cursos HTML y Arena conservan sus rutas y su implementación. No hay login ni servicio de geometría en el servidor.

## Dirección técnica

El editor utiliza geometría B-rep real de Open CASCADE Technology, compilada a WebAssembly mediante `opencascade.js@2.0.0-beta.b5ff984`. El paquete contiene OCCT 7.6.2. Se carga su distribución `opencascade.full`, sin fabricar un kernel que solo contenga las operaciones del prototipo. El binario original mide 50.305.130 bytes; el navegador descarga ese motor desde el mismo sitio, sin CDN.

«Full» es el nombre de la distribución de OpenCascade.js: incluye las clases que el generador upstream puede exponer con sus filtros. No equivale a toda la API C++ de OCCT ni a todos sus módulos. Tampoco incluye la aplicación FreeCAD, sus bancos de trabajo, interfaz Qt, Python, solver de croquis o formato FCStd. La experiencia CAD se construye alrededor del kernel.

El objetivo de uso es un ordenador Windows con teclado y ratón en versiones actuales de Chrome, Edge o Firefox. Se necesitan WebAssembly, Web Workers y WebGL2, además de suficiente memoria para el modelo. La compatibilidad objetivo no sustituye pruebas en Windows: cada entrega debe registrar los navegadores y equipos realmente comprobados. El motor inicial es de un solo hilo; no necesita SharedArrayBuffer ni encabezados de aislamiento de origen.

## Arquitectura

| Capa | Responsabilidad |
| --- | --- |
| Documento JSON | Operaciones, parámetros en milímetros, referencias, nombres, visibilidad y colores. Validación independiente de OCCT y del renderizado. |
| Historial | Instantáneas de documentos para deshacer y rehacer. Un cambio de parámetros reconstruye las operaciones que dependen de él. |
| Worker CAD | Carga WASM, construye los sólidos OCCT, valida resultados, tesela y procesa archivos de intercambio. Las operaciones costosas se apartan del hilo de interfaz. |
| Three.js | Cámara, selección y representación de mallas. La triangulación sirve para mostrar; las operaciones y el intercambio STEP utilizan los sólidos exactos. |
| Interfaz | Herramientas de pieza, parámetros, árbol de operaciones, errores en español y acciones de archivo. |
| Vite y hosting estático | Publican módulos, worker y WASM bajo `/cad/`. Netlify continúa siendo el alojamiento actual. |

Los archivos del usuario se leen en el navegador y viajan al worker local. El documento portable contiene datos declarativos; no ejecuta JavaScript importado. No hay autenticación, cuenta, subida de piezas a un backend ni colaboración remota. El servidor solo entrega los recursos de la aplicación. El guardado en el navegador pertenece a ese origen y puede perderse al borrar sus datos; exportar el proyecto conserva una copia independiente.

## Primera base funcional

El documento inicial contempla cajas, cilindros, esferas, extrusiones de perfiles poligonales, unión, diferencia e intersección, redondeo y transformaciones. Las operaciones referencian piezas anteriores, de modo que editar una dimensión mantiene la intención de sus operaciones posteriores. Hay intercambio STEP/STL y un archivo de proyecto con el historial paramétrico declarativo.

Límites iniciales del documento: 100 operaciones, perfiles de hasta 1.024 puntos y archivos de proyecto de hasta 40 MB. Son límites de esta aplicación para mantener controlada la carga; no describen los límites de OCCT. Un archivo STL representa una triangulación y no recupera por sí mismo croquis ni historial de diseño. Una importación STEP tampoco reconstruye automáticamente las operaciones con las que otra aplicación creó la pieza.

Los resultados de una operación CAD dependen de la geometría y las tolerancias. Un radio de redondeo incompatible o un perfil inválido deben producir un error legible y preservar el último proyecto válido. La base de operaciones no sustituye todavía a un croquis con cotas, restricciones y grados de libertad.

### Manipulación directa y croquis sobre planos

La entrega `9efde1d` añade movimiento libre agarrando la superficie, ejes y planos de traslación, y anillos de rotación mediante `TransformControls`. Los gestos usan una previsualización local de Three.js; al soltar el ratón se aplica una sola operación paramétrica con geometría OCCT. Esc cancela el gesto sin modificar el documento. Ajustar activa pasos de 1 mm y 15°. Los atajos son G para mover y R para girar; Seleccionar recupera la navegación habitual de cámara.

Al trasladar primitivas se actualizan sus coordenadas. Cuando se necesita una transformación de un sólido compuesto, el nodo original se conserva oculto y el resultado mantiene su identificador, para no romper referencias posteriores. Los gestos sucesivos editan ese mismo nodo de transformación. El pivote visual es el centro de la caja envolvente de la pieza; los parámetros guardados siguen describiendo la transformación rígida respecto al origen global.

`Dibujar perfil` permite elegir XY/XZ/YZ o una cara BRep plana. El motor entrega rangos de triángulos por cara y marcos exactos de origen y ejes U/V, con normal exterior. La cámara se coloca perpendicularmente al plano y el usuario dibuja directamente sobre el modelo. Hay rectángulos, cuadrados manteniendo Mayús, círculos exactos y contornos de líneas conectadas. Se pueden arrastrar vértices, centros y radios antes de aplicar; los perfiles existentes se reabren con Editar perfil. El contorno se extruye como sólido nuevo, se añade a una pieza o se resta de ella; la profundidad y el sentido se ajustan en el panel.

El documento versión 1 acepta de forma opcional `plane`, `support`, `profile` y `reverse` en extrusiones; los proyectos anteriores siguen siendo válidos. `support` introduce una dependencia a la pieza de apoyo, por lo que el plano se vuelve a resolver al cambiar sus medidas o colocación. Una circunferencia se conserva como centro/radio y OCCT construye un cilindro exacto, sin aproximarla por un polígono en el sólido. La malla de visualización sí es una aproximación.

La referencia de cara inicial usa su índice y el número de caras del sólido. Se rechaza la reconstrucción si cambia ese número o la cara deja de ser plana. Esto todavía no resuelve el problema general de identificación topológica: una modificación que reordene caras manteniendo su número puede requerir redefinir el apoyo. No se admiten apoyos sobre superficies curvas ni sobre STL. Se necesita un contorno cerrado por operación; no hay todavía solver, cotas persistentes ni perfiles con islas interiores.

La [verificación Windows de esta entrega](https://github.com/RubenDarioMena/Courses-RDM/actions/runs/38689684969) terminó con 33 recorridos aprobados, 11 en cada navegador, sin reintentos ni fallos. Incluye agarrar/mover/girar, cancelar con Esc, dibujar en XZ/YZ y cortar desde un círculo sobre una cara. Pasaron también 39 pruebas del proyecto (15 de documento CAD, 12 de OCCT, 3 de colocación y 9 de Arena) y la compilación completa en los tres trabajos Windows. Se comprobó manualmente además el cambio de radio por arrastre y la reconstrucción del corte dependiente.

La [revisión final `5b532fe`](https://github.com/RubenDarioMena/Courses-RDM/actions/runs/38725415196) volvió a aprobar los 33 recorridos y las 39 pruebas, con los ajustes de contraste del croquis. El informe de cierre y los borradores para la futura planificación se encuentran en [docs/cad](cad/README.md); sus propuestas siguen pendientes de revisión con el usuario.

## Desarrollo y despliegue

Requisitos de la aplicación: Node.js 22 o superior.

```sh
npm ci
npm run dev
```

Abrir `http://localhost:4173/cad/`. Arena sigue en `http://localhost:4173/arena/`. `PORT=4180 npm run dev` permite elegir otro puerto. El servidor mantiene dos instancias Vite con bases y endpoints HMR separados; CAD usa `node_modules/.vite-cad` para evitar colisiones en la caché de dependencias. Las rutas de cursos se sirven como antes.

```sh
npm test
npm run build
npm run preview
```

La compilación existente copia los cursos, construye Arena con `vite.config.mjs` y CAD con `vite.cad.config.mjs`. El resultado está en `dist/cad/`. `cad/public/` aporta la página de licencias y los textos legales. El WASM se emite como archivo independiente; no se convierte en base64 dentro de un bundle. Preview debe servirlo con `Content-Type: application/wasm`.

El sitio conserva la configuración y el dominio Netlify existentes. `/cad/*` recibe encabezados de seguridad básicos independientes de `/arena/*`. No se exige aislamiento entre orígenes en esta base porque el módulo de un solo hilo no lo necesita.

### Comprobaciones de navegador

Después de compilar, `npm run test:cad:browser` comprueba el paquete publicado en `dist/`. En Windows deben estar instalados Chrome, Edge y Firefox de Playwright (`npx playwright install firefox`). La configuración levanta un servidor estático de pruebas en el puerto 4183; no requiere cuenta ni credenciales del sitio.

`.github/workflows/cad-windows.yml` ejecuta los tres navegadores en máquinas Windows independientes, con un solo recorrido activo por navegador. Cada suite comprueba carga del motor, edición de dependencias, deshacer/rehacer, extrusión, errores sin pérdida del estado, guardado portable, persistencia, STEP/STL y recuperación de un proyecto local inválido. Los artefactos contienen capturas del editor, archivos de intercambio y diagnósticos. Ante un fallo conservan también la traza de red y DOM; la grabación continua de vídeo y capturas de traza están desactivadas para reducir la carga del entorno sin GPU física.

### Entrega comprobada el 14 de octubre de 2026

Versión pública: [Taller CAD](https://rubenmena-cursos.netlify.app/cad/). El [informe Windows de la entrega](https://github.com/RubenDarioMena/Courses-RDM/actions/runs/38561070173) corresponde al commit `6b92ea2cf8f0bcaa426b680fcb859ee885563021` y terminó sin fallos ni reintentos. Se verificó el paquete compilado en máquinas virtuales de GitHub Actions con Windows Server 2025, versión `10.0.26100`, y renderizado por software. Estos resultados no son mediciones de rendimiento de un ordenador Windows con GPU física.

| Navegador comprobado | Resultado |
| --- | --- |
| Google Chrome `154.0.8037.58` | 7 recorridos aprobados |
| Microsoft Edge `153.0.4234.48` | 7 recorridos aprobados |
| Firefox de Playwright `157.0` | 7 recorridos aprobados |

También pasaron las 35 pruebas de `npm test`: 15 del documento CAD, 11 del núcleo WASM real y 9 de Arena. `npm run build` completó el sitio en los tres trabajos Windows. La comprobación pública adicional confirmó carga del motor, representación del sólido y volumen exacto del soporte de ejemplo. Se conservaron capturas y archivos STEP, STL y JSON de las suites Windows.

La primera entrega cubre las herramientas descritas arriba. Siguen pendientes el solver de restricciones, referencias estables a caras/aristas, operaciones avanzadas y ensamblajes. Las pruebas actuales usan piezas acotadas; continuar con modelos grandes y mediciones de memoria antes de ampliar los límites de documentos.

## Fuentes, licencias y reproducción

Las copias de licencias y la procedencia están en `/cad/legal.html` y `/cad/licenses/SOURCES.txt`.

`scripts/cad-sources.mjs` descarga los archivos fuente de revisiones inmutables, comprueba sus SHA-256 y los publica junto al WASM en `/cad/licenses/source/`. Una caché local `.cad-source-cache/` evita repetir la descarga de unos 50 MB; está excluida de Git. El primer build requiere acceso a GitHub para preparar estos materiales. Un cambio del archivo upstream que no coincida con el hash fijado hace fallar la compilación, en vez de publicar fuentes sin verificar. El build incluye también `cad-application.tar.gz` con los archivos de integración, las dependencias fijadas y las instrucciones de reenlace de esa entrega. La creación de ese archivo utiliza `tar`, disponible en el entorno de Netlify y en macOS; no añade un requisito al navegador del alumno.

| Componente | Versión / revisión | Licencia |
| --- | --- | --- |
| OpenCascade.js | `2.0.0-beta.b5ff984` | LGPL-2.1-only, según el manifiesto npm |
| OCCT | `bb368e271e24f63078129283148ce83db6b9670a`, línea 7.6.2 | LGPL 2.1 con excepción Open CASCADE |
| Three.js | `0.186.1` | MIT |
| Emscripten/emsdk del port | `3.1.14` | Avisos upstream incluidos |

Artefacto npm exacto: [opencascade.js-2.0.0-beta.b5ff984.tgz](https://registry.npmjs.org/opencascade.js/-/opencascade.js-2.0.0-beta.b5ff984.tgz). Su integridad declarada es `sha512-4ZIrYrfrCV7SXvQFSmbHlfueSYngQNWGVrRVloVaAEZHDSY+R1k2htdY4AU5axbIGkbWVmrj+M8nmyeMLAelwA==`, conservada en `package-lock.json`. La compilación de este sitio no recompila OCCT: usa ese artefacto y empaqueta el envoltorio JavaScript en el worker.

Fuentes de OpenCascade.js del [commit correspondiente al sufijo de versión](https://github.com/donalffons/opencascade.js/tree/b5ff9847200016dce0d92fe747fc38a945771dc5). npm declara además [gitHead `15445938357138fd30f07a126a9bd874054af7d8`](https://github.com/donalffons/opencascade.js/tree/15445938357138fd30f07a126a9bd874054af7d8). Se registran ambos identificadores para no confundir el commit que da nombre al build con el registrado durante su publicación.

El [Dockerfile de esa revisión](https://github.com/donalffons/opencascade.js/blob/b5ff9847200016dce0d92fe747fc38a945771dc5/Dockerfile) fija Emscripten 3.1.14 y las [fuentes OCCT exactas](https://github.com/Open-Cascade-SAS/OCCT/tree/bb368e271e24f63078129283148ce83db6b9670a). Los scripts y parches de generación están en el mismo repositorio. `builds/opencascade.full.yml` define el módulo completo. El Dockerfile upstream clona RapidJSON y FreeType sin fijar revisión, por lo que repetirlo hoy no promete un binario idéntico byte a byte.

Para reconstruir el kernel completo, en una copia de las fuentes upstream de esa revisión y con Docker instalado:

```sh
docker build --target custom-build-image --build-arg threading=single-threaded -t cad-ocjs-local .
docker run --rm -v "$(pwd):/src" -u "$(id -u):$(id -g)" cad-ocjs-local /src/builds/opencascade.full.yml
```

El proceso upstream genera `opencascade.full.js`, `.wasm` y `.d.ts`. Para probar una biblioteca compatible modificada, sustituir en una copia local los artefactos del paquete instalado en `node_modules/opencascade.js/dist/`, conservar sus licencias, y reconstruir con `npm run build`. La aplicación y el motor quedan disponibles en un servidor estático propio. Registrar el cambio de biblioteca y sus fuentes al redistribuirlo; no presentar el hash del artefacto original como si validara ese build modificado.

La LGPL exige conservar avisos y licencia, facilitar el código fuente correspondiente de las bibliotecas y sus cambios, y respetar las condiciones de modificación y reenlace de la sección 6. Sus textos completos y la excepción de OCCT son la referencia. La excepción de OCCT concierne al uso de material de sus cabeceras; no elimina todas las obligaciones de LGPL. No se redefine la licencia de los contenidos del sitio o de cursos.

## Siguientes etapas

1. Ampliar la cobertura Windows con modelos grandes y GPUs físicas. Medir carga del kernel, memoria, teselación y duración de las operaciones; conservar los recorridos actuales de Chrome, Edge y Firefox.
2. Añadir cotas y un solver de restricciones a los croquis actuales. Resolver referencias estables a caras y aristas antes de construir una cadena amplia de funciones paramétricas.
3. Ampliar herramientas con revolución, barrido, loft, vaciado, patrones y selección de aristas para redondeos/chaflanes.
4. Incorporar cuerpos y ensamblajes, transformaciones de componentes y estructuras STEP/XDE con nombres, colores y metadatos.
5. Incorporar diagnóstico de geometría, tolerancias y reparación de importaciones; después planos 2D y documentación de fabricación.

Cada etapa debe entregar herramientas utilizables y archivos compatibles, con pruebas del kernel real. Reutilizar OCCT evita implementar las operaciones geométricas desde cero; construir un editor CAD completo sigue requiriendo la capa paramétrica, las herramientas y la interacción.
