import createOpenCascade from 'opencascade.js/dist/opencascade.full.js';
import wasmUrl from 'opencascade.js/dist/opencascade.full.wasm?url';
import { initKernel } from './kernel.js';

// La distribución full corre en un worker propio; no requiere servidor ni cuenta.
let initialization = initKernel({
  factory: createOpenCascade,
  wasmUrl,
  onProgress: (message) => self.postMessage({ type: 'progress', message }),
});
initialization.then((kernel) => {
  self.postMessage({ type: 'ready', capabilities: kernel.capabilities });
}).catch((error) => {
  self.postMessage({ type: 'fatal', error: `No se pudo iniciar OpenCascade: ${error.message || String(error)}` });
});

// Serializar evita que dos solicitudes modifiquen simultáneamente el FS de OCCT.
let queue = Promise.resolve();
self.addEventListener('message', ({ data }) => {
  queue = queue.then(async () => {
    const { id, type, document, format, options } = data;
    try {
      const kernel = await initialization;
      let result;
      if (type === 'capabilities') result = kernel.capabilities;
      else if (type === 'evaluate') result = kernel.evaluateDocument(document, options);
      else if (type === 'mesh-preview') result = kernel.convertToMesh(document, options);
      else if (type === 'export') result = kernel.exportDocument(document, format);
      else throw new Error('La solicitud al motor geométrico no es compatible.');
      const transfer = type === 'evaluate'
        ? result.meshes.flatMap((mesh) => mesh.positions ? [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer] : [])
        : type === 'mesh-preview' ? [result.mesh.positions.buffer, result.mesh.normals.buffer, result.mesh.indices.buffer, result.data.buffer]
        : type === 'export' ? [result.data.buffer] : [];
      self.postMessage({ id, result }, transfer);
    } catch (error) {
      self.postMessage({ id, error: error.message || 'OpenCascade no pudo completar la operación.' });
    }
  });
});
