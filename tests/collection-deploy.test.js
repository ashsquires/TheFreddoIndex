import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildDeployment,collectionMigrations } from '../scripts/build-collection-deploy.mjs';
test('dashboard deployment replay preserves the schema and seeds without duplicate rows',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;');
  const sql=await buildDeployment([collectionMigrations[0]]);
  await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query('select count(*)::int n from freddo_private.retailer_sources')).rows[0].n,3);
  assert.equal((await db.query('select count(*)::int n from freddo_private.deployment_versions')).rows[0].n,1);
 }finally{await db.close();}
});

test('the complete deployment can be replayed atomically',async()=>{
 const {readFile}=await import('node:fs/promises');const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create schema storage;create table storage.objects(bucket_id text,name text,created_at timestamptz,metadata jsonb);');
  await db.exec(await readFile(new URL('../supabase/migrations/20261016084401_add_freddo_probe.sql',import.meta.url),'utf8'));
  const sql=await buildDeployment();await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query('select count(*)::int n from freddo_private.deployment_versions')).rows[0].n,collectionMigrations.length);
 }finally{await db.close();}
});
