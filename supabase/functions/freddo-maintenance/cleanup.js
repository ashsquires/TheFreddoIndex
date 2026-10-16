export async function cleanupEvidence({db,storage}){
 const objects=await db.plan(),results=[];
 for(const object of objects){
  let error=null;
  try{await storage.remove(object.bucket,object.path);}catch{error='STORAGE_DELETE_FAILED';}
  // Do not claim deletion succeeded if the Storage API or acknowledgement failed.
  await db.ack(object.bucket,object.path,object.lease_id,error);
  results.push({bucket:object.bucket,path:object.path,deleted:error===null});
 }
 return results;
}
export function operationsConditions(health,now){
 const conditions=[],add=(category,summary)=>conditions.push({category,source_id:null,summary});
 if(health.storage_bytes>=health.storage_allowance_bytes*0.8)add('storage_capacity','Screenshot storage has reached 80% of its configured allowance. Review readable JPEG compression; retention has not been shortened.');
 if(health.cleanup_failures>0)add('cleanup_failure','Screenshot deletion failed and will retry. Check Storage access.');
 if(!health.last_backup||Date.parse(now)-Date.parse(health.last_backup)>36*3600000)add('backup_missing','No successful independent backup has been confirmed in the last 36 hours.');
 for(const job of health.jobs??[])if(job.state==='failed'||(job.state==='running'&&Date.parse(now)-Date.parse(job.started_at)>20*60000))add(`${job.job}_failure`,`${job.job} did not complete successfully. Check the private job log.`);
 return conditions;
}
