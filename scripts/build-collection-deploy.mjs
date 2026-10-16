import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const collectionMigrations=['20261016145103_daily_collection.sql','20261016145527_ingestion_transactions.sql','20261016150607_production_authorization.sql','20261016151752_monitoring_and_review.sql','20261016152822_restrict_default_rls_helper.sql','20261016152831_retention_and_backups.sql','20261016153527_daily_index.sql'];
export async function buildDeployment(files=collectionMigrations){
 let sql=`-- Target: personal Freddo project ectikpmaidqobqfsqife ONLY. Verify dashboard identity before Run.\nbegin;\nselect pg_advisory_xact_lock(683204156);\ncreate schema if not exists freddo_private;\nrevoke all on schema freddo_private from public,anon,authenticated;\ncreate table if not exists freddo_private.deployment_versions(version text primary key,sha256 text not null,applied_at timestamptz not null default now());\nalter table freddo_private.deployment_versions enable row level security;\nrevoke all on freddo_private.deployment_versions from public,anon,authenticated;\n`;
 for(const file of files){
  if(!collectionMigrations.includes(file))throw new Error('Unapproved migration');
  const source=await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
  const hash=createHash('sha256').update(source).digest('hex');
  const version=file.split('_')[0];
  if(source.includes('$migration$')||source.includes('$deployment$'))throw new Error('SQL delimiter collision');
  sql+=`do $deployment$ begin\nif exists(select 1 from freddo_private.deployment_versions where version='${version}' and sha256<>'${hash}') then raise exception 'Previously applied migration differs: ${version}';\nelsif not exists(select 1 from freddo_private.deployment_versions where version='${version}') then\nexecute $migration$${source}$migration$;\ninsert into freddo_private.deployment_versions(version,sha256) values('${version}','${hash}');\nend if; end $deployment$;\n`;
 }
 return sql+`commit;\nselect version,sha256,applied_at from freddo_private.deployment_versions order by version;\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(await buildDeployment(process.argv.includes('--schema-only')?[collectionMigrations[0]]:collectionMigrations));
