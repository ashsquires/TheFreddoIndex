export function evaluateHealth(snapshot,now=new Date().toISOString()){
 const conditions=[];
 const add=(category,sourceId,summary)=>conditions.push({category,source_id:sourceId??null,summary});
 if(Date.parse(now)<Date.parse(snapshot.deadline))return conditions;
 if(!snapshot.run)add('missing_run',null,'The scheduled daily collection did not start.');
 else{
  if(snapshot.run.status!=='complete')add('partial_run',null,'The scheduled collection did not finish accounting for all retailers.');
  for(const source of snapshot.sources){
   const latest=snapshot.attempts.filter(a=>a.source_id===source.id).sort((a,b)=>b.attempt_number-a.attempt_number)[0];
   if(!latest){add('missing_source',source.id,'A required retailer has no recorded visit.');continue;}
   if(latest.outcome!=='price_observed')add('collection_failure',source.id,`Retailer visit failed: ${latest.outcome}.`);
   if(!snapshot.evidence.some(e=>e.attempt_id===latest.id&&e.state==='stored'))add('missing_evidence',source.id,'The latest retailer visit has no stored screenshot.');
   if(snapshot.reviews.some(r=>r.attempt_id===latest.id&&['pending','quarantined'].includes(r.decision)))add('review_required',source.id,'A price or product change needs your review.');
  }
 }
 for(const source of snapshot.sources){
  const stock=stockStatus((snapshot.stock_history??[]).filter(a=>a.source_id===source.id),snapshot.policy?.out_of_stock_flag_days??14);
  if(stock.flagged)add('stock_review',source.id,'The retailer has reached the stock-review threshold. Check observed days and gaps before changing membership.');
 }
 const active=snapshot.grants.filter(g=>g.enabled&&Date.parse(g.expires_at)>Date.parse(now));
 if(!active.length)add('collector_access',null,'The collector has no active production grant. Reconnect it.');
 else if(active.every(g=>Date.parse(g.expires_at)-Date.parse(now)<=48*3600000))add('collector_access_expiring',null,'Collector access expires within 48 hours.');
 return conditions;
}

export const ukDate=instant=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));
export function stockStatus(attempts,thresholdDays=14){
 const known=attempts.filter(a=>a.availability_observed_at&&a.availability!=='unknown').sort((a,b)=>Date.parse(a.availability_observed_at)-Date.parse(b.availability_observed_at));
 const available=known.findLastIndex(a=>a.availability==='available');
 const stock=known.slice(available+1);
 if(!stock.length)return {flagged:false,span_days:0,observed_days:0,gap_days:0,last_observed_at:known.at(-1)?.availability_observed_at??null};
 const days=new Set(stock.map(a=>ukDate(a.availability_observed_at)));
 const span=Math.round((Date.parse(ukDate(stock.at(-1).availability_observed_at))-Date.parse(ukDate(stock[0].availability_observed_at)))/86400000)+1;
 return {flagged:span>=thresholdDays,span_days:span,observed_days:days.size,gap_days:span-days.size,last_observed_at:stock.at(-1).availability_observed_at};
}
