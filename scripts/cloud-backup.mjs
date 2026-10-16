import {writeFile,appendFile,readFile} from 'node:fs/promises';
import {encryptBackup,checksum} from './backup-crypto.mjs';
const endpoint='https://ectikpmaidqobqfsqife.supabase.co/functions/v1/freddo-backup';
async function call(args){
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${process.env.FREDDO_BACKUP_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`Backup receiver failed (${response.status})`);return response.json();
}
if(process.argv[2]==='export'){
 const data=await call({action:'export'});const encrypted=encryptBackup(data,process.env.FREDDO_BACKUP_PUBLIC_KEY);
 if(encrypted.length>20*1024*1024)throw Error('Encrypted backup exceeds the 20 MiB budget; review storage before increasing it.');
 await writeFile('freddo-backup.enc',encrypted,{mode:0o600});
 await writeFile('backup-receipt.json',JSON.stringify({job_id:data.job_id,sha256:checksum(encrypted)}),{mode:0o600});
 const date=new Date(),weekly=date.getUTCDay()===0;
 await appendFile(process.env.GITHUB_OUTPUT,`artifact_name=freddo-${weekly?'weekly':'daily'}-${date.toISOString().slice(0,10)}-${process.env.GITHUB_RUN_ID}\nretention_days=${weekly?35:8}\n`);
 console.log(JSON.stringify({encrypted_bytes:encrypted.length,image_bytes_backed_up:false}));
}else if(process.argv[2]==='ack'){
 const receipt=JSON.parse(await readFile('backup-receipt.json','utf8'));await call({action:'ack',...receipt,artifact_id:process.env.ARTIFACT_ID});
}else throw Error('Use export or ack');
