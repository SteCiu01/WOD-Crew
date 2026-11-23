import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../lib/workout.ts';

const block=(mode='fortime',patch={})=>({...engine.preset(mode),id:mode,exercises:[{name:'Squats',reps:'20'}],...patch});
const workout=(blocks,patch={})=>({title:'Open work',notes:'Source prescription',prepare:0,repeat:1,blocks,...patch});

for(const mode of ['fortime','stopwatch']){
 test(`${mode}: validated saved workout compiles to open work and runs beyond four hours`,()=>{
  const saved=engine.validateWorkout(workout([block(mode,{uncapped:true,duration:1})]));
  assert.equal(saved.blocks[0].uncapped,true);
  assert.equal(saved.blocks[0].duration,1);
  const phases=engine.compileWorkout(JSON.parse(JSON.stringify(saved)));
  assert.equal(phases[0].duration,Infinity);
  const s=engine.tick(engine.createSession(phases,0),phases,5*3600*1000);
  assert.equal(s.done,false);assert.equal(s.index,0);assert.equal(s.phaseMs,18000000);
  assert.equal(s.scores[0].elapsed,18000);assert.equal(s.scores[0].status,'timed');
 });
 test(`${mode}: pause, JSON recovery and resume exclude downtime before manual finish`,()=>{
  const w=workout([block(mode,{uncapped:true,duration:1})]);
  let phases=engine.compileWorkout(w),s=engine.pause(engine.createSession(phases,0),phases,18000500);
  const json=JSON.stringify({wod:w,state:s});
  assert.doesNotMatch(json,/Infinity|null/);
  const restored=JSON.parse(json);phases=engine.compileWorkout(restored.wod);
  s=engine.pause(restored.state,phases,20000000);
  assert.equal(s.phaseMs,18000500);
  s=engine.tick(s,phases,21000000);assert.equal(s.phaseMs,18000500);
  s=engine.resume(s,21000000);s=engine.finishPhase(s,phases,21001500,0);
  assert.equal(s.done,true);assert.equal(s.scores[0].elapsed,18002);assert.equal(s.scores[0].status,'finished');
 });
 test(`${mode}: old saved blocks retain automatic finite caps`,()=>{
  const old=workout([block(mode,{duration:60})]);
  const saved=engine.validateWorkout(JSON.parse(JSON.stringify(old)));
  assert.equal(saved.blocks[0].uncapped,undefined);
  const phases=engine.compileWorkout(saved),s=engine.tick(engine.createSession(phases,0),phases,61000);
  assert.equal(s.done,true);assert.equal(s.scores[0].elapsed,60);assert.equal(s.scores[0].status,'capped');
  assert.equal(engine.compatibleWorkoutEdit(old,saved),true);
 });
}

test('manual Finished advances one open phase, then timed rest, then the next open repeat',()=>{
 const w=workout([block('fortime',{uncapped:true,duration:1}),block('rest',{duration:30})],{repeat:2});
 const phases=engine.compileWorkout(w);assert.deepEqual(phases.map(p=>p.duration),[Infinity,30,Infinity,30]);
 let s=engine.finishPhase(engine.createSession(phases,0),phases,18000000,0);
 assert.equal(s.index,1);assert.equal(s.phaseMs,0);assert.equal(s.scores[0].status,'finished');
 s=engine.finishPhase(s,phases,18031000,0);
 assert.equal(s.index,2);assert.equal(s.phaseMs,1000);assert.equal(s.scores[1].status,'timed');
 s=engine.finishPhase(s,phases,18032000,2);assert.equal(s.index,3);assert.equal(s.scores[1].elapsed,2);
 s=engine.tick(s,phases,18062000);assert.equal(s.done,true);assert.equal(s.scores.length,2);
});

test('uncapped must be a boolean and is only valid for For Time or Stopwatch; duration stays finite',()=>{
 for(const uncapped of ['true',1,null])assert.throws(()=>engine.validateWorkout(workout([block('fortime',{uncapped})])),/uncapped|time cap/i);
 for(const mode of ['amrap','emom','tabata','intervals','rest'])assert.throws(()=>engine.validateWorkout(workout([block(mode,{uncapped:true})])),/uncapped|time cap/i);
 for(const duration of [undefined,0,Infinity,NaN])assert.throws(()=>engine.validateWorkout(workout([block('fortime',{uncapped:true,duration})])));
});

test('known durations retain the 24-hour and 4,000-phase budgets alongside open work',()=>{
 const open=block('fortime',{uncapped:true,duration:14400,repeat:6});
 assert.doesNotThrow(()=>engine.validateWorkout(workout([open,block('rest',{duration:14400,repeat:6})])));
 assert.throws(()=>engine.validateWorkout(workout([open,block('rest',{duration:14400,repeat:7})])),/24 hours/);
 const intervals=block('intervals',{rounds:100,exercises:Array.from({length:30},()=>({name:'Move',reps:''}))});
 assert.throws(()=>engine.validateWorkout(workout([open,intervals])),/4,000/);
});

test('uncapped edit is structural; false/absent and unused stored durations remain compatible',()=>{
 const old=workout([block()]),open=structuredClone(old);open.blocks[0].uncapped=true;
 assert.equal(engine.compatibleWorkoutEdit(old,open),false);assert.equal(engine.compatibleWorkoutEdit(open,old),false);
 const explicit=structuredClone(old);explicit.blocks[0].uncapped=false;assert.equal(engine.compatibleWorkoutEdit(old,explicit),true);
 const changed=structuredClone(open);changed.blocks[0].duration=1;changed.blocks[0].label='Corrected';
 assert.equal(engine.compatibleWorkoutEdit(open,changed),true);
});

test('duration labels describe open work and known timed parts without a fake planned cap',()=>{
 assert.equal(typeof engine.durationLabel,'function');
 const open=workout([block('fortime',{uncapped:true,duration:1})]);
 assert.equal(engine.durationLabel(open),'Open ended');assert.equal(engine.duration(open),Infinity);
 assert.equal(engine.durationLabel({...open,prepare:10}),'00:10 timed + open work');
 assert.equal(engine.durationLabel(workout([...open.blocks,block('rest',{duration:60})],{repeat:2})),'02:00 timed + open work');
 assert.equal(engine.durationLabel(workout([block('fortime',{duration:120})])),'02:00');
});

test('prescriptionRounds is informational For Time metadata, independent of historical rounds',()=>{
 const legacy=workout([block('fortime',{uncapped:true,duration:1})]);
 const w=engine.validateWorkout(workout([block('fortime',{uncapped:true,duration:1,prescriptionRounds:5})]));
 assert.equal(w.blocks[0].prescriptionRounds,5);assert.equal(engine.validateWorkout(legacy).blocks[0].prescriptionRounds,undefined);
 const p=engine.compileWorkout(w);assert.equal(p.length,1);assert.equal(p[0].rounds,1);assert.equal(engine.scoreTemplates(w).length,1);
 assert.equal(engine.compatibleWorkoutEdit(legacy,w),true);
 for(const prescriptionRounds of [0,1.5,101,'5'])assert.throws(()=>engine.validateWorkout(workout([block('fortime',{prescriptionRounds})])));
 assert.throws(()=>engine.validateWorkout(workout([block('stopwatch',{prescriptionRounds:5})])));
});

test('all legacy mode shapes retain finite durations, phase counts and no new serialized fields',()=>{
 for(const [mode,seconds,count] of [['amrap',600,1],['fortime',1200,1],['emom',720,12],['tabata',230,15],['intervals',280,9],['stopwatch',600,1],['rest',60,1]]){
  const old=workout([block(mode)]),saved=engine.validateWorkout(JSON.parse(JSON.stringify(old)));
  assert.doesNotMatch(JSON.stringify(saved),/uncapped|prescriptionRounds/);
  assert.equal(engine.duration(saved),seconds,mode);assert.equal(engine.compileWorkout(saved).length,count,mode);
  assert.equal(engine.compatibleWorkoutEdit(old,saved),true,mode);
  const phases=engine.compileWorkout(saved),state=engine.tick(engine.createSession(phases,0),phases,(seconds+1)*1000);
  assert.equal(state.done,true,mode);assert.equal(state.totalMs,seconds*1000,mode);
 }
});

test('Infinity exists only in runtime phases, never in workout, session or score template JSON',()=>{
 const w=engine.validateWorkout(workout([block('fortime',{uncapped:true,duration:1})])),phases=engine.compileWorkout(w);
 const state=engine.tick(engine.createSession(phases,0),phases,90000000);
 assert.equal(state.done,false);assert.equal(state.scores[0].elapsed,90000);
 const finiteOnly=(_key,value)=>{if(typeof value==='number')assert.equal(Number.isFinite(value),true);return value;};
 const payload={wod:w,state,templates:engine.scoreTemplates(w)};
 assert.deepEqual(JSON.parse(JSON.stringify(payload,finiteOnly)),payload);
});

test('exactly 4,000 phases still fit with open work, while the next phase is rejected',()=>{
 const intervals=block('intervals',{rounds:100,work:1,rest:1,exercises:Array.from({length:20},()=>({name:'Move',reps:''}))});
 const w=workout([block('fortime',{uncapped:true,duration:1}),intervals]);
 assert.equal(engine.compileWorkout(engine.validateWorkout(w)).length,4000);
 assert.throws(()=>engine.validateWorkout({...w,prepare:1}),/4,000/);
});
