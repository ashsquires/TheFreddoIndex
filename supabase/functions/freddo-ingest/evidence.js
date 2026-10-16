import { PngDecoder, JpegDecoder, WebPDecoder } from 'image-in-browser';
import { fail } from './contract.js';
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
export function validateImage(bytes,mime){
 const signature=Array.from(bytes.slice(0,12));
 const actual=signature.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'image/png':signature[0]===255&&signature[1]===216&&signature[2]===255?'image/jpeg':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'?'image/webp':null;
 if(actual!==mime)fail('MIME_MISMATCH');
 try{
  const decoder=new ({'image/png':PngDecoder,'image/jpeg':JpegDecoder,'image/webp':WebPDecoder}[mime])();
  const info=decoder.startDecode(bytes);
  if(!info||info.width<1||info.height<1||info.width*info.height>12000000||decoder.numFrames!==1)fail('SIZE_LIMIT');
  const image=decoder.decodeFrame(0);
  if(!image)fail('MIME_MISMATCH');
  return {width:image.width,height:image.height};
 }catch(error){if(error.code==='SIZE_LIMIT')throw error;fail('MIME_MISMATCH');}
}

export function createEvidenceTransfer({db,storage}){
 async function putVerified(path,bytes,mime){
  await storage.create(path,bytes,mime);
  const saved=await storage.read(path);
  if(!saved||saved.length!==bytes.length||await sha256(saved)!==await sha256(bytes))fail('CONFLICT');
 }
 return async(principal,tool,args)=>{
  const chunkTool=tool==='put_evidence_chunk_v1';
  let bytes;
  if(chunkTool){
   let decoded;
   try{decoded=atob(args.base64);}catch{fail('VALIDATION_FAILED');}
   if(!decoded.length||decoded.length>49152||btoa(decoded)!==args.base64)fail('SIZE_LIMIT');
   bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
   if(await sha256(bytes)!==args.chunk_sha256)fail('HASH_MISMATCH');
  }
  const commitArgs=chunkTool?{contract_version:1,request_key:args.request_key,operation:'chunk',reservation_id:args.reservation_id,chunk_index:args.chunk_index,chunk_sha256:args.chunk_sha256,byte_size:bytes.length}:{contract_version:1,request_key:args.request_key,operation:'stored',reservation_id:args.reservation_id,total_chunks:args.total_chunks,total_bytes:args.total_bytes,sha256:args.sha256};
  const commitTool=chunkTool?'commit_chunk':'commit_final';
  const previous=await db.lookup(principal,commitTool,commitArgs);
  if(previous)return previous;
  await db.mutate(principal,chunkTool?'prepare_chunk':'prepare_final',commitArgs);
  const evidence=await db.evidence(principal,args.reservation_id);
  if(!['uploading','stored'].includes(evidence.state))fail('CONFLICT');
  if(chunkTool){
   await putVerified(`staging/${evidence.id}/${args.chunk_index}`,bytes,'application/octet-stream');
   return db.mutate(principal,commitTool,commitArgs);
  }
  if(evidence.byte_size!==args.total_bytes||evidence.sha256!==args.sha256)fail('HASH_MISMATCH');
  const chunks=[...evidence.chunks].sort((a,b)=>a.chunk_index-b.chunk_index);
  if(chunks.length!==args.total_chunks||chunks.some((c,i)=>c.chunk_index!==i))fail('UPLOAD_INCOMPLETE');
  bytes=new Uint8Array(args.total_bytes);
  let offset=0;
  for(const chunk of chunks){
   const part=await storage.read(chunk.object_path);
   if(!part||part.length!==chunk.byte_size||await sha256(part)!==chunk.sha256)fail('UPLOAD_INCOMPLETE');
   if(offset+part.length>bytes.length)fail('SIZE_LIMIT');
   bytes.set(part,offset);offset+=part.length;
  }
  if(offset!==bytes.length||await sha256(bytes)!==args.sha256)fail('HASH_MISMATCH');
  validateImage(bytes,evidence.mime_type);
  await db.evidence(principal,args.reservation_id); // Renew the upload lease after assembly, before writing.
  await putVerified(evidence.object_path,bytes,evidence.mime_type);
  return db.mutate(principal,commitTool,commitArgs);
 };
}
