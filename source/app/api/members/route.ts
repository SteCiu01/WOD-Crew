import {database,json,identity,body,error} from '../../../lib/server';
import {memberName,syncLegacyMembers} from '../../../lib/members';

export async function GET(){try{
 await identity();await syncLegacyMembers();
 const rows=await database().prepare('SELECT m.id,m.name,COUNT(a.id) AS result_count FROM crew_members m LEFT JOIN attempts a ON a.member_id=m.id WHERE m.archived_at IS NULL GROUP BY m.id ORDER BY lower(m.name),m.id').all();
 return json(rows.results.map((r:any)=>({id:r.id,name:r.name,resultCount:r.result_count})));
}catch(e){return error(e);}}
export async function POST(req:Request){try{
 await identity();await syncLegacyMembers();const b=await body(req),{name,nameKey}=memberName(b.name),db=database();
 await db.prepare('INSERT OR IGNORE INTO crew_members(name,name_key,created_at) VALUES(?,?,?)').bind(name,nameKey,new Date().toISOString()).run();
 // Adding the same name explicitly restores a removed member and their history.
 await db.prepare('UPDATE crew_members SET archived_at=NULL WHERE name_key=?').bind(nameKey).run();
 const member=await db.prepare('SELECT id,name FROM crew_members WHERE name_key=?').bind(nameKey).first();
 return json(member,201);
}catch(e){return error(e);}}
export async function DELETE(req:Request){try{
 await identity();const b=await body(req);if(!Number.isSafeInteger(b.id)||b.id<1||b.confirm!==true)throw new Error('Invalid crew member removal.');
 const db=database(),member=await db.prepare('SELECT id FROM crew_members WHERE id=?').bind(b.id).first();
 if(!member)return json({error:'This crew member was already removed.'},404);
 await db.prepare('UPDATE crew_members SET archived_at=? WHERE id=?').bind(new Date().toISOString(),b.id).run();
 return json({removed:true,historyPreserved:true});
}catch(e){return error(e);}}
