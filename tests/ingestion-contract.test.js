import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArguments } from '../supabase/functions/freddo-ingest/contract.js';
test('collector arguments reject unknown authority fields, invalid dates and fractional prices',()=>{
 const start={contract_version:1,request_key:'day-1',trigger:'scheduled',scheduled_for:'2026-10-16T07:00:00Z',collector_version:'v1'};
 assert.deepEqual(validateArguments('start_run_v1',start),start);
 assert.throws(()=>validateArguments('start_run_v1',{...start,principal_id:'attacker'}),/VALIDATION_FAILED/);
 assert.throws(()=>validateArguments('start_run_v1',{...start,scheduled_for:'2026-02-30T07:00:00Z'}),/VALIDATION_FAILED/);
 const observation={observed_at:'2026-10-16T07:01:00Z',product_title:'Freddo',source_url:'https://www.asda.com/groceries/product/5803656',pack_count:1,weight_g:18,currency:'GBP',normal_price_pence:34.5,price_evidence_text:'34p'};
 const attempt={contract_version:1,request_key:'attempt',run_id:crypto.randomUUID(),source_id:crypto.randomUUID(),attempt_number:1,started_at:observation.observed_at,finished_at:observation.observed_at,outcome:'price_observed',availability:'available',availability_observed_at:observation.observed_at,final_url:observation.source_url,evidence_excerpt:'34p',observation};
 assert.throws(()=>validateArguments('record_attempt_v1',attempt),/VALIDATION_FAILED/);
 observation.normal_price_pence=34;
 assert.deepEqual(validateArguments('record_attempt_v1',attempt),attempt);
 assert.throws(()=>validateArguments('record_attempt_v1',{...attempt,observation:{...observation,decision:'accepted'}}),/VALIDATION_FAILED/);
});
