import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
export function database(){if(!env.DB)throw new Error('Database is not available.');return env.DB;}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export async function identity(){const u=await getChatGPTUser();if(!u)throw new Error('Reload WOD Crew to create your browser profile.');return u;}
export function ownerIds(u:{userId:string;aliases?:string[]}){const ids=[...new Set([u.userId,...(u.aliases??[])])].slice(0,3);while(ids.length<3)ids.push(u.userId);return ids as [string,string,string];}
export async function linkLegacyOwnership(u:{userId:string;aliases?:string[]}){
 if(!u.userId.startsWith('crew-profile:'))return;
 const legacy=[...new Set((u.aliases??[]).filter(id=>id!==u.userId&&!id.startsWith('crew-profile:')))].slice(0,2);
 if(!legacy.length)return;
 while(legacy.length<2)legacy.push(legacy[0]);
 const prefix=legacy.find(id=>id.startsWith('sites-email:'))??'__no_legacy_save_prefix__';
 const db=database(),patterns=[`${prefix}:`,`${prefix}:`];
 await db.batch([
  db.prepare("UPDATE attempts SET user_id=? WHERE substr(user_id,1,13)<>'crew-profile:' AND (user_id IN (?,?) OR substr(request_key,1,77)=? OR substr(request_key,1,77)=?)").bind(u.userId,...legacy,...patterns),
  db.prepare("UPDATE workouts SET owner_id=? WHERE substr(owner_id,1,13)<>'crew-profile:' AND (owner_id IN (?,?) OR substr(request_key,1,77)=? OR substr(request_key,1,77)=?)").bind(u.userId,...legacy,...patterns),
 ]);
}
export async function body(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new Error('This request is not allowed.');if(!req.headers.get('content-type')?.includes('application/json'))throw new Error('Expected JSON.');const text=await req.text();if(text.length>120000)throw new Error('This workout is too large.');return JSON.parse(text);}
export function shortText(value:unknown,max:number,label:string,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new Error(`Enter a valid ${label} (up to ${max} characters).`);return value.trim();}
export function key(value:unknown){if(typeof value!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(value))throw new Error('Invalid save identifier. Please reload and try again.');return value;}
export function error(e:unknown){const message=e instanceof Error?e.message:'Unable to complete this request.';if(!/^(Enter |Invalid |Add |Choose |Duplicate |Keep |Workout |Notes |Countdown |Duration |Intervals |Work seconds|Rest seconds|Block |Exercise |Reload WOD Crew|Sign in|This |Expected |Result |Score |WOD |Only )/.test(message))console.error('WOD Crew request failure',message);const safe=/^(Enter |Invalid |Add |Choose |Duplicate |Keep |Workout |Notes |Countdown |Duration |Intervals |Work seconds|Rest seconds|Block |Exercise |Reload WOD Crew|Sign in|This |Expected |Result |Score |WOD |Only )/.test(message);return json({error:safe?message:'Unable to save or load right now. Please try again.'},message.startsWith('Sign in')?401:400);}
