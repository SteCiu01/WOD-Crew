import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
function database(){const db=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));return db;}
test('result pagination exposes every attempt beyond the former 500-row cutoff without repeats',()=>{
 const db=database();db.exec("INSERT INTO workouts(request_key,owner_id,creator,definition,created_at) VALUES('w','u','A','{}','2026-01-01')");
 const insert=db.prepare("INSERT INTO attempts(request_key,wod_id,user_id,athlete,scores,source,style,notes,created_at) VALUES(?,1,'u','A','[]','manual','rx','','2026-10-01')");for(let i=0;i<550;i++)insert.run('attempt-'+i);
 const src=readFileSync('app/api/results/route.ts','utf8');const query=[...src.matchAll(/prepare\('([^']+)'\)/g)].map(x=>x[1]).find(q=>q.startsWith('SELECT a.*,m.name'));assert.ok(query);let cursor=Number.MAX_SAFE_INTEGER,ids=[];
 while(cursor){const rows=db.prepare(query).all(1,cursor);const page=rows.slice(0,100);ids.push(...page.map(r=>r.id));cursor=rows.length>100?page.at(-1).id:null;}
 assert.equal(ids.length,550);assert.equal(new Set(ids).size,550);assert.equal(ids.at(-1),1);db.close();
});
test('direct WOD lookup retrieves an older WOD, active/archive cursors stay separated',()=>{
 const db=database(),insert=db.prepare("INSERT INTO workouts(request_key,owner_id,creator,definition,created_at) VALUES(?,'u','A','{}','2026-01-01')");for(let i=0;i<550;i++)insert.run('w-'+i);
 const src=readFileSync('app/api/wods/route.ts','utf8'),template=src.match(/const query=`([^`]+)`/)[1];
 const query=(where,id)=>template.replace('${where}',where).replace("${id===null?'':' AND w.id=?'}",id===null?'':' AND w.id=?');
 const direct=db.prepare(query('w.archived_at IS NULL',1)).all(Number.MAX_SAFE_INTEGER,1);assert.equal(direct.length,1);assert.equal(direct[0].id,1);
 db.exec("UPDATE workouts SET archived_at='today' WHERE id=1");assert.equal(db.prepare(query('w.archived_at IS NULL',1)).all(Number.MAX_SAFE_INTEGER,1).length,0);
 const archived=db.prepare(query('w.archived_at IS NOT NULL AND w.owner_id IN (?,?,?)',null));assert.equal(archived.all('u','legacy','third',Number.MAX_SAFE_INTEGER).length,1);assert.equal(archived.all('other','legacy-other','third-other',Number.MAX_SAFE_INTEGER).length,0);db.close();
});
