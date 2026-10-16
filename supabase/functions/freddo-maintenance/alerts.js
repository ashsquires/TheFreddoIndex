export async function deliverAlerts({db,apiKey,fetch:send=globalThis.fetch}){
 if(!apiKey)throw new Error('EMAIL_SENDER_NOT_CONFIGURED');
 const events=await db.claim(10),outcomes=[];
 for(const event of events){
  let providerId=null;
  try{
   const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`freddo-alert-${event.id}`},body:JSON.stringify({from:'Freddo alerts <alert@thefreddoindex.com>',to:['thefreddoindex@gmail.com'],subject:`Freddo Index: ${event.kind==='recovery'?'recovered':'action needed'}`,text:`${event.summary}\n\nEvent: ${event.id}\nReview: https://thefreddoindex.com/monitor.html\n\nThis is an automated operational alert. A provider acceptance receipt does not by itself confirm inbox delivery.`}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('EMAIL_PROVIDER_UNAVAILABLE');
   const body=await response.json();
   if(typeof body.id!=='string'||!body.id)throw new Error('EMAIL_PROVIDER_UNAVAILABLE');
   providerId=body.id;
  }catch{
   await db.ack(event.id,event.lease_id,null,'EMAIL_PROVIDER_UNAVAILABLE');
   outcomes.push({event_id:event.id,state:'retry_pending'});continue;
  }
  // If this write fails, leave the lease intact. Retry uses the same provider key.
  await db.ack(event.id,event.lease_id,providerId,null);
  outcomes.push({event_id:event.id,state:'accepted',provider_id:providerId});
 }
 return outcomes;
}
