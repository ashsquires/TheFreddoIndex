import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticator } from '../supabase/functions/freddo-ingest/auth.js';
import { PROJECT_URL, RESOURCE } from '../supabase/functions/freddo-ingest/contract.js';
test('production requires exact resource and a live production grant; probe consent grants no production access',async()=>{
 const claims={iss:`${PROJECT_URL}/auth/v1`,aud:RESOURCE,role:'authenticated',exp:Date.now()/1000+60,sub:crypto.randomUUID(),client_id:'production',session_id:crypto.randomUUID()};
 let roles=['collector'];
 const authenticate=createAuthenticator({verify:async()=>claims,authorize:async()=>roles});
 assert.deepEqual((await authenticate('token')).roles,['collector']);
 roles=[];await assert.rejects(authenticate('token'),/FORBIDDEN/);
 roles=['collector'];claims.aud=`${PROJECT_URL}/functions/v1/freddo-probe`;assert.equal(await authenticate('token'),null);
 claims.aud=RESOURCE;claims.exp=0;assert.equal(await authenticate('token'),null);
});
