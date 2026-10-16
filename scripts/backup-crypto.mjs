import {randomBytes,createCipheriv,createDecipheriv,publicEncrypt,privateDecrypt,constants,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
export function encryptBackup(data,publicKey){
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const header=Buffer.from('freddo-backup-v1');cipher.setAAD(header);
 const ciphertext=Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(data)))),cipher.final()]);
 return Buffer.from(JSON.stringify({format:'freddo-backup-v1',algorithm:'RSA-OAEP-SHA256+AES-256-GCM',key:publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')}));
}
export function decryptBackup(bytes,privateKey){
 const envelope=JSON.parse(bytes);if(envelope.format!=='freddo-backup-v1'||envelope.algorithm!=='RSA-OAEP-SHA256+AES-256-GCM')throw Error('Unsupported backup');
 const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(envelope.key,'base64'));
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));decipher.setAAD(Buffer.from('freddo-backup-v1'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
 const compressed=Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]);
 return JSON.parse(gunzipSync(compressed,{maxOutputLength:64*1024*1024}));
}
export const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
