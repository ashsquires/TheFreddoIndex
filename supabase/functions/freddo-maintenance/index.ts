import {createRuntime} from '../_shared/runtime.ts';
import {authorizedJob} from '../_shared/job-auth.js';
import {runMaintenance} from './runner.js';
import {cleanupEvidence} from './cleanup.js';
import {deliverAlerts} from './alerts.js';
const {admin,rpc}=createRuntime();
Deno.serve(async request=>{
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(!await authorizedJob(request,Deno.env.get('FREDDO_MAINTENANCE_KEY')))return json({error:'FORBIDDEN'},403);
 if(Deno.env.get('FREDDO_MAINTENANCE_ENABLED')!=='true')return json({error:'DISABLED'},503);
 let job=null;
 try{
  job=await rpc('freddo_job_state',{p_job:'maintenance',p_id:null,p_state:null,p_details:{}});
  const result=await runMaintenance({
   health:(date:string)=>rpc('freddo_health_snapshot',{p_date:date}),
   calculate:(date:string)=>rpc('freddo_calculate_index',{p_date:date,p_reason:'Scheduled check; accepted inputs or membership changed'}),
   indexEnabled:Deno.env.get('FREDDO_INDEX_ENABLED')==='true',
   cleanup:()=>cleanupEvidence({db:{plan:()=>rpc('freddo_plan_cleanup',{}),ack:(bucket:string,path:string,lease:string,error:string|null)=>rpc('freddo_ack_cleanup',{p_bucket:bucket,p_path:path,p_lease:lease,p_error:error})},storage:{async remove(bucket:string,path:string){const {error}=await admin.storage.from(bucket).remove([path]);if(error)throw Error('STORAGE_DELETE_FAILED');}}}),
   operations:()=>rpc('freddo_operations_health',{}),
   reconcile:(date:string,conditions:unknown)=>rpc('freddo_reconcile_alerts',{p_date:date,p_conditions:conditions}),
   reportFailure:(date:string,condition:unknown)=>rpc('freddo_report_failure',{p_date:date,p_condition:condition}),
   deliver:()=>deliverAlerts({db:{claim:(limit:number)=>rpc('freddo_claim_alerts',{p_limit:limit}),ack:(event:string,lease:string,provider:string|null,error:string|null)=>rpc('freddo_ack_alert',{p_event:event,p_lease:lease,p_provider:provider,p_error:error})},apiKey:Deno.env.get('FREDDO_ALERT_RESEND_KEY')}),
  });
  await rpc('freddo_job_state',{p_job:'maintenance',p_id:job,p_state:result.state,p_details:result.details});return json({job_id:job,...result},result.state==='complete'?200:503);
 }catch{
  if(job)try{await rpc('freddo_job_state',{p_job:'maintenance',p_id:job,p_state:'failed',p_details:{error:'MAINTENANCE_FAILED'}});}catch{/* Next successful watchdog observes an unfinished job. */}
  return json({error:'MAINTENANCE_FAILED',job_id:job},503);
 }
});
