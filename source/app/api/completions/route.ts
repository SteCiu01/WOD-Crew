import {database,json,identity,error} from '../../../lib/server';
import {syncLegacyMembers,selectedMember} from '../../../lib/members';
export async function GET(req:Request){try{
 await identity();await syncLegacyMembers();const member=await selectedMember(Number(new URL(req.url).searchParams.get('member')));
 const rows=await database().prepare('SELECT DISTINCT a.wod_id FROM attempts a JOIN workouts w ON w.id=a.wod_id WHERE a.member_id=? AND w.archived_at IS NULL').bind(member.id).all();
 return json({ids:rows.results.map((r:any)=>r.wod_id)});
}catch(e){return error(e);}}
