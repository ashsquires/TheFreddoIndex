import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticator } from '../supabase/functions/freddo-probe/auth.js';
const good = { iss: 'https://ectikpmaidqobqfsqife.supabase.co/auth/v1', aud: 'https://ectikpmaidqobqfsqife.supabase.co/functions/v1/freddo-probe', role: 'authenticated', sub: 'operator', client_id: 'chatgpt', session_id: 'session', exp: 2000000000 };
test('only verified OAuth claims with a live approved session are accepted', async () => {
  let claims = good;
  let allowed = true;
  const auth = createAuthenticator({ verify: async () => claims, authorize: async () => allowed });
  assert.deepEqual(await auth('token'), { userId: 'operator' });
  for (const change of [{ iss: 'https://other.example' }, { role: 'service_role' }, { client_id: null }, { session_id: null }, { exp: 1 }, { aud: 'other' }]) {
    claims = { ...good, ...change };
    assert.equal(await auth('token'), null);
  }
  claims = good;
  allowed = false;
  assert.equal(await auth('token'), null);
  claims = null;
  assert.equal(await auth('token'), null);
});
