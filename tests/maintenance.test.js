import test from 'node:test';
import assert from 'node:assert/strict';
import {runMaintenance} from '../supabase/functions/freddo-maintenance/runner.js';
test('a broken index does not prevent collection failure detection or email delivery',async()=>{
 let sent=false,conditions;
 const result=await runMaintenance({now:'2026-10-16T10:00:00Z',indexEnabled:true,health:async()=>({deadline:'2026-10-16T09:00:00Z',run:null,sources:[],grants:[]}),calculate:async()=>{throw Error('broken');},cleanup:async()=>[],operations:async()=>({storage_bytes:0,storage_allowance_bytes:100,last_backup:'2026-10-16T08:00:00Z',jobs:[]}),reconcile:async(_,c)=>{conditions=c;},reportFailure:async()=>{},deliver:async()=>{sent=true;return [];}});
 assert.equal(sent,true);assert.equal(result.state,'failed');assert.ok(conditions.some(c=>c.category==='index_failure'));assert.ok(conditions.some(c=>c.category==='missing_run'));
});
