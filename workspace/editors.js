export const editors = {
  solidcraft: {
    name: 'SolidCraft', url: '/solidcraft/app/', formats: ['json', 'step', 'stl', 'obj'],
    accepts: ['solidcraft', 'solvecraft', 'json', 'step', 'stp', 'stl', 'obj', '3mf', 'glb'],
  },
  sculptgl: {
    name: 'SculptGL', url: '/sculptgl/', formats: ['sgl', 'obj', 'stl', 'ply'],
    accepts: ['sgl', 'obj', 'stl', 'ply'],
  },
  svg: {
    name: 'SVG-Edit', url: '/svg-edit/', formats: ['svg'], accepts: ['svg'], isolated: true,
  },
};

export const extension = name => name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const tmpPath = (format, prefix) => `${prefix}-${crypto.randomUUID()}.${format}`;

async function withSolidFile(format, operation, prefix = 'drafty3d-editor') {
  const root = await navigator.storage.getDirectory();
  const filename = tmpPath(format, prefix);
  try {
    return await operation(root, filename);
  } finally {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await root.removeEntry(filename);
        break;
      } catch (error) {
        if (error.name === 'NotFoundError') break;
        if (attempt === 9) console.warn('No se pudo limpiar el archivo temporal de SolidCraft.', error);
        else await pause(100);
      }
    }
  }
}

export async function exportSolidcraft(frame, format, prefix = 'drafty3d-editor') {
  const api = frame.contentWindow?.solidcraft;
  if (!api || frame.contentDocument?.querySelector('#solidcraft_loading')) throw new Error('loading');
  return withSolidFile(format, async (root, filename) => {
    // The upstream API writes asynchronously into OPFS and returns the expected byte count.
    const { bytes } = await api.execute('file.export', { path: `/opfs/${filename}`, format });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const handle = await root.getFileHandle(filename);
        const file = await handle.getFile();
        if (file.size === bytes) return new Blob([await file.arrayBuffer()]);
      } catch (error) {
        if (!['NotFoundError', 'NoModificationAllowedError'].includes(error.name)) throw error;
      }
      await pause(100);
    }
    throw new Error('timeout');
  }, prefix);
}

export function connectEditor(frame, tool, onEdit, signal) {
  const source = () => frame.contentWindow;
  const svgRequest = (action, svg, timeout) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const listener = event => {
      if (event.origin !== 'null' || event.source !== source() || event.data?.id !== id) return;
      finish(event.data.error ? new Error(event.data.error) : null, event.data.result);
    };
    const abort = () => finish(new DOMException('Editor cerrado', 'AbortError'));
    function finish(error, value) {
      clearTimeout(timer);
      window.removeEventListener('message', listener);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value);
    }
    const timer = setTimeout(() => finish(new Error('timeout')), timeout);
    window.addEventListener('message', listener);
    signal.addEventListener('abort', abort, { once: true });
    source()?.postMessage({ id, action, svg }, '*'); // Sandboxed documents have an opaque origin.
  });
  return {
    async ready() {
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (tool === 'svg') {
          try {
            await svgRequest('ready', undefined, 800);
            window.addEventListener('message', event => {
              if (event.origin === 'null' && event.source === source() && event.data?.type === 'edit') onEdit();
            }, { signal });
            return;
          } catch (error) {
            if (error.message !== 'timeout') throw error;
          }
        } else {
          const win = source();
          const ready = tool === 'solidcraft'
            ? win?.solidcraft && !frame.contentDocument?.querySelector('#solidcraft_loading')
            : win?.draftySculpt?.ready();
          if (ready) {
            for (const event of ['pointerdown', 'keydown']) {
              win.addEventListener(event, onEdit, { signal, capture: true });
            }
            return;
          }
          await pause(200);
        }
      }
      throw new Error('loading');
    },
    async open(file, format, name) {
      if (tool === 'svg') return svgRequest('open', await file.text(), 30_000);
      if (tool === 'sculptgl') return source().draftySculpt.open(file, format);
      const win = source();
      const api = win.solidcraft;
      await api.request('ui.home', { open: false });
      const transfer = new win.DataTransfer();
      transfer.items.add(new win.File([file], name));
      // SolidCraft loads dropped bytes into its virtual filesystem through its normal import path.
      const canvas = win.document.querySelector('canvas');
      canvas.dispatchEvent(new win.DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
      const stem = name.replace(/\.[a-z0-9]+$/i, '');
      const deadline = Date.now() + 50_000;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        const design = await api.inspect();
        if (design.path === `/upload/${name}` || (design.name === stem && design.timeline.length > 0)) return;
        const { status } = await api.request('ui.inspect');
        if (status?.error) throw new Error('openFile');
        await pause(150);
      }
      throw new Error('timeout');
    },
    async export(format) {
      if (tool === 'svg') return new Blob([await svgRequest('export', undefined, 30_000)], { type: 'image/svg+xml' });
      if (tool === 'sculptgl') return source().draftySculpt.export(format);
      return exportSolidcraft(frame, format);
    },
  };
}

export function downloadFile(blob, name) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
