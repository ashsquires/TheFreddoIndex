import test from 'node:test';
import assert from 'node:assert/strict';
import {database,observe} from './helpers/collection-db.js';
const db=await database();test.after(()=>db.close());
const sources=(await db.query('select * from freddo_private.retailer_sources order by retailer_id')).rows;
const calculate=async date=>(await db.query("select public.freddo_calculate_index($1,'Test calculation') r",[date])).rows[0].r;
const inputs=async id=>(await db.query('select * from freddo_private.index_inputs where daily_value_id=$1 order by retailer_id',[id])).rows;
const member=async(source,from,weight=1)=>(await db.query('insert into freddo_private.index_memberships(retailer_id,product_id,effective_from_date,weight,decision_actor,source_id,decision_reason) values($1,$2,$3,$4,$5,$6,\'Test membership\') returning *',[source.retailer_id,source.product_id,from,weight,crypto.randomUUID(),source.id])).rows[0];
test('168 hours inclusive, stale pause, fractional weighted averages and immutable revisions',async()=>{
 await member(sources[0],'2026-10-16',0.5);await member(sources[1],'2026-10-16',1.5);
 const a=await observe(db,sources[0],'2026-10-09T09:00:00Z',{normal:30,availability:'out_of_stock'});
 await observe(db,sources[1],'2026-10-09T08:59:59Z',{normal:50});
 const paused=await calculate('2026-10-16');assert.equal(paused.status,'paused');assert.equal(paused.average_price_pence,null);
 assert.deepEqual((await inputs(paused.id)).map(i=>i.exclusion_reason),[null,'stale_price']);
 await observe(db,sources[1],'2026-10-16T08:00:00Z',{normal:50,loyalty:10});
 const fresh=await calculate('2026-10-16');assert.equal(fresh.status,'published');assert.equal(fresh.average_price_pence,45);assert.equal(fresh.average_price_per_100g_pence,250);assert.equal(fresh.revision_number,2);assert.equal(fresh.supersedes_value_id,paused.id);
 assert.equal((await calculate('2026-10-16')).id,fresh.id);
 assert.equal((await inputs(fresh.id))[0].observation_id,a.id);
 await assert.rejects(db.query('update freddo_private.index_daily_values set average_price_pence=1 where id=$1',[fresh.id]),/immutable/);
 await observe(db,sources[0],'2026-10-16T09:00:01Z',{normal:80}); // post-cutoff excluded
 assert.equal((await calculate('2026-10-16')).id,fresh.id);
});
test('expired offer falls back to older normal using its real age; unknown expiry remains an offer',async()=>{
 const old=await observe(db,sources[0],'2026-10-15T08:00:00Z',{normal:35});
 await observe(db,sources[0],'2026-10-16T08:00:00Z',{normal:null,offer:20,expiry:'2026-10-16T08:30:00Z'});
 let result=await calculate('2026-10-16');let input=(await inputs(result.id))[0];assert.equal(input.observation_id,old.id);assert.equal(input.selected_price_kind,'normal');assert.equal(Number(input.observation_age_seconds),90000);
 await observe(db,sources[0],'2026-10-16T08:01:00Z',{normal:35,offer:25,expiryText:'Until further notice'});
 result=await calculate('2026-10-16');input=(await inputs(result.id))[0];assert.equal(input.selected_price_kind,'public_offer');assert.equal(input.selected_price_pence,25);
 await observe(db,sources[0],'2026-10-16T08:02:00Z',{normal:36,offer:26,expiryText:'2026-10-15'});
 result=await calculate('2026-10-16');assert.equal((await inputs(result.id))[0].selected_price_pence,36);
 const expiry=(await db.query("select freddo_private.offer_expiry(null,'2026-10-24') a,freddo_private.offer_expiry(null,'2026-10-25') b")).rows[0];
 assert.equal(expiry.a.toISOString(),'2026-10-24T23:00:00.000Z');assert.equal(expiry.b.toISOString(),'2026-10-26T00:00:00.000Z');
});
test('quarantines cannot supply a price and membership overlap cannot silently alter denominator',async()=>{
 await observe(db,sources[0],'2026-10-16T08:03:00Z',{normal:100,decision:'quarantined'});
 const before=await calculate('2026-10-16');assert.equal((await inputs(before.id))[0].selected_price_pence,36);
 await assert.rejects(member(sources[0],'2026-10-16'),/CONFLICT/);
 await member(sources[2],'2026-10-16');const paused=await calculate('2026-10-16');assert.equal(paused.expected_member_count,3);assert.equal(paused.status,'paused');
});
test('admission requires seven consecutive real observed dates and records an explicit operator decision',async()=>{
 const owner=crypto.randomUUID();await db.query('insert into auth.users values($1)',[owner]);await db.query("insert into freddo_private.operator_access(user_id,expires_at) values($1,now()+interval '1 year')",[owner]);
 // Close test-only member then test re-admission on the next day.
 await db.query("update freddo_private.index_memberships set effective_to_date='2026-10-17',ended_by=$1,end_reason='Explicit removal' where retailer_id=$2",[owner,sources[2].retailer_id]);
 const args={request_key:'admit',source_id:sources[2].id,effective_date:'2026-10-17',weight:1,reason:'Seven dates verified'};
 await assert.rejects(db.query("select public.freddo_membership($1,'admit',$2)",[owner,JSON.stringify(args)]),/ADMISSION_NOT_READY/);
 for(let day=10;day<=16;day++)await observe(db,sources[2],`2026-10-${day}T08:00:00Z`);
 const admitted=(await db.query("select public.freddo_membership($1,'admit',$2) r",[owner,JSON.stringify(args)])).rows[0].r;
 assert.equal(admitted.decision_actor,owner);assert.equal(admitted.weight,1);
 assert.equal((await db.query("select public.freddo_membership($1,'admit',$2) r",[owner,JSON.stringify(args)])).rows[0].r.id,admitted.id);
});

test('loyalty-only checks do not erase public carry; other collection scopes cannot enter implicitly',async()=>{
 await observe(db,sources[0],'2026-10-16T08:04:00Z',{normal:null,loyalty:10});
 let result=await calculate('2026-10-16');assert.equal((await inputs(result.id))[0].selected_price_pence,36);
 const other=(await db.query("insert into freddo_private.retailer_sources(retailer_id,product_id,product_url,retailer_product_key,scope,expected_pack_count,expected_weight_g) values($1,$2,$3,'other','different-postcode',1,18) returning *",[sources[0].retailer_id,sources[0].product_id,sources[0].product_url])).rows[0];
 await observe(db,other,'2026-10-16T08:05:00Z',{normal:99});
 result=await calculate('2026-10-16');assert.equal((await inputs(result.id))[0].selected_price_pence,36);
});
