import { timingSafeEqual } from 'node:crypto';

const maxBytes = 3 * 1024 * 1024;
const formats = new Set(['json', 'step', 'stl']);
const address = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function sameSecret(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'method_not_allowed' });
  }
  const { RESEND_API_KEY, SHARE_FROM_EMAIL, SHARE_ACCESS_TOKEN } = process.env;
  if (!RESEND_API_KEY || !SHARE_FROM_EMAIL || !SHARE_ACCESS_TOKEN) {
    return response.status(503).json({ error: 'not_configured' });
  }
  let body;
  try { body = request.body; }
  catch { return response.status(400).json({ error: 'invalid_body' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ error: 'invalid_body' });
  }
  if (!sameSecret(body.accessKey, SHARE_ACCESS_TOKEN)) {
    return response.status(401).json({ error: 'unauthorized' });
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
  const provider = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: SHARE_FROM_EMAIL,
      to: [to],
      subject: `Diseño SolidCraft: ${filename}`,
      text: `Te han compartido un diseño de SolidCraft desde Drafty3D. El archivo ${filename} está adjunto.`,
      attachments: [{ filename, content }],
    }),
  }).catch(() => null);
  if (!provider?.ok) {
    console.error('Share email provider rejected request', provider?.status ?? 'network_error');
    return response.status(502).json({ error: 'delivery_failed' });
  }
  return response.status(200).json({ sent: true });
}
