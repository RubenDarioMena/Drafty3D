import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import handler from '../api/share.js';
import configHandler from '../api/share-config.js';

function response() {
  return {
    code: 200, headers: {}, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

const valid = {
  to: 'recipient@example.com', verificationToken: 'token',
  filename: 'Example.step', format: 'step', content: Buffer.from('ISO-10303-21;').toString('base64'),
};
const variables = ['BREVO_API_KEY', 'SHARE_FROM_EMAIL', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'];
const previous = Object.fromEntries(variables.map(name => [name, process.env[name]]));
const setConfigured = () => {
  process.env.BREVO_API_KEY = 'brevo-test-key';
  process.env.SHARE_FROM_EMAIL = 'sender@example.com';
  process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-key';
  process.env.TURNSTILE_SITE_KEY = 'site-test-key';
};
const restore = () => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } };

test('share endpoint stays off without provider and verification credentials', async () => {
  try {
    for (const name of variables) delete process.env[name];
    const config = response();
    configHandler({ method: 'GET' }, config);
    assert.deepEqual(config.payload, { enabled: false, siteKey: null });
    const unavailable = response();
    await handler({ method: 'POST', body: valid }, unavailable);
    assert.equal(unavailable.code, 503);
  } finally { restore(); }
});

test('share endpoint verifies visitor and attaches selected CAD file inside ZIP', async () => {
  const nativeFetch = globalThis.fetch;
  try {
    setConfigured();
    const config = response();
    configHandler({ method: 'GET' }, config);
    assert.deepEqual(config.payload, { enabled: true, siteKey: 'site-test-key' });
    const sent = [];
    globalThis.fetch = async (url, options) => {
      sent.push({ url, options });
      if (url.includes('siteverify')) return { ok: true, json: async () => ({ success: true, action: 'share_design', hostname: 'drafty3-d.vercel.app' }) };
      return { ok: true, status: 201 };
    };
    const invalid = response();
    await handler({ method: 'POST', headers: { host: 'drafty3-d.vercel.app' }, body: { ...valid, filename: 'bad\nsubject.step' } }, invalid);
    assert.equal(invalid.code, 400);
    assert.equal(sent.length, 0);
    const success = response();
    await handler({ method: 'POST', headers: { host: 'drafty3-d.vercel.app' }, body: valid }, success);
    assert.equal(success.code, 200);
    assert.equal(sent.length, 2);
    assert.equal(sent[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(sent[1].url, 'https://api.brevo.com/v3/smtp/email');
    const payload = JSON.parse(sent[1].options.body);
    assert.deepEqual(payload.to, [{ email: valid.to }]);
    assert.equal(payload.attachment[0].name, 'Example.step.zip');
    const archive = unzipSync(Buffer.from(payload.attachment[0].content, 'base64'));
    assert.equal(Buffer.from(archive['Example.step']).toString(), 'ISO-10303-21;');
  } finally { globalThis.fetch = nativeFetch; restore(); }
});

test('share endpoint rejects failed anti-spam verification and mismatched hostname or action', async () => {
  const nativeFetch = globalThis.fetch;
  try {
    setConfigured();
    const sent = [];
    for (const verdict of [
      { success: false },
      { success: true, action: 'other_action', hostname: 'drafty3-d.vercel.app' },
      { success: true, action: 'share_design', hostname: 'another-site.example' },
    ]) {
      globalThis.fetch = async url => {
        sent.push(url);
        return { ok: true, json: async () => verdict };
      };
      const denied = response();
      await handler({ method: 'POST', headers: { host: 'drafty3-d.vercel.app' }, body: valid }, denied);
      assert.equal(denied.code, 403);
    }
    assert.equal(sent.length, 3);
    assert.ok(sent.every(url => url.includes('siteverify')));
  } finally { globalThis.fetch = nativeFetch; restore(); }
});
