import test from 'node:test';
import assert from 'node:assert/strict';
import { handleComments, validateComment } from '../supabase/functions/comments/handler.js';

const origin = 'https://thefreddoindex.com';
const request = (body, method = 'POST', otherHeaders = {}) => new Request(`${origin}/comments`, {
  method, headers: { origin, 'content-type': 'application/json', ...otherHeaders },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});
const deps = overrides => ({ allowedOrigins: [origin], rpc: async () => ({ data: [], error: null }), fingerprint: async () => 'a'.repeat(64), ...overrides });

test('comments validate trimmed lengths and reject non-text/control characters', () => {
  assert.deepEqual(validateComment({ name: '  Barbara ', body: '  Bring back 10p! ' }), { name: 'Barbara', body: 'Bring back 10p!' });
  for (const input of [null, [], {}, { name: 12, body: 'Hello' }, { name: 'A', body: 'Hello' }, { name: 'Barbara', body: 'x'.repeat(1001) }, { name: 'A\nB', body: 'Hello' }]) assert.equal(validateComment(input), null);
});

test('valid posts are sent only to the moderated submission RPC', async () => {
  const calls = [];
  const response = await handleComments(request({ name: 'Barbara', body: '35p? Christ.', status: 'approved' }), deps({ rpc: async (...args) => { calls.push(args); return { error: null }; } }));
  assert.equal(response.status, 202);
  assert.equal(calls[0][0], 'freddo_submit_comment');
  assert.deepEqual(Object.keys(calls[0][1]), ['p_display_name', 'p_body', 'p_fingerprint']);
  assert.match((await response.json()).message, /awaiting approval/);
});

test('GET only returns allowed public fields', async () => {
  const response = await handleComments(request(null, 'GET'), deps({ rpc: async () => ({ data: [{ id: 'one', display_name: 'Barbara', body: 'Hello', created_at: '2026-09-16', fingerprint: 'secret', status: 'approved' }], error: null }) }));
  assert.deepEqual((await response.json()).comments[0], { id: 'one', name: 'Barbara', body: 'Hello', createdAt: '2026-09-16' });
});

test('honeypot submissions never reach the database', async () => {
  const response = await handleComments(request({ name: 'Spam', body: 'Hello', website: 'spam.test' }), deps({ rpc: () => { throw new Error('must not call'); } }));
  assert.equal(response.status, 202);
});

test('unknown browser origins are rejected and CORS preflight is explicit', async () => {
  assert.equal((await handleComments(request({}, 'POST', { origin: 'https://bad.test' }), deps())).status, 403);
  const response = await handleComments(request(null, 'OPTIONS'), deps());
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
});

test('payload limits, malformed JSON and unsupported methods fail safely', async () => {
  assert.equal((await handleComments(request({ body: 'a'.repeat(9000) }), deps())).status, 413);
  const malformed = new Request(`${origin}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal((await handleComments(malformed, deps())).status, 400);
  assert.equal((await handleComments(request(null, 'DELETE'), deps())).status, 405);
});

test('rate limits provide a retry delay; database errors are not exposed', async () => {
  const input = { name: 'Barbara', body: 'Hello there' };
  const limited = await handleComments(request(input), deps({ rpc: async () => ({ error: { code: 'P0001' } }) }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '600');
  const failed = await handleComments(request(input), deps({ rpc: async () => ({ error: { code: 'secret-key', message: 'private database details' } }) }));
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /secret-key|private database/);
});
