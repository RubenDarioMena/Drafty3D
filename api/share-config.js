export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }
  const { BREVO_API_KEY, SHARE_FROM_EMAIL, TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY } = process.env;
  return response.status(200).json({
    enabled: Boolean(BREVO_API_KEY && SHARE_FROM_EMAIL && TURNSTILE_SECRET_KEY && TURNSTILE_SITE_KEY),
    siteKey: TURNSTILE_SITE_KEY || null,
  });
}
