import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const principal='11111111-1111-4111-8111-111111111111';
test.before(async()=>{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);');
 for(const file of ['20261016084401_add_freddo_probe.sql','20261016145103_daily_collection.sql','20261016145527_ingestion_transactions.sql','20261016150607_production_authorization.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
});
test.after(()=>db.close());
const call=async(tool,args,who=principal)=>(await db.query('select public.freddo_ingest($1,$2,$3) as receipt',[who,tool,JSON.stringify({contract_version:1,...args})])).rows[0].receipt;
const startArgs=()=>({request_key:crypto.randomUUID(),trigger:'synthetic',scheduled_for:new Date().toISOString(),collector_version:'test'});
test('identical delivery returns the original run and manifest; conflicting reuse is rejected',async()=>{
 const args=startArgs();
 const [a,b]=await Promise.all([call('start_run_v1',args),call('start_run_v1',args)]);
 assert.equal(a.data.run_id,b.data.run_id);
 assert.equal(b.replayed,true);
 assert.equal(a.data.sources.length,3);
 await assert.rejects(call('start_run_v1',{...args,collector_version:'changed'}),/CONFLICT/);
});

async function visit(run, source, extra={}) {
 const time=new Date().toISOString();
 return {request_key:crypto.randomUUID(),run_id:run,source_id:source.id,attempt_number:1,started_at:time,finished_at:time,outcome:'price_observed',availability:'available',availability_observed_at:time,final_url:source.product_url,evidence_excerpt:'Freddo 18g 34p',observation:{observed_at:time,product_title:'Cadbury Dairy Milk Freddo 18g',source_url:source.product_url,pack_count:1,weight_g:18,currency:'GBP',normal_price_pence:34,price_evidence_text:'34p'},...extra};
}
test('price, review and evidence reservation are atomic, replayable and owner-scoped',async()=>{
 const run=(await call('start_run_v1',startArgs())).data;
 const args=await visit(run.run_id,run.sources[0]);
 const receipt=await call('record_attempt_v1',args);
 assert.ok(receipt.data.observation_id);
 assert.ok(receipt.data.evidence_id);
 assert.equal(receipt.data.review_state,'accepted');
 assert.deepEqual((await call('record_attempt_v1',args)).data,receipt.data);
 await assert.rejects(call('record_attempt_v1',{...args,request_key:'duplicate'}),/CONFLICT/);
 await assert.rejects(call('record_attempt_v1',{...args,request_key:'intruder'},'22222222-2222-4222-8222-222222222222'),/NOT_FOUND/);
});

test('all three failed visits complete accounting without fabricating prices, while partial coverage remains partial',async()=>{
 const run=(await call('start_run_v1',startArgs())).data;
 const first=await visit(run.run_id,run.sources[0],{outcome:'blocked',availability:'unknown',availability_observed_at:null}); delete first.observation;
 await call('record_attempt_v1',first);
 const partial=await call('finish_run_v1',{request_key:crypto.randomUUID(),run_id:run.run_id});
 assert.equal(partial.data.status,'partial');
 assert.equal(partial.data.missing_sources.length,2);
 const all=(await call('start_run_v1',startArgs())).data;
 for(const source of all.sources){
  const args=await visit(all.run_id,source,{outcome:'no_price',availability:'out_of_stock'}); delete args.observation;
  const result=await call('record_attempt_v1',args); assert.equal(result.data.observation_id,null);
 }
 const done=await call('finish_run_v1',{request_key:crypto.randomUUID(),run_id:all.run_id});
 assert.equal(done.data.status,'complete');
 assert.equal(done.data.price_count,0);
 assert.equal(done.data.missing_evidence,3);
});

test('capture failures retain prices and reservations reject foreign links',async()=>{
 const run=(await call('start_run_v1',startArgs())).data;
 const saved=(await call('record_attempt_v1',await visit(run.run_id,run.sources[0]))).data;
 const args={request_key:crypto.randomUUID(),run_id:run.run_id,attempt_id:saved.attempt_id,evidence_id:saved.evidence_id,observation_id:saved.observation_id,purpose:'observation',failure_code:'capture_failed'};
 const reservation=await call('reserve_evidence_v1',args);
 assert.equal(reservation.data.state,'failed');
 assert.equal(reservation.data.failure_code,'capture_failed');
 await assert.rejects(call('reserve_evidence_v1',{...args,request_key:crypto.randomUUID(),attempt_id:crypto.randomUUID()}),/NOT_FOUND/);
 const read=(await db.query('select public.freddo_get_run($1,$2,null) report',[principal,run.run_id])).rows[0].report;
 assert.equal(read.price_count,1);
});

test('production grants are separate from probe grants and revocation is immediate',async()=>{
 const session=crypto.randomUUID();
 await db.query('insert into auth.users values($1)',[principal]);
 await db.query('insert into auth.sessions values($1,$2,null)',[session,principal]);
 const roles=async()=>(await db.query("select public.freddo_production_roles($1,'production',$2) roles",[principal,session])).rows[0].roles;
 assert.deepEqual(await roles(),[]);
 await db.query("insert into freddo_private.production_access values($1,'production','{collector}',true,now()+interval '1 day',now())",[principal]);
 assert.deepEqual(await roles(),['collector']);
 await db.exec("update freddo_private.production_access set enabled=false");
 assert.deepEqual(await roles(),[]);
 await db.exec("update freddo_private.production_access set enabled=true; delete from auth.sessions");
 assert.deepEqual(await roles(),[]);
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(call('start_run_v1',startArgs()),/permission denied/);
  await assert.rejects(roles(),/permission denied/);
  await db.exec('reset role');
 }
});

test('exactly 25 percent is accepted; larger changes and weight mismatches are quarantined',async()=>{
 for(const [price,weight,expected] of [[40,18,'accepted'],[50,18,'accepted'],[63,18,'quarantined'],[50,20,'quarantined']]){
  const run=(await call('start_run_v1',{...startArgs(),trigger:'manual'})).data;
  const args=await visit(run.run_id,run.sources[0]);args.observation.normal_price_pence=price;args.observation.weight_g=weight;
  const saved=(await call('record_attempt_v1',args)).data;
  assert.equal(saved.review_state,expected);
 }
});

test('return to normal after offer expiry compares against the previously observed offer',async()=>{
 const first=(await call('start_run_v1',{...startArgs(),trigger:'manual'})).data;
 const original=await visit(first.run_id,first.sources[1]);
 const past=new Date(Date.now()-60000).toISOString();
 original.started_at=past;original.finished_at=past;original.availability_observed_at=past;original.observation.observed_at=past;
 Object.assign(original.observation,{normal_price_pence:40,public_offer_price_pence:20,offer_expires_at:new Date(Date.now()-30000).toISOString()});
 assert.equal((await call('record_attempt_v1',original)).data.review_state,'accepted');
 const next=(await call('start_run_v1',{...startArgs(),trigger:'manual'})).data;
 const current=await visit(next.run_id,next.sources[1]);current.observation.normal_price_pence=40;
 assert.equal((await call('record_attempt_v1',current)).data.review_state,'quarantined');
});

test('conflicting upload keys cannot poison another chunk and final receipts survive staging cleanup',async()=>{
 const {createEvidenceTransfer,sha256}=await import('../supabase/functions/freddo-ingest/evidence.js');
 const {screenshotPng:bytes}=await import('./fixtures/screenshot.js');
 const run=(await call('start_run_v1',startArgs())).data;
 const saved=(await call('record_attempt_v1',await visit(run.run_id,run.sources[0]))).data;
 await call('reserve_evidence_v1',{request_key:crypto.randomUUID(),run_id:run.run_id,attempt_id:saved.attempt_id,evidence_id:saved.evidence_id,observation_id:saved.observation_id,purpose:'observation',captured_at:new Date().toISOString(),mime_type:'image/png',byte_size:bytes.length,sha256:await sha256(bytes)});
 const files=new Map();
 const dbAdapter={mutate:(who,tool,args)=>call(tool,args,who),evidence:async(who,id)=>(await db.query('select public.freddo_upload_access($1,$2) result',[who,id])).rows[0].result,lookup:async(who,tool,args)=>(await db.query('select public.freddo_lookup_receipt($1,$2,$3) result',[who,tool,JSON.stringify(args)])).rows[0].result};
 const transfer=createEvidenceTransfer({db:dbAdapter,storage:{create:async(path,data)=>{if(!files.has(path))files.set(path,data);},read:async path=>files.get(path)??null}});
 const parts=[bytes.slice(0,30),bytes.slice(30)];
 const chunk=async(index,key)=>({contract_version:1,request_key:key,reservation_id:saved.evidence_id,chunk_index:index,base64:Buffer.from(parts[index]).toString('base64'),chunk_sha256:await sha256(parts[index])});
 await transfer(principal,'put_evidence_chunk_v1',await chunk(0,'same'));
 await assert.rejects(transfer(principal,'put_evidence_chunk_v1',await chunk(1,'same')),/CONFLICT/);
 assert.equal(files.size,1);
 await transfer(principal,'put_evidence_chunk_v1',await chunk(1,'second'));
 const final={contract_version:1,request_key:'final',reservation_id:saved.evidence_id,total_chunks:2,total_bytes:bytes.length,sha256:await sha256(bytes)};
 const stored=await transfer(principal,'finalise_evidence_v1',final);
 assert.equal(stored.data.state,'stored');
 for(const key of files.keys())if(key.startsWith('staging/'))files.delete(key);
 const replay=await transfer(principal,'finalise_evidence_v1',final);
 assert.equal(replay.replayed,true);assert.equal(replay.request_id,stored.request_id);
 await assert.rejects(transfer(principal,'finalise_evidence_v1',{...final,total_chunks:1}),/CONFLICT/);
});
