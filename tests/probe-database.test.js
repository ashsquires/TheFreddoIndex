import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
test.before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);');
  await db.exec(await readFile(new URL('../supabase/migrations/20261016084401_add_freddo_probe.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values($1)', [user]);
  await db.query('insert into auth.sessions values($1,$2,null)', [session,user]);
  await db.query("insert into freddo_private.probe_access values($1,'chatgpt',true,now()+interval '1 day')",[user]);
});
test.after(() => db.close());
const allowed = async () => (await db.query('select freddo_probe_authorized($1,$2,$3) as allowed',[user,'chatgpt',session])).rows[0].allowed;
test('only live approved sessions can use the probe; disable and revoke take effect immediately', async () => {
  assert.equal(await allowed(),true);
  await db.exec('update freddo_private.probe_access set enabled=false');
  assert.equal(await allowed(),false);
  await db.exec('update freddo_private.probe_access set enabled=true');
  await db.exec('delete from auth.sessions');
  assert.equal(await allowed(),false);
});
test('public users cannot inspect or grant probe authority', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(allowed(), /permission denied/);
    await assert.rejects(db.query('select * from freddo_private.probe_access'), /permission denied/);
    await assert.rejects(db.query("select freddo_probe_token_hook('{}')"), /permission denied/);
    await db.exec('reset role');
  }
});
test('token hook binds approved client to receiver audience and preserves other users', async () => {
  for (const client of ['chatgpt','other']) {
    const event = { client_id:client, claims:{sub:user,aud:'authenticated',client_id:client} };
    const result = (await db.query('select freddo_probe_token_hook($1) as event',[JSON.stringify(event)])).rows[0].event;
    assert.equal(result.claims.aud, client === 'chatgpt' ? 'https://ectikpmaidqobqfsqife.supabase.co/functions/v1/freddo-probe' : 'authenticated');
  }
});
