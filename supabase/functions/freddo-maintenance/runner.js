import {evaluateHealth,ukDate} from '../freddo-ingest/monitoring.js';
import {operationsConditions} from './cleanup.js';
// Each subsystem can fail without preventing the remaining monitoring work.
export async function runMaintenance({health,calculate,cleanup,operations,reconcile,reportFailure,deliver,indexEnabled,now=new Date().toISOString()}){
 const date=ukDate(now),failures=[],add=(category,summary)=>failures.push({category,source_id:null,summary});
 let snapshot=null,index=null,cleaned=[],operational=null;
 try{snapshot=await health(date);}catch{add('monitoring_failure','The collection health check failed. Collection state is unknown.');}
 if(snapshot&&Date.parse(now)>=Date.parse(snapshot.deadline)&&indexEnabled){
  try{index=await calculate(date);}catch{add('index_failure','The daily index calculation failed. Previous revisions are preserved.');}
 }
 try{cleaned=await cleanup();}catch{add('cleanup_failure','Screenshot cleanup could not complete and will retry.');}
 try{operational=await operations();}catch{add('operations_failure','Backup and storage health could not be checked.');}
 try{
  if(snapshot&&operational&&Date.parse(now)>=Date.parse(snapshot.deadline))await reconcile(date,[...evaluateHealth(snapshot,now),...operationsConditions(operational,now),...failures,...(index?.status==='paused'?[{category:'index_paused',source_id:null,summary:'The daily index is paused because expected inputs are unavailable or no retailers are admitted.'}]:[])]);
  else for(const failure of failures)await reportFailure(date,failure);
 }catch{add('monitoring_failure','The alert queue could not be updated.');}
 let delivered=[];try{delivered=await deliver();}catch{add('email_failure','The email sender could not complete delivery.');}
 return {state:failures.length?'failed':'complete',details:{failures:failures.map(f=>f.category),cleanup_count:cleaned.length,cleanup_failed:cleaned.filter(c=>!c.deleted).length,alert_count:delivered.length,index_id:index?.id??null}};
}
