export const PROJECT_URL='https://ectikpmaidqobqfsqife.supabase.co';
export const RESOURCE=`${PROJECT_URL}/functions/v1/freddo-ingest`;
const text=(maxLength,minLength=0)=>({type:'string',maxLength,minLength});
const number=(minimum,maximum,integer=true)=>({type:integer?'integer':'number',minimum,maximum});
const choice=(...values)=>({type:'string',enum:values});
const nullable=schema=>({...schema,type:[schema.type,'null']});
const object=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
const uuid={type:'string',pattern:'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'};
const instant={type:'string',format:'date-time',pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?Z$'};
const sha={type:'string',pattern:'^[0-9a-f]{64}$'};
const url={...text(2048,1),format:'uri'};
const price=nullable(number(1,100000));
const observation=object({observed_at:instant,product_title:text(500,1),source_url:url,pack_count:number(1,1000),weight_g:number(0.001,10000,false),currency:choice('GBP'),normal_price_pence:price,public_offer_price_pence:price,loyalty_price_pence:price,offer_conditions:nullable(text(2000)),offer_expires_at:nullable(instant),offer_expiry_text:nullable(text(2000)),loyalty_offer_conditions:nullable(text(2000)),loyalty_offer_expires_at:nullable(instant),loyalty_offer_expiry_text:nullable(text(2000)),price_evidence_text:text(8000,1)},['observed_at','product_title','source_url','pack_count','weight_g','currency','price_evidence_text']);
const common={contract_version:{type:'integer',enum:[1]}};
const mutation={...common,request_key:{type:'string',pattern:'^[A-Za-z0-9_-]{1,80}$'}};
const schemas={
 start_run_v1:object({...mutation,trigger:choice('scheduled','manual','synthetic'),scheduled_for:instant,collector_version:text(100,1),chatgpt_run_url:url},['contract_version','request_key','trigger','scheduled_for','collector_version']),
 record_attempt_v1:object({...mutation,run_id:uuid,source_id:uuid,attempt_number:number(1,2),started_at:instant,finished_at:instant,outcome:choice('price_observed','no_price','blocked','login_required','wrong_product','timeout','error'),availability:choice('available','out_of_stock','unknown'),availability_observed_at:nullable(instant),final_url:url,evidence_excerpt:text(8000),http_status:nullable(number(100,599)),error_code:nullable(text(100)),error_message:nullable(text(2000)),observation},['contract_version','request_key','run_id','source_id','attempt_number','started_at','finished_at','outcome','availability','availability_observed_at','final_url','evidence_excerpt']),
 reserve_evidence_v1:object({...mutation,run_id:uuid,attempt_id:uuid,evidence_id:uuid,observation_id:nullable(uuid),purpose:choice('observation','diagnostic'),captured_at:nullable(instant),mime_type:nullable(choice('image/png','image/jpeg','image/webp')),byte_size:nullable(number(1,5242880)),sha256:nullable(sha),failure_code:nullable(choice('capture_failed','upload_failed'))},['contract_version','request_key','run_id','attempt_id','evidence_id','purpose']),
 put_evidence_chunk_v1:object({...mutation,reservation_id:uuid,chunk_index:number(0,106),base64:text(65536,4),chunk_sha256:sha},['contract_version','request_key','reservation_id','chunk_index','base64','chunk_sha256']),
 finalise_evidence_v1:object({...mutation,reservation_id:uuid,total_chunks:number(1,107),total_bytes:number(1,5242880),sha256:sha},['contract_version','request_key','reservation_id','total_chunks','total_bytes','sha256']),
 finish_run_v1:object({...mutation,run_id:uuid},['contract_version','request_key','run_id']),
 get_run_v1:object({...common,run_id:uuid,scheduled_for:instant},['contract_version']),
};
export const toolDefinitions=Object.entries(schemas).map(([name,inputSchema])=>({name,description:{start_run_v1:'Start or recover a collection with the server-approved sources.',record_attempt_v1:'Save an actual retailer visit and reserve its screenshot. Failures never create a fresh price.',reserve_evidence_v1:'Bind real screenshot metadata or record capture/upload failure.',put_evidence_chunk_v1:'Upload one authenticated screenshot chunk, at most 49152 decoded bytes.',finalise_evidence_v1:'Verify and store the complete private screenshot.',finish_run_v1:'Finish accounting for all sources and read back saved records.',get_run_v1:'Read your saved run, observations and evidence receipts.'}[name],inputSchema,annotations:{readOnlyHint:name==='get_run_v1',destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:['email']}]}));
export function fail(code,message=code){throw Object.assign(new Error(message),{code});}
function check(schema,value){
 const types=Array.isArray(schema.type)?schema.type:[schema.type];
 if(value===null){if(types.includes('null'))return;fail('VALIDATION_FAILED');}
 const type=types[0];
 if(type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('VALIDATION_FAILED');
  if(schema.required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)))fail('VALIDATION_FAILED');
  for(const [k,v] of Object.entries(value))check(schema.properties[k],v);
 }else if(type==='string'){
  if(typeof value!=='string'||value.length<(schema.minLength??0)||value.length>(schema.maxLength??Infinity)||schema.pattern&&!new RegExp(schema.pattern).test(value))fail('VALIDATION_FAILED');
  if(schema.format==='date-time'){
   const date=new Date(value);
   if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,19)!==value.slice(0,19))fail('VALIDATION_FAILED');
  }
  if(schema.format==='uri'){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)fail('VALIDATION_FAILED');}catch{fail('VALIDATION_FAILED');}}
 }else if(typeof value!=='number'||!Number.isFinite(value)||(type==='integer'&&!Number.isInteger(value))||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity))fail('VALIDATION_FAILED');
 if(schema.enum&&!schema.enum.includes(value))fail('VALIDATION_FAILED');
}
export function validateArguments(name,args){
 if(!Object.hasOwn(schemas,name))fail('VALIDATION_FAILED');
 check(schemas[name],args);
 if(name==='get_run_v1'&&(!!args.run_id===!!args.scheduled_for))fail('VALIDATION_FAILED');
 if(name==='record_attempt_v1'){
  if((args.outcome==='price_observed')!==!!args.observation)fail('VALIDATION_FAILED');
  if(args.observation&&!['normal_price_pence','public_offer_price_pence','loyalty_price_pence'].some(k=>args.observation[k]!=null))fail('VALIDATION_FAILED');
 }
 return args;
}
