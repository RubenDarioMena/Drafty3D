import SculptGL from './src/SculptGL.js';
import Export from './src/files/Export.js';

document.body.addEventListener('contextmenu', event => event.preventDefault());

const app = new SculptGL();
app.start();

window.draftySculpt = {
  ready: () => Boolean(app._gl),
  async open(file, format) {
    const data = format === 'obj' ? await file.text() : await file.arrayBuffer();
    // Upstream appends imports. Remove the starter mesh only after a successful import.
    const currentMeshes = [...app.getMeshes()];
    const autoMatrix = app._autoMatrix;
    app._autoMatrix = false;
    try {
      const imported = app.loadScene(data, format);
      if (!imported?.length) throw new Error('SculptGL no encontró una malla en el archivo.');
      app.removeMeshes(currentMeshes);
      app.getStateManager().reset();
      app.render();
    } finally {
      app._autoMatrix = autoMatrix;
    }
  },
  export(format) {
    const meshes = app.getMeshes();
    if (!meshes.length) throw new Error('No hay mallas para exportar.');
    switch (format) {
      case 'sgl': return Export.exportSGL(meshes, app);
      case 'obj': return Export.exportOBJ(meshes);
      case 'stl': return Export.exportBinarySTL(meshes);
      case 'ply': return Export.exportBinaryPLY(meshes);
      default: throw new Error('Formato de SculptGL no disponible.');
    }
  },
};
