import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/share.js';

function response() {
  return {
    code: 200, headers: {}, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

const valid = {
  to: 'recipient@example.com', accessKey: 'a-long-test-secret',
  filename: 'Example.step', format: 'step', content: Buffer.from('ISO-10303-21;').toString('base64'),
};

test('share endpoint requires configuration and rejects unauthorized requests', async () => {
  const previous = { RESEND_API_KEY: process.env.RESEND_API_KEY, SHARE_FROM_EMAIL: process.env.SHARE_FROM_EMAIL, SHARE_ACCESS_TOKEN: process.env.SHARE_ACCESS_TOKEN };
  try {
    delete process.env.RESEND_API_KEY;
    const unavailable = response();
    await handler({ method: 'POST', body: valid }, unavailable);
    assert.equal(unavailable.code, 503);
    process.env.RESEND_API_KEY = 'test-key';
    process.env.SHARE_FROM_EMAIL = 'share@example.com';
    process.env.SHARE_ACCESS_TOKEN = valid.accessKey;
    const denied = response();
    await handler({ method: 'POST', body: { ...valid, accessKey: 'wrong' } }, denied);
    assert.equal(denied.code, 401);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('share endpoint sends only valid requested attachment to Resend', async () => {
  const previous = { RESEND_API_KEY: process.env.RESEND_API_KEY, SHARE_FROM_EMAIL: process.env.SHARE_FROM_EMAIL, SHARE_ACCESS_TOKEN: process.env.SHARE_ACCESS_TOKEN, fetch: globalThis.fetch };
  try {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.SHARE_FROM_EMAIL = 'share@example.com';
    process.env.SHARE_ACCESS_TOKEN = valid.accessKey;
    const sent = [];
    globalThis.fetch = async (url, options) => {
      sent.push({ url, options });
      return { ok: true, status: 200 };
    };
    const invalid = response();
    await handler({ method: 'POST', body: { ...valid, filename: 'bad\nsubject.step' } }, invalid);
    assert.equal(invalid.code, 400);
    assert.equal(sent.length, 0);
    const success = response();
    await handler({ method: 'POST', body: valid }, success);
    assert.equal(success.code, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.resend.com/emails');
    const payload = JSON.parse(sent[0].options.body);
    assert.deepEqual(payload.to, [valid.to]);
    assert.deepEqual(payload.attachments, [{ filename: valid.filename, content: valid.content }]);
  } finally {
    for (const name of ['RESEND_API_KEY', 'SHARE_FROM_EMAIL', 'SHARE_ACCESS_TOKEN']) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
    globalThis.fetch = previous.fetch;
  }
});
