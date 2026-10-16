// Takes an already-provisioned ISOLATED database adapter. Never points to production.
const order=['retailers','products','retailer_sources','policy_versions','collection_runs','collection_run_sources','collection_attempts','price_observations','observation_reviews','screenshot_evidence','alert_incidents','alert_events','index_memberships','index_daily_values','index_inputs'];
export async function restoreBackup(db,backup,{isolated=false}={}){
 if(!isolated||backup.format_version!==1||backup.project_ref!=='ectikpmaidqobqfsqife')throw Error('An isolated database and supported backup are required');
 const tables=Object.keys(backup.tables);if(tables.some(t=>!order.includes(t))||order.slice(0,12).some(t=>!tables.includes(t)))throw Error('Unexpected backup tables');
 await db.transaction(async tx=>{
  await tx.exec(`truncate ${order.map(t=>`freddo_private.${t}`).join(',')} cascade`);
  for(const table of order){
   let rows=[...(backup.tables[table]??[])];
   if(table==='price_observations')rows.sort((a,b)=>a.revision_number-b.revision_number);
   if(table==='observation_reviews')rows.sort((a,b)=>a.sequence_number-b.sequence_number);
   if(table==='index_daily_values')rows.sort((a,b)=>a.revision_number-b.revision_number);
   const columns=(await tx.query("select column_name from information_schema.columns where table_schema='freddo_private' and table_name=$1 and is_generated='NEVER'",[table])).rows.map(c=>c.column_name);
   for(const row of rows){
    const keys=columns.filter(k=>Object.hasOwn(row,k));
    const types=(await tx.query("select column_name,data_type from information_schema.columns where table_schema='freddo_private' and table_name=$1",[table])).rows;
    const values=keys.map(k=>types.find(t=>t.column_name===k)?.data_type==='jsonb'?JSON.stringify(row[k]):row[k]);
    await tx.query(`insert into freddo_private.${table}(${keys.map(k=>`"${k}"`).join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,values);
   }
  }
 });
 return {counts:Object.fromEntries(order.map(t=>[t,(backup.tables[t]??[]).length])),newest_observation:backup.tables.price_observations.map(o=>o.observed_at).sort().at(-1)??null,image_bytes_restored:false};
}
