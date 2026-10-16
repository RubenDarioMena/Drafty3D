"""Genera el informe autónomo; biblioteca estándar de Python, sin descargas."""
from pathlib import Path
from html import escape
import json

ROOT = Path(__file__).resolve().parent
SOURCES = {
    'P1': ('Plasticity · enfoque y ediciones', 'https://www.plasticity.xyz/'),
    'P2': ('Plasticity · trazado y primitivas', 'https://doc.plasticity.xyz/all-commands/tool-commands'),
    'P3': ('Plasticity · transformaciones, patrones y materiales', 'https://doc.plasticity.xyz/all-commands/common-commands'),
    'P4': ('Plasticity · comandos de sólidos y superficies', 'https://doc.plasticity.xyz/all-commands/solid-commands'),
    'P5': ('Plasticity · Dimension', 'https://doc.plasticity.xyz/common/dimension'),
    'P6': ('Plasticity · Offset Face / Push Face', 'https://doc.plasticity.xyz/solid/offset-face'),
    'P7': ('Plasticity · Fillet', 'https://doc.plasticity.xyz/solid/fillet'),
    'P8': ('Plasticity · XNurbs', 'https://doc.plasticity.xyz/solid/xnurbs'),
    'P9': ('Plasticity · PolySplines', 'https://doc.plasticity.xyz/solid/polyspline'),
    'P10': ('Plasticity · menú radial', 'https://doc.plasticity.xyz/plasticity-essentials/radial-menu'),
    'P11': ('Plasticity · formatos por edición', 'https://doc.plasticity.xyz/plasticity-essentials/import-export'),
    'P12': ('Plasticity · Section Analysis', 'https://doc.plasticity.xyz/common/section-analysis'),
    'P13': ('Plasticity · Spline Curve', 'https://doc.plasticity.xyz/tool/spline-curve'),
    'O1': ('Onshape · herramientas de croquis', 'https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm'),
    'O2': ('Onshape · restricciones', 'https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm'),
    'O3': ('Onshape · operaciones paramétricas y previsualización', 'https://cad.onshape.com/help/Content/PartStudio/feature_basics.htm'),
    'O4': ('Onshape · Move Face', 'https://cad.onshape.com/help/Content/PartStudio/move_face.htm'),
    'O5': ('Onshape · Extrude', 'https://cad.onshape.com/help/Content/PartStudio/extrude.htm'),
    'O6': ('Onshape · Loft', 'https://cad.onshape.com/help/Content/PartStudio/loft.htm'),
    'O7': ('Onshape · Sweep', 'https://cad.onshape.com/help/Content/PartStudio/sweep.htm'),
    'O8': ('Onshape · Fillet', 'https://cad.onshape.com/help/Content/PartStudio/fillet.htm'),
    'O9': ('Onshape · Chamfer', 'https://cad.onshape.com/help/Content/PartStudio/chamfer.htm'),
    'O10': ('Onshape · Shell', 'https://cad.onshape.com/help/Content/PartStudio/shell.htm'),
    'O11': ('Onshape · modelado de superficies', 'https://cad.onshape.com/help/Content/PartStudio/surface_modeling.htm'),
    'O12': ('Onshape · Mixed Modeling', 'https://cad.onshape.com/help/Content/PartStudio/mixed_modeling.htm'),
    'O13': ('Onshape · patrones de piezas, caras y operaciones', 'https://cad.onshape.com/help/Content/PartStudio/linear_pattern.htm'),
    'O14': ('Onshape · Mates', 'https://cad.onshape.com/help/Content/Assembly/mates.htm'),
    'O15': ('Onshape · Sheet Metal Model', 'https://cad.onshape.com/help/Content/PartStudio/sheet_metal_model.htm'),
    'O16': ('Onshape · creación de planos', 'https://cad.onshape.com/help/Content/Drawing/creating_a_drawing.htm'),
    'O17': ('Onshape · exportación', 'https://cad.onshape.com/help/Content/File/exporting_files.htm'),
    'O18': ('Onshape · guardado, versiones y colaboración', 'https://cad.onshape.com/help/Content/Home/getting_started_with_onshape.htm'),
    'O19': ('Onshape · configuraciones', 'https://cad.onshape.com/help/Content/PartStudio/configurations.htm'),
    'O20': ('Onshape · FeatureScript', 'https://cad.onshape.com/FsDoc/'),
    'O21': ('Onshape · atajos y personalización', 'https://cad.onshape.com/help/Content/Plans/my_account_preferences.htm'),
    'M1': ('3D Modeling App · ficha oficial del desarrollador', 'https://play.google.com/store/apps/details?id=com.inforcegames.app3dmodelling'),
    'M2': ('3D Modeling App · web de soporte', 'https://3dmodelingapp.info/'),
    'F1': ('FreeCAD · funciones oficiales', 'https://www.freecad.org/features.php?lang=eng_EN'),
    'B1': ('Blender · edición de malla, manual 5.2', 'https://docs.blender.org/manual/en/5.2/modeling/meshes/editing/index.html'),
    'T1': ('OCCT · Modeling Algorithms, documentación actual', 'https://occt3d.com/dev/doc/overview/html/occt_user_guides__modeling_algos.html'),
    'T2': ('OCCT · OCAF y nombres topológicos', 'https://occt3d.com/dev/doc/overview/html/occt_user_guides__ocaf.html'),
    'T3': ('OCCT · topología e historial de modificaciones (PDF)', 'https://dev.opencascade.org/sites/default/files/pdf/Topology.pdf'),
    'T4': ('Emscripten · pthreads y requisitos del navegador', 'https://emscripten.org/docs/porting/pthreads'),
}

# id, categoría, título, Plasticity/texto/fuentes, Onshape/texto/fuentes,
# móvil/texto/fuentes, distinción, oportunidad Drafty3D, recomendación.
ROWS = [
 ('seleccion','interaccion','Selección y acceso a herramientas',
  'Paleta de comandos y menús radiales personalizables junto al cursor; herramientas que responden a la selección.', 'P10 P6',
  'Barra por contexto, búsqueda y menú S personalizable cerca del puntero. El catálogo amplio no obliga a usar siempre la barra superior.', 'O21 O3',
  'Gestos; selección de vértices, aristas, caras y objetos.', 'M1',
  'La interfaz puede ser directa en los tres casos. Lo que cambia es qué entidad se selecciona y qué operación puede conservarse después.',
  'Selección primero, acciones válidas al lado del cursor y un inspector acoplado con medidas. Paleta buscable para el catálogo completo.', 'incluir'),
 ('croquis','precision','Dibujar perfiles y curvas',
  'Líneas, círculos por distintos métodos, arcos, elipses, rectángulos, polígonos, splines y curvas por puntos de control.', 'P2 P13',
  'Entidades de croquis, geometría de construcción, recorte y curvas; los perfiles alimentan las operaciones posteriores.', 'O1',
  'Dibujar caras por puntos y cortar aristas.', 'M1',
  'Trazar una cara de polígonos no crea un croquis con restricciones. Las curvas CAD se conservan como curvas, aunque la pantalla las aproxime.',
  'Conservar rectángulo/círculo/polilínea; añadir arcos, recortar, offset, proyección y múltiples regiones con huecos.', 'incluir'),
 ('cotas','precision','Cotas y restricciones',
  'Dimension cambia diámetros, dimensiones de cajas, separaciones de caras y tamaños de redondeos mediante selección geométrica.', 'P5',
  'Cotas y relaciones como coincidencia, tangencia, paralelismo e igualdad. El croquis resuelve su sistema de restricciones.', 'O2',
  'Valores exactos de transformación y ajustes de rejilla.', 'M1',
  'Precisión numérica, edición de una dimensión y solver de restricciones son tres niveles distintos. Una etiqueta de distancia puede ser solo informativa.',
  'Cotas conductoras y de referencia diferenciadas; restricciones básicas con diagnóstico de grados de libertad y conflictos.', 'incluir'),
 ('historial','precision','Historial, variables y variantes',
  'El producto prioriza edición directa sin exigir árbol de operaciones. Tener medidas editables no implica reconstrucción por historial.', 'P1 P5',
  'Lista paramétrica de operaciones y configuraciones que cambian medidas, supresiones, materiales y otras propiedades.', 'O3 O19',
  'Historial paramétrico y solver: sin evidencia pública encontrada.', '',
  'Deshacer acciones no equivale a conservar intención de diseño. Una familia de variantes necesita parámetros relacionados, no copias sueltas.',
  'Mantener el grafo de dependencias; añadir variables con unidades y expresiones controladas. Configuraciones cuando la reconstrucción sea estable.', 'incluir'),
 ('transformar','interaccion','Mover, girar, repetir y reflejar',
  'Move, Rotate, Scale, Mirror y arrays rectangulares, radiales o sobre curvas.', 'P3',
  'Patrones de piezas, caras u operaciones; pueden reaplicar cada operación y omitir instancias.', 'O13',
  'Transformar, clonar y reflejar; entrada numérica.', 'M1',
  'Duplicar una geometría y regenerar una operación en cada posición producen comportamientos distintos cuando cambia la pieza original.',
  'Gizmos con escritura numérica y snap. Primero patrones de cuerpos; patrones de operaciones tras resolver referencias.', 'incluir'),
 ('extrusion','forma','Extrusión y revolución',
  'Extrude y Revolve generan geometría a partir de curvas o regiones.', 'P4',
  'Extrusión nueva, aditiva, sustractiva o de intersección, hasta cara/siguiente/pasante y con manipulador; revolución como feature.', 'O5 O3',
  'Extruir caras o aristas de una malla.', 'M1',
  'Extruir polígonos añade conectividad a la malla. Extruir un perfil CAD genera superficies y, si cierra correctamente, un sólido BRep.',
  'Arrastrar profundidad y confirmar una operación. Añadir revolución; después simétrica, pasante y hasta cara.', 'incluir'),
 ('loft','forma','Barrido, loft y tubos',
  'Sweep, Loft y Pipe cubren perfiles guiados y transiciones.', 'P4',
  'Loft entre secciones con guías y condiciones de contorno; Sweep con orientación, giro y escala del perfil.', 'O6 O7',
  'Equivalente CAD guiado: no documentado en la ficha.', '',
  'Loft interpola secciones; barrido transporta un perfil por una trayectoria. Unir caras a mano no conserva esas reglas.',
  'Loft sencillo y barrido de sección constante como ampliación. Guías múltiples y continuidad avanzada requieren otra etapa.', 'explorar'),
 ('booleanas','forma','Unir, restar, intersectar y recortar',
  'Boolean, Cut, Trim e Imprint distinguen combinar cuerpos, cortar y marcar intersecciones.', 'P4',
  'Operaciones de material y herramientas de división; Mixed Modeling admite algunas operaciones sobre representaciones mixtas.', 'O3 O12',
  'Combinar/separar objetos y rellenar bordes abiertos.', 'M1',
  'Combinar objetos puede ser solo agrupar sus polígonos. No acredita una unión booleana cerrada ni una intersección exacta.',
  'Conservar las booleanas BRep y hacer explícitos objetivo/herramienta. Booleanas de malla necesitarán un motor y validación propios.', 'incluir'),
 ('redondeos','forma','Redondeos y chaflanes',
  'Fillet actúa sobre geometría CAD; hay comandos para editar o retirar redondeos.', 'P7 P4',
  'Fillets constantes, variables, parciales y con controles de curvatura; Chamfer tiene su propia operación.', 'O8 O9',
  'Suavizado y normales; no acreditan un fillet CAD.', 'M1',
  'Suavizar el sombreado cambia la apariencia. Un fillet crea una superficie; un bevel poligonal agrega caras y depende de la teselación.',
  'Seleccionar aristas y arrastrar radio; chaflán constante. Mostrar fallo y conservar el último sólido válido.', 'incluir'),
 ('vaciado','forma','Vaciado, espesor y desmoldeo',
  'Hollow, Thicken y Draft Face trabajan sobre sólidos o superficies.', 'P4',
  'Shell retira caras y aplica espesor; las operaciones de superficie y pieza complementan el flujo.', 'O10 O11',
  'Espesor BRep y desmoldeo: sin evidencia encontrada.', '',
  'Escalar una copia interior no mantiene un espesor constante. El offset de superficies puede intersectarse consigo mismo.',
  'Vaciado de piezas simples con límites claros. Engrosado de superficies y desmoldeo después de validar offsets.', 'explorar'),
 ('superficies','forma','Superficies NURBS y continuidad',
  'Patch, Bridge Surface y edición de superficies; XNurbs permite condiciones G0/G1/G2 para rellenar contornos complejos.', 'P4 P8',
  'Curvas de apoyo, superficies por secciones, rellenos y controles de tangencia/curvatura; análisis para evaluar sus uniones.', 'O11',
  'Edición NURBS: no documentada en la ficha.', '',
  'G0 une posiciones, G1 alinea tangentes y G2 alinea curvatura. Verse liso en pantalla no demuestra continuidad ni estanqueidad.',
  'Empezar por superficies delimitadas sencillas. La calidad comparable a XNurbs es un trabajo de geometría especializado.', 'explorar'),
 ('caras','forma','Edición directa de caras CAD',
  'Push Face desplaza caras con distancia y opciones de crecimiento; Dimension ofrece cambios por geometría reconocida.', 'P6 P5',
  'Move Face traslada, gira o desfasa caras, también de piezas importadas; permite intentar reaplicar redondeos contiguos.', 'O4',
  'Mover caras, aristas o vértices libremente.', 'M1',
  'Una cara BRep puede ser cilíndrica o recortada y tener vecinas que reparar. Mover sus triángulos visibles no edita el sólido exacto.',
  'Gesto unificado con operaciones tipadas: cambiar parámetro conocido o crear una edición directa de cara identificada.', 'explorar'),
 ('topologia','malla','Edición de topología poligonal',
  'El flujo central documentado es CAD directo. PolySplines recibe mallas para producir superficies.', 'P1 P9',
  'Mixed Modeling relaciona malla y BRep con herramientas limitadas; no equivale a edición general de loops y vértices.', 'O12',
  'Merge, connect, loop cut, extrude, detach y reverse.', 'M1',
  'Aquí está la aportación principal de la app móvil. Vértice de malla y vértice CAD tienen funciones y vecindades distintas.',
  'Modo Malla con selección vértice/arista/cara, extrusión, corte, fusionar y rellenar. Necesita una estructura de adyacencia editable.', 'incluir'),
 ('esculpir','malla','Esculpir, subdividir y suavizar',
  'Deformaciones y edición de puntos de curvas/superficies. Subdivide del catálogo aumenta estructura de curvas/superficies; no prueba un sculpt poligonal.', 'P3 P4',
  'El catálogo consultado no acredita pinceles de esculpido ni un flujo de subdivisión poligonal como Blender.', '',
  'Pinceles mover/empujar/tirar/suavizar; tamaño y fuerza.', 'M1',
  'Normales suaves, relajación de vértices, subdivisión y esculpido son mecanismos distintos. Pueden alterar silueta, volumen o solo sombreado.',
  'Suavizado y subdivisión controlada después del editor básico; pinceles con aceleración espacial como investigación posterior.', 'explorar'),
 ('hibrido','malla','Pasar entre CAD y malla',
  'PolySplines convierte mallas en parches B-spline suaves y describe límites de creases/bevels. El producto anuncia esta función en Studio.', 'P9 P1',
  'Mixed Modeling conserva elementos analíticos y facetados; solo parte de sus herramientas funciona sobre el conjunto.', 'O12',
  'OBJ nativo; STEP depende de conversores externos.', 'M1',
  'Teselar CAD es una aproximación controlable. Reconstruir superficies desde polígonos es un problema inverso y no recupera automáticamente el diseño original.',
  'Conversión explícita BRep → copia de malla. Investigación separada para reconstrucción; preservar siempre el objeto CAD de origen.', 'explorar'),
 ('inspeccion','interaccion','Medir, inspeccionar y dar apariencia',
  'Medidas, secciones virtuales, materiales y visualización de curvatura.', 'P12 P3',
  'Herramientas de medida y propiedades; análisis de superficies con curvatura y continuidad para revisar calidad geométrica.', 'O11 O3',
  'Distancias, wireframe, normales, materiales y pintura de vértices.', 'M1',
  'Un color/material visual no define por sí mismo densidad o comportamiento físico. Medida sobre triángulos y medida CAD pueden diferir.',
  'Medidas exactas en CAD; mediciones poligonales identificadas en malla. Sección, aislar, wireframe y colores por objeto.', 'incluir'),
 ('ensamblajes','produccion','Ensamblajes y relaciones de movimiento',
  'Grupos, duplicación y colocación organizan la escena; no se acredita un sistema mecánico de mates equivalente.', 'P3 P1',
  'Mates con sistemas de coordenadas y grados de libertad entre instancias; conectores explícitos o implícitos.', 'O14',
  'Clonado y organización; mates mecánicos no acreditados.', 'M1',
  'Piezas en una escena no forman necesariamente un ensamblaje. Resolver articulaciones y persistir instancias es otro subsistema.',
  'Grupos y colocación ahora; mates fijos/revolutos solo al validar una necesidad de mecanismos.', 'posponer'),
 ('chapa','produccion','Chapa y desarrollo plano',
  'Unwrap Face figura en el catálogo; no demuestra un modelo de chapa con reglas de plegado.', 'P4',
  'Modelo de chapa con espesor, pliegues, tabla y patrón plano relacionados; restricciones específicas de operaciones.', 'O15',
  'Desarrollo de chapa: no documentado.', '',
  'Desenvolver una superficie para visualizarla no calcula compensación de pliegue, radios ni un desarrollo fabricable.',
  'Posponer hasta disponer de modelo de material/plegado y casos de fabricación para contrastar los desarrollos.', 'posponer'),
 ('planos','produccion','Planos técnicos 2D',
  'Exportación SVG y comando de líneas ocultas en el manual; no acreditan planos técnicos asociativos completos.', 'P11 P4',
  'Planos a partir de piezas/ensamblajes, vistas, cotas, hojas y plantillas; actualización tras cambios geométricos.', 'O16',
  'Planos técnicos asociativos: no documentados.', '',
  'Una imagen ortográfica no conserva cotas ni asociaciones. La dificultad aumenta cuando cambian las aristas a las que se acota.',
  'Vista y captura ortográfica primero. Más adelante proyección vectorial; planos asociativos como módulo propio.', 'posponer'),
 ('archivos','produccion','Intercambio de archivos',
  'STEP, Parasolid, OBJ, STL y otros formatos; IGES/SAT y algunas importaciones dependen de la edición y plataforma.', 'P11',
  'Exporta sólidos/superficies y mallas en formatos distintos, además de croquis/caras planas. Las opciones dependen de la entidad.', 'O17',
  'Importación/exportación OBJ.', 'M1',
  'STEP normalmente transporta geometría e información de producto, no el historial editable de la aplicación de origen. STL/OBJ no contienen ese historial.',
  'Proyecto propio + STEP para CAD, STL para impresión y OBJ para edición poligonal. Declarar unidades y pérdidas de cada conversión.', 'incluir'),
 ('colaboracion','produccion','Guardado, versiones y colaboración',
  'Archivos locales y publicación a Plasticity Share; compartir un modelo no acredita coedición simultánea.', 'P1 P3',
  'Guardado en nube, versiones, comparación/restauración y edición simultánea sobre documentos compartidos.', 'O18',
  'Autoguardado.', 'M1',
  'Un archivo recuperable, versiones locales y trabajo concurrente requieren garantías distintas. Sin backend no hay sincronización multiusuario.',
  'Autoguardado robusto, recuperación y archivo portable. Colaboración remota fuera de la primera versión.', 'incluir'),
 ('extensiones','produccion','Herramientas propias y automatización',
  'Paleta y menús personalizables; puentes con aplicaciones DCC. Personalizar acceso no crea nuevas operaciones geométricas.', 'P10 P1',
  'FeatureScript crea operaciones personalizadas integradas en Part Studios; no es una macro que repite clics.', 'O20',
  'API de extensiones: sin documentación encontrada.', '',
  'Cambiar atajos es trabajo de interfaz; ejecutar extensiones exige un contrato de documento, errores, versiones y aislamiento.',
  'Registro interno común de comandos para mouse, atajos y paleta. API pública o scripting cuando el modelo de operaciones esté asentado.', 'posponer'),
]

def refs(ids):
    return ' '.join(f'<a class="ref" href="{SOURCES[i][1]}" target="_blank" rel="noreferrer" title="{escape(SOURCES[i][0])}">{i} ↗</a>' for i in ids.split())

def build_rows():
    result = []
    labels = {'incluir':'Incluir', 'explorar':'Explorar', 'posponer':'Posponer'}
    for n, r in enumerate(ROWS, 1):
        ident, category, title, p, ps, o, os, m, ms, difference, proposal, choice = r
        cells = ''.join(f'<div class="app-cell {cls}"><span class="mobile-label">{label}</span><p>{text}</p><div class="refs">{refs(src)}</div></div>' for cls, label, text, src in [('plasticity','Plasticity',p,ps),('onshape','Onshape',o,os),('mobile-app','3D Modeling App',m,ms)])
        options = ''.join(f'<option value="{key}" {"selected" if key == choice else ""}>{value}</option>' for key, value in labels.items())
        result.append(f'''<article class="feature" id="{ident}" data-category="{category}" data-default="{choice}">
          <div class="feature-heading"><div><span class="number">{n:02}</span><h3>{title}</h3></div><label class="choice">Tu alcance <select aria-label="Alcance de {title}" data-choice="{ident}">{options}</select></label></div>
          <div class="compare-row">{cells}</div>
          <div class="difference"><strong>La diferencia</strong><p>{difference}</p></div>
          <div class="drafty-proposal"><strong>Para Drafty3D</strong><p>{proposal}</p><span class="recommend">Propuesta: {labels[choice].lower()}</span></div>
          <label class="personal-note" for="note-{ident}"><span>Nota personal <span class="optional">· opcional</span></span><textarea id="note-{ident}" data-note="{ident}" rows="2" maxlength="1000" placeholder="Anota una duda, caso de uso o decisión…"></textarea></label>
        </article>''')
    return '\n'.join(result)

def build_sources():
    return '\n'.join(f'<li id="fuente-{key}"><a href="{url}" target="_blank" rel="noreferrer"><b>{key}</b> {escape(label)} ↗</a></li>' for key,(label,url) in SOURCES.items())

TEMPLATE = r'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Investigación para Drafty3D: Plasticity, Onshape y 3D Modeling App; diferencias funcionales, alcance propuesto y viabilidad técnica sobre OpenCascade.js.">
<title>Drafty3D — Tres maneras de dar forma</title>
<style>
:root{color-scheme:light;--bg:#f5f4f0;--paper:#fff;--ink:#202a31;--muted:#5e6b72;--line:#d9dfdf;--teal:#126954;--teal-bg:#e7f2ec;--p:#7451a6;--p-bg:#f3eef9;--o:#2162a0;--o-bg:#edf4fa;--m:#96601b;--m-bg:#faf2e5;--red:#a33e39;--header:#132b32;--header-ink:#f4f7f4;--shadow:0 8px 30px #132b3207}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:90px}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select{font:inherit}a{color:var(--teal);text-underline-offset:3px}button,a,select,input{touch-action:manipulation}button,select{cursor:pointer}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #18a283;outline-offset:3px}button{border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);padding:9px 14px}button:hover{border-color:var(--teal)}button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}[hidden]{display:none!important}.wrap{width:min(1280px,calc(100% - 64px));margin:auto}.hero{background:var(--header);color:var(--header-ink);padding:36px 0 58px;position:relative;overflow:hidden}.hero:after{content:"";position:absolute;width:480px;height:480px;right:-170px;top:-210px;border:1px solid #9bc1b22b;border-radius:50%;box-shadow:0 0 0 65px #9bc1b208,0 0 0 130px #9bc1b206;pointer-events:none}.brand{display:flex;align-items:center;gap:12px;font-weight:650;letter-spacing:-.4px}.logo{display:grid;place-items:center;width:34px;height:34px;border:1px solid #9bc1b26b;transform:rotate(-10deg);font-size:19px;color:#addec3}.eyebrow{font-size:12px;letter-spacing:1.7px;text-transform:uppercase;font-weight:650}.hero .eyebrow{color:#afd0c5;margin:47px 0 16px}.hero h1{max-width:950px;font-size:clamp(38px,4.6vw,66px);line-height:1.08;font-weight:550;letter-spacing:-2px;margin:0 0 24px}.hero h1 em{color:#a8d6c0;font-style:normal}.hero .intro{max-width:830px;color:#d0dcda;font-size:19px;line-height:1.6}.meta{display:flex;gap:25px;flex-wrap:wrap;font-size:13px;color:#a7bfba;margin-top:30px}.nav{position:sticky;top:0;background:var(--paper);z-index:5;border-bottom:1px solid var(--line)}.nav .wrap{display:flex;align-items:center;gap:26px;min-height:62px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}.nav a{font-size:14px;text-decoration:none;color:var(--ink);padding:7px 0}.nav .nav-end{margin-left:auto;font-size:13px;color:var(--muted)}main{padding:42px 0 55px}.section{margin-bottom:64px}.section-tag{color:var(--teal);font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700}.section h2{font-size:32px;line-height:1.2;letter-spacing:-1px;font-weight:600;margin:8px 0 18px}.lead{color:var(--muted);max-width:900px;margin:0 0 25px;font-size:17px}.profiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.profile{padding:24px;background:var(--paper);border-top:4px solid var(--app-color);box-shadow:var(--shadow);border-radius:0 0 8px 8px}.profile h3{margin:0 0 6px;color:var(--app-color);font-size:20px}.profile .tag{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted)}.profile p{margin:15px 0 8px}.plasticity{--app-color:var(--p);--app-bg:var(--p-bg)}.onshape{--app-color:var(--o);--app-bg:var(--o-bg)}.mobile-app{--app-color:var(--m);--app-bg:var(--m-bg)}.ref{font-size:12px;font-weight:650;white-space:nowrap;color:var(--app-color,var(--teal));margin-right:7px;text-decoration:none}.ref:hover{text-decoration:underline}.note{border-left:3px solid var(--line);padding:2px 0 2px 18px;margin:24px 0;color:var(--muted);font-size:14px}.note strong{color:var(--ink)}.principle{display:grid;grid-template-columns:210px 1fr;gap:25px;margin:34px 0 0;border-top:1px solid var(--line);padding-top:22px}.principle h3{margin:0;font-size:18px}.principle p{margin:0;color:var(--muted)}.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:22px 0 16px}.filters button{font-size:13px;padding:8px 13px}.filters input{min-width:180px;flex:1;margin-left:12px;max-width:330px;padding:9px 12px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink)}.filter-status{font-size:13px;color:var(--muted);display:flex;gap:15px;justify-content:space-between;align-items:center;margin-bottom:14px}.legend{display:flex;gap:18px;flex-wrap:wrap}.legend span{display:flex;align-items:center;gap:7px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--app-color)}.column-head{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;background:var(--line);padding:1px;position:sticky;top:62px;z-index:4;border-radius:7px;overflow:hidden;margin-bottom:16px}.column-head div{padding:11px 21px;background:var(--app-bg);color:var(--app-color);font-weight:650;font-size:14px}.feature{background:var(--paper);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:0 0 20px;box-shadow:var(--shadow);scroll-margin-top:135px}.feature-heading{padding:18px 21px;display:flex;justify-content:space-between;align-items:center;gap:15px}.feature-heading>div{display:flex;gap:13px;align-items:baseline}.number{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}.feature h3{font-size:19px;margin:0;font-weight:650;letter-spacing:-.3px}.choice{display:flex;gap:8px;align-items:center;font-size:12px;white-space:nowrap;color:var(--muted)}select{padding:6px 27px 6px 9px;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:5px;font-size:13px;min-height:34px}.compare-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.app-cell{padding:18px 21px;background:var(--app-bg);border-top:2px solid var(--app-color);display:flex;flex-direction:column;justify-content:space-between}.app-cell+.app-cell{border-left:3px solid var(--paper)}.app-cell p{margin:0 0 11px;font-size:14px;line-height:1.65}.refs{min-height:20px}.mobile-label{display:none}.difference,.drafty-proposal{display:grid;grid-template-columns:145px 1fr;gap:12px;padding:15px 21px;font-size:14px;border-top:1px solid var(--line)}.difference strong,.drafty-proposal strong{font-weight:650;font-size:12px;letter-spacing:.2px}.difference p,.drafty-proposal p{margin:0}.difference{color:var(--muted)}.drafty-proposal{background:var(--teal-bg);color:var(--teal);grid-template-columns:145px 1fr auto}.recommend{font-size:11px;text-transform:uppercase;letter-spacing:.6px;align-self:center}.action-line{display:flex;justify-content:space-between;gap:18px;align-items:center;flex-wrap:wrap;margin-top:22px}.action-line p{font-size:13px;max-width:720px;color:var(--muted);margin:0}.action-line button{font-size:13px}.decision-counter{font-size:13px;color:var(--teal)}.baseline{display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:26px;background:var(--paper);border:1px solid var(--line);border-radius:8px}.baseline h3{font-size:17px;margin:0 0 12px}.baseline ul{margin:0;padding-left:20px;font-size:14px}.baseline li{margin:8px 0}.baseline code,code{font-size:.88em;overflow-wrap:anywhere;background:var(--bg);padding:1px 4px;border-radius:3px}.path{font-size:12px;color:var(--muted);overflow-wrap:anywhere;margin-top:12px}.risk-intro{display:grid;grid-template-columns:1.05fr 1fr;gap:35px;margin:30px 0}.risk-intro h3{margin:0 0 12px;font-size:25px;line-height:1.25;font-weight:550;letter-spacing:-.5px}.risk-intro p{margin:0;color:var(--muted)}.flow{display:grid;grid-template-columns:1fr 40px 1fr;align-items:center;margin:25px 0}.flow-block{background:var(--paper);padding:20px;border:1px solid var(--line);border-radius:7px}.flow-block h4{margin:0 0 8px;font-size:16px}.flow-block p{margin:0;font-size:13px;color:var(--muted)}.arrow{text-align:center;color:var(--teal);font-size:24px}.flow-note{font-size:13px;margin-top:13px;color:var(--muted)}.technical-table{width:100%;border-collapse:collapse;font-size:14px;background:var(--paper)}.technical-table th{font-size:12px;text-transform:uppercase;letter-spacing:.4px;background:var(--teal-bg);color:var(--teal);text-align:left}.technical-table th,.technical-table td{padding:15px 17px;border-bottom:1px solid var(--line);vertical-align:top}.technical-table td:first-child{width:23%;font-weight:600}.technical-table td:nth-child(2){width:23%}.level{display:inline-block;font-size:11px;padding:2px 7px;letter-spacing:.3px;border-radius:3px;margin-bottom:5px;border:1px solid currentColor}.level.high{color:var(--red)}.level.mid{color:var(--m)}.level.low{color:var(--teal)}.risks{margin-top:26px}details{background:var(--paper);border-bottom:1px solid var(--line);padding:0 22px}details:first-child{border-top:1px solid var(--line)}summary{padding:18px 0;cursor:pointer;font-weight:600;font-size:16px;list-style-position:outside;margin-left:17px}summary .severity{color:var(--red);font-size:11px;letter-spacing:1px;margin-right:12px;text-transform:uppercase}details[open]{padding-bottom:22px}.risk-body{display:grid;grid-template-columns:1fr 1fr;gap:25px;font-size:14px}.risk-body p{margin:0 0 12px}.risk-body strong{color:var(--teal)}.risk-body .refs{margin-top:12px}.risk-body h4{font-size:12px;text-transform:uppercase;color:var(--muted);letter-spacing:.5px;margin:0 0 10px}.phases{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.phase{border-top:3px solid var(--teal);padding-top:16px}.phase .phase-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--teal)}.phase h3{font-size:21px;line-height:1.3;margin:10px 0}.phase ul{padding-left:19px;font-size:14px;margin-bottom:18px}.phase li{margin-bottom:9px}.phase p{font-size:13px;color:var(--muted)}.ui-table{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:24px}.ui-block{padding:20px;background:var(--paper);border:1px solid var(--line);border-radius:7px}.ui-block .tiny{color:var(--teal);font-size:11px;text-transform:uppercase;letter-spacing:.8px}.ui-block h3{font-size:17px;margin:8px 0}.ui-block p{font-size:14px;margin:0;color:var(--muted)}.sources{columns:2;column-gap:40px;padding:0;list-style:none;font-size:13px}.sources li{padding:7px 0;break-inside:avoid;border-bottom:1px solid var(--line)}.sources a{text-decoration:none;color:var(--muted)}.sources a:hover{text-decoration:underline;color:var(--teal)}.sources b{display:inline-block;min-width:33px;color:var(--ink)}.local-evidence{font-size:13px;padding:22px;border:1px solid var(--line);border-radius:7px;margin-top:26px}.local-evidence p{margin:0 0 12px}.local-evidence ul{padding-left:18px;margin:0}.local-evidence li{margin:9px 0;overflow-wrap:anywhere}footer{border-top:1px solid var(--line);font-size:12px;padding:25px 0;color:var(--muted)}.no-results{padding:26px;border:1px solid var(--line);background:var(--paper);border-radius:8px}.skip{position:absolute;left:-999px}.skip:focus{left:10px;top:10px;background:var(--paper);padding:10px;z-index:20}.toolbar-actions{display:flex;gap:8px}.method{font-size:14px;color:var(--muted);max-width:1060px}.method strong{color:var(--ink)}.callout{padding:24px;background:var(--teal-bg);color:var(--teal);border-radius:8px;font-size:17px;margin:26px 0}.callout p{margin:0}.evidence-label{font-size:11px;font-weight:650;text-transform:uppercase;letter-spacing:.7px;color:var(--teal)}
.personal-note{display:grid;grid-template-columns:165px minmax(0,1fr);gap:14px;align-items:start;padding:13px 21px 17px;border-top:1px solid var(--line);background:var(--paper);font-size:13px}.personal-note>span{padding-top:7px;font-weight:600}.optional{color:var(--muted);font-weight:400}.personal-note textarea{display:block;width:100%;min-height:60px;max-height:240px;resize:vertical;border:1px solid var(--line);border-radius:5px;padding:8px 10px;background:var(--paper);color:var(--ink);font-size:14px;line-height:1.45}.personal-note textarea::placeholder{color:var(--muted);opacity:.85}.personal-note textarea:focus-visible{outline:3px solid #18a283;outline-offset:2px}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#141c21;--paper:#1d282e;--ink:#e7eeee;--muted:#abb9bf;--line:#39464c;--teal:#9cd3bb;--teal-bg:#233a34;--p:#c5a6eb;--p-bg:#2d2939;--o:#9fc9ef;--o-bg:#23323e;--m:#e9c181;--m-bg:#383127;--red:#f0a19b;--header:#10262d;--shadow:none}}
@media(max-width:900px){.wrap{width:calc(100% - 36px)}.nav .wrap{gap:18px}.nav .nav-end{display:none}.profiles{gap:10px}.profile{padding:18px}.drafty-proposal{grid-template-columns:120px 1fr}.recommend{grid-column:2}.difference{grid-template-columns:120px 1fr}.technical-table th,.technical-table td{padding:12px}.sources{column-gap:25px}.phases{gap:18px}}
@media(max-width:650px){html{scroll-padding-top:115px}.hero{padding-top:24px}.hero .eyebrow{margin-top:35px}.hero h1{letter-spacing:-1px}.hero .intro{font-size:17px}.meta{gap:8px 20px}.nav .wrap{gap:4px 20px}.nav a{font-size:13px}.profiles,.baseline,.risk-intro,.risk-body,.phases,.ui-table{grid-template-columns:1fr}.section h2{font-size:28px}.section{margin-bottom:45px}.principle{grid-template-columns:1fr;gap:10px}.column-head{display:none}.compare-row{grid-template-columns:1fr}.app-cell+.app-cell{border-left:none}.mobile-label{display:block;font-size:12px;font-weight:700;color:var(--app-color);margin-bottom:7px}.feature-heading{flex-wrap:wrap;padding:17px}.feature h3{font-size:18px}.choice{margin-left:28px}.difference,.drafty-proposal{display:block;padding:15px 17px}.difference strong,.drafty-proposal strong{display:block;margin-bottom:5px}.recommend{display:inline-block;margin-top:10px}.filters input{margin:4px 0 0;max-width:none;flex-basis:100%}.filter-status{align-items:flex-start;flex-direction:column;gap:8px}.legend{gap:13px;font-size:12px}.baseline{gap:24px;padding:20px}.flow{grid-template-columns:1fr;gap:12px}.arrow{transform:rotate(90deg)}.sources{columns:1}.risk-intro{gap:20px}.technical-table,.technical-table tbody,.technical-table tr,.technical-table td{display:block}.technical-table thead{display:none}.technical-table tr{border-bottom:1px solid var(--line);padding:10px 0}.technical-table td{border-bottom:none;padding:6px 15px}.technical-table td:first-child,.technical-table td:nth-child(2){width:auto}.technical-table td:before{content:attr(data-label);display:block;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin-bottom:3px}.feature{scroll-margin-top:105px}.personal-note{grid-template-columns:1fr;gap:5px;padding:12px 17px 15px}.personal-note>span{padding:0}.personal-note textarea{min-height:64px;font-size:16px}select{font-size:16px}.toolbar-actions{flex-wrap:wrap}summary{font-size:15px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{:root{color-scheme:light;--bg:#fff;--paper:#fff;--ink:#111;--muted:#444;--line:#ccc;--teal:#165742;--teal-bg:#eff7f2;--p:#653c94;--p-bg:#f6f1fa;--o:#17538b;--o-bg:#f0f6fb;--m:#805014;--m-bg:#fbf4e9}.wrap{width:100%}.hero{color:#111;background:#fff;padding:0 0 25px}.hero h1 em,.hero .eyebrow,.hero .intro,.hero .meta{color:#333}.hero:after,.nav,.filters,.choice,.toolbar-actions,.action-line button,.skip{display:none}.hero h1{font-size:36px}.hero .eyebrow{margin-top:20px}main{padding-top:10px}.column-head{position:static}.feature{break-inside:avoid;box-shadow:none;margin-bottom:15px}.section{margin-bottom:30px}.feature[hidden]{display:block!important}.no-results{display:none}.risk-body{display:block}details{break-inside:avoid}.technical-table tr{break-inside:avoid}.sources{columns:2}.ref{font-size:10px}.profile{box-shadow:none}.hero .brand{color:#111}.personal-note{break-inside:avoid}.personal-note textarea{border-color:#999}footer{margin-top:25px}}
</style>
</head>
<body>
<a class="skip" href="#comparativa">Saltar a la comparativa</a>
<header class="hero"><div class="wrap">
 <div class="brand"><span class="logo" aria-hidden="true">D</span> Drafty3D <span style="font-size:12px;font-weight:400;letter-spacing:.6px;margin-left:10px;color:#b5ccc5">PRODUCT RESEARCH / 01</span></div>
 <p class="eyebrow">Modelado paramétrico × edición directa × malla</p>
 <h1>Tres maneras de dar forma.<br><em>Una dirección para Drafty3D.</em></h1>
 <p class="intro">Qué conviene tomar de Plasticity, Onshape y 3D Modeling App, dónde sus herramientas se parecen y qué implica combinarlas en una aplicación propia que se sienta natural con el ratón.</p>
 <div class="meta"><span>Consulta · 16 octubre 2026</span><span>22 familias funcionales</span><span>Fuentes oficiales + lectura del código existente</span><span>Propuesta para discusión</span></div>
</div></header>
<nav class="nav" aria-label="Índice del informe"><div class="wrap"><a href="#enfoques">Los tres enfoques</a><a href="#comparativa">Comparativa</a><a href="#base">Base actual</a><a href="#viabilidad">Viabilidad</a><a href="#alcance">Alcance propuesto</a><a href="#fuentes">Fuentes</a><span class="nav-end">Investigación, no compromiso de desarrollo</span></div></nav>
<main class="wrap">
<section id="enfoques" class="section">
 <span class="section-tag">01 / Qué aporta cada referencia</span><h2>La mezcla tiene sentido si cada geometría conserva su identidad.</h2>
 <p class="lead">La oportunidad es unir la inmediatez del modelado directo, la intención de diseño del CAD y la libertad de una malla. Eso exige distinguir representaciones, operaciones y formas de guardar los cambios.</p>
 <div class="profiles">
  <article class="profile plasticity"><div class="tag">P · CAD directo</div><h3>Plasticity</h3><p>Sólidos y superficies con interacción rápida, cotas que modifican geometría y herramientas avanzadas de forma. Su propuesta evita exigir un árbol de historial.</p><p><strong>Tomar:</strong> selección contextual, arrastre, edición de caras y rapidez para explorar formas.</p><div class="refs">@@P_PROFILE@@</div></article>
  <article class="profile onshape"><div class="tag">O · CAD paramétrico</div><h3>Onshape</h3><p>Croquis con restricciones, operaciones dependientes y variantes. Amplía el flujo a ensamblajes, planos y documentos compartidos.</p><p><strong>Tomar:</strong> medidas conductoras, intención de diseño y reconstrucción predecible.</p><div class="refs">@@O_PROFILE@@</div></article>
  <article class="profile mobile-app"><div class="tag">M · Modelado poligonal</div><h3>3D Modeling App</h3><p>Edición poligonal por gestos, con herramientas sobre componentes y pinceles.</p><p><strong>Tomar:</strong> manipulación de topología y acceso inmediato a acciones.</p><div class="refs">@@M_PROFILE@@</div></article>
 </div>
 <p class="note"><strong>Alcance de las “tres aplicaciones”.</strong> La comparación principal usa Plasticity, Onshape como CAD convencional y la app Android enlazada. FreeCAD sirve como contraste adicional: su documentación confirma OCCT, parámetros, solver de croquis, ensamblaje y planos. Compartir kernel con FreeCAD no incorpora automáticamente esos subsistemas. <a class="ref" href="https://www.freecad.org/features.php?lang=eng_EN">F1 ↗</a></p>
 <div class="principle"><h3>Un nombre parecido no garantiza la misma función.</h3><p>“Extruir”, “suavizar”, “combinar”, “paramétrico” o “desplegar” pueden significar cosas muy diferentes. Cada familia indica la operación real y después explica la diferencia que importa para diseñar Drafty3D.</p></div>
</section>

<section id="comparativa" class="section">
 <span class="section-tag">02 / Catálogo comparado</span><h2>Funciones agrupadas por intención de uso</h2>
 <p class="method"><strong>Cómo leerlo:</strong> P = Plasticity, O = Onshape y M = app móvil. El color y la etiqueta identifican el origen. Los enlaces llevan a la fuente de cada afirmación. “No documentado” significa falta de evidencia en las fuentes consultadas, no una prueba de ausencia. Las propuestas para Drafty3D son evaluación propia.</p>
 <p class="note"><strong>Calidad de evidencia:</strong> Plasticity y Onshape tienen manuales públicos detallados. La web de soporte de la app móvil solo ofrece contacto; su catálogo procede de la ficha oficial publicada por el desarrollador. No se encontró allí un manual técnico público ni evidencia de un solver o historial paramétrico CAD. Las funciones se investigaron documentalmente; no se ejecutaron las tres aplicaciones. <a class="ref" href="https://3dmodelingapp.info/">M2 ↗</a></p>
 <div class="filters" aria-label="Filtrar familias"><button type="button" data-filter="all" aria-pressed="true">Todas</button><button type="button" data-filter="interaccion" aria-pressed="false">Interacción</button><button type="button" data-filter="precision" aria-pressed="false">Precisión</button><button type="button" data-filter="forma" aria-pressed="false">Forma CAD</button><button type="button" data-filter="malla" aria-pressed="false">Malla</button><button type="button" data-filter="produccion" aria-pressed="false">Producción</button><input id="search" type="search" placeholder="Buscar una función…" aria-label="Buscar funciones"></div>
 <div class="filter-status"><div class="legend"><span class="plasticity"><i class="dot" aria-hidden="true"></i>P · Plasticity</span><span class="onshape"><i class="dot" aria-hidden="true"></i>O · Onshape</span><span class="mobile-app"><i class="dot" aria-hidden="true"></i>M · 3D Modeling App</span></div><span id="result-count" aria-live="polite">22 familias visibles</span></div>
 <div class="column-head" aria-hidden="true"><div class="plasticity">P / Plasticity</div><div class="onshape">O / Onshape</div><div class="mobile-app">M / 3D Modeling App</div></div>
 <div id="features">@@ROWS@@</div>
 <p id="no-results" class="no-results" hidden>No hay familias con esos filtros. Cambia la búsqueda o selecciona “Todas”.</p>
 <div class="action-line"><div><div class="decision-counter" id="decision-count" aria-live="polite"></div><p id="save-status">Tus decisiones y notas se guardan en este navegador. Descarga el JSON para conservarlas o compartirlas.</p></div><div class="toolbar-actions"><button id="reset" type="button">Restaurar propuestas</button><button id="export" type="button">Descargar selección JSON</button></div></div>
 <noscript><p class="note">El informe completo se puede leer sin JavaScript. Los filtros y la descarga de selecciones requieren JavaScript.</p></noscript>
</section>

<section id="base" class="section">
 <span class="section-tag">03 / Punto de partida comprobado</span><h2>Qué hay realmente en el CAD de origen</h2>
 <p class="lead">Drafty3D estaba vacío al comenzar. El análisis corresponde al código de <code>Cursos-templates/cad</code> y sus documentos. La extracción y el rediseño del editor son los siguientes trabajos; este entregable es la investigación.</p>
 <div class="baseline"><div><span class="evidence-label">Implementado en el origen</span><h3>Una base útil de sólidos exactos</h3><ul><li>OpenCascade.js <code>2.0.0-beta.b5ff984</code>, distribución <code>full</code>, con OCCT 7.6.2 en worker; Three.js <code>0.186.1</code> para renderizar.</li><li>Caja, cilindro, esfera, extrusión, booleanas, redondeo y transformación; dependencias y caché de resultados.</li><li>Movimiento y giro con gizmos: preview Three.js y commit geométrico al terminar el gesto.</li><li>Rectángulos, círculos exactos y polilíneas en planos de origen o caras BRep planas. Añadir, cortar o crear pieza.</li><li>Proyecto JSON portable, recuperación de estado y STEP/STL. STL se trata como malla.</li></ul></div><div><span class="evidence-label">Límites leídos en el código</span><h3>La interfaz es solo una parte del cambio</h3><ul><li>Sin solver de restricciones, cotas persistentes ni múltiples contornos con huecos en el croquis actual.</li><li>La cara de apoyo se guarda por índice y número de caras. Un reordenamiento con igual cantidad puede resolver a otra cara.</li><li>El redondeo actual intenta todas las aristas únicas del cuerpo; falta seleccionar aristas CAD concretas.</li><li>Las líneas visibles se generan con <code>EdgesGeometry</code>; no son un catálogo de aristas exactas del kernel.</li><li>Las booleanas/redondeos rechazan STL. La importación de malla no incluye herramientas de topología.</li><li>Límites del documento: 100 objetos, 1.024 puntos por perfil y 40 MiB de archivo. Son restricciones de la aplicación.</li></ul></div></div>
 <p class="path">Evidencia local: kernel.js:4, 81, 152, 256, 382, 399 · document.js:3 · interactions.js:17 y 83 · viewport.js:129 · sketch.js · docs/CAD_WEB.md. Rutas completas y advertencias documentales al final.</p>
 <p class="note"><strong>Verificación de bindings:</strong> el archivo instalado <code>opencascade.full.d.ts</code> declara MakeRevol, MakePipe, ThruSections, MakeThickSolid, MakeChamfer, MakeFilling y TNaming. Esto respalda estudiar revolución, barrido, loft, vaciado, chaflán y referencias; una declaración de tipos no demuestra que el flujo completo funcione en este WASM. No se ejecutaron prototipos geométricos en esta investigación.</p>
</section>

<section id="viabilidad" class="section">
 <span class="section-tag">04 / Viabilidad y límites técnicos</span><h2>El reto duro es mantener coherencia al editar.</h2>
 <div class="risk-intro"><div><h3>Una experiencia común.<br>Dos modelos geométricos explícitos.</h3><p>Recomendación arquitectónica: un documento con objetos tipados de sólido/superficie CAD y de malla. Compartir cámara, selección, gizmos, unidades y guardado; cada operación se ejecuta en el motor que corresponde a la representación.</p></div><div><p>El grafo registra operaciones y conversiones. Una cara BRep puede contener una superficie NURBS recortada; su triangulación es una representación para pantalla. Una malla editable tiene conectividad propia y no debe modificar en silencio esa triangulación mientras el BRep exportado queda intacto.</p><p class="flow-note">Evaluación propia sobre el código y los modelos descritos en P9, O12 y T1–T3. No presupone acceso a Parasolid o XNurbs desde OpenCascade.</p></div></div>
 <div class="flow" role="group" aria-label="Conversión propuesta entre representaciones"><div class="flow-block"><h4>CAD · BRep / curvas / superficies</h4><p>Croquis y operaciones → sólido exacto dentro de tolerancias → teselación de visualización. STEP toma la geometría CAD.</p></div><div class="arrow" aria-hidden="true">→</div><div class="flow-block"><h4>Malla · topología editable</h4><p>“Crear copia de malla” con tolerancia registrada → vértices/aristas/caras editables. STL/OBJ toman la malla correspondiente.</p></div></div>
 <p class="flow-note"><strong>Vuelta a CAD:</strong> comando separado de reconstrucción/ajuste con informe de error. No prometer una conversión reversible ni la recuperación del historial. Si cambia el CAD padre de una copia editada, ofrecer conservar esa copia o regenerarla perdiendo sus ediciones; la actualización automática necesita correspondencias que pueden haber desaparecido.</p>
 <div class="callout"><p><strong>Ventaja de producto:</strong> el usuario puede arrastrar con el mismo gesto en ambos modos, pero ve si está cambiando una cota, creando una operación CAD o deformando polígonos. Esa claridad permite libertad sin vender una precisión que el objeto ya no conserva.</p></div>

 <table class="technical-table"><caption style="text-align:left;margin:0 0 14px;color:var(--muted);font-size:14px">Viabilidad relativa sobre la base actual. Es juicio técnico, sin calendario ni promesa de paridad con productos comerciales.</caption><thead><tr><th>Paquete</th><th>Dificultad</th><th>Oportunidad y condición de entrada</th></tr></thead><tbody>
 <tr><td data-label="Paquete">Interfaz contextual, gizmos y paleta</td><td data-label="Dificultad"><span class="level low">Baja–media</span><br>Gran valor inmediato</td><td data-label="Oportunidad">Reutiliza gestos y commits existentes. Separar registro de comandos, selección, previews y paneles; una prueba de uso debe permitir crear/editar sin perder acceso a medidas.</td></tr>
 <tr><td data-label="Paquete">Revolución, patrones de cuerpos, chaflán</td><td data-label="Dificultad"><span class="level mid">Media</span><br>Ruta geométrica identificada</td><td data-label="Oportunidad">Hay clases declaradas para revolución/chaflán. Faltan esquema, selección exacta, tolerancias, errores y pruebas. Patrones de cuerpos son más acotados que patrones de operaciones.</td></tr>
 <tr><td data-label="Paquete">Loft, barrido, shell y superficies básicas</td><td data-label="Dificultad"><span class="level mid">Media–alta</span><br>Complejidad dependiente del caso</td><td data-label="Oportunidad">Muy útiles para carcasas y tubos. Empezar con secciones compatibles, trayectorias simples y espesores válidos; guías, singularidades y offsets elevan el riesgo. <a class="ref" href="https://occt3d.com/dev/doc/overview/html/occt_user_guides__modeling_algos.html">T1 ↗</a></td></tr>
 <tr><td data-label="Paquete">Solver, referencias estables y edición de caras</td><td data-label="Dificultad"><span class="level high">Alta</span><br>Fundamentos del producto</td><td data-label="Oportunidad">Dan confianza al paramétrico. No llegan por tener OCCT: requieren solver, rastreo de entidades, política de ambigüedad y reparación de operaciones dependientes.</td></tr>
 <tr><td data-label="Paquete">Editor poligonal y modificadores básicos</td><td data-label="Dificultad"><span class="level high">Alta</span><br>Viable como subsistema separado</td><td data-label="Oportunidad">Encaja con selección, extruir, cortar, fusionar y subdividir. Un BufferGeometry de render no sustituye una estructura de edición con adyacencia, atributos e historial.</td></tr>
 <tr><td data-label="Paquete">Reconstrucción malla → CAD y superficies de alta calidad</td><td data-label="Dificultad"><span class="level high">Muy alta / I+D</span><br>Sin equivalencia inmediata</td><td data-label="Oportunidad">Diferenciador potente, con alcance acotado. Quad patches diseñados y escaneos triangulados exigen procesos distintos. Medir ajuste y continuidad; evaluar tecnología adicional si se busca paridad avanzada.</td></tr>
 <tr><td data-label="Paquete">Ensamblajes, chapa, planos y colaboración</td><td data-label="Dificultad"><span class="level high">Alta por módulo</span><br>Multiplican alcance</td><td data-label="Oportunidad">Cada uno abre otro producto: solver de mates, reglas de plegado, dibujo asociativo o infraestructura de documentos concurrentes. Seleccionarlos por casos reales, después del núcleo.</td></tr>
 </tbody></table>

 <div class="action-line"><p>Los siguientes ocho riesgos explican las barreras más importantes y cómo contrastarlas antes de comprometer funciones.</p><div class="toolbar-actions"><button type="button" id="open-risks">Abrir todos los riesgos</button><button type="button" id="close-risks">Cerrar riesgos</button></div></div>
 <div class="risks">
 <details open><summary><span class="severity">Crítico</span>1. Referencias que cambian al reconstruir</summary><div class="risk-body"><div><h4>Qué falla y por qué</h4><p>Un agujero puede dividir una cara, un fillet puede sustituir varias y una booleana puede borrar la arista elegida. El índice actual de cara no es identidad persistente. Hay casos ambiguos incluso con el mismo número de caras.</p><p>OCCT ofrece historial Generated/Modified/IsDeleted y OCAF/TNaming para rastrear evolución; hay que registrar y resolver esas relaciones. Incorporar una clase TNaming no resuelve toda la política del documento. @@TOPO_REFS@@</p></div><div><h4>Ruta y prueba decisiva</h4><p><strong>Propuesta:</strong> identificadores semánticos para primitivas, historial de evolución donde exista, descriptores geométricos como apoyo y estado “referencia ambigua” con reparación visible. Nunca elegir una cara dudosa en silencio.</p><p><strong>Prueba:</strong> croquis en una cara + corte + fillet; cambiar dimensión, dividir cara, eliminar arista y reordenar operaciones. Debe conservar intención o pedir reparación, manteniendo el último estado válido.</p></div></div></details>
 <details open><summary><span class="severity">Crítico</span>2. Solver de croquis y arrastre estable</summary><div class="risk-body"><div><h4>Qué falta</h4><p>El croquis actual arrastra coordenadas. Un solver debe satisfacer ecuaciones de distancias y relaciones, detectar grados de libertad y distinguir redundancia, conflicto y degeneración. Tangencias y círculos admiten varias soluciones; durante el arrastre puede saltar a una rama distinta.</p><p>Las restricciones documentadas por Onshape y el solver de FreeCAD son funciones de aplicación, no una consecuencia del render ni de cargar el kernel. @@SOLVER_REFS@@</p></div><div><h4>Ruta y prueba decisiva</h4><p><strong>Propuesta:</strong> evaluar un solver compatible con navegador y su distribución; empezar por líneas/círculos, coincidencia, horizontal/vertical, paralelismo, perpendicularidad, distancia e igualdad. Cotas de referencia separadas de las que conducen.</p><p><strong>Prueba:</strong> arrastrar un mecanismo de croquis parcialmente restringido; introducir cotas incompatibles; deshacer y reabrir. Mostrar el conflicto sin deformar o sustituir silenciosamente la intención.</p></div></div></details>
 <details><summary><span class="severity">Muy alto</span>3. Fillets, offsets y reparación de sólidos</summary><div class="risk-body"><div><h4>Por qué no basta con exponer un botón</h4><p>Radios grandes, caras diminutas, aristas casi tangentes y espesores superiores al espacio disponible crean intersecciones o soluciones inviables. Una cara movida necesita recortar/extender sus vecinas y recomponer un volumen válido.</p><p>Plasticity usa Parasolid y tecnología de superficie adicional; no se puede deducir el mismo resultado del OCCT de origen. La documentación moderna de OCCT tampoco certifica los bindings de 7.6.2. @@FILLET_REFS@@</p></div><div><h4>Ruta y prueba decisiva</h4><p><strong>Propuesta:</strong> selección de aristas exactas, operaciones sencillas primero, validación del resultado, tolerancias registradas y preview que indique qué se ha podido calcular. No prometer arrastre exacto a 60 fps.</p><p><strong>Prueba:</strong> catálogo de esquinas, radios variables, paredes finas y caras importadas; comprobar validez y volumen. Un fallo conserva el modelo y explica la condición que se debe ajustar.</p></div></div></details>
 <details open><summary><span class="severity">Muy alto</span>4. Malla → NURBS / BRep no es “deshacer la triangulación”</summary><div class="risk-body"><div><h4>La pérdida de información</h4><p>Al teselar se pierde la definición analítica de curvas/superficies y no se codifica la secuencia con la que se construyó el objeto. Hacer una cara plana por triángulo crea un BRep facetado pesado; no recupera el cilindro, los parches suaves ni el historial.</p><p>PolySplines documenta generación de parches y limitaciones concretas; Mixed Modeling integra representaciones con un subconjunto de herramientas. Ninguno acredita una reversibilidad universal. @@HYBRID_REFS@@</p></div><div><h4>Ruta y prueba decisiva</h4><p><strong>Propuesta:</strong> permitir mallas como referencia o salida editable. Para volver a CAD, acotar primero planos/cilindros y mallas de pocos parches; después estudiar reconstrucción de superficies y cosido con tolerancia declarada.</p><p><strong>Prueba:</strong> comparar malla original con superficie reconstruida por desviación máxima y distribución del error, bordes abiertos y continuidad. Ensayar un cubo, un cilindro, una malla quad limpia y un escaneo irregular por separado.</p></div></div></details>
 <details><summary><span class="severity">Alto</span>5. Topología de malla, atributos y modificadores</summary><div class="risk-body"><div><h4>Lo que no da el render</h4><p>Loop cut y extrusión necesitan vecindad de caras/aristas; fusionar o borrar vértices puede crear mallas no manifold, caras invertidas o intersecciones. UVs, colores, normales y grupos deben sobrevivir a las ediciones.</p><p>La malla triangulada actual está pensada para dibujar sólidos. Una estructura half-edge u otra representación editable, con índices persistentes propios, es una decisión nueva. El manual de Blender sirve para delimitar los tipos de herramientas. @@MESH_REFS@@</p></div><div><h4>Ruta y prueba decisiva</h4><p><strong>Propuesta:</strong> módulo de malla con adyacencia, validadores, atributos y operaciones reversibles. Separar mesh base, modificadores y resultado evaluado; guardar checkpoints para cambios destructivos.</p><p><strong>Prueba:</strong> extruir, cortar, soldar y subdividir manteniendo selecciones, color y orientación. Abrir/guardar debe reproducir el mismo resultado; advertir bordes abiertos antes de exportar para impresión.</p></div></div></details>
 <details><summary><span class="severity">Alto</span>6. WASM, memoria, cancelación y latencia</summary><div class="risk-body"><div><h4>Coste real en navegador</h4><p>El WASM del origen ronda 50,3 MB antes de compresión. BRep, caché de operaciones, historial, triangulación y buffers de GPU pueden convivir a la vez. El número de objetos no predice bien la memoria de una pieza compleja.</p><p>El worker evita bloquear la interfaz, pero una llamada geométrica síncrona no procesa un mensaje de cancelación hasta volver. Los hilos WASM requieren recompilación y requisitos COOP/COEP para SharedArrayBuffer. @@WASM_REFS@@</p></div><div><h4>Ruta y prueba decisiva</h4><p><strong>Propuesta:</strong> preview ligero durante el gesto; descartar respuestas obsoletas, liberar wrappers embind y buffers; checkpoints recuperables. Para abortos duros, terminar/recrear el worker puede implicar perder su caché.</p><p><strong>Prueba:</strong> medir carga fría, reconstrucción, memoria y recuperación en Chrome/Edge/Firefox sobre Windows con piezas pequeñas y grandes. Multihilo y PWA se evalúan aparte; no sustituyen medir el build actual.</p></div></div></details>
 <details><summary><span class="severity">Alto</span>7. Ensamblajes, chapa y planos son subsistemas nuevos</summary><div class="risk-body"><div><h4>Requisitos que multiplican el alcance</h4><p>Un ensamblaje necesita instancias, marcos y restricciones de movimiento. Chapa necesita espesores, radios, alivios y compensación de pliegue. Un plano asociativo debe mantener vistas y referencias de cotas después de cambios.</p><p>Los ejemplos de Onshape muestran por qué grupos de objetos, un unwrap y una captura no reemplazan esos flujos. @@PROD_REFS@@</p></div><div><h4>Ruta y prueba decisiva</h4><p><strong>Propuesta:</strong> primero grupos y alineación; después mates sencillos si el producto aborda mecanismos. Para chapa y dibujo técnico, definir casos de fabricación y actualización antes de escoger algoritmos.</p><p><strong>Prueba:</strong> bisagra con límites, pieza plegada con desarrollo contrastado y plano de una pieza que cambia de dimensiones. Validar cada módulo de manera independiente.</p></div></div></details>
 <details><summary><span class="severity">Alto</span>8. Persistencia, interoperabilidad y nube</summary><div class="risk-body"><div><h4>Contrato del documento</h4><p>El formato propio debe guardar parámetros, referencias, mallas y versiones de evaluación. Importar STEP aporta geometría, no el árbol paramétrico del sistema de origen. Exportar OBJ/STL implica decisiones de unidades, atributos y aproximación.</p><p>El guardado del sitio de cursos pertenece a su origen; una URL o dominio nuevo no traslada localStorage. La coedición agrega sincronización, conflictos, permisos y revisión de documentos. @@FILE_REFS@@</p></div><div><h4>Ruta y prueba decisiva</h4><p><strong>Propuesta:</strong> versionar esquema y migraciones; preservar proyectos antiguos, ofrecer exportación/importación y validar formatos mediante ida/vuelta. En la separación, llevar también pruebas, configuración del worker/WASM y avisos/fuentes de dependencias.</p><p><strong>Prueba:</strong> abrir los JSON anteriores, interrumpir guardados, reparar referencias y round-trip STEP/STL/OBJ con escala conocida. Para nube, usar un prototipo de conflictos real antes de prometer colaboración.</p></div></div></details>
 </div>
</section>

<section id="alcance" class="section">
 <span class="section-tag">05 / Selección propuesta</span><h2>Una primera identidad: precisión que se pueda agarrar.</h2>
 <p class="lead">Estas prioridades son propuestas de producto, no requisitos ya aceptados. La barra superior puede reducirse pronto, manteniendo un acceso completo y contextual al catálogo; la libertad sobre mallas se construye como una capacidad propia y explícita.</p>
 <div class="phases">
 <article class="phase"><span class="phase-label">Primero · núcleo usable</span><h3>Mouse + medidas + confianza</h3><ul><li>Separar CAD a Drafty3D conservando pruebas, formatos y distribución del motor.</li><li>Selección y acciones por contexto; inspector lateral; paleta y atajos.</li><li>Arrastre para profundidad, posición, giro y radio con preview/cancelación.</li><li>Aristas y caras exactas seleccionables; referencias con reparación visible.</li><li>Cotas/restricciones básicas y perfiles con huecos.</li><li>Revolución, chaflán, simetría y patrones de cuerpos.</li></ul><p>Aceptación: crear un soporte acotado, variar su anchura, mover un agujero y ajustar un redondeo conservando los cambios dependientes.</p></article>
 <article class="phase"><span class="phase-label">Después · ampliación de forma</span><h3>CAD directo + malla básica</h3><ul><li>Edición directa de caras inicialmente planas y cilíndricas.</li><li>Loft/barrido sencillos y vaciado en geometrías contrastadas.</li><li>Copias de malla con origen y tolerancia registrados.</li><li>Selección vértice/arista/cara, extruir, cortar, fusionar y rellenar.</li><li>Simetría y subdivisión de malla; OBJ además de STEP/STL.</li></ul><p>Aceptación: diseñar una carcasa CAD, sacar una copia poligonal y modificarla, con exportación y estado del original comprensibles.</p></article>
 <article class="phase"><span class="phase-label">Investigar o posponer</span><h3>Paridad avanzada por demanda</h3><ul><li>Reconstrucción automática de mallas arbitrarias a superficies CAD.</li><li>Superficies de alta calidad y transiciones complejas G2.</li><li>Esculpido de alta densidad, remallado y booleanas mixtas robustas.</li><li>Mates mecánicos, chapa, planos técnicos asociativos.</li><li>Coedición, PDM, CAM/FEM, rigging y animación como alcances separados.</li></ul><p>Entrada: un caso real que necesite la función y un prototipo que supere sus pruebas geométricas. Evitar convertir cada referencia en una promesa.</p></article>
 </div>
 <h3 style="font-size:22px;margin:40px 0 10px">Cómo sustituir la barra sin ocultar capacidades</h3>
 <div class="ui-table"><article class="ui-block"><span class="tiny">Persistente</span><h3>Documento y propiedades</h3><p>Arriba: archivo, deshacer/rehacer y estado. A un lado: árbol e inspector. Las medidas y errores permanecen accesibles mientras se trabaja.</p></article><article class="ui-block"><span class="tiny">Contextual</span><h3>Acciones junto a la selección</h3><p>Perfil → extruir/revolucionar. Cara CAD → croquis/desfase. Arista CAD → radio/chaflán. Cara de malla → extruir/cortar. Acciones incompatibles explican su requisito.</p></article><article class="ui-block"><span class="tiny">Explorable</span><h3>Paleta completa y ayuda local</h3><p>Buscar por verbo o resultado; agrupar por crear, modificar e inspeccionar. Menú radial opcional para favoritos. Un popup pequeño no debe ser el único acceso al catálogo.</p></article></div>
 <p class="note"><strong>Estado del rediseño:</strong> esta es una propuesta de organización, no una captura de interfaz implementada. Las imágenes aportadas ilustran la amplitud del catálogo de Onshape; las funciones se corroboraron en la documentación, sin deducirlas solo de los iconos.</p>
</section>

<section id="fuentes" class="section">
 <span class="section-tag">06 / Trazabilidad</span><h2>Fuentes y límites de la investigación</h2>
 <p class="method">Fuentes primarias consultadas el <strong>16 de octubre de 2026</strong>. Los manuales web cambian. Las diferencias de edición/plataforma se indican cuando son relevantes; no se presume que una capacidad comercial esté disponible en la edición gratuita o en otra plataforma. No se usaron reseñas de usuarios para atribuir funciones.</p>
 <p class="note"><strong>Dos cautelas concretas.</strong> La ficha móvil menciona conversión a otros formatos mediante herramientas externas; eso no demuestra exportación STEP nativa. En Plasticity, las tablas con marcas de edición pueden perder esas marcas al extraerse como texto: para capacidades avanzadas se contrastó la página comercial, que anuncia PolySplines y XNurbs en Studio. Verificar la edición exacta al planificar una prueba.</p>
 <ul class="sources">@@SOURCES@@</ul>
 <div class="local-evidence"><p><strong>Lectura local del proyecto de origen</strong></p><ul><li><code>/Users/rubenmena/Documents/Dev/Cursos-templates/cad/</code>: kernel, documento, croquis, interacción, viewport e interfaz.</li><li><code>/Users/rubenmena/Documents/Dev/Cursos-templates/node_modules/opencascade.js/dist/opencascade.full.d.ts</code>: declaraciones de clases para revolución, barrido, loft, vaciado, chaflán, relleno y nombres topológicos.</li><li><code>/Users/rubenmena/Documents/Dev/Cursos-templates/docs/CAD_WEB.md</code> y <code>docs/cad/README.md</code>, <code>PROGRESO.md</code>, <code>PLAN_PROVISIONAL.md</code>, <code>SEPARACION_PROVISIONAL.md</code>: arquitectura, entrega y antecedentes de extracción.</li></ul><p style="margin-top:15px">Los planes anteriores están marcados como provisionales; se trataron como antecedentes. El nombre y carpeta Drafty3D vienen de la solicitud actual. Los resultados Windows citados en documentos heredados son históricos y no se reprodujeron durante esta investigación.</p><p><strong>Versiones:</strong> la documentación OCCT en línea consultada identifica 8.0.1; el motor instalado del origen es 7.6.2. Sus manuales sirven para conceptos y posibilidades generales. Las firmas específicas se contrastaron con los tipos instalados; el comportamiento debe validarse ejecutando ese build.</p><p style="margin-bottom:0"><strong>Separación entre evidencia e inferencia:</strong> el catálogo describe documentación de los proveedores; “Para Drafty3D”, dificultades, arquitectura, prioridades y pruebas son evaluación propia basada en esas fuentes y en el código. No son tiempos de desarrollo ni garantías de robustez.</p></div>
</section>
</main>
<footer><div class="wrap">Drafty3D · Informe de investigación 01 · 16 octubre 2026 · Documento autónomo, sin dependencias de red · Las selecciones de alcance solo pertenecen a este navegador.</div></footer>
<script>
(() => {
 'use strict';
 const features = Array.from(document.querySelectorAll('.feature'));
 const choices = Array.from(document.querySelectorAll('[data-choice]'));
 const search = document.getElementById('search');
 const resultCount = document.getElementById('result-count');
 const decisionCount = document.getElementById('decision-count');
 const storageKey = 'drafty3d.investigacion.alcance.v1';
 let filter = 'all';
 const clean = value => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
 const texts = new Map(features.map(item => [item,clean(item.textContent)]));
 function applyFilter() {
   const query = clean(search.value.trim()); let count = 0;
   features.forEach(item => { const visible = (filter === 'all' || item.dataset.category === filter) && texts.get(item).includes(query); item.hidden = !visible; if(visible)count++; });
   resultCount.textContent = count + (count === 1 ? ' familia visible' : ' familias visibles');
   document.getElementById('no-results').hidden = count > 0;
 }
 function snapshot() { return Object.fromEntries(choices.map(select => [select.dataset.choice, select.value])); }
 const notes = Array.from(document.querySelectorAll('[data-note]'));
 const notesKey = storageKey + '.notes';
 function noteSnapshot() { return Object.fromEntries(notes.map(area => [area.dataset.note, area.value])); }
 function updateCounts() {
   const counts = {incluir:0,explorar:0,posponer:0}; choices.forEach(select => counts[select.value]++);
   decisionCount.textContent = 'Tu selección: ' + counts.incluir + ' incluir · ' + counts.explorar + ' explorar · ' + counts.posponer + ' posponer';
 }
 function save() { try { localStorage.setItem(storageKey, JSON.stringify(snapshot())); localStorage.setItem(notesKey, JSON.stringify(noteSnapshot())); } catch (_) { document.getElementById('save-status').textContent = 'El navegador no permite guardar todos los cambios localmente. Puedes descargar la selección JSON.'; } }
 try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); if(saved && typeof saved === 'object') choices.forEach(select => { if(['incluir','explorar','posponer'].includes(saved[select.dataset.choice]))select.value = saved[select.dataset.choice]; }); } catch (_) { /* El informe sigue disponible sin almacenamiento. */ }
 try { const savedNotes = JSON.parse(localStorage.getItem(notesKey) || '{}'); if(savedNotes && typeof savedNotes === 'object') notes.forEach(area => { if(typeof savedNotes[area.dataset.note] === 'string') area.value = savedNotes[area.dataset.note].slice(0,1000); }); } catch (_) { /* Las notas permanecen editables aunque falle el almacenamiento. */ }
 notes.forEach(area => { const resize = () => { area.style.height = 'auto'; area.style.height = Math.min(area.scrollHeight,240) + 'px'; }; resize(); area.addEventListener('input', () => { resize(); save(); }); });
 document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button))); applyFilter(); }));
 search.addEventListener('input', applyFilter);
 choices.forEach(select => select.addEventListener('change', () => { updateCounts(); save(); }));
 document.getElementById('reset').addEventListener('click', () => { choices.forEach(select => select.value = select.closest('.feature').dataset.default); updateCounts(); save(); });
 document.getElementById('export').addEventListener('click', () => {
   const data = {documento:'Drafty3D — Investigación de alcance',consulta:'2026-10-16',tipo:'seleccion personal; no implementación',familias:features.map(item => ({id:item.id,familia:item.querySelector('h3').textContent,propuesta:item.dataset.default,seleccion:item.querySelector('select').value,nota:item.querySelector('[data-note]').value}))};
   const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
   const link = document.createElement('a'); link.href = url; link.download = 'drafty3d-seleccion-funciones.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
 });
 const risks = Array.from(document.querySelectorAll('.risks details'));
 document.getElementById('open-risks').addEventListener('click',() => risks.forEach(item => item.open = true));
 document.getElementById('close-risks').addEventListener('click',() => risks.forEach(item => item.open = false));
 let printState;
 window.addEventListener('beforeprint',() => { printState = risks.map(item => item.open); risks.forEach(item => item.open = true); });
 window.addEventListener('afterprint',() => { if(printState)risks.forEach((item,index) => item.open = printState[index]); });
 updateCounts(); applyFilter();
})();
</script>
</body></html>'''

REPLACEMENTS = {
    '@@ROWS@@': build_rows(), '@@SOURCES@@': build_sources(),
    '@@P_PROFILE@@': refs('P1 P5'), '@@O_PROFILE@@': refs('O2 O18 O19'), '@@M_PROFILE@@': refs('M1'),
    '@@TOPO_REFS@@': refs('T2 T3'), '@@SOLVER_REFS@@': refs('O2 F1'),
    '@@FILLET_REFS@@': refs('P1 O8 T1'), '@@HYBRID_REFS@@': refs('P9 O12'),
    '@@MESH_REFS@@': refs('B1'), '@@WASM_REFS@@': refs('T4'),
    '@@PROD_REFS@@': refs('O14 O15 O16'), '@@FILE_REFS@@': refs('O17 O18'),
}
for marker, content in REPLACEMENTS.items():
    TEMPLATE = TEMPLATE.replace(marker, content)
assert '@@' not in TEMPLATE
assert len(ROWS) == 22
(ROOT / 'comparativa-cad.html').write_text(TEMPLATE, encoding='utf-8')
print(f'Generado: {ROOT / "comparativa-cad.html"} ({len(TEMPLATE.encode())} bytes)')
