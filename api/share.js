import { zipSync } from 'fflate';

const maxBytes = 3 * 1024 * 1024;
const formats = new Set(['json', 'step', 'stl']);
const address = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'method_not_allowed' });
  }
  const { BREVO_API_KEY, SHARE_FROM_EMAIL, TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY } = process.env;
  if (!BREVO_API_KEY || !SHARE_FROM_EMAIL || !TURNSTILE_SECRET_KEY || !TURNSTILE_SITE_KEY) {
    return response.status(503).json({ error: 'not_configured' });
  }
  let body;
  try { body = request.body; }
  catch { return response.status(400).json({ error: 'invalid_body' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ error: 'invalid_body' });
  }
  const { to, filename, format, content, verificationToken } = body;
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
  if (typeof verificationToken !== 'string' || !verificationToken || verificationToken.length > 2048) {
    return response.status(403).json({ error: 'verification_failed' });
  }
  const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: verificationToken }),
  }).catch(() => null);
  if (!verification?.ok) return response.status(502).json({ error: 'verification_unavailable' });
  const verdict = await verification.json().catch(() => null);
  if (!verdict?.success || verdict.action !== 'share_design' || verdict.hostname !== request.headers.host?.split(':')[0]) {
    return response.status(403).json({ error: 'verification_failed' });
  }
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
}
