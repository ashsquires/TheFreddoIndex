import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
test.before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
  await db.exec(await readFile(new URL('../supabase/migrations/20260916101352_add_freddo_comments.sql', import.meta.url), 'utf8'));
});
test.after(() => db.close());
test.beforeEach(async () => {
  await db.exec('reset role; truncate freddo_comments, freddo_comment_attempts restart identity;');
});

const submit = (name = 'Reader', body = 'Bring back 10p!', fingerprint = 'a'.repeat(64)) => db.query('select freddo_submit_comment($1, $2, $3)', [name, body, fingerprint]);

test('SQL forces submissions into moderation and only returns approved comments', async () => {
  await db.exec('set role service_role');
  await submit();
  assert.equal((await db.query('select status from freddo_comments')).rows[0].status, 'pending');
  assert.equal((await db.query('select * from freddo_list_comments()')).rows.length, 0);
  await db.exec("update freddo_comments set status = 'approved'");
  const visible = (await db.query('select * from freddo_list_comments()')).rows;
  assert.equal(visible.length, 1);
  assert.deepEqual(Object.keys(visible[0]), ['id', 'display_name', 'body', 'created_at']);
  await db.exec("update freddo_comments set status = 'rejected'");
  assert.equal((await db.query('select * from freddo_list_comments()')).rows.length, 0);
});

test('anonymous and signed-in visitors cannot bypass the Edge Function', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const sql of ['select * from freddo_comments', 'select * from freddo_comment_attempts', 'select * from freddo_list_comments()', "insert into freddo_comments(display_name,body,status) values ('attacker','bypass','approved')"]) await assert.rejects(db.query(sql), /permission denied/);
    await assert.rejects(submit(), /permission denied/);
    await db.exec('reset role');
  }
});

test('SQL enforces per-fingerprint rate limits', async () => {
  await db.exec('set role service_role');
  await submit(); await submit(); await submit();
  await assert.rejects(submit(), /Comment limit reached/);
  assert.equal((await db.query('select count(*)::int as n from freddo_comments')).rows[0].n, 3);
});

test('SQL global rate limit holds even when fingerprints change', async () => {
  await db.exec('set role service_role');
  for (let i = 0; i < 20; i++) await submit('Reader', 'Bring back 10p!', i.toString(16).padStart(64, '0'));
  await assert.rejects(submit('Reader', 'Another comment', 'f'.repeat(64)), /Comment limit reached/);
});

test('SQL validates input and removes expired spam-prevention records on submission', async () => {
  await db.exec('set role service_role');
  await assert.rejects(submit('X'), /Invalid comment/);
  await assert.rejects(submit('Reader', 'x'.repeat(1001)), /Invalid comment/);
  await db.query("insert into freddo_comment_attempts(fingerprint,created_at) values($1, now() - interval '2 days')", ['f'.repeat(64)]);
  await submit();
  assert.equal((await db.query('select count(*)::int as n from freddo_comment_attempts')).rows[0].n, 1);
});

test('the moderation queue is bounded and reads return at most 50 approved rows', async () => {
  await db.exec("insert into freddo_comments(display_name,body) select 'Reader', 'Comment ' || n from generate_series(1,500) n");
  await db.exec('set role service_role');
  await assert.rejects(submit(), /Comment limit reached/);
  await db.exec("update freddo_comments set status = 'approved'");
  assert.equal((await db.query('select * from freddo_list_comments()')).rows.length, 50);
});
