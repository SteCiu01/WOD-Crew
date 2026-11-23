import {database,json,identity,error} from '../../../lib/server';
import {validateBoundaries,calendarDate,summarizeActivity} from '../../../lib/crew-stats';
import {rosterQuery,dailyActivityQuery} from '../../../lib/stats-query';
import {syncLegacyMembers} from '../../../lib/members';
export async function GET(req:Request){try{
 await identity();const params=new URL(req.url).searchParams,raw=params.get('boundaries'),currentMember=Number(params.get('member'));if(!raw||raw.length>2000)throw new Error('Invalid stats period.');
 const boundaries=validateBoundaries(JSON.parse(raw)),timeZone=params.get('timeZone')??'UTC';
 try{if(timeZone.length>100)throw new Error();new Intl.DateTimeFormat('en-US',{timeZone}).format();}catch{throw new Error('Invalid timezone.');}
 await syncLegacyMembers();const db=database();
 const [roster,counts]=await db.batch([db.prepare(rosterQuery),db.prepare(dailyActivityQuery)]);
 const rows=counts.results.map((r:any)=>({...r,day:r.day.length===10?r.day:calendarDate(r.day,timeZone)}));
 return json(summarizeActivity(roster.results as any,rows as any,boundaries.map(b=>calendarDate(b,timeZone)),currentMember));
}catch(e){return error(e);}}
