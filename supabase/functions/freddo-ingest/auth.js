import { PROJECT_URL, RESOURCE, fail } from './contract.js';
export function createAuthenticator({verify,authorize}){
 return async token=>{
  const claims=await verify(token);
  if(!claims||claims.iss!==`${PROJECT_URL}/auth/v1`||claims.aud!==RESOURCE||claims.role!=='authenticated'||typeof claims.exp!=='number'||claims.exp<=Date.now()/1000||!['sub','client_id','session_id'].every(k=>typeof claims[k]==='string'&&claims[k].length>0))return null;
  const roles=await authorize({userId:claims.sub,clientId:claims.client_id,sessionId:claims.session_id});
  if(!Array.isArray(roles)||!roles.length)fail('FORBIDDEN');
  return {userId:claims.sub,roles};
 };
}
