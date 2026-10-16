import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperatorReceiver } from '../supabase/functions/freddo-ops/handler.js';
const req=(body,origin='https://thefreddoindex.com')=>new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer token',origin},body:JSON.stringify(body)});
test('private operator endpoint denies unrelated origins and identities and rejects authority injection',async()=>{
 const handler=createOperatorReceiver({authenticate:async()=>null,execute:async()=>({})});
 assert.equal((await handler(req({action:'snapshot',args:{}}))).status,403);
 assert.equal((await handler(req({action:'snapshot',args:{}},'https://attacker.test'))).status,403);
 const approved=createOperatorReceiver({authenticate:async()=>({userId:'owner'}),execute:async()=>({saved:true})});
 assert.equal((await approved(req({action:'review',args:{request_key:'x',observation_id:crypto.randomUUID(),expected_sequence:1,decision:'accepted',reason:'Verified',actor:'attacker'}}))).status,400);
 assert.deepEqual(await(await approved(req({action:'snapshot',args:{}}))).json(),{saved:true});
});

test('operator can correct separated public and loyalty offer metadata',async()=>{
 const handler=createOperatorReceiver({authenticate:async()=>({userId:'owner'}),execute:async()=>({saved:true})});
 const args={request_key:'fix',observation_id:crypto.randomUUID(),expected_sequence:1,reason:'Checked source',changes:{offer_expires_at:'2026-10-20T23:00:00Z',loyalty_offer_conditions:'Card required',public_offer_price_pence:30}};
 assert.equal((await handler(req({action:'correct',args}))).status,200);
});
