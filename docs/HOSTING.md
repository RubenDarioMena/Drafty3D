# Herramientas y alojamiento

## Revisión upstream

- **SolidCraft**, `tangency-labs/solidcraft`, revisión inspeccionada `728f753b8094e1a54c5cc8b7e453982afa028023`. Rust, egui/eframe, kernel truck; navegador con WebGPU y fallback WebGL2. Su pipeline `packaging/web/package.sh` publica un ZIP estático con rutas relativas. Se integra el release estable **v0.18.3**, sin modificar archivos de la aplicación. El hash del ZIP coincide con `SHA256SUMS.txt` del release. Las actualizaciones son explícitas: cambiar versión/URL/hash en `scripts/solidcraft.mjs`, revisar licencias y repetir las pruebas.
- **Materializr**, `materializr-cad/materializr`, revisión inspeccionada `602efd44429629c1979c35c8badb6920749125b0`, CMake 1.7.4. C++17, SDL3/OpenGL, ImGui y OpenCascade. README, `docs/building.md`, CMake y workflows no proporcionan un objetivo web/Emscripten ni un paquete web. Las menciones Emscripten encontradas en `portable-file-dialogs.h` son de esa dependencia y no constituyen un port de la aplicación. Los releases distribuyen binarios nativos.
- **Draft3D / Atlas** conserva la implementación del repositorio y las mejoras de `codex/atlas-cad`, integradas con el estado de `origin/main` antes de añadir la portada.

## Qué sirve Vercel

Un solo sitio sirve `/`, `/solidcraft/`, `/solidcraft/app/`, `/materializr/`, `/cad/` y `/about/`. La portada no ejecuta ni descarga motores. El contenedor visual de SolidCraft solo se crea al navegar a su página y apunta a archivos de este mismo alojamiento. No incorpora un editor remoto ni altera la identidad del proyecto.

Las librerías y recursos se descargan en build, nunca desde un CDN de terceros al abrir la portada. La descarga del ZIP está fijada por SHA-256, y un paquete alterado detiene el build. Las cachés locales están excluidas de Git. Los artefactos binarios generados solo se publican en `dist`, no en el historial del repositorio.

Durante las pruebas de Atlas se corrigió una selección que podía usar la matriz de cámara anterior al cambiar de plano antes del siguiente frame. El raycasting actualiza esa matriz sin dibujar un frame extra ni recalcular geometría. Una prueba sin render comprueba la selección inmediata en los tres planos.

El service worker upstream conserva su manifiesto y hashes originales. Su ámbito queda bajo `/solidcraft/app/`. No se amplía a `/` y no afecta al editor Atlas. Se conservan NOTICE, MIT, Apache-2.0, licencias de dependencias y de fuentes.

## Materializr y el servidor que falta

Este despliegue estático de Vercel no ofrece un proceso gráfico persistente ni puede ejecutar un binario de escritorio como aplicación web. Las funciones serverless tampoco sustituyen un servidor de escritorio remoto con GPU/CPU, almacenamiento y sesión persistente.

Para un acceso real de Materializr desde navegador se necesita un VPS/servidor separado, una sesión gráfica con la aplicación instalada y una pasarela web de escritorio remoto protegida con autenticación/TLS. Es un servicio diferente, con costes y mantenimiento propios. No se ha creado una instancia ficticia ni expuesto un escritorio sin protección. Mientras no exista ese servicio, `/materializr/` indica el límite y enlaza la instalación oficial.

Si ya existe ese servicio, configurar `MATERIALIZR_WEB_URL=https://materializr.example.com/` en las variables de build de Vercel añade un botón hacia él. La URL debe ser HTTPS y no contener credenciales. La configuración no crea infraestructura y no convierte el programa nativo en WASM.

## Validación de publicación

1. `npm ci`, pruebas unitarias, build y suite de navegador.
2. Publicar el commit en `main` para activar Vercel.
3. Verificar el estado de despliegue de ese commit y `/deployment.json` en producción.
4. Abrir SolidCraft y Atlas desde la portada, comprobar arranque y archivos WASM locales.
5. Comprobar que Materializr informa de la disponibilidad real.

En entornos con restricciones de red, permitir el sitio Vercel y `api.github.com` es necesario para observar producción y sus estados. Un push correcto no prueba por sí solo que el despliegue haya terminado.
