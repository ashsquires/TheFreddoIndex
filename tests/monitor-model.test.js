import test from 'node:test';
import assert from 'node:assert/strict';
import {retailerObservations} from '../src/monitor-model.js';
test('an older quarantine remains reviewable after a newer accepted observation',()=>{
 const rows=[{id:'older',source_id:'asda',observed_at:'2026-10-15T08:00:00Z',review:{decision:'quarantined'}},{id:'newer',source_id:'asda',observed_at:'2026-10-16T08:00:00Z',review:{decision:'accepted'}},{id:'superseded',source_id:'asda',observed_at:'2026-10-16T09:00:00Z',review:{decision:'superseded'}}];
 const result=retailerObservations(rows,new Set(['asda']));assert.equal(result.latest.id,'newer');assert.deepEqual(result.outstanding.map(o=>o.id),['older']);
});
