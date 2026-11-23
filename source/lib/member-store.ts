export function normalizeMemberName(value:unknown){
 if(typeof value!=='string'||value.length>60)throw new Error('Enter a valid crew member (up to 60 characters).');
 const name=value.trim().replace(/\s+/g,' ');
 if(!name)throw new Error('Enter a crew member name.');
 return {name,nameKey:name.toLocaleLowerCase('en-US')};
}

// Only unlinked legacy rows are considered. A unique name key makes concurrent
// backfills idempotent; an archived member remains archived, including on retries.
export async function backfillMembers(db:any){
 const legacy=await db.prepare("SELECT athlete AS name FROM attempts WHERE member_id IS NULL UNION SELECT creator AS name FROM workouts WHERE creator_member_id IS NULL").all();
 for(const row of legacy.results){
  if(typeof row.name!=='string'||!row.name.trim())continue;
  const {name,nameKey}=normalizeMemberName(row.name);
  await db.batch([
   db.prepare('INSERT OR IGNORE INTO crew_members(name,name_key,created_at) VALUES(?,?,?)').bind(name,nameKey,new Date().toISOString()),
   db.prepare('UPDATE attempts SET member_id=(SELECT id FROM crew_members WHERE name_key=?) WHERE member_id IS NULL AND athlete=?').bind(nameKey,row.name),
   db.prepare('UPDATE workouts SET creator_member_id=(SELECT id FROM crew_members WHERE name_key=?) WHERE creator_member_id IS NULL AND creator=?').bind(nameKey,row.name),
  ]);
 }
}
