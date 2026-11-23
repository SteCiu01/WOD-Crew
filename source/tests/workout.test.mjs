import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileWorkout,createSession,tick,pause,resume,finishPhase,validateWorkout,preset} from '../lib/workout.ts';
const w=(blocks,repeat=1)=>({title:'Test',notes:'',prepare:0,repeat,blocks});
test('EMOM cycles named exercises and ends exactly after prescribed intervals',()=>{
 const b=preset('emom'); b.rounds=3;b.work=50;b.rest=10;b.exercises=[{name:'Burpees',reps:'10'},{name:'Squats',reps:'15'}];
 const p=compileWorkout(w([b])); assert.equal(p.length,6);assert.deepEqual(p.filter(x=>x.kind==='work').map(x=>x.label),['Burpees','Squats','Burpees']);
 let s=createSession(p,1000);s=tick(s,p,51000);assert.equal(s.index,1);assert.equal(s.phaseMs,0);
 s=tick(s,p,181000);assert.equal(s.done,true);assert.equal(s.scores[0].intervals,3);assert.equal(s.scores[0].elapsed,180);
});
test('large background jump consumes multiple phases without losing time',()=>{const b=preset('intervals');b.rounds=3;b.work=20;b.rest=10;const p=compileWorkout(w([b]));let s=tick(createSession(p,1000),p,76000);assert.equal(p[s.index].kind,'work');assert.equal(s.phaseMs,15000);assert.equal(s.totalMs,75000);});
test('pause excludes downtime and resumes at same remaining time',()=>{const p=compileWorkout(w([preset('amrap')]));let s=pause(createSession(p,1000),p,11000);s=tick(s,p,51000);assert.equal(s.phaseMs,10000);s=resume(s,51000);s=tick(s,p,56000);assert.equal(s.phaseMs,15000);});
test('For Time distinguishes early finish from cap',()=>{const p=compileWorkout(w([preset('fortime')]));let s=finishPhase(createSession(p,1000),p,4500);assert.equal(s.done,true);assert.equal(s.scores[0].status,'finished');assert.equal(s.scores[0].elapsed,3.5);s=tick(createSession(p,0),p,1200000);assert.equal(s.scores[0].status,'capped');});
test('repeats receive distinct score keys and intervals omit only final rest',()=>{const b=preset('intervals');b.rounds=2;b.repeat=2;b.work=20;b.rest=10;const p=compileWorkout(w([b],2));assert.equal(p.reduce((n,x)=>n+x.duration,0),200);assert.equal(new Set(p.map(x=>x.key)).size,4);});
test('workout validation rejects invalid durations and explosive repeat expansion',()=>{const b=preset('amrap');b.duration=-1;assert.throws(()=>validateWorkout(w([b])));const huge=preset('emom');huge.rounds=100;huge.repeat=100;assert.throws(()=>validateWorkout(w([huge],100)));});
test('AMRAP has full exercise list, preparation is not scored, interval overrides apply',()=>{const b=preset('amrap');b.exercises=[{name:'Run',reps:'200 m'},{name:'Squats',reps:'20'}];const p=compileWorkout({...w([b]),prepare:10});assert.equal(p[0].kind,'prepare');assert.equal(p[1].exercises.length,2);const s=tick(createSession(p,0),p,700000);assert.equal(s.scores.length,1);const i=preset('intervals');i.rounds=1;i.exercises=[{name:'Bike',reps:'',work:45,rest:15},{name:'Row',reps:'',work:30,rest:5}];assert.deepEqual(compileWorkout(w([i])).map(x=>x.duration),[45,15,30]);});
test('a late finish click cannot finish the following block',()=>{const a=preset('fortime');a.duration=1;const b=preset('fortime');b.duration=10;const p=compileWorkout(w([a,b]));const s=finishPhase(createSession(p,0),p,1001,0);assert.equal(s.index,1);assert.equal(s.done,false);assert.equal(s.scores[0].status,'capped');assert.equal(s.scores[1].status,'timed');});
test('bounded compilation rejects phase explosion before allocating the full workout',()=>{const b=preset('intervals');b.rounds=100;b.repeat=1;b.exercises=Array.from({length:30},()=>({name:'Move',reps:''}));assert.throws(()=>compileWorkout(w([b],1)),/4,000/);});

test('score count is bounded so every accepted workout can submit results',()=>{const blocks=Array.from({length:11},()=>{const b=preset('amrap');b.duration=1;b.repeat=20;b.exercises=[{name:'Move',reps:''}];return b;});assert.throws(()=>validateWorkout(w(blocks)),/200 scored/);});
test('custom rest instructions appear in the runner',()=>{const b=preset('emom');b.rest=10;b.work=50;b.restLabel='Recover and prepare the rower';assert.equal(compileWorkout(w([b]))[1].label,b.restLabel);});
test('round tap on an expired AMRAP does not add a round to the next block',async()=>{const {incrementRounds}=await import('../lib/workout.ts');const a=preset('amrap');a.duration=1;const b=preset('amrap');const p=compileWorkout(w([a,b]));const s=incrementRounds(createSession(p,0),p,1001,0,1);assert.equal(s.scores[1].rounds,0);});
test('all-together EMOM shows the full exercise list inside every 2:30 interval',()=>{
 const b=preset('emom');b.exerciseFlow='together';b.rounds=6;b.work=150;b.rest=0;b.exercises=[{name:'Dips',reps:'5'},{name:'Pull-ups',reps:'4'},{name:'Box jumps',reps:'jamie'}];
 const validated=validateWorkout(w([b]));assert.equal(validated.blocks[0].exerciseFlow,'together');
 const phases=compileWorkout(validated);assert.equal(phases.length,6);assert.equal(phases.reduce((n,p)=>n+p.duration,0),900);assert.ok(phases.every(p=>p.exercises.length===3));assert.deepEqual(phases[0].exercises.map(e=>e.name),['Dips','Pull-ups','Box jumps']);
});
test('all-together intervals repeat one shared exercise list and omit only the final rest',()=>{
 const b=preset('intervals');b.exerciseFlow='together';b.rounds=3;b.work=90;b.rest=10;b.exercises=[{name:'Dips',reps:'5'},{name:'Pull-ups',reps:'4'}];
 const phases=compileWorkout(validateWorkout(w([b])));assert.deepEqual(phases.map(p=>p.kind),['work','rest','work','rest','work']);assert.equal(phases.reduce((n,p)=>n+p.duration,0),290);assert.ok(phases.filter(p=>p.kind==='work').every(p=>p.exercises.length===2));
});
test('older interval workouts default to rotating exercises',()=>{const b=preset('emom');delete b.exerciseFlow;b.rounds=2;b.exercises=[{name:'A',reps:''},{name:'B',reps:''}];const v=validateWorkout(w([b]));assert.equal(v.blocks[0].exerciseFlow,'rotate');assert.deepEqual(compileWorkout(v).map(p=>p.exercises[0].name),['A','B']);});
