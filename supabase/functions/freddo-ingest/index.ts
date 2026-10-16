import { createRuntime } from '../_shared/runtime.ts';
import { fail } from './contract.js';
import { createReceiver } from './handler.js';
import { createAuthenticator } from './auth.js';
import { createEvidenceTransfer } from './evidence.js';
const {admin,rpc,verify}=createRuntime();
const db={
 lookup:(principal:string,tool:string,args:Record<string,unknown>)=>rpc('freddo_lookup_receipt',{p_principal:principal,p_tool:tool,p_args:args}),
 mutate:(principal:string,tool:string,args:Record<string,unknown>)=>rpc('freddo_ingest',{p_principal:principal,p_tool:tool,p_args:args}),
 evidence:(principal:string,id:string)=>rpc('freddo_upload_access',{p_principal:principal,p_evidence:id}),
};
const authenticate=createAuthenticator({
 verify,
 authorize:({userId,clientId,sessionId}:{userId:string;clientId:string;sessionId:string})=>rpc('freddo_production_roles',{p_user:userId,p_client:clientId,p_session:sessionId}),
});
const storage={
 async create(path:string,bytes:Uint8Array,mime:string){
  const bucket=admin.storage.from(path.startsWith('staging/')?'freddo-evidence-staging':'freddo-evidence');
  const {error}=await bucket.upload(path,bytes,{contentType:mime,upsert:false});
  if(error&&!['400','409'].includes(String(error.statusCode)))fail('DEPENDENCY_UNAVAILABLE');
 },
 async read(path:string){
  const bucket=admin.storage.from(path.startsWith('staging/')?'freddo-evidence-staging':'freddo-evidence');
  const {data,error}=await bucket.download(path);
  if(error){if(['404'].includes(String(error.statusCode)))return null;fail('DEPENDENCY_UNAVAILABLE');}
  return new Uint8Array(await data!.arrayBuffer());
 },
};
const transfer=createEvidenceTransfer({db,storage});
Deno.serve(createReceiver({authenticate,async execute(identity:{userId:string},name:string,args:Record<string,unknown>){
 if(name==='get_run_v1')return {contract_version:1,request_id:crypto.randomUUID(),received_at:new Date().toISOString(),replayed:false,data:await rpc('freddo_get_run',{p_principal:identity.userId,p_run:args.run_id??null,p_slot:args.scheduled_for??null})};
 if(name==='put_evidence_chunk_v1'||name==='finalise_evidence_v1')return transfer(identity.userId,name,args);
 return db.mutate(identity.userId,name,args);
}}));
