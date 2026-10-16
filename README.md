# Drafty3D

Investigación y prototipos para una aplicación de diseño paramétrico, edición directa CAD y modelado poligonal.

**Estado actual:** laboratorio interactivo de cinco interfaces y documentación de producto. El motor CAD del proyecto de origen aún no se ha migrado a este repositorio. El soporte 3D del laboratorio es una ilustración interactiva, no geometría calculada por OpenCascade.

## Contenido

- [Cinco propuestas de UI](docs/investigacion/propuestas-ui.html): Atlas, Foco, Taller, Secuencia y Guía; cambio de diseño con estado compartido, notas y evaluación exportable.
- [Documento de diseño](docs/investigacion/disenos-ui.md): explicación de cada variante y primeros pasos de implementación.
- [Comparativa de funciones](docs/investigacion/comparativa-cad.html): investigación, fuentes y viabilidad técnica.
- [Selección provisional](docs/investigacion/drafty3d-seleccion-funciones-1.json): respuesta de producto utilizada para los diseños.

## Conectar a Netlify

Importar este repositorio de GitHub en Netlify y elegir la rama `main`. La configuración está versionada en [`netlify.toml`](netlify.toml):

| Campo | Valor |
| --- | --- |
| Base directory | Vacío (raíz del repositorio) |
| Package directory | Vacío |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node.js | 22 |
| Variables secretas o servicios adicionales | Ninguno |

La portada redirige a `/docs/investigacion/propuestas-ui.html`. Se conservan las rutas de investigación, documentos y JSON. No hay backend ni configuración de SPA. El build publica una lista explícita de archivos estáticos y comprueba sus enlaces HTML locales; el generador Python permanece en el repositorio como herramienta editorial.

Después de conectar GitHub y desplegar, los pushes a la rama de producción configurada en Netlify podrán actualizar el sitio mediante su despliegue continuo. Esta configuración prepara la publicación; el repositorio por sí solo no crea un sitio en la cuenta de Netlify.

Referencia: [configuración por archivo de Netlify](https://docs.netlify.com/build/configure-builds/file-based-configuration/).

## Desarrollo y vista previa

Requiere Node.js 22 o posterior. El build no tiene dependencias npm externas.

```sh
npm ci
npm run build
npm run preview
```

Abrir `http://127.0.0.1:4188`. La vista previa usa Python 3 y el puerto 4188 para poder coexistir con una vista de trabajo en 4187. El directorio `dist` se regenera y no se versiona.

Para servir las fuentes directamente:

```sh
python3 -m http.server 4187 --bind 127.0.0.1
```

Para regenerar únicamente la comparativa después de editar su generador:

```sh
python3 docs/investigacion/generar_informe.py
```

Las evaluaciones y notas se guardan en el navegador. El dominio de Netlify tendrá un almacenamiento distinto al de localhost; exportar el JSON permite conservar las evaluaciones para revisión. No hay sincronización entre navegadores ni importador de evaluaciones en el laboratorio actual.

## Próxima etapa

Extraer el editor CAD, separar documento/sesión/presentación y conectar un registro común de comandos a la nueva UI. El plan y los criterios para elegir diseño están en [disenos-ui.md](docs/investigacion/disenos-ui.md).
