import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiver } from '../supabase/functions/freddo-ingest/handler.js';
const request=(body,token='good')=>new Request('https://ectikpmaidqobqfsqife.supabase.co/functions/v1/freddo-ingest',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
test('unauthenticated callers cannot invoke tools; validated callers receive saved receipts and sanitized failures',async()=>{
 const handler=createReceiver({authenticate:async token=>token==='good'?{userId:'owner',roles:['collector']}:null,execute:async()=>{throw new Error('secret upstream response');}});
 const message={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'start_run_v1',arguments:{contract_version:1,request_key:'test',trigger:'synthetic',scheduled_for:'2026-10-16T07:00:00Z',collector_version:'v1'}}};
 assert.equal((await handler(request(message,null))).status,401);
 const result=await (await handler(request(message))).json();
 assert.equal(result.result.isError,true);
 assert.equal(result.result.structuredContent.error.code,'DEPENDENCY_UNAVAILABLE');
 assert.ok(!JSON.stringify(result).includes('secret'));
 const invalid=await (await handler(request({...message,params:{...message.params,arguments:{...message.params.arguments,role:'operator'}}}))).json();
 assert.equal(invalid.result.structuredContent.error.code,'VALIDATION_FAILED');
});
