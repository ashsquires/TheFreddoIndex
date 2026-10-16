import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const db=new PGlite();
test.before(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create schema storage;create table storage.objects(bucket_id text,name text,created_at timestamptz,metadata jsonb);");
 for(const file of ['20261016084401_add_freddo_probe.sql','20261016145103_daily_collection.sql','20261016145527_ingestion_transactions.sql','20261016150607_production_authorization.sql','20261016151752_monitoring_and_review.sql','20261016152831_retention_and_backups.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
});
test.after(()=>db.close());
test('orphan grace, repeat cleanup, failed retry and history-safe export',async()=>{
 await db.exec("insert into storage.objects values('freddo-evidence','old',now()-interval '25 hours','{\"size\":42}'),('freddo-evidence','new',now()-interval '23 hours','{\"size\":42}')");
 const plan=async()=>(await db.query('select public.freddo_plan_cleanup() p')).rows[0].p;
 let jobs=await plan();assert.equal(jobs.length,1);assert.equal(jobs[0].path,'old');
 assert.deepEqual(await plan(),[]);
 await db.query('select public.freddo_ack_cleanup($1,$2,$3,$4)',[jobs[0].bucket,jobs[0].path,jobs[0].lease_id,'STORAGE_DELETE_FAILED']);
 jobs=await plan();assert.equal(jobs.length,1);
 await db.exec("delete from storage.objects where name='old'"); // Storage API test double, not application code.
 await db.query('select public.freddo_ack_cleanup($1,$2,$3,null)',[jobs[0].bucket,jobs[0].path,jobs[0].lease_id]);
 assert.deepEqual(await plan(),[]);
 const backup=(await db.query('select public.freddo_logical_export() b')).rows[0].b;
 assert.equal(backup.tables.retailers.length,3);assert.equal(backup.image_bytes_backed_up,false);assert.equal(backup.tables.production_access,undefined);
});

test('a fresh watchdog does not conceal prior failed or abandoned jobs',async()=>{
 await db.exec("insert into freddo_private.job_runs(job,state,started_at,finished_at) values('maintenance','failed',now()-interval '1 hour',now()-interval '59 minutes'),('maintenance','running',now()-interval '30 minutes',null),('maintenance','running',now(),null)");
 const health=(await db.query('select public.freddo_operations_health() h')).rows[0].h;
 assert.ok(health.jobs.some(j=>j.state==='failed'));assert.ok(health.jobs.some(j=>j.state==='running'));
});

test('expiry boundary, active upload lease and frozen retention preserve price history',async()=>{
 const {observe}=await import('./helpers/collection-db.js');const source=(await db.query('select * from freddo_private.retailer_sources limit 1')).rows[0];
 const observation=await observe(db,source,'2026-10-16T08:00:00Z');
 await db.exec('begin');
 try{
  const evidence=(await db.query("insert into freddo_private.screenshot_evidence(attempt_id,observation_id,purpose,captured_at,object_path,mime_type,byte_size,sha256,state,uploaded_at,expires_at) values($1,$2,'observation',now()-interval '365 days','observation/expiry','image/png',100,repeat('a',64),'stored',now()-interval '365 days',now()) returning id",[observation.attempt,observation.id])).rows[0].id;
  await db.exec("insert into storage.objects values('freddo-evidence','observation/expiry',now()-interval '365 days','{\"size\":100}')");
  await db.query("insert into freddo_private.upload_leases values($1,now()+interval '10 minutes')",[evidence]);
  const plan=async()=>(await db.query('select public.freddo_plan_cleanup() p')).rows[0].p;
  assert.ok(!(await plan()).some(j=>j.evidence_id===evidence));
  await db.query("update freddo_private.upload_leases set active_until=now() where evidence_id=$1",[evidence]);
  const job=(await plan()).find(j=>j.evidence_id===evidence);assert.equal(job.reason,'retention_expired');
  await assert.rejects(db.query('select public.freddo_upload_access($1,$2)',[crypto.randomUUID(),evidence]),/NOT_FOUND/);
  // Recover from the intentional transaction error for the remaining assertions below.
 }finally{await db.exec('rollback');}
 assert.equal((await db.query('select normal_price_pence from freddo_private.price_observations where id=$1',[observation.id])).rows[0].normal_price_pence,40);
});
