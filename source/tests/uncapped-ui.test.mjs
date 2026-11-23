import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as workout from '../lib/workout.ts';
import * as language from '../lib/language.ts';
import * as stats from '../lib/crew-stats.ts';

// Transpile only in memory; render actual components and fields without browser effects.
const require=createRequire(import.meta.url),cache=new Map();
function component(name){
 if(cache.has(name))return cache.get(name);
 const source=readFileSync(`app/components/${name}.tsx`,'utf8')+(name==='Crew'?'\nexport {WodDetail};':'');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 const load=id=>{
  if(id==='../../lib/workout')return workout;
  if(id==='../../lib/language')return language;
  if(id==='../../lib/crew-stats')return stats;
  if(id==='../../lib/api')return {api:async()=>({})};
  if(id==='../../lib/profile.js')return {getProfileKey:()=>'',restoreProfileKey:()=>{}};
  if(id==='../../lib/audio-cues')return {timerCue:()=>null};
  if(id==='./audio')return {playCue:()=>{},unlockAudio:()=>{},silenceVoice:()=>{}};
  if(id==='./ui')return component('ui');
  if(id.startsWith('./'))return {default:()=>null};
  return require(id);
 };
 new Function('require','module','exports',js)(load,module,module.exports);cache.set(name,module.exports);return module.exports;
}
const w=(mode='fortime',patch={})=>({id:1,title:'Open session',notes:'Original source instructions',prepare:0,repeat:1,creator:'Athlete',createdAt:'2026-10-01',attemptCount:0,mine:true,expectedDefinition:'original',blocks:[{...workout.preset(mode),id:'block',duration:1,uncapped:true,exercises:[{name:'Squats',reps:'20'}],...patch}]});
const noop=()=>{},render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));

for(const mode of ['fortime','stopwatch']){
 test(`Editor: ${mode} hides the stored duration and describes open work`,()=>{
  const html=render(component('Editor').default,{initial:w(mode),memberId:1,athlete:'Athlete',onName:noop,onCancel:noop,onDiscard:noop,onSaved:noop});
  assert.match(html,/type="checkbox"[^>]*checked=""[^>]*\/>.*No time cap/);
  assert.match(html,/Open ended/);assert.doesNotMatch(html,/Time cap minutes|Maximum time minutes|Planned duration \/ maximum with time caps|240:00|Infinity|NaN/);
  assert.match(html,/Original source instructions/);
 });
 test(`Runner: ${mode} counts up beyond four hours with no cap or invalid progress`,()=>{
  const wod=w(mode),phases=workout.compileWorkout(wod);
  const recovered={...workout.createSession(phases,0),paused:true,phaseMs:18000000,totalMs:18000000};
  const html=render(component('Runner').default,{wod,recovered,sound:false,vibration:false,onDone:noop,onExit:noop});
  assert.match(html,/300:00/);assert.match(html,/No time cap/);assert.match(html,/Finished/);
  assert.doesNotMatch(html,/CAP |Infinity|NaN/);
 });
}

test('Editor and Runner keep legacy finite caps visible',()=>{
 const wod=w('fortime',{uncapped:undefined,duration:120});
 const editor=render(component('Editor').default,{initial:wod,memberId:1,athlete:'Athlete',onName:noop,onCancel:noop,onDiscard:noop,onSaved:noop});
 assert.match(editor,/Time cap minutes/);assert.doesNotMatch(editor,/type="checkbox"[^>]*checked/);
 const runner=render(component('Runner').default,{wod,sound:false,vibration:false,onDone:noop,onExit:noop});assert.match(runner,/CAP 02:00/);
});

test('For Time prescribed rounds are instructions for one continuous clock, not intervals',()=>{
 const wod=w('fortime',{prescriptionRounds:5}),props={initial:wod,memberId:1,athlete:'Athlete',onName:noop,onCancel:noop,onDiscard:noop,onSaved:noop};
 assert.match(render(component('Editor').default,props),/Rounds of exercise list/);
 const runner=render(component('Runner').default,{wod,sound:false,vibration:false,onDone:noop,onExit:noop});
 assert.match(runner,/5 rounds of full list/);assert.doesNotMatch(runner,/INTERVAL 1 \/ 5/);
 const legacy=render(component('Runner').default,{wod:w(),sound:false,vibration:false,onDone:noop,onExit:noop});assert.doesNotMatch(legacy,/5 rounds of full list/);
});

test('Crew detail shows prescribed rounds and open duration without a fake planned cap',()=>{
 const html=render(component('Crew').WodDetail,{wod:w('fortime',{prescriptionRounds:5}),memberId:1,athlete:'Athlete',done:false,initialResults:false,onResultsChanged:noop,onName:noop,onBack:noop,onRun:noop,onManual:noop,onEdit:noop,onCopy:noop,onShare:noop,onFavorite:noop,onDelete:noop,favorite:false});
 assert.match(html,/Open ended/);assert.match(html,/5 rounds · No time cap/);
 assert.doesNotMatch(html,/Infinity|NaN|00:01 time cap|Open ended planned/);
});

test('ResultForm supports elapsed times above four hours and omits the nonexistent cap outcome',()=>{
 const wod=w(),scores=workout.scoreTemplates(wod).map(s=>({...s,elapsed:18000,status:'finished'}));
 const html=render(component('ResultForm').default,{pending:{wod,scores,source:'timer',requestKey:'result'},memberId:1,athlete:'Athlete',onName:noop,onCancel:noop,onSaved:noop});
 assert.match(html,/No time cap/);assert.match(html,/Elapsed minutes/);assert.match(html,/max="1440"[^>]*value="300"/);
 assert.doesNotMatch(html,/Reached time cap|Infinity|NaN/);
 const capped=w('fortime',{uncapped:undefined,duration:60});
 assert.match(render(component('ResultForm').default,{pending:{wod:capped,scores:workout.scoreTemplates(capped),source:'manual',requestKey:'result'},memberId:1,athlete:'Athlete',onName:noop,onCancel:noop,onSaved:noop}),/Reached time cap/);
});

test('Runner preview of a following open phase has no Infinity duration',()=>{
 const wod=w();wod.blocks=[{...wod.blocks[0],mode:'amrap',uncapped:undefined,duration:60},{...wod.blocks[0],id:'next'}];
 const html=render(component('Runner').default,{wod,sound:false,vibration:false,onDone:noop,onExit:noop});
 assert.match(html,/UP NEXT/);assert.match(html,/No time cap/);assert.doesNotMatch(html,/Infinity|NaN/);
});
