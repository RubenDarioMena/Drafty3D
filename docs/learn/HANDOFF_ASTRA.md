# Handoff: Drafty3D Learn con Codex-Astra

Documento para una sesión de Claude Code **local** (en la Mac de Freeman) que continúa el trabajo de la sesión en la nube. Esa sesión local coordina a **Codex-Astra** (`codex-astra` en la terminal) en iteraciones acotadas, revisa lo que produce, corre las pruebas y sube el resultado.

Léelo completo antes de lanzar a Astra. Después lee `docs/learn/README.md` (decisiones y cómo probar), `docs/learn/ROADMAP.md` (temario) y `docs/learn/PIPELINE_CONTRACT.md` (formato de las lecciones).

---

## 1. Reglas que no cambian

- **Nunca hacer push a `main`.** Se trabaja en `codex/portal-diseno`. Freeman revisa y hace el merge. No abrir PR si Freeman no lo pide; el PR #13 debe quedar estable.
- **Firma del APK:** una sola llave. Freeman la genera en su PC con `keytool` y la sube como secreto de GitHub junto con su contraseña. La llave nunca pasa por el chat ni por un archivo del repositorio.
- **App sin Internet:** el APK no pide el permiso INTERNET (solo VIBRATE). Las pruebas de Playwright fallan si la app pide algo fuera de `/learn/`, y el workflow falla si el APK pide INTERNET. Nada de CDN, fuentes remotas ni analítica.
- **Computer use:** solo si aparece algo que los scripts no puedan reproducir, y avisando a Freeman antes.
- **Idiomas:** la interfaz de la app en inglés (como Blender), la documentación de `docs/learn/` en español, las respuestas a Freeman en español.
- **Commits:** terminan con las líneas de atribución que pida el entorno. No se sube la carpeta `research/` si existe (es de otra sesión).
- **Zona segura de Android:** todo el contenido queda dentro de `env(safe-area-inset-*)` (el padding de `#app`); los menús se colocan con `placeMenu` en `learn/src/menu.js`, que respeta los cuatro lados.

## 2. Cómo trabaja Astra

Astra (Codex CLI con la cuenta "astra") escribe código. La sesión local de Claude es quien lo dirige y la única que integra.

- **Comando:** `~/.local/bin/codex-astra` es un script que pone `CODEX_HOME=~/.codex-astra` y ejecuta `codex` (0.166.0, sesión de ChatGPT activa). No tocar `~/.codex`: es otra cuenta. Antes de la primera tarea, revisa `codex-astra --help` y `codex-astra exec --help` para confirmar las opciones de esta versión.
- **Encierro:** Astra trabaja siempre en un **worktree aparte** y con el sandbox de Codex en modo de escritura limitada al directorio de trabajo y **sin red**. Así no instala nada en la Mac ni toca otros proyectos. Ejemplo:

  ```bash
  git -C ~/ruta/Drafty3D worktree add ../drafty3d-astra -b astra/<tarea> codex/portal-diseno
  ```

  ```bash
  codex-astra exec --cd ../drafty3d-astra --sandbox workspace-write "<prompt>"
  ```

  (Ajusta las opciones a lo que diga `--help`. Para la fase de planeación usa `--sandbox read-only`.)
- **Dependencias:** `npm ci` y la instalación del navegador de Playwright las hace la sesión de Claude, no Astra.
- **Iteraciones acotadas:** una operación o una pieza por tarea, con su prueba de aceptación escrita en el prompt. Al terminar: la sesión de Claude lee el diff, corre las pruebas, corrige o devuelve a Astra con observaciones concretas, y solo entonces hace merge a `codex/portal-diseno` y push.
- **Contexto:** a Astra se le da el panorama completo **una vez**, en la planeación (sección 6). Después, cada tarea lleva solo el contexto de ingeniería que necesita (sección 7). De vez en cuando se le puede recordar el objetivo grande: para generar cosas completas en 3D puede ser un buen modelo.
- **Gasto:** la idea es aprovechar al máximo el plan de Astra, así que las tareas grandes de código (operaciones de malla, pruebas, refactors) van a Astra. La sesión de Claude se queda con la revisión, la integración y las decisiones.

## 3. Qué es la app

Drafty3D Learn (`/learn/`) enseña Blender 5.3 en un celular, sin Internet. Hoy tiene 4 niveles completos (30 de 58 lecciones de la ruta, ver `ROADMAP.md`): moverse y crear, modelado en Edit Mode, modificadores y escultura.

Cada lección es una pareja:

- **Watch** (`learn/src/watch.js`): la app hace la operación paso a paso con un cursor animado, sobre la interfaz de Blender (Properties, header del 3D Viewport, menús, Adjust Last Operation, Outliner). Se puede avanzar acción por acción, con la barra o con Autoplay. Si la persona gira la vista, se queda donde la dejó (⟲ Reset view vuelve a la de Blender).
- **Your turn** (`learn/src/yourturn.js`): la persona repite la operación con otros valores. Hoy funciona como un **candado de combinación**: cada paso se resuelve cuando el control correcto queda en el valor correcto (`isSolved` en `learn/src/state.js`), o cuando un toque cae sobre la cara, arista o punto que Blender seleccionó, o cuando un trazo de escultura sigue la guía (`trace.js`).

**Lo esencial:** la app **no calcula geometría**. Todo lo que muestra lo grabó Blender real (`learn/pipeline/blender/*.py`, con bpy) y la app solo reproduce estados:

- `learn/public/examples/<módulo>/<lección>/timeline.json`: `initial` y `steps`. Cada paso tiene `action`, el id semántico del control, `camera`, y en los niveles 1 y 2 `after` (escena, modo, selección, panel de redo) y `edit` (`verts`, `edges`, `faces` y selección de la malla en Edit Mode).
- `step-NN.glb`: la malla que Blender exportó después de ese paso.
- `learn/public/examples/blender-ui.json`: etiquetas, menús, campos y atajos leídos de Blender.
- Verificación: `learn/verify.html` + `learn/src/verify.js` dibujan las normales de la malla con three.js y las comparan con el render de Blender (`tests/browser/learn-verify.spec.mjs`).

## 4. El problema que motiva el plan

En el celular, Your turn muchas veces no da la misión por cumplida aunque la persona hizo algo equivalente (otro gesto, otra arista del mismo anillo, otro camino a la misma forma). La razón es que la app compara **el gesto o el control**, no **el resultado**, porque no sabe calcular el resultado.

## 5. El plan: operaciones reales, lección por lección

En lugar de clonar Blender de cero a cien, se construye **lo justo para que cada tutorial sea una operación real** sobre su pieza: la persona hace la operación, la app calcula la malla, y el paso se cumple si el **resultado** coincide con el de Blender. Así cualquier gesto equivalente sirve.

**La prueba de aceptación ya existe en los datos:** para cada paso tenemos el estado antes (`edit` del paso anterior o la malla `glb`) y el estado que Blender dejó después. Una operación está lista cuando, aplicada a la pieza de la lección con los valores del paso, da el mismo resultado:

- **Edit Mode:** mismos números de puntos, aristas y caras, y posiciones iguales con tolerancia de 1e-4 m, **sin depender del orden** de los índices (emparejar por vecino más cercano). Blender no siempre numera igual que nosotros, y eso no importa.
- **Object Mode:** ubicación, rotación y escala de cada objeto iguales a `after.scene`, con la misma tolerancia.
- **Imagen:** además, la comparación de render de `verify.js` sobre la malla calculada, con sus mismos umbrales.

**Orden sugerido (de fácil a difícil):**

1. **Núcleo de malla:** una estructura tipo BMesh / half-edge en `learn/src/` (puntos, aristas, caras, selección), con conversión desde y hacia `edit` y la geometría de three.js. Sin dependencias nuevas salvo que haga falta.
2. **Object Mode:** Move, Rotate, Scale con valores exactos; Add de primitivas (cubo, UV sphere, cilindro, plano, grid) con los parámetros de Adjust Last Operation; Duplicate.
3. **Modificadores sencillos:** Mirror, Array, Solidify, Simple Deform, Wireframe.
4. **Edit Mode:** Extrude, Inset, Loop Cut and Slide, Bevel, Merge, Proportional Editing.
5. **Difíciles:** Knife; Boolean (posible librería de geometría empaquetada dentro de la app, offline, con licencia compatible); Subdivision.
6. **Escultura:** pinceles aproximados; aquí la comparación es por render y tolerancia, no por puntos exactos.

Después de cada operación real, Your turn deja de pedir el gesto exacto y juzga el resultado. Ese cambio en `yourturn.js` y `state.js` se hace en la sesión de Claude, o en una tarea de Astra aparte, cuando Freeman haya contado su idea para la detección en móvil (está en espera).

## 6. Prompt de planeación para Astra (contexto amplio, solo lectura)

```text
Eres parte de un equipo que construye Drafty3D Learn, una app offline (web + APK Android con Capacitor) que enseña Blender 5.3 en el celular. Lee docs/learn/HANDOFF_ASTRA.md, docs/learn/README.md, docs/learn/ROADMAP.md y docs/learn/PIPELINE_CONTRACT.md, y recorre learn/src/ y un timeline de cada módulo en learn/public/examples/.

Hoy la app reproduce estados que grabó Blender; no calcula geometría. Queremos que cada lección sea una operación real: la persona hace la operación en el celular, la app calcula la malla, y el paso se cumple si el resultado coincide con el de Blender (los timelines ya traen el antes y el después de cada paso).

No escribas código todavía. Entrega un plan en docs/learn/PLAN_OPERACIONES.md (en español):
1. Arquitectura del núcleo de malla (estructura de datos, conversión desde y hacia el campo "edit" de los timelines y three.js, cómo se integra con viewer.js y scene-view.js).
2. La lista de operaciones que usan las 30 lecciones actuales, agrupadas en iteraciones pequeñas, de fácil a difícil, cada una con su prueba de aceptación concreta (qué timeline, qué paso, qué se compara y con qué tolerancia).
3. Riesgos: numeración de índices distinta a Blender, operaciones difíciles (Knife, Boolean, Bevel, escultura), rendimiento en un celular de gama media, tamaño del APK.
Restricciones: sin red ni dependencias remotas en tiempo de ejecución; código y textos de la interfaz en inglés; nada de cambios fuera de learn/, tests/ y docs/learn/.
```

## 7. Plantilla de tarea de ingeniería (contexto acotado)

```text
Tarea: <operación>, iteración <n> de docs/learn/PLAN_OPERACIONES.md.
Archivos: <lista corta>.
Entrada: el estado "edit" del paso <k-1> de learn/public/examples/<módulo>/<lección>/timeline.json y los valores del paso <k>.
Aceptación: una prueba en tests/<nombre>.test.mjs (node --test) que aplique la operación y compare con el "edit" del paso <k>: mismos números de puntos, aristas y caras; posiciones con tolerancia 1e-4 sin depender del orden. Debe pasar `npm test`.
No cambies: la interfaz, otros módulos, package.json (si necesitas una dependencia, dilo y detente).
Al terminar: resume qué hiciste, qué quedó pendiente y qué dudas tienes.
```

## 8. Cómo probar (en la Mac)

Requisitos: Node 22, git y el Chromium de Playwright (`npx playwright install chromium`; en la nube ya venía instalado).

```bash
npm ci
```

```bash
npm test
```

```bash
npm run build
```

```bash
npx playwright test --trace off
```

- `npm test`: pruebas de Node, incluido el contrato entre el pipeline y la interfaz (`tests/learn.test.mjs`). Hoy son 22 y pasan.
- Playwright: 86 pruebas en un Pixel 7 emulado (`tests/browser/learn.spec.mjs` y `learn-verify.spec.mjs`). Hoy pasan todas.
- No hace falta Blender para este plan: las mallas de referencia ya están en los timelines. Solo hace falta para grabar lecciones nuevas (`learn/pipeline/get-blender.sh`).

## 9. Publicar

- Push a `codex/portal-diseno`: el workflow `learn-android.yml` publica la vista previa en la rama `preview`. Enlace: `https://raw.githack.com/RubenDarioMena/Drafty3D/<sha>/learn/index.html`, con el sha de la punta de la rama `preview`.
- APK: solo se compila al lanzarlo a mano (workflow_dispatch del mismo workflow sobre `codex/portal-diseno`). Queda en https://github.com/RubenDarioMena/Drafty3D/releases/download/learn-preview/drafty3d-learn.apk

## 10. Estado al momento del handoff

- Último commit de la sesión en la nube: Watch conserva la vista del usuario, botón Proportional con nombre y On/Off, menús dentro de la zona segura y revisión de INTERNET en el APK.
- En espera: la detección de misiones en móvil (Freeman va a contar su plan; este documento propone juzgar por resultado).
- Siguiente paso: lanzar la planeación de la sección 6, revisar el plan con Freeman y empezar por el núcleo de malla.
