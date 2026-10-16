import { PROJECT_URL, RESOURCE, toolDefinitions, validateArguments, fail } from './contract.js';
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
const codes=new Set(['UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','VALIDATION_FAILED','CONFLICT','RUN_CLOSED','CUTOFF_REACHED','ADMISSION_NOT_READY','RATE_LIMITED','UPLOAD_INCOMPLETE','HASH_MISMATCH','MIME_MISMATCH','SIZE_LIMIT','DEPENDENCY_UNAVAILABLE']);
export function safeError(error,requestId){
 const code=codes.has(error?.code)?error.code:'DEPENDENCY_UNAVAILABLE';
 return {contract_version:1,request_id:requestId,error:{code,message:code,retryable:['RATE_LIMITED','DEPENDENCY_UNAVAILABLE'].includes(code),retry_after_seconds:['RATE_LIMITED','DEPENDENCY_UNAVAILABLE'].includes(code)?2:null}};
}
export function createReceiver({authenticate,execute}){
 return async request=>{
  const requestId=crypto.randomUUID();
  const path=new URL(request.url).pathname.replace(/^\/functions\/v1/,'');
  if(request.method==='GET'&&path==='/freddo-ingest/.well-known/oauth-protected-resource')return json({resource:RESOURCE,authorization_servers:[`${PROJECT_URL}/auth/v1`],scopes_supported:['email'],bearer_methods_supported:['header']});
  if(path!=='/freddo-ingest')return json({error:'Not found'},404);
  if(request.method!=='POST')return json({error:'Method not allowed'},405,{allow:'POST'});
  if(request.headers.has('origin'))return json(safeError({code:'FORBIDDEN'},requestId),403);
  const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  let identity;
  try{identity=token?await authenticate(token):null;}catch(error){return json(safeError(error,requestId),error.code==='FORBIDDEN'?403:503);}
  if(!identity)return json(safeError({code:'UNAUTHENTICATED'},requestId),401,{'WWW-Authenticate':`Bearer resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  let message;
  try{
   const reader=request.body?.getReader();let length=0,body='';const decoder=new TextDecoder();
   if(reader)while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>100000){await reader.cancel();return json(safeError({code:'SIZE_LIMIT'},requestId),413);}body+=decoder.decode(value,{stream:true});}
   message=JSON.parse(body+decoder.decode());
  }catch{return json(safeError({code:'VALIDATION_FAILED'},requestId),400);}
  if(!message||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string')return json(safeError({code:'VALIDATION_FAILED'},requestId),400);
  if(message.method==='notifications/initialized'&&message.id===undefined)return new Response(null,{status:202});
  const result=value=>json({jsonrpc:'2.0',id:message.id??null,result:value});
  if(message.method==='initialize')return result({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'freddo-ingest',version:'1.0.0'}});
  if(message.method==='ping')return result({});
  if(message.method==='tools/list')return result({tools:identity.roles.includes('collector')?toolDefinitions:[]});
  if(message.method==='tools/call'){
   try{
    if(!identity.roles.includes('collector'))fail('FORBIDDEN');
    const name=message.params?.name;
    const args=validateArguments(name,message.params?.arguments);
    const data=await execute(identity,name,args);
    return result({structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]});
   }catch(error){const data=safeError(error,requestId);return result({isError:true,structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]});}
  }
  return json({jsonrpc:'2.0',id:message.id??null,error:{code:-32601,message:'Method not found'}});
 };
}
