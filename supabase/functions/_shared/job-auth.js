export async function authorizedJob(request,key){
 if(request.method!=='POST'||request.headers.has('origin')||typeof key!=='string'||key.length<40)return false;
 const supplied=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];if(!supplied)return false;
 const hash=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [a,b]=await Promise.all([hash(key),hash(supplied)]);let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];return different===0;
}
