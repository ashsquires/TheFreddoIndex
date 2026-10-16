import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const migrations=['20261016084401_add_freddo_probe.sql','20261016145103_daily_collection.sql','20261016145527_ingestion_transactions.sql','20261016150607_production_authorization.sql','20261016151752_monitoring_and_review.sql','20261016152831_retention_and_backups.sql','20261016153527_daily_index.sql'];
export async function database(){
 const db=new PGlite();
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create schema storage;create table storage.objects(bucket_id text,name text,created_at timestamptz,metadata jsonb);');
 for(const file of migrations)await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
 return db;
}
export async function observe(db,source,time,{normal=40,offer=null,loyalty=null,expiry=null,expiryText=null,weight=18,decision='accepted',availability='available'}={}){
 const run=crypto.randomUUID(),attempt=crypto.randomUUID(),id=crypto.randomUUID();
 await db.query("insert into freddo_private.collection_runs(id,principal_id,idempotency_key,scheduled_for,trigger,collector_version,policy_version_id) select $1,$2,$3,$4,'manual','fixture',id from freddo_private.policy_versions where version=1",[run,crypto.randomUUID(),run,time]);
 await db.query('insert into freddo_private.collection_run_sources values($1,$2,true)',[run,source.id]);
 await db.query("insert into freddo_private.collection_attempts(id,run_id,source_id,attempt_number,started_at,finished_at,outcome,final_url,availability,availability_observed_at) values($1,$2,$3,1,$4,$4,'price_observed',$5,$6,$4)",[attempt,run,source.id,time,source.product_url,availability]);
 await db.query("insert into freddo_private.price_observations(id,attempt_id,observed_at,product_title,source_url,pack_count,weight_g,currency,normal_price_pence,public_offer_price_pence,loyalty_price_pence,offer_expires_at,offer_expiry_text,price_evidence_text,availability) values($1,$2,$3,'Cadbury Freddo',$4,1,$5,'GBP',$6,$7,$8,$9,$10,'fixture',$11)",[id,attempt,time,source.product_url,weight,normal,offer,loyalty,expiry,expiryText,availability]);
 await db.query("insert into freddo_private.observation_reviews(observation_id,sequence_number,decision,reason_codes,actor,policy_version_id) select $1,1,$2,'{}','test',id from freddo_private.policy_versions where version=1",[id,decision]);
 return {id,attempt,run};
}
