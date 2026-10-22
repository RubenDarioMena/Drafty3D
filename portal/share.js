const frame = document.querySelector('.editor-frame');
const dialog = document.querySelector('#share-dialog');
const form = document.querySelector('#share-form');

if (frame && dialog && form) {
  const open = document.querySelector('#share-open');
  const close = document.querySelector('#share-close');
  const cancel = document.querySelector('#share-cancel');
  const send = document.querySelector('#share-send');
  const status = document.querySelector('#share-status');
  const format = document.querySelector('#share-format');
  const email = document.querySelector('#share-email');
  let verificationToken = '';
  let widgetId = null;
  let scriptPromise;
  const copy = {
    es: {
      open: 'Compartir…', title: 'Compartir diseño', close: 'Cerrar',
      description: 'Envía una copia del diseño en un ZIP que contiene el formato elegido. El diseño no se modifica.',
      email: 'Correo destinatario', format: 'Formato',
      hint: 'Archivos de hasta 3 MB. Confirma la verificación antispam para enviar.',
      cancel: 'Cancelar', send: 'Enviar archivo', configuring: 'Preparando verificación antispam…', verify: 'Completa la verificación antispam.', preparing: 'Preparando archivo…', sending: 'Enviando correo…',
      success: 'Archivo enviado. Revisa también la carpeta de correo no deseado.',
      loading: 'SolidCraft todavía está cargando. Intenta de nuevo en unos segundos.',
      tooLarge: 'El archivo supera 3 MB. Expórtalo desde File para compartirlo por otro medio.',
      exportFailed: 'No se pudo exportar el diseño en este formato.',
      timeout: 'La exportación tardó demasiado. Intenta de nuevo.',
      unauthorized: 'La verificación antispam caducó o fue rechazada. Intenta de nuevo.',
      unconfigured: 'El correo todavía no está configurado en este sitio.',
      rateLimited: 'Se alcanzó el límite de envíos. Intenta de nuevo más tarde.',
      server: 'No se pudo enviar el correo. Intenta de nuevo.',
    },
    en: {
      open: 'Share…', title: 'Share design', close: 'Close',
      description: 'Email a ZIP containing the design in the selected format. The open design is not changed.',
      email: 'Recipient email', format: 'Format',
      hint: 'Files up to 3 MB. Complete the anti-spam check before sending.',
      cancel: 'Cancel', send: 'Send file', configuring: 'Preparing anti-spam check…', verify: 'Complete the anti-spam check.', preparing: 'Preparing file…', sending: 'Sending email…',
      success: 'File sent. Check the spam folder too.',
      loading: 'SolidCraft is still loading. Try again in a few seconds.',
      tooLarge: 'The file exceeds 3 MB. Export it from File to share another way.',
      exportFailed: 'Could not export this design in the selected format.',
      timeout: 'Export took too long. Try again.',
      unauthorized: 'The anti-spam check expired or was rejected. Try again.',
      unconfigured: 'Email is not configured for this site yet.',
      rateLimited: 'The sending limit was reached. Try again later.',
      server: 'Could not send the email. Try again.',
    },
  };
  const t = () => copy[document.documentElement.lang === 'en' ? 'en' : 'es'];
  const translate = () => {
    const c = t();
    open.textContent = c.open;
    document.querySelector('#share-title').textContent = c.title;
    close.setAttribute('aria-label', c.close);
    document.querySelector('#share-description').textContent = c.description;
    document.querySelector('label[for="share-email"]').textContent = c.email;
    document.querySelector('label[for="share-format"]').textContent = c.format;
    document.querySelector('#share-hint').textContent = c.hint;
    cancel.textContent = c.cancel;
    send.textContent = c.send;
    format.options[0].textContent = document.documentElement.lang === 'en' ? 'Editable project (.json)' : 'Proyecto editable (.json)';
  };
  translate();
  document.querySelector('#language')?.addEventListener('change', () => queueMicrotask(translate));

  const message = (value, error = false) => {
    status.textContent = value;
    status.classList.toggle('error', error);
  };
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'));
      script.onerror = () => reject(new Error('turnstile'));
      document.head.append(script);
    }).catch(error => { scriptPromise = undefined; throw error; });
    return scriptPromise;
  }
  open.addEventListener('click', async () => {
    verificationToken = '';
    send.disabled = true;
    message(t().configuring);
    dialog.showModal();
    email.focus();
    try {
      const configResponse = await fetch('/api/share-config');
      if (!configResponse.ok) throw new Error('unconfigured');
      const config = await configResponse.json();
      if (!config.enabled || !config.siteKey) throw new Error('unconfigured');
      const turnstile = await loadTurnstile();
      if (!dialog.open) return;
      message(t().verify);
      if (widgetId === null) {
        widgetId = turnstile.render('#share-turnstile', {
          sitekey: config.siteKey,
          action: 'share_design',
          theme: 'light',
          callback: token => {
            verificationToken = token;
            send.disabled = false;
            if (status.textContent !== copy.es.success && status.textContent !== copy.en.success) message('');
          },
          'expired-callback': () => { verificationToken = ''; send.disabled = true; message(t().verify, true); },
          'error-callback': () => { verificationToken = ''; send.disabled = true; message(t().verify, true); },
        });
      } else turnstile.reset(widgetId);
    } catch (error) {
      message(t()[error.message] || t().server, true);
    }
  });
  close.addEventListener('click', () => dialog.close());
  cancel.addEventListener('click', () => dialog.close());

  const maxBytes = 3 * 1024 * 1024;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const safeName = value => (value || 'SolidCraft').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'SolidCraft';
  async function exportedFile(selectedFormat) {
    const win = frame.contentWindow;
    if (!win?.solidcraft || win.document.querySelector('#solidcraft_loading')) throw new Error('loading');
    const api = win.solidcraft;
    const design = await api.inspect();
    const tempName = `drafty3d-share-${crypto.randomUUID()}.${selectedFormat}`;
    const root = await navigator.storage.getDirectory();
    let wrote = false;
    try {
      const result = await api.execute('file.export', { path: `/opfs/${tempName}`, format: selectedFormat });
      wrote = true;
      let file;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        try {
          const handle = await root.getFileHandle(tempName);
          file = await handle.getFile();
          if (file.size === result.bytes) break;
        } catch (error) {
          if (error.name !== 'NotFoundError' && error.name !== 'NoModificationAllowedError') throw error;
        }
        await pause(100);
      }
      if (!file || file.size !== result.bytes) throw new Error('timeout');
      if (file.size > maxBytes) throw new Error('tooLarge');
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      return {
        filename: `${safeName(design.name)}.${selectedFormat}`,
        format: selectedFormat,
        content,
      };
    } finally {
      if (wrote) {
        for (let attempt = 0; attempt < 10; attempt++) {
          try { await root.removeEntry(tempName); break; }
          catch (error) {
            if (error.name === 'NotFoundError') break;
            if (attempt === 9) console.warn('Temporary SolidCraft export could not be removed', error);
            else await pause(100);
          }
        }
      }
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!verificationToken) { message(t().verify, true); return; }
    send.disabled = true;
    try {
      message(t().preparing);
      let attachment;
      try { attachment = await exportedFile(format.value); }
      catch (error) {
        if (error.message === 'loading') throw error;
        if (error.message === 'tooLarge' || error.message === 'timeout') throw error;
        console.error('SolidCraft export failed', error);
        throw new Error('exportFailed');
      }
      message(t().sending);
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email.value.trim(), verificationToken, ...attachment }),
      });
      if (!response.ok) {
        if (response.status === 403) throw new Error('unauthorized');
        if (response.status === 503) throw new Error('unconfigured');
        if (response.status === 413) throw new Error('tooLarge');
        if (response.status === 429) throw new Error('rateLimited');
        throw new Error('server');
      }
      message(t().success);
    } catch (error) {
      message(t()[error.message] || t().server, true);
    } finally {
      verificationToken = '';
      send.disabled = true;
      if (widgetId !== null) window.turnstile?.reset(widgetId);
    }
  });
}
