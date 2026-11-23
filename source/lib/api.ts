import {getProfileKey,PROFILE_HEADER} from './profile.js';
/** Keep browser/network errors separate from server validation; never parse sign-in HTML as JSON. */
export async function api(url:string,method='GET',data?:unknown){
 let r:Response;
 try{r=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',[PROFILE_HEADER]:getProfileKey(),...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});}
 catch{throw new Error('Could not reach the crew. Check your connection and retry. Your unsaved entry is kept on this device.');}
 if(r.status===401||r.redirected||r.headers.get('content-type')?.includes('text/html'))throw new Error('Reload WOD Crew, then continue your unsaved entry. Your browser profile is kept on this device.');
 let result:any;
 try{result=await r.json();}catch{throw new Error('The crew returned an unreadable response. Reload and retry your unsaved entry.');}
 if(!r.ok)throw new Error(typeof result?.error==='string'?result.error:'Unable to save or load right now. Please retry.');
 return result;
}
