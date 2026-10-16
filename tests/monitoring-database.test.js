import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const db=new PGlite();
test.before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);');
 for(const file of ['20261016084401_add_freddo_probe.sql','20261016145103_daily_collection.sql','20261016145527_ingestion_transactions.sql','20261016150607_production_authorization.sql','20261016151752_monitoring_and_review.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
});
test.after(()=>db.close());
const reconcile=async conditions=>(await db.query("select public.freddo_reconcile_alerts('2026-10-16',$1) result",[JSON.stringify(conditions)])).rows[0].result;
test('repeat conditions produce one failure event and one recovery event',async()=>{
 const condition={category:'missing_run',source_id:null,summary:'No scheduled collection.'};
 await reconcile([condition]);await reconcile([condition]);
 assert.equal((await db.query('select count(*)::int n from freddo_private.alert_events')).rows[0].n,1);
 await reconcile([]);await reconcile([]);
 assert.deepEqual((await db.query('select kind from freddo_private.alert_events order by created_at,id')).rows.map(r=>r.kind).sort(),['failure','recovery']);
 await reconcile([condition]);
 assert.equal((await db.query('select count(*)::int n from freddo_private.alert_events')).rows[0].n,3);
});

test('delivery leases suppress duplicate workers and require the matching lease to acknowledge',async()=>{
 const claim=async()=>(await db.query('select public.freddo_claim_alerts(1) events')).rows[0].events;
 const first=(await claim())[0];assert.ok(first.lease_id);
 const second=(await claim())[0];assert.notEqual(second.id,first.id);
 await assert.rejects(db.query("select public.freddo_ack_alert($1,$2,'message-id',null)",[first.id,crypto.randomUUID()]),/CONFLICT/);
 await db.query("select public.freddo_ack_alert($1,$2,'message-id',null)",[first.id,first.lease_id]);
 assert.equal((await db.query('select state from freddo_private.alert_events where id=$1',[first.id])).rows[0].state,'accepted');
});

test('health reports an absent run explicitly and computes UK deadlines across daylight saving',async()=>{
 for(const [date,expected] of [['2026-10-24','2026-10-24T09:00:00+00:00'],['2026-10-25','2026-10-25T10:00:00+00:00']]){
  const snapshot=(await db.query('select public.freddo_health_snapshot($1) snapshot',[date])).rows[0].snapshot;
  assert.equal(snapshot.run,null);
  assert.equal(new Date(snapshot.deadline).toISOString(),new Date(expected).toISOString());
 }
});

test('operator reviews require authority and reject stale edits while retaining history',async()=>{
 const owner=crypto.randomUUID();
 await db.query('insert into auth.users values($1)',[owner]);
 await assert.rejects(db.query("select public.freddo_operator($1,'snapshot','{}')",[owner]),/FORBIDDEN/);
 await db.query("insert into freddo_private.operator_access(user_id,expires_at) values($1,now()+interval '1 year')",[owner]);
 const run=(await db.query("select public.freddo_ingest($1,'start_run_v1',$2) r",[owner,JSON.stringify({contract_version:1,request_key:'operator-test',trigger:'synthetic',scheduled_for:new Date().toISOString(),collector_version:'test'})])).rows[0].r.data;
 const time=new Date().toISOString(),source=run.sources[0];
 const args={contract_version:1,request_key:'price',run_id:run.run_id,source_id:source.id,attempt_number:1,started_at:time,finished_at:time,outcome:'price_observed',availability:'available',availability_observed_at:time,final_url:source.product_url,evidence_excerpt:'50p',observation:{observed_at:time,product_title:'Freddo',source_url:source.product_url,pack_count:1,weight_g:20,currency:'GBP',normal_price_pence:50,price_evidence_text:'50p'}};
 const price=(await db.query("select public.freddo_ingest($1,'record_attempt_v1',$2) r",[owner,JSON.stringify(args)])).rows[0].r.data;
 const review={request_key:'review',observation_id:price.observation_id,expected_sequence:1,decision:'rejected',reason:'Wrong weight.'};
 await db.query("select public.freddo_operator($1,'review',$2)",[owner,JSON.stringify(review)]);
 await assert.rejects(db.query("select public.freddo_operator($1,'review',$2)",[owner,JSON.stringify({...review,request_key:'another'})]),/CONFLICT/);
 assert.deepEqual((await db.query('select decision from freddo_private.observation_reviews where observation_id=$1 order by sequence_number',[price.observation_id])).rows.map(r=>r.decision),['quarantined','rejected']);
});

test('an actionable change alerts once while unchanged failure stays quiet',async()=>{
 const condition={category:'collection_failure',source_id:null,summary:'Retailer visit failed: blocked.'};
 await reconcile([condition]);
 const before=(await db.query('select count(*)::int n from freddo_private.alert_events')).rows[0].n;
 const changed={...condition,summary:'Retailer visit failed: login_required.'};
 await reconcile([changed]);await reconcile([changed]);
 assert.equal((await db.query('select count(*)::int n from freddo_private.alert_events')).rows[0].n,before+1);
});
