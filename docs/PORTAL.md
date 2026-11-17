# Espacio de diseño

Abre `/workspace/` desde la portada. Puedes usar los editores inmediatamente y descargar sus archivos. Con Supabase configurado, la cuenta da acceso a los mismos proyectos desde otro dispositivo.

## Configurar Supabase

1. Aplica [la migración SQL](../supabase/migrations/20261117000000_design_portal.sql) a tu proyecto Supabase con el SQL Editor o con tu flujo habitual de migraciones. Crea las tablas, las políticas de acceso por propietario y el bucket privado `design-files`.
2. Habilita el proveedor de correo y contraseña en Supabase Auth y confirma o crea las cuentas que necesiten acceso.
3. Copia [`.env.example`](../.env.example) a `.env.local` para desarrollo. En Vercel, define `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en el entorno de compilación correspondiente, por ejemplo Preview para una rama. El portal también se puede compilar en Netlify con esas dos variables.
4. Reconstruye el frontend y abre `/workspace/`. El build sirve la configuración pública como `/workspace/config.json`. Usa la URL HTTPS del proyecto y la clave publicable `sb_publishable_…`. Cualquier dato incluido en ese archivo será visible para quien abra el portal.

Los valores de ejemplo son placeholders. La aplicación mantiene el token de acceso y el de renovación en memoria. Cada pestaña o recarga requiere inicio de sesión manual. SolidCraft y Atlas mantienen su comportamiento propio para caché y documentos locales.

## Documentos y formatos

| Herramienta | Abrir desde el proyecto | Guardar o descargar |
| --- | --- | --- |
| SolidCraft | SOLIDCRAFT, SOLVECRAFT, JSON de SolidCraft, STEP, STL, OBJ, 3MF y GLB | JSON editable, STEP, STL y OBJ |
| SculptGL | SGL, OBJ, STL y PLY | SGL editable, OBJ, STL y PLY |
| SVG-Edit | SVG | SVG |

Usa **Subir archivos** para conservar originales, exportaciones, referencias y capturas. Si el editor exporta otro formato, el portal lo guarda como archivo independiente. Para actualizar un original desde Blender, FreeCAD, Blockbench u otra aplicación, abre **Versiones → Subir nueva versión**. Cada versión admite hasta 50 MiB. Para modelos y texturas en varios archivos, conserva juntos todos los recursos de origen y sube un GLB cuando quieras compartir un modelo en un solo archivo.

**Descargar respaldo** genera un ZIP con los originales, todas las versiones y un manifiesto de rutas y fechas. El límite por ZIP es 128 MiB de archivos. En proyectos más grandes puedes descargar cualquier versión de forma individual. **Restaurar** crea una versión nueva a partir de los bytes de la seleccionada. Si otra pestaña guarda una versión mientras editas, el portal conserva la tuya en el editor para que puedas descargarla antes de reabrir la última.

**Nueva nota** guarda un archivo Markdown para compartir con agentes. Los SVG se pueden marcar en el propio editor y descargar como copia. Los comentarios en línea y las anotaciones vinculadas a coordenadas quedan para una ampliación.

## Herramientas externas

- **Blockbench** abre su editor web. Se comprobó el arranque con el menú de modelos y el lienzo. Conserva el `.bbmodel` y usa un OBJ o GLB como copia de intercambio. [Editor web](https://web.blockbench.net/)
- **Graphite** abrió la pantalla de creación y apertura de documentos en Chromium. Su compilación web usa Rust y WebAssembly y se genera en su propio flujo de CI. Se enlaza a su versión alfa para conservar `.graphite` y exportar SVG mediante intercambio manual de archivos. [Editor web](https://editor.graphite.art/) · [Build upstream de referencia](https://github.com/GraphiteEditor/Graphite/actions/runs/44090638660)
- **FreeCAD Web** es un port independiente de FreeCAD. El sitio del port respondió y su pantalla mostró una descarga inicial de alrededor de 115 MB. Usa WASM64 y JSPI con aislamiento entre orígenes. El acceso abre el port en su propia pestaña. Para documentos FCStd usa la descarga y la subida manual. [Port y requisitos](https://github.com/Virtastic/freecad-web)

## Operación y migración futura

Para respaldos de infraestructura conserva tanto PostgreSQL como el contenido del bucket. La metadata SQL por sí sola contiene las rutas, no los bytes. Una carga que se interrumpe después de subir bytes pero antes de confirmar su versión puede dejar un objeto sin registrar. Un administrador puede identificar esos objetos por su ausencia en `design_file_versions.object_path` y eliminarlos mediante la API de Storage después de un periodo de retención.

El frontend requiere alojamiento estático HTTPS con las cabeceras de [Vercel](../vercel.json) o [Netlify](../netlify.toml). En particular, SVG-Edit funciona en un iframe con origen aislado y carga sus módulos como recursos CORS. Una migración a Supabase autohospedado requiere trasladar usuarios, PostgreSQL y los objetos del bucket, conservar sus rutas y volver a compilar con la URL y la clave publicable nuevas.

SculptGL se compila desde un commit fijado e incluye sus licencias en `/sculptgl/LICENSE` y `/sculptgl/sculptgl.js.LICENSE.txt`. SVG-Edit 7.4.2 se sirve junto con su licencia y atribuciones en `/svg-edit/vendor/`.
