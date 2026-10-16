import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupEvidence,operationsConditions} from '../supabase/functions/freddo-maintenance/cleanup.js';
test('failed storage deletion remains retryable and is never acknowledged as deleted',async()=>{
 const acks=[];const object={bucket:'freddo-evidence',path:'p',lease_id:'lease'};
 const db={plan:async()=>[object],ack:async(...args)=>acks.push(args)};
 assert.equal((await cleanupEvidence({db,storage:{remove:async()=>{throw Error('offline');}}}))[0].deleted,false);
 assert.equal(acks[0][3],'STORAGE_DELETE_FAILED');
 assert.equal((await cleanupEvidence({db,storage:{remove:async()=>{}}}))[0].deleted,true);
 assert.equal(acks[1][3],null);
});
test('capacity and independent backup failures enter the existing notification route',()=>{
 const conditions=operationsConditions({storage_bytes:80,storage_allowance_bytes:100,cleanup_failures:1,last_backup:null,jobs:[]},'2026-10-16T10:00:00Z');
 assert.deepEqual(conditions.map(c=>c.category),['storage_capacity','cleanup_failure','backup_missing']);
});
