import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {testDatabase} from './db-helper.mjs';
import {backfillMembers,normalizeMemberName} from '../lib/member-store.ts';
import * as workout from '../lib/workout.ts';
import {assembleStats,monthlyWeeks,periodWindow,validateBoundaries} from '../lib/crew-stats.ts';
import {calendarDate,summarizeActivity,validateTrainingDate} from '../lib/crew-stats.ts';
import {rosterQuery,statsQuery,dailyActivityQuery} from '../lib/stats-query.ts';
import {samePayload,scopedSaveKey} from '../lib/saves.ts';
import {workoutFromExample} from '../lib/wod-examples.ts';

function fixture(){
 const {sql,db}=testDatabase();const w={title:'Original',notes:'',prepare:0,repeat:1,blocks:[{...workout.preset('amrap'),id:'block',duration:60,exercises:[{name:'Squats',reps:'10'}]}]};
 const definition=JSON.stringify(w);for(const id of [1,3,5,6,8])sql.prepare("INSERT INTO workouts(id,request_key,owner_id,creator,definition,created_at) VALUES(?,?,'old','Alex',?,'2026-10-01')").run(id,'w'+id,definition);
 const score=JSON.stringify([{...workout.scoreTemplates(w)[0],rounds:6,reps:19}]);
 for(const id of [1,3,5,6,8])sql.prepare("INSERT INTO attempts(id,request_key,wod_id,user_id,athlete,scores,source,style,notes,created_at) VALUES(?,?,?,?,'Alex',?,'manual','rx',?,?)").run(id,'r'+id,id,id===8?'new':'old',score,id===8?'7 rounds + 4 reps':'original note',id===8?'2026-10-20T12:00:00.000Z':'2026-10-06T12:00:00.000Z');
 sql.prepare("INSERT INTO attempts(request_key,wod_id,user_id,athlete,scores,source,style,notes,created_at) VALUES('jamie',1,'jamie','Jamie',?,'manual','rx','','2026-10-07T12:00:00.000Z')").run(score);
 const identity=async()=>({userId:'browser',aliases:['browser']});
 const selectedMember=async(id)=>{if(!Number.isSafeInteger(id)||id<1)throw new Error('Choose a crew member.');const m=sql.prepare('SELECT id,name FROM crew_members WHERE id=? AND archived_at IS NULL').get(id);if(!m)throw new Error('This crew member was removed. Choose another member.');return m;};
 const deps={...workout,calendarDate,summarizeActivity,validateTrainingDate,dailyActivityQuery,assembleStats,validateBoundaries,rosterQuery,statsQuery,samePayload,scopedSaveKey,database:()=>db,identity,selectedMember,syncLegacyMembers:()=>backfillMembers(db),memberName:normalizeMemberName,linkLegacyOwnership:async()=>{},ownerIds:()=>['browser','browser','browser'],body:req=>req.json(),key:x=>x,shortText:x=>x.trim(),json:(v,status=200)=>Response.json(v,{status}),error:e=>Response.json({error:e.message},{status:400})};
 function route(name){const source=stripTypeScriptTypes(readFileSync(`app/api/${name}/route.ts`,'utf8').replace(/^import .*;\n/gm,'')).replace(/export /g,'');return new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;${source};return {${['GET','POST','PATCH','DELETE'].filter(x=>source.includes('function '+x+'(')).join(',')}};`)(deps);}
 const req=(method,body)=>new Request('https://crew.test/api',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 return {sql,db,w,definition,route,req};
}

test('legacy consolidation retains every score, note and logged date, and never resurrects removed members',async()=>{
 const f=fixture();const before=f.sql.prepare('SELECT * FROM attempts ORDER BY id').all();
 await Promise.all([backfillMembers(f.db),backfillMembers(f.db)]);
 await backfillMembers(f.db);const members=f.sql.prepare('SELECT * FROM crew_members').all();assert.equal(members.length,2);
 const alex=members.find(m=>m.name==='Alex');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM attempts WHERE member_id=?').get(alex.id).n,5);
 for(const [i,row] of f.sql.prepare('SELECT * FROM attempts ORDER BY id').all().entries()){const {member_id,...actual}=row;assert.deepEqual(actual,((({member_id,...v})=>v)(before[i])));}
 const response=await f.route('members').DELETE(f.req('DELETE',{id:alex.id,confirm:true}));assert.equal(response.status,200);await backfillMembers(f.db);
 assert.equal((await (await f.route('members').GET()).json()).some(m=>m.id===alex.id),false);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM attempts').get().n,6);
 const restored=await (await f.route('members').POST(f.req('POST',{name:' ALEX '}))).json();assert.equal(restored.id,alex.id);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM attempts WHERE member_id=?').get(alex.id).n,5);
});
test('normalization handles internal spaces and avoids duplicate roster entries',async()=>{
 const f=fixture();f.sql.prepare("UPDATE attempts SET athlete='  AlEx  ' WHERE id=8").run();await backfillMembers(f.db);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM crew_members').get().n,2);assert.equal(normalizeMemberName('  Mary   Jane ').nameKey,'mary jane');
});
test('wording edits preserve WOD number and attempts; stale and incompatible edits return conflict',async()=>{
 const f=fixture();await backfillMembers(f.db);const member=f.sql.prepare("SELECT id FROM crew_members WHERE name='Alex'").get().id;
 const before=f.sql.prepare('SELECT * FROM attempts').all();const changed=structuredClone(f.w);changed.title='Corrected';changed.blocks[0].label='New label';changed.blocks[0].exercises[0].name='Air squats';
 const r=f.route('wods');const first=await r.PATCH(f.req('PATCH',{id:8,memberId:member,workout:changed,expectedDefinition:f.definition}));assert.equal(first.status,200);
 assert.deepEqual(f.sql.prepare('SELECT * FROM attempts').all(),before);assert.equal(f.sql.prepare('SELECT id FROM workouts WHERE id=8').get().id,8);
 assert.equal((await r.PATCH(f.req('PATCH',{id:8,memberId:member,workout:changed,expectedDefinition:f.definition}))).status,409);
 const current=f.sql.prepare('SELECT definition FROM workouts WHERE id=8').get().definition;changed.blocks[0].duration++;
 assert.equal((await r.PATCH(f.req('PATCH',{id:8,memberId:member,workout:changed,expectedDefinition:current}))).status,409);
 const results=await (await f.route('results').GET(new Request(`https://crew.test/api?wod=8&member=${member}`))).json();assert.equal(results.attempts[0].scores[0].label,'New label');
});
test('completion is distinct per member and changes when the last result is removed',async()=>{
 const f=fixture();await backfillMembers(f.db);const members=await (await f.route('members').GET()).json();const s=members.find(x=>x.name==='Alex').id,m=members.find(x=>x.name==='Jamie').id;
 const completions=async(id)=>(await (await f.route('completions').GET(new Request('https://crew.test/api?member='+id))).json()).ids;
 assert.deepEqual((await completions(s)).sort((a,b)=>a-b),[1,3,5,6,8]);assert.deepEqual(await completions(m),[1]);
 const scores=workout.scoreTemplates(f.w);await f.route('results').POST(f.req('POST',{wodId:8,memberId:s,expectedDefinition:f.definition,scores,style:'rx',source:'manual',notes:'repeat',requestKey:'repeat-attempt-1234'}));assert.equal((await completions(s)).length,5);
 for(const row of f.sql.prepare('SELECT id FROM attempts WHERE wod_id=8 AND member_id=?').all(s))await f.route('results').DELETE(f.req('DELETE',{id:row.id,memberId:s}));
 assert.equal((await completions(s)).includes(8),false);assert.deepEqual(await completions(m),[1]);
});
test('result save rejects a stale WOD definition and a removed member',async()=>{
 const f=fixture();await backfillMembers(f.db);const s=f.sql.prepare("SELECT id FROM crew_members WHERE name='Alex'").get().id;
 const input={wodId:8,memberId:s,expectedDefinition:'stale',scores:workout.scoreTemplates(f.w),style:'rx',source:'manual',notes:'',requestKey:'new-attempt-1234'};
 assert.equal((await f.route('results').POST(f.req('POST',input))).status,409);
 await f.route('members').DELETE(f.req('DELETE',{id:s,confirm:true}));input.expectedDefinition=f.definition;assert.equal((await f.route('results').POST(f.req('POST',input))).status,400);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM attempts').get().n,6);
});
test('monthly SQL counts populate numeric member IDs and recompute without accumulated totals',async()=>{
 const f=fixture();await backfillMembers(f.db);const s=f.sql.prepare("SELECT id FROM crew_members WHERE name='Alex'").get().id;
 const range=periodWindow('month',new Date(2026,9,20)),url='https://crew.test/api?member='+s+'&boundaries='+encodeURIComponent(JSON.stringify(range.boundaries));
 const a=await (await f.route('stats').GET(new Request(url))).json(),b=await (await f.route('stats').GET(new Request(url))).json();assert.deepEqual(a,b);assert.equal(a.members.find(m=>m.id===String(s)).total,5);assert.equal(a.members.reduce((n,m)=>n+m.total,0),6);
 const weeks=monthlyWeeks(range.dates,a.members.find(m=>m.id===String(s)).counts);assert.deepEqual(weeks.map(w=>[w.start.getDate(),w.end.getDate()]),[[1,4],[5,11],[12,18],[19,25],[26,31]]);assert.deepEqual(weeks.map(w=>w.count),[0,4,0,1,0]);assert.deepEqual(weeks.map(w=>w.running),[0,4,4,5,5]);
});
test('compatibility also protects EMOM exercise rotation and countdown semantics',()=>{
 const w={title:'EMOM',notes:'',prepare:10,repeat:1,blocks:[{...workout.preset('emom'),exercises:[{name:'Squats',reps:''}]}]};
 for(const mutate of [x=>x.prepare++,x=>x.blocks[0].exerciseFlow='together',x=>x.blocks[0].exercises.push({name:'Run',reps:''}),x=>x.blocks[0].id='new']){const changed=structuredClone(w);mutate(changed);assert.equal(workout.compatibleWorkoutEdit(w,changed),false);}
});

test('a first result arriving during a structural edit blocks that edit atomically',async()=>{
 const f=fixture();await backfillMembers(f.db);const s=f.sql.prepare("SELECT id FROM crew_members WHERE name='Alex'").get().id;f.sql.exec('DELETE FROM attempts');
 const prepare=f.db.prepare.bind(f.db);f.db.prepare=(query)=>{const statement=prepare(query);if(query.startsWith('UPDATE workouts SET definition=')){const run=statement.run.bind(statement);statement.run=async()=>{f.sql.prepare("INSERT INTO attempts(request_key,wod_id,user_id,member_id,athlete,scores,source,style,notes,created_at) VALUES('concurrent',8,'old',?,'Alex','[]','manual','rx','','now')").run(s);return run();};}return statement;};
 const changed=structuredClone(f.w);changed.blocks[0].duration++;
 assert.equal((await f.route('wods').PATCH(f.req('PATCH',{id:8,memberId:s,workout:changed,expectedDefinition:f.definition}))).status,409);assert.equal(f.sql.prepare('SELECT definition FROM workouts WHERE id=8').get().definition,f.definition);
});

test('a workout change arriving during result insertion never commits a score against the new definition',async()=>{
 const f=fixture();await backfillMembers(f.db);const s=f.sql.prepare("SELECT id FROM crew_members WHERE name='Alex'").get().id;
 const prepare=f.db.prepare.bind(f.db);f.db.prepare=(query)=>{const statement=prepare(query);if(query.startsWith('INSERT INTO attempts')){const run=statement.run.bind(statement);statement.run=async()=>{f.sql.prepare("UPDATE workouts SET definition='{}' WHERE id=8").run();return run();};}return statement;};
 assert.equal((await f.route('results').POST(f.req('POST',{wodId:8,memberId:s,expectedDefinition:f.definition,scores:workout.scoreTemplates(f.w),style:'rx',source:'manual',notes:'',requestKey:'concurrent-save-1234'}))).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM attempts').get().n,6);
});

test('month summaries clip six partial weeks, include leap day, and total daily values once',()=>{
 for(const [year,month] of [[2026,7],[2024,1],[2026,5]]){const range=periodWindow('month',new Date(year,month,15)),values=range.dates.map((_,i)=>i%3);const rows=monthlyWeeks(range.dates,values);assert.equal(rows[0].start.getDate(),1);assert.equal(rows.at(-1).end.getDate(),range.dates.length);assert.equal(rows.at(-1).running,values.reduce((a,b)=>a+b,0));assert.equal(rows.reduce((a,b)=>a+b.count,0),values.reduce((a,b)=>a+b,0));for(const row of rows.slice(1))assert.equal(row.start.getDay(),1);}
});

test('correcting a result date moves its statistics while retaining original save time and score',async()=>{
 const f=fixture();await backfillMembers(f.db);const s=f.sql.prepare("SELECT id FROM crew_members WHERE name='Alex'").get().id;
 const before=f.sql.prepare('SELECT * FROM attempts WHERE id=8').get();
 const edit={id:8,wodId:8,memberId:s,expectedDefinition:f.definition,expectedVersion:before.created_at,scores:JSON.parse(before.scores),style:before.style,source:before.source,notes:before.notes,performedOn:'2026-09-09'};
 const response=await f.route('results').PATCH(f.req('PATCH',edit));assert.equal(response.status,200,JSON.stringify(await response.json()));
 const row=f.sql.prepare('SELECT * FROM attempts WHERE id=8').get();assert.equal(row.performed_on,'2026-09-09');assert.equal(row.created_at,before.created_at);assert.deepEqual(JSON.parse(row.scores),JSON.parse(before.scores));assert.equal(row.notes,before.notes);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM attempts').get().n,6);
 const stats=async(month)=>{const range=periodWindow('month',new Date(2026,month,15));return (await (await f.route('stats').GET(new Request('https://crew.test/api?member='+s+'&boundaries='+encodeURIComponent(JSON.stringify(range.boundaries))))).json()).members.find(m=>m.id===String(s));};
 assert.equal((await stats(9)).total,4);assert.equal((await stats(8)).total,1);assert.equal((await stats(8)).totalDays,1);assert.equal((await stats(9)).lifetime.workouts,5);
 assert.equal((await f.route('results').PATCH(f.req('PATCH',edit))).status,409);
 edit.expectedVersion=row.updated_at;edit.performedOn='2026-02-30';assert.equal((await f.route('results').PATCH(f.req('PATCH',edit))).status,400);
 assert.equal(f.sql.prepare('SELECT performed_on FROM attempts WHERE id=8').get().performed_on,'2026-09-09');
});

test('date-aware save retries are idempotent and reject changing a saved attempt under the same key',async()=>{
 const f=fixture();await backfillMembers(f.db);const s=f.sql.prepare("SELECT id FROM crew_members WHERE name='Alex'").get().id;
 const input={wodId:8,memberId:s,expectedDefinition:f.definition,scores:workout.scoreTemplates(f.w),style:'rx',source:'manual',notes:'dated',performedOn:'2026-10-09',requestKey:'dated-result-1234'};
 const r=f.route('results');assert.equal((await r.POST(f.req('POST',input))).status,201);assert.equal((await r.POST(f.req('POST',input))).status,201);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM attempts').get().n,7);input.performedOn='2026-10-10';assert.equal((await r.POST(f.req('POST',input))).status,409);
 const results=await (await r.GET(new Request('https://crew.test/api?wod=8&member='+s))).json();assert.equal(results.attempts[0].performedOn,'2026-10-09');
});

test('explicit training dates stay fixed while legacy timestamps follow the viewing timezone',async()=>{
 const f=fixture();await backfillMembers(f.db);const s=f.sql.prepare("SELECT id FROM crew_members WHERE name='Alex'").get().id;
 f.sql.exec("UPDATE attempts SET created_at='2026-10-10T23:30:00.000Z',performed_on='2026-10-09' WHERE id=8; UPDATE attempts SET created_at='2026-10-10T23:30:00.000Z' WHERE id=6");
 const range=periodWindow('month',new Date(2026,9,15));
 const data=await (await f.route('stats').GET(new Request('https://crew.test/api?member='+s+'&timeZone=Europe%2FWarsaw&boundaries='+encodeURIComponent(JSON.stringify(range.boundaries))))).json();
 const m=data.members.find(m=>m.id===String(s));assert(m.days.some(d=>d.date==='2026-10-09'&&d.workouts===1));assert(m.days.some(d=>d.date==='2026-10-11'&&d.workouts===1));
});

test('Add to Workouts creates a fresh member-owned copy dated now with no results and normal editing',async()=>{
 const f=fixture();await backfillMembers(f.db);const member=f.sql.prepare("SELECT id FROM crew_members WHERE name='Alex'").get().id;
 const catalog=JSON.parse(readFileSync('lib/wod-catalog.json','utf8')),example=catalog.examples.find(e=>e.name==='Cindy');const w=workoutFromExample(example),before=f.sql.prepare('SELECT * FROM attempts').all(),start=Date.now();
 const input={memberId:member,workout:w,requestKey:'catalog-import-12345'},api=f.route('wods');
 const response=await api.POST(f.req('POST',input));assert.equal(response.status,201);const {id}=await response.json();assert(id>8);
 const [stored]=await (await api.GET(new Request('https://crew.test/api?id='+id+'&member='+member))).json();assert.equal(stored.creator,'Alex');assert.equal(stored.mine,true);assert.equal(stored.attemptCount,0);assert(Date.parse(stored.createdAt)>=start&&Date.parse(stored.createdAt)<=Date.now());assert.equal(stored.title,'Cindy');assert(stored.notes.includes(example.sourceUrl));
 assert.deepEqual(f.sql.prepare('SELECT * FROM attempts').all(),before);
 assert.equal((await (await api.POST(f.req('POST',input))).json()).id,id);
 const edit=structuredClone(w);edit.title='Crew Cindy';assert.equal((await api.PATCH(f.req('PATCH',{id,memberId:member,workout:edit,expectedDefinition:stored.expectedDefinition}))).status,200);
 assert.equal(f.sql.prepare('SELECT creator_member_id FROM workouts WHERE id=?').get(id).creator_member_id,member);
});
