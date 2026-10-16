import test from 'node:test';
import assert from 'node:assert/strict';
import {readProbeObject} from '../supabase/functions/freddo-probe/storage.js';
test('only explicit absent-object errors return null; service and permission failures remain errors', async()=>{
  for(const error of [{code:'NoSuchKey',statusCode:'404'},{message:'Object not found',statusCode:'400'},{message:'Object not found',statusCode:'404'}]) assert.equal(await readProbeObject({download:async()=>({error})},'owner/id.bin'),null);
  for(const error of [{code:'NoSuchBucket',statusCode:'404'},{code:'AccessDenied',statusCode:'403'},{statusCode:'500'},{message:'Object not found',statusCode:'403'},{statusCode:'404',message:'Unknown'}]) await assert.rejects(readProbeObject({download:async()=>({error})},'owner/id.bin'),/Download failed/);
  const bytes=await readProbeObject({download:async()=>({data:new Blob(['hello'])})},'owner/id.bin');
  assert.equal(new TextDecoder().decode(bytes),'hello');
});
