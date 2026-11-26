# Drafty3D

El espacio de diseño es la pantalla principal del sitio. Ahí puedes organizar archivos por proyecto y abrir SolidCraft, SculptGL o SVG-Edit. Cada motor se carga al abrir su editor.

| Acceso | Estado | Ruta |
| --- | --- | --- |
| **Espacio de diseño** | Proyectos, archivos y tres editores integrados | `/` (también disponible en `/workspace/`) |
| **SolidCraft** | Paquete web oficial 0.18.3, alojado aquí | `/solidcraft/` |
| **Drafty3D Learn** | Aprender la interfaz de Blender 5.3 (prototipo: Modificadores); también como APK sin conexión | `/learn/` |

## Local

Node.js **22.23.3 o posterior**, npm y `tar` (también disponible con Git Bash en Windows):

```sh
npm ci
npm run dev
```

Abrir **http://127.0.0.1:4187/**. El arranque prepara el paquete de SolidCraft y compila SculptGL en `.upstream-cache/` con Node.js. SVG-Edit se obtiene de la versión fijada en `package-lock.json`. Si editas un módulo del espacio de diseño, reinicia `npm run dev` para recompilarlo. El navegador solo descarga su motor al entrar en SolidCraft. `PORT=4190 npm run dev` cambia el puerto.

Para probar el resultado de producción:

```sh
npm run build
npm run preview
```

Abrir **http://127.0.0.1:4188/**. El build descarga las versiones fijadas de SolidCraft y SculptGL, comprueba SHA-256 y reutiliza cachés locales en builds posteriores. Si falla una descarga o el hash, el build falla; no publica accesos rotos silenciosamente.

En el entorno cloud con proxy, usar `NODE_USE_ENV_PROXY=1` con una versión de Node compatible y conservar los certificados del entorno. No hace falta en una máquina local sin proxy. `npm run setup:solidcraft` permite preparar solo SolidCraft.

## Espacio de diseño

El dashboard está disponible en `/` (y también en `/workspace/`, que sirve el mismo contenido para no romper enlaces antiguos). Los tres editores abren y exportan archivos aunque Supabase esté pendiente de configurar. Con una cuenta puedes subir originales, guardar nuevas versiones, restaurar una anterior como una versión adicional y descargar un respaldo ZIP con un manifiesto. El inicio de sesión se hace con correo y contraseña y se repite al recargar o abrir otra pestaña.

Consulta la [guía del portal](docs/PORTAL.md) para activar Supabase en el entorno elegido, conocer los formatos y revisar el alcance de Blockbench, Graphite y FreeCAD Web.

## Drafty3D Learn

Módulo para aprender la interfaz de Blender con ejemplos reales: Blender 5.3 (`bpy`) graba cada paso y three.js solo lo muestra. Es el mismo build en `/learn/`, en la vista previa de githack y en el APK de Android (Capacitor), que se publica en GitHub Releases. Para probarlo, ver las decisiones y regenerar ejemplos: [guía de Drafty3D Learn](docs/learn/README.md). Contrato de datos: [docs/learn/PIPELINE_CONTRACT.md](docs/learn/PIPELINE_CONTRACT.md).

- `npm run build:learn` compila solo `/learn/` en `dist/learn`.
- `npm run learn:examples` regenera los ejemplos (requiere el entorno `bpy` descrito en la guía).

## Memoria y archivos

- El espacio de diseño usa HTML, CSS y un módulo pequeño para ES/EN, sin dependencias de ejecución ni fuentes externas.
- SolidCraft se ejecuta en un iframe **del mismo sitio**, creado únicamente al abrir `/solidcraft/`. Su paquete oficial permanece intacto en `/solidcraft/app/`, incluyendo hashes, licencias y service worker. La barra exterior permite volver a las herramientas.
- El service worker de SolidCraft solo controla `/solidcraft/app/`, nunca el resto del sitio. Puede guardar sus archivos para uso sin conexión después de abrirlo.
- En el espacio de diseño, el editor activo se monta dentro del dashboard. Guarda en el proyecto o descarga el documento editable antes de cerrar el editor. Mantener una sola pestaña de edición evita tener varias instancias activas.
- El idioma del espacio de diseño y de la página de licencias comparte preferencia. El idioma interno de SolidCraft se configura en la aplicación upstream.

## Vercel

El sitio de producción es [drafty3-d.vercel.app](https://drafty3-d.vercel.app/), vinculado a **`main`**. Un único despliegue sirve el espacio de diseño y las rutas independientes. Netlify fue el alojamiento anterior. `ignoreCommand` en `vercel.json` hace que Vercel solo compile `main`; las demás ramas (incluidas las de Codex) no generan vistas previas pagadas.

- La configuración versionada está en `vercel.json`: build `npm run build`, publicación `dist`, Node 22 según `package.json`.
- La raíz sirve el espacio de diseño.
- Los WASM se sirven localmente. No hay proxy hacia un editor externo ni servidor geométrico obligatorio.
- `/deployment.json` identifica `VERCEL_GIT_COMMIT_SHA` cuando Vercel compila. Comprobar que coincide con el commit de GitHub antes de dar un despliegue por verificado.

### Compartir diseños SolidCraft por correo

La barra exterior de SolidCraft ofrece **Compartir…**. Usa la API oficial del editor para exportar una copia del diseño como proyecto editable `.json`, STEP o STL, lee el archivo temporal desde el almacenamiento privado del navegador y lo elimina al terminar. No cambia el documento abierto. Brevo acepta ZIP como adjunto, por lo que el destinatario recibe un ZIP que contiene el archivo en el formato elegido. El límite es **3 MiB** para caber en el límite de solicitudes de Vercel. Para diseños mayores, exportar desde el menú File y compartir el archivo por otro medio.

El endpoint `/api/share` es una Vercel Function. Requiere estas variables de entorno en el proyecto, para Production y Preview según corresponda:

| Variable | Uso |
| --- | --- |
| `BREVO_API_KEY` | Clave de API de Brevo con permiso de correo transaccional. Solo en el servidor. |
| `SHARE_FROM_EMAIL` | Dirección de remitente verificada en Brevo. Si es de un proveedor gratuito, Brevo puede reemplazarla por una dirección propia para cumplir autenticación. |

La función responde `503` hasta que ambas estén configuradas. Después de guardar las variables en Vercel, hacer un nuevo despliegue. El navegador activa BotID Basic para `/api/share`; el servidor comprueba el resultado antes de llamar a Brevo. Este proyecto usa OIDC de Vercel, necesario para BotID. El endpoint rechaza formatos, nombres, destinatarios y tamaños inválidos. No se incluye ninguna credencial privada en el build estático. Además, el Firewall de Vercel limita `/api/share` a **10 solicitudes por IP cada 10 minutos**, con respuesta 429 al excederlo; conservar esa regla al migrar de proyecto Vercel.

## Comprobaciones y procedencia

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

En cloud puede usarse `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. La suite usa un único worker y un preview propio en el puerto 4193. Prueba las cargas diferidas, el aislamiento de los editores, el intercambio de archivos y el flujo de sesión y versiones con respuestas simuladas de Supabase. Las capturas quedan en `artifacts/`.

SolidCraft: [tangency-labs/solidcraft](https://github.com/tangency-labs/solidcraft), MIT o Apache-2.0. El ZIP oficial y su SHA-256 están fijados en `scripts/solidcraft.mjs`; los avisos originales se publican sin cambios.
