import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { PROJECT_URL, fail } from '../freddo-ingest/contract.js';
export function createRuntime(){
 if(Deno.env.get('SUPABASE_URL')!==PROJECT_URL)throw new Error('Wrong project: disabled');
 const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
 const options={global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false}};
 const verifier=createClient(PROJECT_URL,Deno.env.get('SUPABASE_ANON_KEY')!,options);
 const admin=createClient(PROJECT_URL,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options);
 async function rpc(name:string,args:Record<string,unknown>){
  const {data,error}=await admin.rpc(name,args);
  if(error){
   const known=error.message.match(/^(FORBIDDEN|NOT_FOUND|CONFLICT|RUN_CLOSED|CUTOFF_REACHED|ADMISSION_NOT_READY|VALIDATION_FAILED|SIZE_LIMIT|HASH_MISMATCH)/)?.[1];
   fail(known??(['23514','23502','22P02','22007'].includes(error.code)?'VALIDATION_FAILED':'DEPENDENCY_UNAVAILABLE'));
  }
  return data;
 }
 async function verify(token:string){
  const {data,error}=await verifier.auth.getClaims(token);
  if(error&&'status' in error&&Number(error.status)>=500)fail('DEPENDENCY_UNAVAILABLE');
  return error?null:data?.claims;
 }
 return {admin,rpc,verify};
}
