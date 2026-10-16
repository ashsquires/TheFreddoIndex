import test from 'node:test';
import assert from 'node:assert/strict';
import { createProbeReceiver, RESOURCE, PROJECT_URL } from '../supabase/functions/freddo-probe/handler.js';
import { createAuthenticator } from '../supabase/functions/freddo-probe/auth.js';
const claims = { iss: `${PROJECT_URL}/auth/v1`, aud: RESOURCE, role: 'authenticated', exp: 2000000000, sub: 'alice', client_id: 'client', session_id: 'session' };
const req = (args, token = 'alice') => new Request(RESOURCE, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'probe_get',arguments:args}}) });
test('foreign claims and verification failure never reach authorization or storage', async () => {
  for (const change of [{aud:'authenticated'},{aud:'https://foreign.example/resource'},{iss:'https://foreign.example/auth/v1'},{exp:1},{client_id:''},{session_id:''}]) {
    const receiver = createProbeReceiver({authenticate:createAuthenticator({verify:async()=>({...claims,...change}),authorize:async()=>assert.fail('authorization reached')}),storage:{read:async()=>assert.fail('storage reached')}});
    assert.equal((await receiver(req({probe_id:'same'}))).status,401);
  }
  const receiver = createProbeReceiver({authenticate:createAuthenticator({verify:async()=>{throw Error('invalid signature');},authorize:async()=>assert.fail('authorization reached')}),storage:{read:async()=>assert.fail('storage reached')}});
  assert.equal((await receiver(req({probe_id:'same'}))).status,503);
});
test('same ID resolves only within verified identity and foreign path fields are rejected', async () => {
  const paths=[];
  const receiver=createProbeReceiver({authenticate:async token=>({userId:token}),storage:{read:async path=>{paths.push(path);return path==='alice/same.bin'?new TextEncoder().encode('private'):null;}}});
  const alice=await (await receiver(req({probe_id:'same'}))).json();
  assert.equal(alice.result.structuredContent.base64,'cHJpdmF0ZQ==');
  const bob=await (await receiver(req({probe_id:'same'},'bob'))).json();
  assert.equal(bob.result.isError,true);
  assert.deepEqual(paths,['alice/same.bin','bob/same.bin']);
  for(const args of [{probe_id:'../alice/same'},{probe_id:'alice/same'},{probe_id:'same',user_id:'alice'},{probe_id:'same',bucket:'other'},{probe_id:'same',project_id:'other'}]){
    assert.equal((await (await receiver(req(args,'bob'))).json()).result.isError,true);
  }
  assert.equal(paths.length,2);
});
