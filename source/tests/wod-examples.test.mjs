import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateWorkout,compileWorkout,duration} from '../lib/workout.ts';
const catalog=JSON.parse(readFileSync('lib/wod-catalog.json','utf8'));
const daily=JSON.parse(readFileSync('lib/wod-daily-examples.json','utf8'));
const helper=await import('../lib/wod-examples.ts').catch(()=>({}));
const find=name=>catalog.examples.find(e=>e.name===name);
test('the complete retrieved benchmark page contains at least 100 distinct sourced prescriptions',()=>{
 assert.equal(catalog.sourceCount,catalog.examples.length);assert(catalog.examples.length>=100);assert.equal(new Set(catalog.examples.map(e=>e.id)).size,catalog.examples.length);
 for(const e of catalog.examples){assert.equal(new URL(e.sourceUrl).hostname,'www.crossfit.com');assert(new URL(e.sourceUrl).pathname.startsWith('/benchmark/'));assert(e.prescription.length>0);assert(e.prescription.every(line=>!/<\/?(?:p|br|script)/.test(line)));}
});
test('every official example produces a valid independent editable workout with fresh block keys',()=>{
 assert.equal(typeof helper.workoutFromExample,'function');
 for(const e of [...catalog.examples,...daily.examples]){const a=helper.workoutFromExample(e),b=helper.workoutFromExample(e);validateWorkout(a);assert(a.notes.includes(e.sourceUrl),e.name);assert.equal(a.title,e.name);assert(!a.blocks.some(block=>b.blocks.some(other=>other.id===block.id)));assert(!('createdAt' in a));assert(!('creator' in a));assert(!('id' in a));}
});
test('daily supplements add six distinct EMOMs and six Tabatas without replacing benchmarks',()=>{
 const all=[...catalog.examples,...daily.examples];assert.equal(catalog.examples.length,399);assert.equal(new Set(all.map(e=>e.id)).size,all.length);
 assert.equal(daily.examples.filter(e=>helper.exampleMode(e)==='emom').length,6);assert.equal(daily.examples.filter(e=>helper.exampleMode(e)==='tabata').length,6);
 for(const e of daily.examples){assert.equal(new URL(e.sourceUrl).hostname,'www.crossfit.com');assert(e.sourceUrl.endsWith(e.firstPosted.slice(0,7).replace('-','/')));assert(!['Chelsea','Tabata This!'].includes(e.name));}
});
test('daily timers retain alternating stations, progression, and real recovery minutes',()=>{
 const get=date=>helper.workoutFromExample(daily.examples.find(e=>e.firstPosted===date));
 const july=get('2024-07-01'),phases=compileWorkout(july).filter(p=>p.kind==='work');
 assert.equal(duration(july),1210);assert.equal(phases.length,20);assert.equal(phases[0].exercises[0].name.toLowerCase(),'clean and jerks');assert.match(phases[0].exercises[0].reps,/6/);assert.equal(phases[4].exercises[0].name,phases[0].exercises[0].name);assert.equal(phases[1].exercises[0].name.toLowerCase(),'strict handstand push-ups');assert.match(phases[1].exercises[0].reps,/12/);
 const snatch=get('2024-05-03');assert.deepEqual(snatch.blocks.map(b=>b.rounds),[5,5,10]);assert.equal(duration(snatch),1210);
 const clean=get('2024-06-04');assert.equal(duration(clean),1030);assert.equal(compileWorkout(clean).filter(p=>p.kind==='work').length,15);
 const rings=get('2024-09-27');assert.equal(duration(rings),910);assert.equal(compileWorkout(rings).filter(p=>p.kind==='work').length,12);assert.equal(rings.blocks.filter(b=>b.mode==='rest').length,3);
 const failure=get('2024-05-17');assert.equal(duration(failure),910);assert(failure.notes.includes('Stop when'));
});
test('supplemental Tabatas complete all eight efforts before changing movement and retain final rests',()=>{
 for(const e of daily.examples.filter(e=>e.timer.mode==='tabata')){
  const workout=helper.workoutFromExample(e),work=compileWorkout(workout).filter(p=>p.kind==='work');
  assert.equal(work.length,e.timer.segments.length*8);assert(work.every(p=>p.duration===20));
  assert.equal(work[0].exercises[0].name,e.timer.segments[0].exercises[0].replace(/^Calorie row$/i,'Row'));if(/^Calorie row$/i.test(e.timer.segments[0].exercises[0]))assert.match(work[0].exercises[0].reps,/calories/i);assert.equal(work[7].exercises[0].name,work[0].exercises[0].name);assert.equal(work[8].exercises[0].name,e.timer.segments[1].exercises[0]);
  assert.equal(duration(workout),10+e.timer.segments.length*240+e.timer.segments.reduce((n,s)=>n+s.restAfter,0));assert.equal(helper.exampleTiming(e).manual,false);
 }
});
test('Cindy and Chelsea keep their prescribed 20-minute and 30-minute timer semantics',()=>{
 assert.equal(typeof helper.workoutFromExample,'function');const c=helper.workoutFromExample(find('Cindy')),e=helper.workoutFromExample(find('Chelsea'));
 assert.equal(c.blocks[0].mode,'amrap');assert.equal(duration(c),1210);
 assert.equal(e.blocks[0].mode,'emom');assert.equal(e.blocks[0].exerciseFlow,'together');assert.equal(e.blocks[0].rounds,30);assert.equal(compileWorkout(e).filter(p=>p.kind==='work').length,30);assert.equal(duration(e),1810);
});
test('station workouts preserve rests and Tabata intervals instead of inventing continuous AMRAP timing',()=>{
 assert.equal(typeof helper.workoutFromExample,'function');const f=helper.workoutFromExample(find('Fight Gone Bad')),t=helper.workoutFromExample(find('Tabata This!'));
 assert.equal(duration(f),1030);assert.equal(compileWorkout(f).filter(p=>p.kind==='work').length,15);
 assert.equal(duration(t),1450);assert.equal(compileWorkout(t).filter(p=>p.kind==='work').length,40);
});
test('uncapped and round-rest examples use genuine open work and prescribed recoveries',()=>{
 const murph=find('Murph'),holbrook=find('Holbrook');
 const a=helper.workoutFromExample(murph),b=helper.workoutFromExample(holbrook);
 assert.equal(a.blocks[0].uncapped,true);assert(!a.notes.includes('4 hours'));
 for(const line of murph.prescription)assert(a.notes.includes(line));
 assert.equal(b.blocks.filter(b=>b.mode==='fortime').length,10);
 assert.equal(b.blocks.filter(b=>b.mode==='rest').length,9);
 assert(b.blocks.filter(b=>b.mode==='rest').every(b=>b.duration===60));
 assert(b.blocks.filter(b=>b.mode==='fortime').every(b=>b.uncapped));
});
test('a running-clock prefix takes priority over a shorter work segment inside the workout',()=>{
 const example=find("Jack's Triangle");assert(example);const timing=helper.exampleTiming(example);assert.equal(timing.seconds,1380);
});
test('a failed import retry keeps both its save key and original block IDs; a new copy gets new IDs',()=>{
 assert.equal(typeof helper.exampleImport,'function');const cache=new Map(),example=find('Cindy');
 const first=helper.exampleImport(cache,example,2),retry=helper.exampleImport(cache,example,2);assert.deepEqual(retry,first);assert.equal(retry.workout.blocks[0].id,first.workout.blocks[0].id);
 const otherMember=helper.exampleImport(cache,example,1);assert.notEqual(otherMember.requestKey,first.requestKey);
 cache.clear();const next=helper.exampleImport(cache,example,2);assert.notEqual(next.requestKey,first.requestKey);assert.notEqual(next.workout.blocks[0].id,first.workout.blocks[0].id);
});
