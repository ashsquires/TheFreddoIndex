import {createRuntime} from '../_shared/runtime.ts';
import {authorizedJob} from '../_shared/job-auth.js';
const {rpc}=createRuntime();
Deno.serve(async request=>{
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(!await authorizedJob(request,Deno.env.get('FREDDO_BACKUP_KEY')))return json({error:'FORBIDDEN'},403);
 if(Deno.env.get('FREDDO_BACKUP_ENABLED')!=='true')return json({error:'DISABLED'},503);
 try{
  const body=await request.text();if(body.length>2048)return json({error:'SIZE_LIMIT'},400);
  const args=JSON.parse(body);
  if(args.action==='export'&&Object.keys(args).length===1){
   const job=await rpc('freddo_job_state',{p_job:'backup',p_id:null,p_state:null,p_details:{}});
   const data=await rpc('freddo_logical_export',{});const text=JSON.stringify({job_id:job,...data});
   if(new TextEncoder().encode(text).length>32*1024*1024)throw Error('SIZE_LIMIT');
   return new Response(text,{headers:{'content-type':'application/json','cache-control':'no-store'}});
  }
  if(args.action==='ack'&&Object.keys(args).every(k=>['action','job_id','artifact_id','sha256'].includes(k))&&/^[0-9a-f-]{36}$/.test(args.job_id)&&/^[0-9]+$/.test(args.artifact_id)&&/^[0-9a-f]{64}$/.test(args.sha256)){
   await rpc('freddo_job_state',{p_job:'backup',p_id:args.job_id,p_state:'complete',p_details:{artifact_id:args.artifact_id,sha256:args.sha256,destination:'github-actions',image_bytes_backed_up:false}});return json({confirmed:true});
  }
  return json({error:'VALIDATION_FAILED'},400);
 }catch{return json({error:'BACKUP_FAILED'},503);}
});
