# Drafty3D · Threeway Avenue

Un punto de entrada ligero para elegir una herramienta de diseño. La portada no importa motores, no precarga WASM y no monta editores ocultos. Cada acceso navega a otra página en la misma pestaña.

| Acceso | Estado | Ruta |
| --- | --- | --- |
| **SolidCraft** | Paquete web oficial 0.18.3, alojado aquí | `/solidcraft/` |
| **Materializr** | Aplicación nativa; acceso a sus descargas oficiales | `/materializr/` |
| **Draft3D / Atlas** | Editor existente, conservado con sus croquis, sólidos y mallas | `/cad/` |

**Materializr no dispone de un build web soportado.** Su interfaz C++/SDL3/OpenGL y OpenCascade no puede ejecutarse en este alojamiento estático. No se presenta un enlace de descarga como si fuera un editor self hosted. Para usarlo desde navegador hace falta otro servidor con escritorio remoto y control de acceso. [Repositorios revisados y límites](docs/HOSTING.md).

## Local

Node.js **22.23.3 o posterior**, npm y `tar` (también disponible con Git Bash en Windows):

```sh
npm ci
npm run dev
```

Abrir **http://127.0.0.1:4187/**. El arranque prepara el paquete de SolidCraft en `.upstream-cache/`; no necesita Rust, Docker ni compilar OpenCascade. El navegador solo descarga su motor al entrar en SolidCraft. `PORT=4190 npm run dev` cambia el puerto.

Para probar el resultado de producción:

```sh
npm run build
npm run preview
```

Abrir **http://127.0.0.1:4188/**. El build descarga versiones fijadas de SolidCraft y las fuentes LGPL del motor de Atlas, comprueba SHA-256 y reutiliza cachés locales en builds posteriores. Si falla una descarga o el hash, el build falla; no publica accesos rotos silenciosamente.

En el entorno cloud con proxy, usar `NODE_USE_ENV_PROXY=1` con una versión de Node compatible y conservar los certificados del entorno. No hace falta en una máquina local sin proxy. `npm run setup:solidcraft` permite preparar solo SolidCraft.

## Memoria y archivos

- La portada usa HTML, CSS y un módulo pequeño para ES/EN, sin dependencias de ejecución ni fuentes externas.
- SolidCraft se ejecuta en un iframe **del mismo sitio**, creado únicamente al abrir `/solidcraft/`. Su paquete oficial permanece intacto en `/solidcraft/app/`, incluyendo hashes, licencias y service worker. La barra exterior permite volver a las herramientas.
- El service worker de SolidCraft solo controla `/solidcraft/app/`, nunca la portada ni Atlas. Puede guardar sus archivos para uso sin conexión después de abrirlo.
- Volver a la portada navega fuera del editor. Mantener una sola pestaña de edición evita tener varias instancias activas. El navegador administra la liberación de memoria y su historial de navegación.
- Los documentos y formatos de cada editor son independientes. Guardar/exportar antes de cambiar. Atlas conserva sus claves de almacenamiento y sus proyectos previos; su logotipo vuelve a la portada.
- El idioma de la portada y Atlas comparte preferencia. El idioma interno de SolidCraft se configura en la aplicación upstream.

La [guía de Atlas](docs/cad/GUIA.md) conserva las instrucciones de croquis, selección local, STEP/STL y conversión a malla. El editor renderiza bajo demanda y calcula BRep en un worker.

## Vercel

El sitio de producción es [drafty3-d.vercel.app](https://drafty3-d.vercel.app/), vinculado a **`main`**. Un único despliegue sirve la portada y las rutas independientes. Netlify fue el alojamiento anterior.

- La configuración versionada está en `vercel.json`: build `npm run build`, publicación `dist`, Node 22 según `package.json`.
- La raíz sirve la portada, sin redirección automática al CAD.
- Los WASM se sirven localmente. No hay proxy hacia un editor externo ni servidor geométrico obligatorio.
- `/deployment.json` identifica `VERCEL_GIT_COMMIT_SHA` cuando Vercel compila. Comprobar que coincide con el commit de GitHub antes de dar un despliegue por verificado.
- Si ya existe un servidor Materializr protegido con HTTPS, la variable opcional de build `MATERIALIZR_WEB_URL` añade un acceso en su página. No crea ni despliega ese servidor y no debe incluir contraseñas o tokens.

### Compartir diseños SolidCraft por correo

La barra exterior de SolidCraft ofrece **Compartir…**. Usa la API oficial del editor para exportar una copia del diseño como proyecto editable `.json`, STEP o STL, lee el archivo temporal desde el almacenamiento privado del navegador y lo elimina al terminar. No cambia el documento abierto. Brevo acepta ZIP como adjunto, por lo que el destinatario recibe un ZIP que contiene el archivo en el formato elegido. El límite es **3 MiB** para caber en el límite de solicitudes de Vercel. Para diseños mayores, exportar desde el menú File y compartir el archivo por otro medio.

El endpoint `/api/share` es una Vercel Function. Requiere estas variables de entorno en el proyecto, para Production y Preview según corresponda:

| Variable | Uso |
| --- | --- |
| `BREVO_API_KEY` | Clave de API de Brevo con permiso de correo transaccional. Solo en el servidor. |
| `SHARE_FROM_EMAIL` | Dirección de remitente verificada en Brevo. Si es de un proveedor gratuito, Brevo puede reemplazarla por una dirección propia para cumplir autenticación. |
| `TURNSTILE_SITE_KEY` | Clave pública de Cloudflare Turnstile, restringida a los hostnames del sitio. |
| `TURNSTILE_SECRET_KEY` | Clave privada de Turnstile. Solo en el servidor. |

La función responde `503` hasta que todas estén configuradas. Después de guardar las variables en Vercel, hacer un nuevo despliegue. El navegador solicita un token Turnstile por envío; el servidor lo valida con Cloudflare, comprueba el hostname y la acción, y solo entonces llama a Brevo. El endpoint rechaza formatos, nombres, destinatarios y tamaños inválidos. No se incluye ninguna credencial privada en el build estático. Además, el Firewall de Vercel limita `/api/share` a **10 solicitudes por IP cada 10 minutos**, con respuesta 429 al excederlo; conservar esa regla al migrar de proyecto Vercel.

## Comprobaciones y procedencia

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

En cloud puede usarse `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. La suite usa un único worker y un preview propio en el puerto 4193. Prueba la ausencia de cargas CAD en portada, el arranque de SolidCraft, aislamiento de su service worker y regresiones de Atlas. Las capturas quedan en `artifacts/`.

SolidCraft: [tangency-labs/solidcraft](https://github.com/tangency-labs/solidcraft), MIT o Apache-2.0. El ZIP oficial y su SHA-256 están fijados en `scripts/solidcraft.mjs`; los avisos originales se publican sin cambios.

Materializr: [materializr-cad/materializr](https://github.com/materializr-cad/materializr), GPL-3.0 con excepciones upstream. Solo se enlazan sus fuentes y descargas, sin redistribuir binarios.

Atlas utiliza Three.js y OpenCascade.js. Sus licencias y fuentes correspondientes se publican en `/cad/legal.html`. [Origen del editor](docs/cad/ORIGEN_CAD.md). El sitio de cursos no se modifica.
