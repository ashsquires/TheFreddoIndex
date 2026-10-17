import {retailerObservations} from './monitor-model.js';
import { createClient } from '@supabase/supabase-js';
const project='https://ectikpmaidqobqfsqife.supabase.co';
const client=createClient(project,'sb_publishable_JlpWqctX_NXzcN9twF7F7w_19Mw0kWD',{auth:{flowType:'pkce',storage:sessionStorage,storageKey:'freddo-operator'}});
const $=id=>document.getElementById(id),status=$('status');
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const date=value=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Europe/London'}):'Unknown';
const money=value=>value===null||value===undefined?'Not observed':`${value}p`;
async function request(action,args={}){
 const {data:{session}}=await client.auth.getSession();
 if(!session)throw new Error('Sign in to continue.');
 const response=await fetch(`${project}/functions/v1/freddo-ops`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,args})});
 const result=await response.json();
 if(!response.ok){const code=result.error?.code??result.error;throw new Error(code==='CONFLICT'?'This record changed since you opened it. Refresh and review again.':code==='FORBIDDEN'?'Your account does not have active operator access.':`Request failed (${code??response.status}). Your changes are not confirmed.`);}
 return result;
}
function showError(error){status.textContent=error.message||'The request failed. No successful update is confirmed.';}
async function preview(evidence){
 try{const data=await request('evidence',{evidence_id:evidence.id});$('capture-time').textContent=`Captured ${date(data.captured_at)}. This private preview expires in two minutes.`;$('screenshot').src=data.url;$('preview').showModal();setTimeout(()=>{$('screenshot').removeAttribute('src');},data.expires_in*1000);}catch(error){showError(error);}
}
function historyPanel(observation){
 const details=element('details'),content=element('div');details.append(element('summary','View review and correction history'),content);
 let loaded=false;
 details.ontoggle=async()=>{if(!details.open||loaded)return;loaded=true;content.textContent='Loading history…';try{
  const history=await request('history',{observation_id:observation.id});content.replaceChildren();
  for(const revision of history.revisions){
   const entry=element('section');entry.append(element('h4',`Revision ${revision.revision_number}`),element('p',`Observed ${date(revision.observed_at)} · Normal ${money(revision.normal_price_pence)} · Public offer ${money(revision.public_offer_price_pence)} · Loyalty ${money(revision.loyalty_price_pence)} · ${revision.weight_g}g`));
   if(revision.correction_reason)entry.append(element('p',`Correction: ${revision.correction_reason}`));
   entry.append(element('p',revision.price_evidence_text));
   for(const review of revision.reviews)entry.append(element('p',`${date(review.created_at)} — ${review.decision} · ${review.actor} · ${review.note??review.reason_codes.join(', ')}`));
   content.append(entry);
  }
 }catch(error){loaded=false;content.textContent=error.message;}};
 return details;
}
function reviewForm(observation){
 const details=element('details'),summary=element('summary','Review or correct this observation'),form=element('form');details.append(summary,form);
 const choice=element('select');choice.name='decision';for(const [value,text] of [['accepted','Accept'],['rejected','Reject'],['correct','Correct observed details']]){const option=element('option',text);option.value=value;choice.append(option);}
 const actionLabel=element('label','Decision');actionLabel.append(choice);form.append(actionLabel);
 const corrections=element('fieldset');corrections.hidden=true;const inputs={};
 for(const [key,label,type] of [['normal_price_pence','Normal price (pence)','number'],['public_offer_price_pence','Public offer (pence)','number'],['loyalty_price_pence','Loyalty price (pence)','number'],['pack_count','Bars per pack','number'],['weight_g','Weight (grams)','number'],['offer_expires_at','Public offer expiry (ISO timestamp with timezone)','text'],['offer_conditions','Public offer conditions','text'],['offer_expiry_text','Public expiry source text','text'],['loyalty_offer_expires_at','Loyalty expiry (ISO timestamp with timezone)','text'],['loyalty_offer_conditions','Loyalty conditions','text'],['loyalty_offer_expiry_text','Loyalty expiry source text','text'],['price_evidence_text','Price evidence text','text']]){
  const input=element('input');input.type=type;input.value=observation[key]??'';if(type==='number'){input.min='1';input.step=key==='weight_g'?'any':'1';}
  const wrapper=element('label',label);wrapper.append(input);corrections.append(wrapper);inputs[key]=input;
 }
 choice.onchange=()=>{corrections.hidden=choice.value!=='correct';};form.append(corrections);
 const reason=element('textarea');reason.required=true;reason.maxLength=2000;const reasonLabel=element('label','Reason (required)');reasonLabel.append(reason);form.append(reasonLabel);
 const submit=element('button','Save review');submit.type='submit';form.append(submit);
 let pending=null,signature=null;
 form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{
  const action=choice.value==='correct'?'correct':'review';
  const args={observation_id:observation.id,expected_sequence:observation.review.sequence_number,reason:reason.value,...(action==='correct'?{changes:Object.fromEntries(Object.entries(inputs).filter(([key,input])=>input.value!==String(observation[key]??'')).map(([key,input])=>[key,input.value===''?null:input.type==='number'?Number(input.value):input.value]))}:{decision:choice.value})};
  const next=JSON.stringify({action,args});if(next!==signature){pending={action,args:{...args,request_key:crypto.randomUUID()}};signature=next;}
  await request(pending.action,pending.args);pending=null;await load();status.textContent='Review saved with its audit history.';
 }catch(error){showError(error);}finally{submit.disabled=false;}};
 return details;
}
function membershipForm(action,identity){
 const form=element('form'),details=element('details');details.append(element('summary',action==='admit'?'Admit to the index':'End this membership'),form);
 const day=element('input');day.type='date';day.required=true;const dayLabel=element('label','Effective UK date');dayLabel.append(day);form.append(dayLabel);
 const weight=element('input');weight.type='number';weight.min='0.000001';weight.step='any';weight.value='1';if(action==='admit'){const label=element('label','Index weight');label.append(weight);form.append(label);}
 const reason=element('input');reason.required=true;const reasonLabel=element('label','Decision reason');reasonLabel.append(reason);form.append(reasonLabel);
 const button=element('button','Save explicit membership decision');form.append(button);let pending=null,signature=null;
 form.onsubmit=async event=>{event.preventDefault();button.disabled=true;try{const args={...identity,effective_date:day.value,reason:reason.value,...(action==='admit'?{weight:Number(weight.value)}:{})};const next=JSON.stringify(args);if(next!==signature){pending={...args,request_key:crypto.randomUUID()};signature=next;}await request(action,pending);await load();}catch(error){showError(error);}finally{button.disabled=false;}};
 return details;
}
function render(data){
 const latest=data.runs.find(r=>r.trigger==='scheduled');$('run').replaceChildren(element('strong',latest?`${date(latest.scheduled_for)} — ${latest.status}`:'No scheduled collection has been saved yet.'),element('p','Failed visits do not refresh old prices. Screenshots and prices are tracked separately.','muted'));
 $('retailers').replaceChildren();
 for(const retailer of data.retailers){
  const sources=data.sources.filter(s=>s.retailer_id===retailer.id),sourceIds=new Set(sources.map(s=>s.id));
  const {latest:observation,outstanding}=retailerObservations(data.observations,sourceIds);
  const card=element('article',undefined,'card');card.append(element('h3',retailer.name));
  if(observation){
   card.append(element('p',`Normal ${money(observation.normal_price_pence)} · Public offer ${money(observation.public_offer_price_pence)} · Loyalty ${money(observation.loyalty_price_pence)}`,'prices'));
   card.append(element('p',`${observation.weight_g}g · ${observation.pack_count} bar(s) · ${observation.availability.replaceAll('_',' ')}`));
   card.append(element('p',`Observed ${date(observation.observed_at)} · ${(Math.max(0,Date.parse(data.server_now)-Date.parse(observation.observed_at))/3600000).toFixed(1)} hours old`,'muted'));
   card.append(element('p',`Review: ${observation.review?.decision??'pending'}`));
   if(['pending','quarantined'].includes(observation.review?.decision))card.classList.add('warning');
   const evidence=data.evidence.filter(e=>e.attempt_id===observation.attempt_id);
   for(const e of evidence){if(e.state==='stored'){const button=element('button','View screenshot');button.onclick=()=>preview(e);card.append(button);}else card.append(element('p',`Screenshot: ${e.failure_code??e.state}`));}
   if(!evidence.length)card.append(element('p','Screenshot metadata unavailable.'));
   if(observation.review)card.append(reviewForm(observation),historyPanel(observation));
  }else card.append(element('p','No price observation saved yet.'));
  for(const pending of outstanding){
   const queue=element('section',undefined,'warning');queue.append(element('h4',`Outstanding review — ${date(pending.observed_at)}`),element('p',`${money(pending.normal_price_pence)} normal · ${money(pending.public_offer_price_pence)} public offer · ${pending.weight_g}g`),element('p',pending.review.reason_codes?.join(', ')??'Needs review'));
   for(const evidence of data.evidence.filter(e=>e.attempt_id===pending.attempt_id&&e.state==='stored')){const button=element('button','View screenshot');button.onclick=()=>preview(evidence);queue.append(button);}
   queue.append(reviewForm(pending),historyPanel(pending));card.append(queue);
  }
  const attempts=data.attempts.filter(a=>sourceIds.has(a.source_id)).sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at));
  if(attempts[0])card.append(element('small',`Latest visit: ${attempts[0].outcome.replaceAll('_',' ')} · ${date(attempts[0].started_at)}`));
  for(const stock of data.stock.filter(s=>sourceIds.has(s.source_id)&&s.flagged))card.append(element('p',`Stock review: ${stock.span_days}-day span, ${stock.observed_days} observed days and ${stock.gap_days} gaps. Last known ${date(stock.last_observed_at)}.`));
  for(const source of sources.filter(s=>s.collection_enabled&&!s.valid_to))card.append(membershipForm('admit',{source_id:source.id}));
  $('retailers').append(card);
 }
 $('index').replaceChildren();
 for(const membership of data.index.memberships){const row=element('section');row.append(element('p',`${data.retailers.find(r=>r.id===membership.retailer_id)?.name} · weight ${membership.weight} · ${membership.effective_from_date} to ${membership.effective_to_date??'ongoing'}`));if(!membership.effective_to_date)row.append(membershipForm('remove',{membership_id:membership.id}));$('index').append(row);}
 if(!data.index.memberships.length)$('index').append(element('p','No retailers admitted yet. Each needs seven consecutive valid UK dates and an explicit decision.'));
 for(const value of data.index.values.slice(0,10)){const row=element('details');row.append(element('summary',`${value.uk_date} · revision ${value.revision_number} · ${value.status}${value.status==='published'?` · ${Number(value.average_price_pence).toFixed(2)}p average`:''}`));
  for(const input of data.index.inputs.filter(i=>i.daily_value_id===value.id))row.append(element('p',`${data.retailers.find(r=>r.id===input.retailer_id)?.name}: ${input.exclusion_reason??`${input.selected_price_pence}p ${input.selected_price_kind}, ${input.weight_g_used}g`} · weight ${input.weight_used} · observed input ${input.observation_id??'missing'}`));
  const form=element('form'),reason=element('input');reason.required=true;reason.placeholder='Reason for recomputation';reason.setAttribute('aria-label','Reason for recomputation');const button=element('button','Recompute with current accepted evidence');form.append(reason,button);let key=crypto.randomUUID();form.onsubmit=async event=>{event.preventDefault();button.disabled=true;try{await request('recompute',{request_key:key,uk_date:value.uk_date,reason:reason.value});key=crypto.randomUUID();await load();}catch(error){showError(error);}finally{button.disabled=false;}};row.append(form);$('index').append(row);
 }
 $('jobs').replaceChildren(element('p',`Screenshot storage: ${(data.operations.storage_bytes/1048576).toFixed(2)} MiB of ${(data.operations.storage_allowance_bytes/1048576).toFixed(0)} MiB configured allowance.`),element('p',`Last independent backup: ${date(data.operations.last_backup)}. Backups contain data and the screenshot manifest; image bytes are not backed up.`));
 for(const job of data.operations.jobs)$('jobs').append(element('p',`${job.job}: ${job.state} · ${date(job.started_at)}`));
 $('alerts').replaceChildren();
 if(!data.alerts.length)$('alerts').append(element('p','No notification events recorded.'));
 for(const alert of data.alerts){const item=element('p',`${date(alert.created_at)} — ${alert.summary}`);item.append(element('small',`${alert.state}${alert.state==='accepted'?' by email provider (inbox delivery not confirmed)':''} · attempts ${alert.attempts}${alert.last_error?` · ${alert.last_error}`:''}`));$('alerts').append(item);}
}
async function load(){
 status.textContent='Loading private collection records…';
 const {data:{user}}=await client.auth.getUser();
 $('login').hidden=!!user;$('logout').hidden=!user;$('refresh').hidden=!user;$('dashboard').hidden=true;
 if(!user){status.textContent='Sign in with your Freddo operator account.';return;}
 const data=await request('snapshot');render(data);$('dashboard').hidden=false;status.textContent=`Updated ${date(data.server_now)}. Signed in as ${user.email}.`;
}
$('login').onsubmit=async event=>{event.preventDefault();const button=$('login').querySelector('button');button.disabled=true;try{const email=new FormData($('login')).get('email');const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:'https://thefreddoindex.com/monitor.html'}});if(error)throw error;status.textContent='Open the sign-in email in this browser to continue.';}catch(error){showError(error);}finally{button.disabled=false;}};
$('refresh').onclick=()=>load().catch(showError);
$('logout').onclick=async()=>{await client.auth.signOut();location.reload();};
$('close-preview').onclick=()=>{$('preview').close();$('screenshot').removeAttribute('src');};
if(window.top!==window.self){document.body.textContent='Open the private monitor directly.';}else load().catch(showError);
