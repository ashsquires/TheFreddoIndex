import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHealth } from '../supabase/functions/freddo-ingest/monitoring.js';
test('watchdog is quiet before cutoff, detects an absent collector at cutoff, and distinguishes missing screenshots',()=>{
 const base={uk_date:'2026-10-16',deadline:'2026-10-16T09:00:00Z',run:null,sources:[{id:'asda'}],attempts:[],evidence:[],reviews:[],grants:[{enabled:true,expires_at:'2027-01-01T00:00:00Z'}]};
 assert.deepEqual(evaluateHealth(base,'2026-10-16T08:59:59Z'),[]);
 assert.equal(evaluateHealth(base,'2026-10-16T09:00:00Z')[0].category,'missing_run');
 const checked={...base,run:{status:'complete'},attempts:[{id:'a',source_id:'asda',attempt_number:1,outcome:'price_observed',availability:'out_of_stock'}],evidence:[{attempt_id:'a',state:'failed'}]};
 assert.deepEqual(evaluateHealth(checked,'2026-10-16T09:00:00Z').map(x=>x.category),['missing_evidence']);
 checked.evidence[0].state='stored';assert.deepEqual(evaluateHealth(checked,'2026-10-16T09:00:00Z'),[]);
});

test('fourteen-day stock flags expose gaps rather than claiming continuous unavailability',async()=>{
 const {stockStatus}=await import('../supabase/functions/freddo-ingest/monitoring.js');
 const visits=[{availability:'out_of_stock',availability_observed_at:'2026-10-01T08:00:00Z'},{availability:'unknown',availability_observed_at:null},{availability:'out_of_stock',availability_observed_at:'2026-10-14T08:00:00Z'}];
 assert.deepEqual(stockStatus(visits),{flagged:true,span_days:14,observed_days:2,gap_days:12,last_observed_at:'2026-10-14T08:00:00Z'});
 visits.push({availability:'available',availability_observed_at:'2026-10-15T08:00:00Z'});
 assert.equal(stockStatus(visits).flagged,false);
});

test('stock review uses the policy threshold and enters the alert pipeline',()=>{
 const snapshot={deadline:'2026-10-16T09:00:00Z',run:null,sources:[{id:'s'}],grants:[{enabled:true,expires_at:'2027-01-01T00:00:00Z'}],policy:{out_of_stock_flag_days:3},stock_history:[{source_id:'s',availability:'out_of_stock',availability_observed_at:'2026-10-01T08:00:00Z'},{source_id:'s',availability:'out_of_stock',availability_observed_at:'2026-10-03T08:00:00Z'}]};
 assert.ok(evaluateHealth(snapshot,'2026-10-16T09:00:00Z').some(c=>c.category==='stock_review'));
});
