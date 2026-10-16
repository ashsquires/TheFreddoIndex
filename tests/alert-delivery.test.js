import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverAlerts } from '../supabase/functions/freddo-maintenance/alerts.js';
test('the sender uses only the agreed addresses and stable provider deduplication keys',async()=>{
 const event={id:crypto.randomUUID(),lease_id:crypto.randomUUID(),kind:'failure',summary:'No scheduled run.'};
 let sent,ack;
 const db={claim:async()=>[event],ack:async(...args)=>{ack=args;}};
 await deliverAlerts({db,apiKey:'test-key',fetch:async(_url,options)=>{sent=options;return new Response(JSON.stringify({id:'provider-1'}),{status:200});}});
 assert.equal(sent.headers['Idempotency-Key'],`freddo-alert-${event.id}`);
 const body=JSON.parse(sent.body);
 assert.equal(body.from,'Freddo alerts <alert@thefreddoindex.com>');assert.deepEqual(body.to,['thefreddoindex@gmail.com']);
 assert.deepEqual(ack,[event.id,event.lease_id,'provider-1',null]);
});
test('provider failure is recorded as failed delivery rather than a successful notification',async()=>{
 let ack;
 const db={claim:async()=>[{id:'event',lease_id:'lease',kind:'failure',summary:'Missing.'}],ack:async(...args)=>{ack=args;}};
 await deliverAlerts({db,apiKey:'test',fetch:async()=>new Response('sensitive provider error',{status:503})});
 assert.deepEqual(ack,['event','lease',null,'EMAIL_PROVIDER_UNAVAILABLE']);
});
