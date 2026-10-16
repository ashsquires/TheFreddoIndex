import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImage, sha256 } from '../supabase/functions/freddo-ingest/evidence.js';
import { screenshotPng as png } from './fixtures/screenshot.js';
test('uploaded bytes must decode as the claimed image format, not just carry its filename',async()=>{
 assert.equal(validateImage(png,'image/png').width,1);
 assert.throws(()=>validateImage(new TextEncoder().encode('<html>blocked</html>'),'image/png'),/MIME_MISMATCH/);
 assert.throws(()=>validateImage(png,'image/jpeg'),/MIME_MISMATCH/);
});

test('chunk retry preserves bytes; finalisation requires complete verified storage read-back',async()=>{
 const {createEvidenceTransfer}=await import('../supabase/functions/freddo-ingest/evidence.js');
 const id=crypto.randomUUID(),files=new Map();
 const record={id,reservation_id:id,state:'uploading',object_path:`observation/${id}`,mime_type:'image/png',byte_size:png.length,sha256:await sha256(png),chunks:[]};
 const receipts=new Map();
 const db={lookup:async(_who,tool,args)=>receipts.get(tool+args.request_key),evidence:async()=>structuredClone(record),mutate:async(_who,_tool,args)=>{
  if(args.operation==='chunk'&&!record.chunks.some(c=>c.chunk_index===args.chunk_index))record.chunks.push({chunk_index:args.chunk_index,byte_size:args.byte_size,sha256:args.chunk_sha256,object_path:`staging/${id}/${args.chunk_index}`});
  if(args.operation==='stored'&&_tool==='commit_final')record.state='stored';
  const result={data:structuredClone(record)};
  if(_tool.startsWith('commit_'))receipts.set(_tool+args.request_key,result);
  return result;
 }};
 const storage={create:async(path,bytes)=>{if(!files.has(path))files.set(path,bytes);},read:async path=>files.get(path)??null};
 const transfer=createEvidenceTransfer({db,storage});
 const whole={contract_version:1,request_key:'finish',reservation_id:id,total_chunks:1,total_bytes:png.length,sha256:record.sha256};
 await assert.rejects(transfer('owner','finalise_evidence_v1',whole),/UPLOAD_INCOMPLETE/);
 const chunk={contract_version:1,request_key:'chunk',reservation_id:id,chunk_index:0,base64:Buffer.from(png).toString('base64'),chunk_sha256:record.sha256};
 await transfer('owner','put_evidence_chunk_v1',chunk);
 await transfer('owner','put_evidence_chunk_v1',chunk);
 assert.equal(record.chunks.length,1);
 assert.equal((await transfer('owner','finalise_evidence_v1',whole)).data.state,'stored');
 assert.deepEqual(files.get(record.object_path),png);
 files.delete(`staging/${id}/0`);
 assert.equal((await transfer('owner','finalise_evidence_v1',whole)).data.state,'stored');
 await assert.rejects(transfer('owner','put_evidence_chunk_v1',{...chunk,chunk_sha256:'0'.repeat(64)}),/HASH_MISMATCH/);
});
