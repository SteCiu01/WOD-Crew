export type DispatchIdentity={userId:string;legacyUserId:string;aliases:string[];displayName:string;email:string;fullName:string|null};
/** Only call with server request headers delivered by the Sites authentication gateway. */
export async function readDispatchIdentity(requestHeaders:Pick<Headers,'get'>,siteId:string):Promise<DispatchIdentity|null>{
 const platformId=requestHeaders.get('oai-authenticated-user-id')?.trim();
 const email=requestHeaders.get('oai-authenticated-user-email')?.trim();
 const value=requestHeaders.get('oai-authenticated-user-full-name');let fullName:string|null=null;
 if(value&&requestHeaders.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{fullName=decodeURIComponent(value);}catch{}}
 let legacyPlatform:string|null=null;if(email&&email.includes('@'))legacyPlatform=await hashedId('sites-email',siteId,email.toLowerCase());
 const profile=requestHeaders.get('x-wod-crew-profile')?.trim();const local=/^wc_[A-Za-z0-9_-]{32,80}$/.test(profile??'')?await hashedId('crew-profile',siteId,profile!):null;
 if(!local&&!legacyPlatform)return null;
 const primary=local??platformId??legacyPlatform!;const aliases=[...new Set([primary,platformId,legacyPlatform].filter((x):x is string=>!!x))];
 return {userId:primary,legacyUserId:legacyPlatform??primary,aliases,displayName:fullName??email??'Crew member',email:email??'',fullName};
}
async function hashedId(prefix:string,siteId:string,value:string){const bytes=new TextEncoder().encode(`${siteId}\0${value}`);const hash=await crypto.subtle.digest('SHA-256',bytes);return prefix+':'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
