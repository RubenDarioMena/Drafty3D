import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import handler, { createHandler } from '../api/share.js';
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
  to: 'recipient@example.com',
  filename: 'Example.step', format: 'step', content: Buffer.from('ISO-10303-21;').toString('base64'),
};
const variables = ['BREVO_API_KEY', 'SHARE_FROM_EMAIL'];
const previous = Object.fromEntries(variables.map(name => [name, process.env[name]]));
const setConfigured = () => {
  process.env.BREVO_API_KEY = 'brevo-test-key';
  process.env.SHARE_FROM_EMAIL = 'sender@example.com';
};
const restore = () => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } };

test('share endpoint stays off without provider credentials', async () => {
  try {
    for (const name of variables) delete process.env[name];
    const config = response();
    configHandler({ method: 'GET' }, config);
    assert.deepEqual(config.payload, { enabled: false });
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
    assert.deepEqual(config.payload, { enabled: true });
    const sent = [];
    globalThis.fetch = async (url, options) => {
      sent.push({ url, options });
      return { ok: true, status: 201 };
    };
    const protectedHandler = createHandler(async () => ({ isHuman: true, isBot: false }));
    const invalid = response();
    await protectedHandler({ method: 'POST', body: { ...valid, filename: 'bad\nsubject.step' } }, invalid);
    assert.equal(invalid.code, 400);
    const disguised = response();
    await protectedHandler({ method: 'POST', body: { ...valid, content: Buffer.from('arbitrary file').toString('base64') } }, disguised);
    assert.equal(disguised.code, 400);
    assert.equal(sent.length, 0);
    const success = response();
    await protectedHandler({ method: 'POST', body: valid }, success);
    assert.equal(success.code, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.brevo.com/v3/smtp/email');
    const payload = JSON.parse(sent[0].options.body);
    assert.deepEqual(payload.to, [{ email: valid.to }]);
    assert.equal(payload.attachment[0].name, 'Example.step.zip');
    const archive = unzipSync(Buffer.from(payload.attachment[0].content, 'base64'));
    assert.equal(Buffer.from(archive['Example.step']).toString(), 'ISO-10303-21;');
  } finally { globalThis.fetch = nativeFetch; restore(); }
});

test('share endpoint rejects bot and unavailable protection before email delivery', async () => {
  const nativeFetch = globalThis.fetch;
  try {
    setConfigured();
    const sent = [];
    globalThis.fetch = async url => { sent.push(url); return { ok: true }; };
    for (const [verifyBot, expectedCode] of [
      [async () => ({ isHuman: false, isBot: true }), 403],
      [async () => { throw new Error('unavailable'); }, 502],
    ]) {
      const denied = response();
      await createHandler(verifyBot)({ method: 'POST', body: valid }, denied);
      assert.equal(denied.code, expectedCode);
    }
    assert.equal(sent.length, 0);
  } finally { globalThis.fetch = nativeFetch; restore(); }
});
