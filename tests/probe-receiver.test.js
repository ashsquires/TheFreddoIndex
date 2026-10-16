import test from 'node:test';
import assert from 'node:assert/strict';
import { createProbeReceiver } from '../supabase/functions/freddo-probe/handler.js';

const endpoint = 'https://ectikpmaidqobqfsqife.supabase.co/functions/v1/freddo-probe';
const request = (method, params = {}, token = '') => new Request(endpoint, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
});

test('unauthenticated calls are challenged before any probe access', async () => {
  const receiver = createProbeReceiver({ authenticate: async () => null });
  const response = await receiver(request('tools/list'));
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /oauth-protected-resource/);
});

test('cloud client discovers OAuth, initializes and lists only synthetic probe tools', async () => {
  const receiver = createProbeReceiver({ authenticate: async () => ({ userId: 'operator' }) });
  const discovery = await receiver(new Request(`${endpoint}/.well-known/oauth-protected-resource`));
  assert.equal((await discovery.json()).authorization_servers[0], 'https://ectikpmaidqobqfsqife.supabase.co/auth/v1');
  const init = await receiver(request('initialize', { protocolVersion: '2025-03-26' }, 'valid'));
  assert.equal((await init.json()).result.protocolVersion, '2025-03-26');
  const list = await receiver(request('tools/list', {}, 'valid'));
  assert.deepEqual((await list.json()).result.tools.map(tool => tool.name), ['probe_put', 'probe_get']);
});

test('synthetic bytes round-trip and conflicting replay cannot overwrite evidence', async () => {
  const objects = new Map();
  const receiver = createProbeReceiver({
    authenticate: async () => ({ userId: 'operator' }),
    storage: {
      async read(path) { return objects.get(path) ?? null; },
      async create(path, bytes) { if (objects.has(path)) return false; objects.set(path, bytes); return true; },
    },
  });
  const call = async (name, args) => (await (await receiver(request('tools/call', { name, arguments: args }, 'valid'))).json()).result;
  const saved = await call('probe_put', { probe_id: 'scheduled-1', base64: 'YWJj' });
  assert.equal(saved.structuredContent.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal((await call('probe_get', { probe_id: 'scheduled-1' })).structuredContent.base64, 'YWJj');
  assert.equal((await call('probe_put', { probe_id: 'scheduled-1', base64: 'YWJj' })).isError, undefined);
  assert.equal((await call('probe_put', { probe_id: 'scheduled-1', base64: 'ZGVm' })).isError, true);
  assert.equal((await call('probe_get', { probe_id: 'scheduled-1' })).structuredContent.base64, 'YWJj');
});

test('oversized requests and browser origins are rejected before parsing tool input', async () => {
  const receiver = createProbeReceiver({ authenticate: async () => ({ userId: 'operator' }) });
  const oversized = await receiver(new Request(endpoint, { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: ' '.repeat(100001) }));
  assert.equal(oversized.status, 413);
  const browser = request('tools/list', {}, 'valid');
  browser.headers.set('origin', 'https://untrusted.example');
  assert.equal((await receiver(browser)).status, 403);
});

test('Supabase proxy internal URLs expose the same public discovery resource', async () => {
  const receiver = createProbeReceiver({ authenticate: async () => null });
  for (const path of ['/functions/v1/freddo-probe/.well-known/oauth-protected-resource','/freddo-probe/.well-known/oauth-protected-resource']) {
    const response = await receiver(new Request(`http://edge-runtime${path}`));
    assert.equal(response.status,200);
    assert.equal((await response.json()).resource,endpoint);
  }
});
