import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailAlertProbe, EMAIL_TEST } from '../supabase/functions/freddo-probe/email-alert.js';
import { createProbeReceiver } from '../supabase/functions/freddo-probe/handler.js';

const identity = { userId: EMAIL_TEST.userId };
function fixture(overrides = {}) {
  const objects = new Map();
  const requests = [];
  const storage = { read: async path => objects.get(path) ?? null, create: async (path, bytes) => { if (!objects.has(path)) objects.set(path, bytes); } };
  const options = { storage, apiKey: 'test-only-key', enabled: true, now: () => EMAIL_TEST.opensAt + 1000,
    fetchImpl: async (url, request) => { requests.push({ url, ...request }); return Response.json({ id: 'test-email-id' }); }, ...overrides };
  return { objects, requests, options, run: createEmailAlertProbe(options) };
}
test('missing completion sends fixed alert, persists receipt and suppresses replay', async () => {
  const f = fixture();
  const result = await f.run(identity);
  assert.equal(result.status, 'accepted_by_provider');
  assert.equal(result.email_id, 'test-email-id');
  assert.equal((await f.run(identity)).replayed, true);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, 'https://api.resend.com/emails');
  const body = JSON.parse(f.requests[0].body);
  assert.deepEqual(body.to, ['thefreddoindex@gmail.com']);
  assert.equal(body.from, 'The Freddo Index <alert@thefreddoindex.com>');
  assert.equal(f.requests[0].headers['Idempotency-Key'], EMAIL_TEST.eventId);
});
test('healthy marker does not send email', async () => {
  const f = fixture();
  f.objects.set(`${identity.userId}/${EMAIL_TEST.marker}.bin`, new Uint8Array([1]));
  assert.equal((await f.run(identity)).email_sent, false);
  assert.equal(f.requests.length, 0);
});
test('disabled, missing credentials, foreign identity and expired test fail before sending', async () => {
  for (const overrides of [{ enabled: false }, { apiKey: undefined }, { now: () => EMAIL_TEST.closesAt }, { now: () => EMAIL_TEST.opensAt - 1 }]) {
    const f = fixture(overrides);
    await assert.rejects(f.run(identity));
    assert.equal(f.requests.length, 0);
  }
  const f = fixture();
  await assert.rejects(f.run({ userId: 'foreign-user' }));
  assert.equal(f.requests.length, 0);
});
test('storage failure is not interpreted as a missing marker', async () => {
  const f = fixture({ storage: { read: async () => { throw new Error('unavailable'); } } });
  await assert.rejects(f.run(identity));
  assert.equal(f.requests.length, 0);
});
test('provider failure cannot produce a success receipt', async () => {
  const f = fixture({ fetchImpl: async () => new Response('provider detail', { status: 403 }) });
  await assert.rejects(f.run(identity), /provider rejected/);
  assert.equal(f.objects.size, 0);
});
test('unknown send outcome retries with the same provider idempotency key', async () => {
  const f = fixture();
  let writes = 0;
  const run = createEmailAlertProbe({ ...f.options, storage: { ...f.options.storage, create: async (...args) => {
    if (++writes === 1) throw new Error('temporary persistence failure');
    return f.options.storage.create(...args);
  } } });
  await assert.rejects(run(identity));
  await run(identity);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].headers['Idempotency-Key'], f.requests[1].headers['Idempotency-Key']);
  assert.equal(f.requests[0].body, f.requests[1].body);
});
test('receiver authenticates email action and rejects recipient overrides', async () => {
  let sends = 0;
  const receiver = createProbeReceiver({ authenticate: async token => token === 'valid' ? identity : null, storage: {}, emailAlert: async () => { sends++; return {}; } });
  const request = (token, args) => new Request('https://example.com/freddo-probe', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'probe_check_email_alert', arguments: args } }) });
  assert.equal((await receiver(request('invalid', {}))).status, 401);
  assert.equal((await (await receiver(request('valid', { to: 'other@example.com' }))).json()).result.isError, true);
  assert.equal(sends, 0);
  await receiver(request('valid', {}));
  assert.equal(sends, 1);
});
