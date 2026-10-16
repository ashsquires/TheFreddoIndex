import { fail } from '../freddo-ingest/contract.js';
import { safeError } from '../freddo-ingest/handler.js';
const fields={snapshot:[],admit:['request_key','source_id','effective_date','weight','reason'],remove:['request_key','membership_id','effective_date','reason'],recompute:['request_key','uk_date','reason'],evidence:['evidence_id'],review:['request_key','observation_id','expected_sequence','decision','reason'],correct:['request_key','observation_id','expected_sequence','reason','changes']};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
function validate(message){
 if(!message||Object.keys(message).some(k=>!['action','args'].includes(k))||!Object.hasOwn(fields,message.action))fail('VALIDATION_FAILED');
 const {action,args}=message,keys=fields[action];
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(args,k)))fail('VALIDATION_FAILED');
 if(['admit','remove','recompute'].includes(action)){
  if(typeof args.request_key!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(args.request_key)||typeof args.reason!=='string'||!args.reason.trim()||args.reason.length>2000)fail('VALIDATION_FAILED');
  const day=args.effective_date??args.uk_date;if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)fail('VALIDATION_FAILED');
  if(action==='admit'&&(!uuid(args.source_id)||typeof args.weight!=='number'||!Number.isFinite(args.weight)||args.weight<=0||args.weight>1000000))fail('VALIDATION_FAILED');
  if(action==='remove'&&!uuid(args.membership_id))fail('VALIDATION_FAILED');
 }
 if(action==='evidence'&&!uuid(args.evidence_id))fail('VALIDATION_FAILED');
 if(['review','correct'].includes(action)){
  if(typeof args.request_key!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(args.request_key)||!uuid(args.observation_id)||!Number.isInteger(args.expected_sequence)||args.expected_sequence<1||typeof args.reason!=='string'||!args.reason.trim()||args.reason.length>2000)fail('VALIDATION_FAILED');
  if(action==='review'&&!['accepted','rejected'].includes(args.decision))fail('VALIDATION_FAILED');
  if(action==='correct'){
   const allowed=['normal_price_pence','public_offer_price_pence','loyalty_price_pence','pack_count','weight_g','price_evidence_text','offer_conditions','offer_expires_at','offer_expiry_text','loyalty_offer_conditions','loyalty_offer_expires_at','loyalty_offer_expiry_text'];
   if(!args.changes||typeof args.changes!=='object'||Array.isArray(args.changes)||!Object.keys(args.changes).length||Object.keys(args.changes).some(k=>!allowed.includes(k)))fail('VALIDATION_FAILED');
   for(const [key,value] of Object.entries(args.changes)){
    if(key.endsWith('_expires_at')){if(value!==null&&(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))))fail('VALIDATION_FAILED');}
    else if(key.includes('conditions')||key.endsWith('expiry_text')){if(value!==null&&(typeof value!=='string'||value.length>2000))fail('VALIDATION_FAILED');}
    else if(key==='price_evidence_text'){if(typeof value!=='string'||!value.trim()||value.length>8000)fail('VALIDATION_FAILED');}
    else if(key==='weight_g'){if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>10000)fail('VALIDATION_FAILED');}
    else if(!(key.endsWith('_pence')&&value===null)&&(!Number.isInteger(value)||value<1||value>(key==='pack_count'?1000:100000)))fail('VALIDATION_FAILED');
   }
  }
 }
 return message;
}
export function createOperatorReceiver({authenticate,execute}){
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'content-type':'application/json','cache-control':'no-store',...(origin==='https://thefreddoindex.com'?{'access-control-allow-origin':origin,'vary':'Origin'}:{})};
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&origin!=='https://thefreddoindex.com')return json({error:'FORBIDDEN'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type'}});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  try{
   const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
   const identity=token?await authenticate(token):null;if(!identity)fail('FORBIDDEN');
   if(!request.headers.get('content-type')?.startsWith('application/json'))fail('VALIDATION_FAILED');
   const reader=request.body.getReader(),decoder=new TextDecoder();let size=0,body='';
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000){await reader.cancel();fail('SIZE_LIMIT');}body+=decoder.decode(value,{stream:true});}
   let message;try{message=validate(JSON.parse(body+decoder.decode()));}catch{fail('VALIDATION_FAILED');}
   return json(await execute(identity,message.action,message.args));
  }catch(error){return json(safeError(error,crypto.randomUUID()),error.code==='FORBIDDEN'?403:error.code==='CONFLICT'?409:error.code==='VALIDATION_FAILED'||error.code==='SIZE_LIMIT'?400:503);}
 };
}
