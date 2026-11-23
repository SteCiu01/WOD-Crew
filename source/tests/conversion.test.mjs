import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateWorkout,compileWorkout} from '../lib/workout.ts';
import {workoutFromExample,exampleTiming,exampleMode,exampleConversionInfo} from '../lib/wod-examples.ts';

const all=['wod-catalog','wod-daily-examples'].flatMap(f=>JSON.parse(readFileSync(`lib/${f}.json`,'utf8')).examples);
const source=name=>{const e=all.find(e=>e.name===name);assert(e,name);return e;};
const get=name=>workoutFromExample(source(name));
const work=name=>get(name).blocks.filter(b=>b.mode!=='rest');
const fixedSeconds=w=>compileWorkout({...w,prepare:0}).reduce((sum,p)=>sum+p.duration,0);

test('pre-import conversion information exposes limitations without materializing workouts or UUIDs',t=>{
 const uuid=t.mock.method(globalThis.crypto,'randomUUID',()=>{throw new Error('Catalog analysis must not allocate UUIDs');});
 const audit=JSON.parse(readFileSync('lib/conversion-audit.json','utf8'));
 for(const e of all){const info=exampleConversionInfo(e),record=audit.find(x=>x.id===e.id);assert.equal(info.format,record.format);assert.equal(info.status,record.status);assert.deepEqual(info.limitations,record.manualActions);exampleMode(e);exampleTiming(e);}
 assert.equal(uuid.mock.callCount(),0);
});

test('all 411 imports contain actual movements, separate quantities, and preserve every source line',()=>{
 assert.equal(all.length,411);
 for(const e of all){
  const w=workoutFromExample(e),saved=validateWorkout(w);
  assert.equal(w.title,e.name);
  for(const line of [...e.prescription,...e.loads,e.sourceUrl])assert(w.notes.includes(line),`${e.name}: missing ${line}`);
  for(const b of w.blocks){
   assert.equal(b.repeat,1,`${e.name}: repeats restart a clock`);
   if(b.mode==='rest'){assert.deepEqual(b.exercises,[]);continue;}
   assert(b.exercises.length, e.name);
   for(const x of b.exercises){
    assert(!/^(?:\d|[♀♂]|For\b|Then\b|With\b|Wearing\b|Max\b|Use\b|At\b|During\b|AMRAP\b|As many\b|Complete\b|Rest\b|Score\b|After\b|Every\b|Minutes?\b|Rx\b|Sequence\b|Tabata\b|On a\b)/i.test(x.name),`${e.name}: ${x.name}`);
    assert(!/\d|\b(?:rounds?|minutes?|seconds?|reps?|time cap|body ?weight)\b/i.test(x.name),`${e.name}: quantity in ${x.name}`);
   }
   if(b.uncapped){assert.equal(b.duration,1);assert.equal(saved.blocks.find(x=>x.id===b.id).uncapped,true);}
   if(b.prescriptionRounds)assert.equal(saved.blocks.find(x=>x.id===b.id).prescriptionRounds,b.prescriptionRounds);
  }
  const copy=workoutFromExample(e);assert(!w.blocks.some(b=>copy.blocks.some(c=>b.id===c.id)));
  assert(!JSON.stringify(w).includes('Infinity'));
 }
});

test('all catalog identities have an explicit reviewed conversion with no unknown fallback',async()=>{
 const plans=JSON.parse(readFileSync('lib/conversion-plans.json','utf8'));
 assert.deepEqual(Object.keys(plans).sort(),all.map(e=>e.id).sort());
 for(const e of all){const p=plans[e.id];assert.equal(p.name,e.name);assert.equal(p.reviewed,true);assert(p.format);assert(['supported','manual-conditional'].includes(p.status));assert.deepEqual(p.source.prescription,e.prescription);assert.deepEqual(p.source.loads,e.loads);assert.deepEqual(p.source.timer??null,e.timer??null);assert.equal(p.sourceSha256,createHash('sha256').update(JSON.stringify(p.source)).digest('hex'),e.name);}
 assert.throws(()=>workoutFromExample({...source('Cindy'),id:'unknown'}),/review/i);
 assert.throws(()=>workoutFromExample({...source('Cindy'),prescription:['AMRAP 3:','5 pull-ups']}),/review/i);
});

test('Artie has five movements and a twenty minute AMRAP, with only movement quantities in details',()=>{
 const [b]=work('Artie');assert.equal(b.mode,'amrap');assert.equal(b.duration,1200);
 assert.deepEqual(b.exercises.map(e=>e.name.toLowerCase()),['pull-ups','push-ups','squats','pull-ups','thrusters']);
 assert.deepEqual(b.exercises.map(e=>e.reps.match(/^\d+/)?.[0]),['5','10','15','5','10']);
 assert(b.exercises[4].reps.includes('65'));assert(b.exercises[4].reps.includes('95'));
});

test('Barbara Ann has five uncapped efforts and exactly four three minute recoveries',()=>{
 const w=get('Barbara Ann');assert.equal(w.blocks.length,9);
 assert.deepEqual(w.blocks.map(b=>b.mode),['fortime','rest','fortime','rest','fortime','rest','fortime','rest','fortime']);
 assert(w.blocks.filter(b=>b.mode==='rest').every(b=>b.duration===180));
 assert(work('Barbara Ann').every(b=>b.uncapped&&b.exercises.length===4));
 assert.equal(exampleTiming(source('Barbara Ann')).seconds,null);
 assert(work('Barbara Ann')[0].exercises[1].reps.includes('95/135 lb'));
});

test('ordinary rounds stay on one uncapped for-time clock with an informative round count',()=>{
 for(const [name,rounds] of [['Helen',3],['Adrian',7],['Candy',5],['Holleyman',30],['Marguerita',50],['Eva Strong',5]]){
  const w=get(name);assert.equal(w.blocks.length,1,name);const [b]=w.blocks;
  assert.equal(b.mode,'fortime',name);assert.equal(b.prescriptionRounds,rounds,name);assert.equal(b.repeat,1,name);assert.equal(b.rounds,1,name);assert.equal(b.uncapped,true,name);
 }
 assert.equal(work('Helen')[0].exercises[1].reps.match(/^\d+/)[0],'21');
});

test('uncapped means no source cap, never an invented four-hour limit',()=>{
 for(const name of ['Murph','Run 10K','Back Squat 5RM','L-Sit Hold','Bar Muscle-ups','Coffland']){
  const w=get(name);assert(w.blocks.some(b=>b.uncapped),name);assert.equal(exampleTiming(source(name)).seconds,null,name);
  assert(!/safety limit|4.hour|240.min/i.test(w.notes),name);
 }
 assert.equal(work('L-Sit Hold')[0].mode,'stopwatch');
});

test('source caps apply once to the full sequence',()=>{
 for(const [name,seconds] of [['FERN',3600],['2007 Hopper',1200]]){
  const w=get(name);assert.equal(w.blocks.length,1);assert.equal(w.blocks[0].mode,'fortime');assert.equal(w.blocks[0].duration,seconds);assert(!w.blocks[0].uncapped);assert.equal(exampleTiming(source(name)).seconds,seconds);
 }
 assert(get('FERN').blocks[0].exercises.some(e=>/9 rounds/i.test(e.reps)));
 assert(get('FERN').blocks[0].exercises.some(e=>/3 rounds/i.test(e.reps)));
});

test('finite ladders retain each round quantity and a single overall score',()=>{
 for(const [name,ladder] of [['Fran','21-15-9'],['Amanda','9-7-5'],['Linda','10-9-8-7-6-5-4-3-2-1'],['Donny','21-15-9-9-15-21'],['Stephen','30-25-20-15-10-5']]){
  const w=get(name);assert.equal(w.blocks.length,1,name);assert.equal(w.blocks[0].mode,'fortime',name);assert(w.blocks[0].exercises.every(e=>e.reps.includes(ladder)),name);assert.equal(w.blocks[0].repeat,1);
 }
 assert.equal(work('Carse')[0].exercises[0].name.toLowerCase(),'bear crawl');
 assert.match(work('Carse')[0].exercises[0].reps,/50.*each round/i);
});

test('continuous multisection sequences keep one clock and exact section cues',()=>{
 for(const name of ['Alec','DVB','Gage','Goose','Jonathon Farmer','Josh-O','Josie','Leehan','Locke','Northrup','Operation Red Wings','Rich','Ryan SO','TommyG3x','Wes']){
  const w=get(name);assert.equal(w.blocks.length,1,name);assert.equal(w.blocks[0].mode,'fortime',name);assert(w.blocks[0].uncapped,name);assert(w.blocks[0].exercises.some(e=>/rounds/i.test(e.reps)),name);
 }
 const d=work('DVB')[0].exercises;assert(d.some(e=>/8 rounds/.test(e.reps)));assert(d.some(e=>/4 rounds/.test(e.reps)));assert(d.some(e=>/2 rounds/.test(e.reps)));
});

test('buy-ins use the remaining part of the same clock, without a second full AMRAP',()=>{
 for(const [name,seconds] of [['Finseth',1080],['Garbo',1260],['Tiff',1500],['Wesley',2100]]){
  const w=get(name);assert.equal(w.blocks.length,1,name);assert.equal(w.blocks[0].mode,'amrap',name);assert.equal(w.blocks[0].duration,seconds,name);
  assert.match(w.blocks[0].exercises[0].reps,/buy-in/i,name);assert(w.blocks[0].exercises.slice(1).every(e=>/remaining/i.test(e.reps)),name);
 }
 const foo=get('Foo');assert.deepEqual(foo.blocks.map(b=>b.mode),['fortime','amrap']);assert(foo.blocks[0].uncapped);assert.equal(foo.blocks[1].duration,1200);
});

test('running-clock windows retain exact durations without restarting the whole clock',()=>{
 const triangle=get("Jack's Triangle");assert.deepEqual(triangle.blocks.map(b=>[b.mode,b.duration]),[['amrap',120],['amrap',1140],['amrap',120]]);assert.equal(fixedSeconds(triangle),1380);
 assert.deepEqual(get('Dominic J. Hall').blocks.map(b=>[b.mode,b.duration]),[['amrap',743],['rest',157],['amrap',1980]]);assert.equal(fixedSeconds(get('Dominic J. Hall')),2880);
 assert.deepEqual(get('Nukes').blocks.map(b=>b.duration),[480,600,720]);assert.equal(fixedSeconds(get('Nukes')),1800);
 const scooter=get('Scooter');assert.equal(fixedSeconds(scooter),2100);assert.equal(scooter.blocks[0].duration,1800);assert.equal(scooter.blocks[1].work,300);assert(scooter.blocks[1].exercises[0].reps.includes('1RM'));
});

test('each-for-time efforts have every prescribed recovery, without a spurious last recovery',()=>{
 for(const [name,count,rest] of [['Holbrook',10,60],['Hammer',5,90],['Hall',5,120],['Woehlke',3,180],['Paul Pena',7,180],['The Lyon',5,120],['Maloney',6,120],['PK',5,120]]){
  const w=get(name);assert.equal(w.blocks.filter(b=>b.mode==='fortime').length,count,name);assert.equal(w.blocks.filter(b=>b.mode==='rest').length,count-1,name);assert(w.blocks.filter(b=>b.mode==='rest').every(b=>b.duration===rest),name);assert.equal(w.blocks.at(-1).mode,'fortime');
 }
});

test('station and interval protocols have their full work and recovery counts',()=>{
 for(const name of ['Fight Gone Bad','Hope','Santora']){const w=get(name);assert.equal(fixedSeconds(w),1020,name);assert.equal(compileWorkout(w).filter(p=>p.kind==='work').length,15,name);}
 assert.equal(fixedSeconds(get('Manuel')),3000);assert.equal(compileWorkout(get('Manuel')).filter(p=>p.kind==='work').length,20);
 assert.equal(fixedSeconds(get('The Ghost')),1440);assert.equal(get('The Ghost').blocks.filter(b=>b.mode==='rest').length,6);
 assert.equal(fixedSeconds(get('The Chief')),1200);assert.equal(get('The Chief').blocks.filter(b=>b.mode==='amrap').length,5);
 assert.equal(fixedSeconds(get('Dallas 5')),1740);
 assert.equal(fixedSeconds(get('Time Priority Angie')),720);
});

test('Tabata Something Else and all supplemental Tabatas finish all eight efforts then restore final recovery',()=>{
 assert.equal(exampleMode(source('Tabata Something Else')),'tabata');
 for(const e of [source('Tabata Something Else'),source('Tabata This!'),...all.filter(e=>e.timer?.mode==='tabata')]){
  const w=workoutFromExample(e),blocks=w.blocks.filter(b=>b.mode==='tabata');
  assert(blocks.every(b=>b.rounds===8&&b.work===20&&b.rest===10&&b.exerciseFlow==='together'));
  assert.equal(compileWorkout(w).filter(p=>p.kind==='work').length,blocks.length*8);
  assert.equal(fixedSeconds(w),exampleTiming(e).seconds,e.name);
  assert.equal(w.blocks.at(-1).mode,'rest');assert.equal(w.blocks.at(-1).duration,10);
 }
 assert.equal(fixedSeconds(get('Tabata Something Else')),960);assert.equal(fixedSeconds(get('Tabata This!')),1440);
});

test('daily EMOMs retain progression, rotating stations and genuine recovery minutes',()=>{
 for(const e of all.filter(e=>e.timer?.mode==='emom')){const w=workoutFromExample(e);assert.equal(fixedSeconds(w),exampleTiming(e).seconds);assert(w.blocks.filter(b=>b.mode==='emom').every(b=>b.work===60&&b.rest===0));}
 const e=all.find(e=>e.firstPosted==='2024-07-01'),p=compileWorkout(workoutFromExample(e)).filter(p=>p.kind==='work');assert.equal(p.length,20);assert.equal(p[0].exercises[0].name,'clean and jerks');assert.equal(p[1].exercises[0].name,'strict handstand push-ups');
 const rings=workoutFromExample(all.find(e=>e.firstPosted==='2024-09-27'));assert.equal(rings.blocks.filter(b=>b.mode==='rest').length,3);assert.equal(fixedSeconds(rings),900);
 const [chelsea]=work('Chelsea');assert.equal(chelsea.rounds,30);assert.equal(chelsea.exerciseFlow,'together');assert.equal(fixedSeconds(get('Chelsea')),1800);
});

test('loads and movement-specific modifiers live in exercise details',()=>{
 assert.match(work('Fran')[0].exercises[0].reps,/65.*95/);assert(!/\blb/.test(work('Fran')[0].exercises[1].reps));
 assert(!/\blb/.test(work('Artie')[0].exercises[2].reps));
 assert.match(work('Moon')[0].exercises[0].reps,/30.*40/);
 assert.match(work('Tumilson')[0].exercises[1].reps,/45.*60/);
 assert.equal(work('Kev')[0].exercises.length,4);assert.equal(work('Kev')[0].mode,'amrap');assert.equal(work('Kev')[0].duration,1560);
 assert.equal(work('Laura')[0].exercises.length,3);assert.equal(work('Laura')[0].duration,1260);
 assert.deepEqual(work('Tama')[0].exercises.filter(x=>/farmers carry/i.test(x.name)).map(x=>x.reps),['800 meters · ♀ 35 lb · ♂ 45 lb','400 meters · ♀ 65 lb · ♂ 95 lb','200 meters · ♀ 95 lb · ♂ 135 lb']);
 assert.match(work('Tama')[0].exercises.find(x=>/front squat/i.test(x.name)).reps,/65.*95/);assert.match(work('Tama')[0].exercises.find(x=>/hang power clean/i.test(x.name)).reps,/95.*135/);
 assert.match(work('Zeus')[0].exercises.find(x=>/back squat/i.test(x.name)).reps,/bodyweight/);assert(!/55|75/.test(work('Zeus')[0].exercises.find(x=>/back squat/i.test(x.name)).reps));
 assert.match(work('Dominic J. Hall')[1].exercises[1].reps,/400 meters/);
 assert.match(work('Brenton')[0].exercises[0].reps,/100 feet/);
 assert.match(work('Diane')[0].exercises[0].reps,/225\/155 lb/);
 assert.match(work('Adambrown')[0].exercises.find(e=>/deadlift/i.test(e.name)).reps,/195.*295/);
 assert.match(work('Adambrown')[0].exercises.find(e=>/bench/i.test(e.name)).reps,/135.*195/);
 assert.match(work('Nasty Girls')[0].exercises.find(e=>/hang power clean/i.test(e.name)).reps,/10.*135/);
 assert.match(work('Moon')[0].exercises[0].reps,/right arm/);
 assert.equal(work('Row 5K')[0].exercises[0].name,'Row');assert.match(work('Row 5K')[0].exercises[0].reps,/5,000/);
});

test('strength, unbroken attempts, cumulative holds and event-triggered work explicitly disclose manual semantics',()=>{
 const plans=JSON.parse(readFileSync('lib/conversion-plans.json','utf8'));
 for(const name of ['Coffland','Shawn','Peyton','T.J.','Chelsea','Twelve Days of Christmas','Gwen','Lynne']){
  const e=source(name);assert.equal(plans[e.id].status,'manual-conditional',name);assert(plans[e.id].limitations.length,name);assert.match(get(name).notes,/Manual cues:/i,name);
 }
 const c=work('Coffland')[0];assert.equal(c.mode,'fortime');assert(c.uncapped);assert.match(c.exercises[0].name,/hang/i);assert.match(c.exercises[0].reps,/6 minutes.*accumulat|accumulat.*6 minutes/i);assert.match(c.exercises[1].reps,/release/i);assert.match(c.exercises[2].reps,/release/i);
 const otis=work('Otis')[0];assert.equal(otis.mode,'amrap');assert.equal(otis.duration,900);assert.equal(otis.exercises.length,3);assert(otis.exercises.every(e=>/1.*2.*3/.test(e.reps)));
 assert.equal(work('Gwen')[0].mode,'stopwatch');assert.match(work('Gwen')[0].exercises[0].reps,/15.*12.*9/);
});
