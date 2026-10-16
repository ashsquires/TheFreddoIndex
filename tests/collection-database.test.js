import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
test.before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(await readFile(new URL('../supabase/migrations/20261016145103_daily_collection.sql', import.meta.url), 'utf8'));
});
test.after(() => db.close());
test('only the three approved single-bar sources are seeded and public clients cannot access collection data', async () => {
  const { rows } = await db.query('select slug from freddo_private.retailers order by slug');
  assert.deepEqual(rows.map(r => r.slug), ['asda', 'sainsburys', 'tesco']);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from freddo_private.retailers'), /permission denied/);
    await db.exec('reset role');
  }
});

async function attempt() {
  const run = (await db.query(`insert into freddo_private.collection_runs(principal_id,idempotency_key,scheduled_for,trigger,collector_version,policy_version_id)
    select gen_random_uuid(),gen_random_uuid()::text,'2026-10-16T07:00:00Z','synthetic','test',id from freddo_private.policy_versions returning id`)).rows[0].id;
  const source = (await db.query('select id from freddo_private.retailer_sources limit 1')).rows[0].id;
  await db.query('insert into freddo_private.collection_run_sources(run_id,source_id) values($1,$2)',[run,source]);
  return (await db.query(`insert into freddo_private.collection_attempts(run_id,source_id,attempt_number,started_at,finished_at,outcome,availability,availability_observed_at,final_url)
    values($1,$2,1,'2026-10-16T07:01:00Z','2026-10-16T07:02:00Z','price_observed','available','2026-10-16T07:01:30Z','https://www.asda.com/groceries/product/5803656') returning id`,[run,source])).rows[0].id;
}
async function price(attemptId) {
  return (await db.query(`insert into freddo_private.price_observations(attempt_id,observed_at,product_title,source_url,pack_count,weight_g,normal_price_pence,availability,price_evidence_text)
    values($1,'2026-10-16T07:01:30Z','Freddo 18g','https://www.asda.com/groceries/product/5803656',1,18,34,'available','34p') returning id`,[attemptId])).rows[0].id;
}
test('a price survives a failed capture, and screenshots cannot reference a different attempt', async () => {
  const a = await attempt();
  const o = await price(a);
  await db.query(`insert into freddo_private.screenshot_evidence(attempt_id,observation_id,purpose,state,failure_code)
    values($1,$2,'observation','failed','capture_failed')`,[a,o]);
  assert.equal((await db.query('select normal_price_pence from freddo_private.price_observations where id=$1',[o])).rows[0].normal_price_pence,34);
  const b = await attempt();
  await assert.rejects(db.query(`insert into freddo_private.screenshot_evidence(attempt_id,observation_id,purpose) values($1,$2,'observation')`,[b,o]), /foreign key/);
  await assert.rejects(db.query('update freddo_private.price_observations set normal_price_pence=35 where id=$1',[o]), /immutable/);
  await assert.rejects(db.query('delete from freddo_private.price_observations where id=$1',[o]), /immutable/);
});

test('corrections preserve observation time, reviews serialize, synthetic prices stay ineligible', async () => {
  const a = await attempt(), o = await price(a);
  const policy = (await db.query('select id from freddo_private.policy_versions')).rows[0].id;
  await db.query(`insert into freddo_private.observation_reviews(observation_id,sequence_number,decision,actor,policy_version_id) values($1,1,'accepted','test',$2)`,[o,policy]);
  await assert.rejects(db.query(`insert into freddo_private.observation_reviews(observation_id,sequence_number,decision,actor,policy_version_id) values($1,3,'rejected','test',$2)`,[o,policy]), /review sequence conflict/);
  assert.equal((await db.query('select count(*)::int n from freddo_private.eligible_observations')).rows[0].n,0);
  await assert.rejects(db.query(`insert into freddo_private.price_observations(attempt_id,revision_number,supersedes_observation_id,correction_reason,observed_at,product_title,source_url,pack_count,weight_g,normal_price_pence,availability,price_evidence_text)
  select attempt_id,2,id,'transcription','2026-10-16T07:01:31Z',product_title,source_url,pack_count,weight_g,35,availability,price_evidence_text from freddo_private.price_observations where id=$1`,[o]),/preserve attempt and time/);
  const corrected = (await db.query(`insert into freddo_private.price_observations(attempt_id,revision_number,supersedes_observation_id,correction_reason,observed_at,product_title,source_url,pack_count,weight_g,normal_price_pence,availability,price_evidence_text)
  select attempt_id,2,id,'transcription',observed_at,product_title,source_url,pack_count,weight_g,35,availability,price_evidence_text from freddo_private.price_observations where id=$1 returning revision_number`,[o])).rows[0];
  assert.equal(corrected.revision_number,2);
});

test('historical source identity and synthetic run classification cannot be rewritten', async () => {
  await assert.rejects(db.query("update freddo_private.retailer_sources set expected_weight_g=20"), /source identity/);
  await assert.rejects(db.query("update freddo_private.collection_runs set trigger='manual'"), /run identity/);
  await assert.rejects(db.query("update freddo_private.observation_reviews set decision='accepted'"), /immutable/);
});

test('corrections require an explicit reason and stored screenshots require actual metadata', async () => {
 const a=await attempt(), o=await price(a);
 await assert.rejects(db.query(`insert into freddo_private.price_observations(attempt_id,revision_number,supersedes_observation_id,observed_at,product_title,source_url,pack_count,weight_g,normal_price_pence,availability,price_evidence_text)
 select attempt_id,2,id,observed_at,product_title,source_url,pack_count,weight_g,35,availability,price_evidence_text from freddo_private.price_observations where id=$1`,[o]),/check constraint/);
 await assert.rejects(db.query("insert into freddo_private.screenshot_evidence(attempt_id,observation_id,purpose,state) values($1,$2,'observation','stored')",[a,o]),/check constraint/);
});

test('evidence purpose cannot shorten price retention and evidence history cannot disappear', async () => {
 const a=await attempt(), o=await price(a);
 await assert.rejects(db.query("insert into freddo_private.screenshot_evidence(attempt_id,observation_id,purpose) values($1,$2,'diagnostic')",[a,o]),/diagnostic evidence/);
 const e=(await db.query("insert into freddo_private.screenshot_evidence(attempt_id,observation_id,purpose) values($1,$2,'observation') returning id",[a,o])).rows[0].id;
 await assert.rejects(db.query('delete from freddo_private.screenshot_evidence where id=$1',[e]),/immutable/);
});

test('public and loyalty promotions keep independent wording and expiry', async () => {
 const a=await attempt();
 const row=(await db.query(`insert into freddo_private.price_observations(attempt_id,observed_at,product_title,source_url,pack_count,weight_g,normal_price_pence,public_offer_price_pence,loyalty_price_pence,offer_conditions,offer_expires_at,loyalty_offer_conditions,loyalty_offer_expires_at,availability,price_evidence_text)
 values($1,'2026-10-16T07:01:30Z','Freddo','https://www.asda.com/groceries/product/5803656',1,18,40,35,30,'Rollback','2026-10-20T23:00:00Z','Members only','2026-10-18T23:00:00Z','available','40p 35p 30p') returning offer_conditions,loyalty_offer_conditions`,[a])).rows[0];
 assert.deepEqual(row,{offer_conditions:'Rollback',loyalty_offer_conditions:'Members only'});
});
