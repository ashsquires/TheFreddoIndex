import test from 'node:test';
import assert from 'node:assert/strict';
import {database,observe} from './helpers/collection-db.js';
import {readFile} from 'node:fs/promises';
import {createOperatorReceiver} from '../supabase/functions/freddo-ops/handler.js';
test('owner can inspect ordered correction and review history; unrelated users cannot',async()=>{
 const db=await database();
 try{
  await db.exec(await readFile(new URL('../supabase/migrations/20261017045742_operator_review_history.sql',import.meta.url),'utf8'));
  const owner=crypto.randomUUID();await db.query('insert into auth.users values($1)',[owner]);
  await db.query("insert into freddo_private.operator_access(user_id,expires_at) values($1,now()+interval '1 day')",[owner]);
  const source=(await db.query('select * from freddo_private.retailer_sources limit 1')).rows[0];
  const original=await observe(db,source,'2026-10-16T08:00:00Z');
  const call=async(user,action,args)=>(await db.query('select public.freddo_operator($1,$2,$3) r',[user,action,JSON.stringify(args)])).rows[0].r;
  const correction=await call(owner,'correct',{request_key:'correction',observation_id:original.id,expected_sequence:1,reason:'Verified the printed price',changes:{normal_price_pence:35}});
  const handler=createOperatorReceiver({authenticate:async()=>({userId:owner}),execute:(identity,action,args)=>call(identity.userId,action,args)});
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({action:'history',args:{observation_id:correction.data.observation_id}})}));
  assert.equal(response.status,200);
  const history=await response.json();
  assert.deepEqual(history.revisions.map(r=>r.normal_price_pence),[40,35]);
  assert.deepEqual(history.revisions[0].reviews.map(r=>r.decision),['accepted','superseded']);
  assert.equal(history.revisions[1].correction_reason,'Verified the printed price');
  assert.equal(history.revisions[1].observed_at,history.revisions[0].observed_at);
  await assert.rejects(call(crypto.randomUUID(),'history',{observation_id:original.id}),/FORBIDDEN/);
 }finally{await db.close();}
});
