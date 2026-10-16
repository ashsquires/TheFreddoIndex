import { createRuntime } from '../_shared/runtime.ts';
import { PROJECT_URL, fail } from '../freddo-ingest/contract.js';
import { createOperatorReceiver } from './handler.js';
import { stockStatus } from '../freddo-ingest/monitoring.js';
const {admin,rpc,verify}=createRuntime();
Deno.serve(createOperatorReceiver({
 async authenticate(token:string){
  const c=await verify(token);
  if(!c||c.iss!==`${PROJECT_URL}/auth/v1`||c.aud!=='authenticated'||c.role!=='authenticated'||typeof c.exp!=='number'||c.exp<=Date.now()/1000||typeof c.sub!=='string'||typeof c.session_id!=='string')return null;
  return await rpc('freddo_operator_authorized',{p_user:c.sub,p_session:c.session_id})===true?{userId:c.sub}:null;
 },
 async execute(identity:{userId:string},action:string,args:Record<string,unknown>){
  if(['admit','remove','recompute'].includes(action))return rpc('freddo_membership',{p_user:identity.userId,p_action:action,p_args:args});
  const data=await rpc('freddo_operator',{p_user:identity.userId,p_action:action,p_args:args});
  if(action==='evidence'){
   const {data:link,error}=await admin.storage.from('freddo-evidence').createSignedUrl(data.object_path,120);
   if(error)fail('DEPENDENCY_UNAVAILABLE');
   return {url:link!.signedUrl,expires_in:120,captured_at:data.captured_at,sha256:data.sha256};
  }
  if(action==='snapshot'){data.index=await rpc('freddo_index_report',{});data.operations=await rpc('freddo_operations_health',{});}
  if(action==='snapshot')data.stock=data.sources.map((source:{id:string})=>({source_id:source.id,...stockStatus(data.attempts.filter((a:{source_id:string})=>a.source_id===source.id),data.policy.out_of_stock_flag_days)}));
  return data;
 }
}));
