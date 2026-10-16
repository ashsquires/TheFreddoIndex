import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {encryptBackup,decryptBackup} from '../scripts/backup-crypto.mjs';
import {restoreBackup} from '../scripts/restore-backup.mjs';
import {database,observe} from './helpers/collection-db.js';
test('encrypted logical export restores facts, reviews and image manifest into an isolated PostgreSQL engine',async()=>{
 const source=await database(),target=await database();
 try{
  const retailer=(await source.query('select * from freddo_private.retailer_sources limit 1')).rows[0];
  const observation=await observe(source,retailer,'2026-10-16T08:00:00Z',{normal:34,offer:32});
  await source.query("insert into freddo_private.screenshot_evidence(attempt_id,observation_id,purpose,state,failure_code) values($1,$2,'observation','failed','capture_failed')",[observation.attempt,observation.id]);
  const backup=(await source.query('select public.freddo_logical_export() b')).rows[0].b;
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});const bytes=encryptBackup(backup,publicKey);
  assert.ok(!bytes.toString().includes(observation.id));const recovered=decryptBackup(bytes,privateKey);assert.deepEqual(recovered,backup);
  const corrupt=JSON.parse(bytes);corrupt.data=Buffer.from('tampered').toString('base64');assert.throws(()=>decryptBackup(Buffer.from(JSON.stringify(corrupt)),privateKey));
  await assert.rejects(restoreBackup(target,recovered),/isolated/);
  const start=performance.now();const report=await restoreBackup(target,recovered,{isolated:true});
  const restored=(await target.query('select public.freddo_logical_export() b')).rows[0].b;
  for(const table of Object.keys(backup.tables))assert.deepEqual(restored.tables[table].sort((a,b)=>String(a.id).localeCompare(String(b.id))),backup.tables[table].sort((a,b)=>String(a.id).localeCompare(String(b.id))));
  assert.deepEqual(restored.evidence_manifest,backup.evidence_manifest);assert.equal(report.counts.price_observations,1);
  console.log(JSON.stringify({isolated_restore_ms:Math.round(performance.now()-start),newest_observation:report.newest_observation,encrypted_bytes:bytes.length,image_bytes_restored:false}));
 }finally{await source.close();await target.close();}
});
