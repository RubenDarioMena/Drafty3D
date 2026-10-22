import { zipSync } from 'fflate';
import { checkBotId } from 'botid/server';

const maxBytes = 3 * 1024 * 1024;
const formats = new Set(['json', 'step', 'stl']);
const address = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function matchesFormat(format, bytes) {
  if (format === 'step') return bytes.subarray(0, 13).toString('ascii') === 'ISO-10303-21;';
  if (format === 'stl') return bytes.length >= 84 && bytes.length === 84 + bytes.readUInt32LE(80) * 50;
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  } catch { return false; }
}

export const createHandler = (verifyBot = checkBotId) => async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'method_not_allowed' });
  }
  const { BREVO_API_KEY, SHARE_FROM_EMAIL } = process.env;
  if (!BREVO_API_KEY || !SHARE_FROM_EMAIL) {
    return response.status(503).json({ error: 'not_configured' });
  }
  let body;
  try { body = request.body; }
  catch { return response.status(400).json({ error: 'invalid_body' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ error: 'invalid_body' });
  }
  const { to, filename, format, content } = body;
  if (typeof to !== 'string' || to.length > 254 || !address.test(to) ||
      typeof format !== 'string' || !formats.has(format) ||
      typeof filename !== 'string' || filename.length > 100 ||
      !new RegExp(`^[a-zA-Z0-9_-]+\\.${format}$`).test(filename) ||
      typeof content !== 'string' || content.length > Math.ceil(maxBytes / 3) * 4 ||
      !base64.test(content)) {
    return response.status(400).json({ error: 'invalid_attachment' });
  }
  const bytes = Buffer.from(content, 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== content) {
    return response.status(413).json({ error: 'invalid_size' });
  }
  if (!matchesFormat(format, bytes)) return response.status(400).json({ error: 'invalid_attachment' });
  const verdict = await verifyBot({ advancedOptions: { checkLevel: 'basic' } }).catch(() => null);
  if (!verdict) return response.status(502).json({ error: 'verification_unavailable' });
  if (!verdict.isHuman || verdict.isBot) return response.status(403).json({ error: 'verification_failed' });
  const zipName = `${filename}.zip`;
  let zip;
  try { zip = zipSync({ [filename]: new Uint8Array(bytes) }, { level: 6 }); }
  catch { return response.status(500).json({ error: 'archive_failed' }); }
  const provider = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: SHARE_FROM_EMAIL, name: 'Drafty3D' },
      to: [{ email: to }],
      subject: `Diseño SolidCraft: ${filename}`,
      htmlContent: `<p>Te han compartido un diseño de SolidCraft desde Drafty3D.</p><p>El archivo ${filename} está dentro del ZIP adjunto.</p>`,
      textContent: `Te han compartido un diseño de SolidCraft desde Drafty3D. El archivo ${filename} está dentro del ZIP adjunto.`,
      attachment: [{ name: zipName, content: Buffer.from(zip).toString('base64') }],
    }),
  }).catch(() => null);
  if (!provider?.ok) {
    console.error('Share email provider rejected request', provider?.status ?? 'network_error');
    return response.status(502).json({ error: 'delivery_failed' });
  }
  return response.status(200).json({ sent: true });
};

export default createHandler();
