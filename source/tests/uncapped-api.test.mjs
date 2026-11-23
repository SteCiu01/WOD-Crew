import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {testDatabase} from './db-helper.mjs';
import * as workout from '../lib/workout.ts';
import {samePayload,scopedSaveKey} from '../lib/saves.ts';
import {validateTrainingDate} from '../lib/crew-stats.ts';

function fixture({open=true,modes=['fortime']}={}){
 const {sql,db}=testDatabase();
 const w={title:'Open',notes:'',prepare:0,repeat:1,blocks:modes.map((mode,i)=>({...workout.preset(mode),id:'block'+i,duration:60,...(open?{uncapped:true}:{}),exercises:[{name:'Squats',reps:'20'}]}))};
 const definition=JSON.stringify(w);
 sql.exec("INSERT INTO crew_members(id,name,name_key,created_at) VALUES(1,'Athlete','athlete','now')");
 sql.prepare("INSERT INTO workouts(id,request_key,owner_id,creator,creator_member_id,definition,created_at) VALUES(1,'w','browser','Athlete',1,?,'now')").run(definition);
 const deps={...workout,samePayload,scopedSaveKey,validateTrainingDate,database:()=>db,identity:async()=>({userId:'browser',legacyUserId:'browser',aliases:['browser']}),ownerIds:()=>['browser','browser','browser'],selectedMember:async()=>({id:1,name:'Athlete'}),linkLegacyOwnership:async()=>{},body:req=>req.json(),key:x=>x,shortText:x=>x.trim(),json:(v,status=200)=>Response.json(v,{status}),error:e=>Response.json({error:e.message},{status:400})};
 function route(name){const source=stripTypeScriptTypes(readFileSync(`app/api/${name}/route.ts`,'utf8').replace(/^import .*;\n/gm,'')).replace(/export /g,'');return new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;${source};return {POST,PATCH};`)(deps);}
 const req=(method,body)=>new Request('https://crew.test/api',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const input={wodId:1,memberId:1,expectedDefinition:definition,scores:workout.scoreTemplates(w).map(s=>({...s,status:'finished',elapsed:18000})),style:'rx',source:'timer',notes:'',requestKey:'uncapped-result'};
 return {sql,w,definition,route,req,input};
}

test('each uncapped score accepts five hours through exactly 86,400 seconds and stores finite JSON',async()=>{
 const f=fixture({modes:['fortime','stopwatch']});f.input.scores.forEach(s=>s.elapsed=86400);
 const r=await f.route('results').POST(f.req('POST',f.input));assert.equal(r.status,201,JSON.stringify(await r.json()));
 const stored=f.sql.prepare('SELECT scores FROM attempts').get().scores;
 assert.doesNotMatch(stored,/Infinity|null/);assert.deepEqual(JSON.parse(stored).map(s=>s.elapsed),[86400,86400]);
});

test('uncapped result validation rejects elapsed values above 24 hours or nonfinite values',async()=>{
 for(const elapsed of [86400.001,86401,1e20,Infinity,NaN,-1]){
  const f=fixture();f.input.scores[0].elapsed=elapsed;
  const r=await f.route('results').POST(f.req('POST',f.input));assert.equal(r.status,400,`elapsed ${elapsed}`);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM attempts').get().n,0);
 }
});

test('uncapped elapsed validation also bounds result edits',async()=>{
 const f=fixture(),r=f.route('results');assert.equal((await r.POST(f.req('POST',f.input))).status,201);
 const saved=f.sql.prepare('SELECT * FROM attempts').get();
 const input={...f.input,id:saved.id,expectedVersion:saved.created_at};input.scores[0].elapsed=86401;
 assert.equal((await r.PATCH(f.req('PATCH',input))).status,400);
 input.scores[0].elapsed=86400;assert.equal((await r.PATCH(f.req('PATCH',input))).status,200);
 assert.equal(JSON.parse(f.sql.prepare('SELECT scores FROM attempts').get().scores)[0].elapsed,86400);
});

test('finite legacy caps keep their existing boundary tolerance and reject over-cap times',async()=>{
 for(const [elapsed,status] of [[60,201],[60.005,201],[60.02,400],[18000,400]]){
  const f=fixture({open:false});f.input.scores[0].elapsed=elapsed;
  assert.equal((await f.route('results').POST(f.req('POST',f.input))).status,status);
 }
});

test('workout edits cannot change uncapped semantics once results exist, in either direction',async()=>{
 for(const open of [true,false]){
  const f=fixture({open});f.input.scores[0].elapsed=30;
  assert.equal((await f.route('results').POST(f.req('POST',f.input))).status,201);
  const before=f.sql.prepare('SELECT * FROM attempts').all(),changed=structuredClone(f.w);changed.blocks[0].uncapped=!open;
  const r=await f.route('wods').PATCH(f.req('PATCH',{id:1,memberId:1,expectedDefinition:f.definition,workout:changed}));
  assert.equal(r.status,409);assert.equal(f.sql.prepare('SELECT definition FROM workouts').get().definition,f.definition);
  assert.deepEqual(f.sql.prepare('SELECT * FROM attempts').all(),before);
 }
});

test('prescribed round wording can be corrected without changing existing results or timing',async()=>{
 const f=fixture();f.input.scores[0].elapsed=30;assert.equal((await f.route('results').POST(f.req('POST',f.input))).status,201);
 const before=f.sql.prepare('SELECT * FROM attempts').all(),changed=structuredClone(f.w);changed.blocks[0].prescriptionRounds=5;
 assert.equal((await f.route('wods').PATCH(f.req('PATCH',{id:1,memberId:1,expectedDefinition:f.definition,workout:changed}))).status,200);
 assert.deepEqual(f.sql.prepare('SELECT * FROM attempts').all(),before);
});
