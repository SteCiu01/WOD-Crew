export type Mode = 'amrap'|'fortime'|'emom'|'tabata'|'intervals'|'stopwatch'|'rest';
export type Exercise = {name:string;reps:string;work?:number;rest?:number};
export type ExerciseFlow = 'rotate'|'together';
export type Block = {id:string;mode:Mode;label:string;duration:number;uncapped?:boolean;prescriptionRounds?:number;rounds:number;work:number;rest:number;restLabel?:string;exerciseFlow?:ExerciseFlow;repeat:number;exercises:Exercise[]};
export type Workout = {title:string;notes:string;prepare:number;repeat:number;blocks:Block[]};
export type Wod = Workout & {id:number;creator:string;createdAt:string;attemptCount:number;mine:boolean;expectedDefinition:string};
export type Phase = {key:string;blockId:string;mode:Mode;kind:'work'|'rest'|'prepare';label:string;blockLabel:string;duration:number;round:number;rounds:number;exercises:Exercise[];last:boolean};
export type Score = {key:string;label:string;mode:Mode;elapsed:number;intervals:number;rounds:number;reps:number;status:'finished'|'capped'|'timed'|'stopped';confirmed:boolean};
export type Session = {index:number;phaseMs:number;totalMs:number;anchor:number;paused:boolean;done:boolean;scores:Score[]};
export const modes:Mode[]=['amrap','fortime','emom','tabata','intervals','stopwatch','rest'];
export const names:Record<Mode,string>={amrap:'AMRAP',fortime:'For Time',emom:'EMOM',tabata:'Tabata',intervals:'Intervals',stopwatch:'Stopwatch',rest:'Rest'};
export const descriptions:Record<Mode,string>={amrap:'As many rounds as possible',fortime:'Complete the work. Beat the clock.',emom:'A fresh start every interval',tabata:'Short efforts. Big energy.',intervals:'Your work. Your recovery.',stopwatch:'Count up at your own pace',rest:'Recover and reset'};
export function preset(mode:Mode):Block {return {id:globalThis.crypto.randomUUID(),mode,label:names[mode],duration:mode==='rest'?60:mode==='fortime'?1200:600,rounds:mode==='tabata'?8:mode==='emom'?12:5,work:mode==='tabata'?20:mode==='emom'?60:40,rest:mode==='tabata'?10:mode==='emom'?0:20,exerciseFlow:'rotate',repeat:1,exercises:[{name:mode==='rest'?'Recover':'',reps:''}]};}
function str(v:unknown,max:number,label:string,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new Error(`${label} is required (maximum ${max} characters).`);return v.trim();}
function int(v:unknown,min:number,max:number,label:string){if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)throw new Error(`${label} must be ${min}–${max}.`);return v;}
function isOpen(b:Block){return b.uncapped===true&&(b.mode==='fortime'||b.mode==='stopwatch');}
export function validateWorkout(input:unknown):Workout {
 if(!input||typeof input!=='object')throw new Error('Invalid workout.');const w=input as Workout;
 const title=str(w.title,100,'Workout title',true),notes=str(w.notes,2000,'Notes');
 const prepare=int(w.prepare,0,60,'Countdown'),repeat=int(w.repeat,1,20,'Workout repeats');
 if(!Array.isArray(w.blocks)||!w.blocks.length||w.blocks.length>40)throw new Error('Add 1–40 workout blocks.');
 const seen=new Set<string>();
 const blocks=w.blocks.map(b=>{if(!b||!modes.includes(b.mode))throw new Error('Choose a valid workout mode.');const id=str(b.id,80,'Block ID',true);if(seen.has(id))throw new Error('Duplicate block ID.');seen.add(id);
 if(!Array.isArray(b.exercises)||b.exercises.length>30||(b.mode!=='rest'&&!b.exercises.length))throw new Error('Add 1–30 exercises per block.');
 if(b.uncapped!==undefined&&(typeof b.uncapped!=='boolean'||!['fortime','stopwatch'].includes(b.mode)))throw new Error('No time cap (uncapped) is only available for For Time and Stopwatch.');
 if(b.prescriptionRounds!==undefined&&b.mode!=='fortime')throw new Error('Prescribed rounds are only available for For Time.');
 const exerciseFlow=b.exerciseFlow??'rotate';if(!['rotate','together'].includes(exerciseFlow))throw new Error('Choose a valid interval exercise pattern.');return {id,mode:b.mode,label:str(b.label,100,'Block title',true),duration:int(b.duration,1,14400,'Duration'),...(b.uncapped===undefined?{}:{uncapped:b.uncapped}),...(b.prescriptionRounds===undefined?{}:{prescriptionRounds:int(b.prescriptionRounds,1,100,'Prescribed rounds')}),rounds:int(b.rounds,1,100,'Intervals'),work:int(b.work,1,3600,'Work seconds'),rest:int(b.rest,0,3600,'Rest seconds'),restLabel:str(b.restLabel??'Recover',100,'Rest label',true),exerciseFlow,repeat:int(b.repeat,1,20,'Block repeats'),exercises:b.exercises.map(e=>({name:str(e.name,150,'Exercise name',true),reps:str(e.reps,150,'Exercise details'),...(e.work===undefined?{}:{work:int(e.work,1,3600,'Exercise work')}),...(e.rest===undefined?{}:{rest:int(e.rest,0,3600,'Exercise rest')})}))};});
 const result={title,notes,prepare,repeat,blocks};compileWorkout(result);return result;
}
function stats(w:Workout){
 let seconds=w.prepare,phases=w.prepare?1:0,scored=0,open=false;
 for(const b of w.blocks){const repeat=b.repeat*w.repeat;let sec=isOpen(b)?0:b.duration,count=1;open||=isOpen(b);
 if(b.mode==='emom'){sec=b.rounds*(b.work+b.rest);count=b.rounds*(b.rest>0?2:1);}
 if(b.mode==='tabata'||b.mode==='intervals'){if(b.exerciseFlow==='together'){sec=b.rounds*(b.work+b.rest)-b.rest;count=b.rounds*(b.rest>0?2:1)-(b.rest>0?1:0);}else{const es=b.exercises.length?b.exercises:[{name:'Work',reps:''}];const last=es[es.length-1];sec=b.rounds*es.reduce((n,e)=>n+(e.work??b.work)+(e.rest??b.rest),0)-(last.rest??b.rest);count=b.rounds*es.reduce((n,e)=>n+1+((e.rest??b.rest)>0?1:0),0)-((last.rest??b.rest)>0?1:0);}}
 seconds+=repeat*sec;phases+=repeat*count;if(b.mode!=='rest')scored+=repeat;
 }return {seconds,phases,scored,open};
}
export function compileWorkout(w:Workout):Phase[]{
 const budget=stats(w);if(!Number.isFinite(budget.phases)||!Number.isFinite(budget.seconds)||budget.phases>4000||budget.seconds>86400)throw new Error('Keep the complete workout within 24 hours and 4,000 phases.');if(budget.scored>200)throw new Error('Keep the workout within 200 scored blocks, including repeats.');
 const phases:Phase[]=[];
 if(w.prepare)phases.push({key:'prepare',blockId:'',mode:'rest',kind:'prepare',label:'Get ready',blockLabel:'Your workout starts soon',duration:w.prepare,round:0,rounds:0,exercises:[],last:true});
 for(let cycle=0;cycle<w.repeat;cycle++)for(const b of w.blocks)for(let repeat=0;repeat<b.repeat;repeat++){
 const key=`${b.id}:${cycle}:${repeat}`;const label=b.label+(w.repeat>1?` · set ${cycle+1}`:'')+(b.repeat>1?` · repeat ${repeat+1}`:'');const group:Phase[]=[];
 const add=(kind:Phase['kind'],duration:number,text:string,round:number,rounds:number,exercises:Exercise[])=>group.push({key,blockId:b.id,mode:b.mode,kind,label:text,blockLabel:label,duration,round,rounds,exercises,last:false});
 if(['emom','tabata','intervals'].includes(b.mode)){
 const together=b.exerciseFlow==='together';const count=together||b.mode==='emom'?b.rounds:b.rounds*Math.max(1,b.exercises.length);
 for(let i=0;i<count;i++){const e=b.exercises[i%Math.max(1,b.exercises.length)]??{name:'Work',reps:''};const exercises=together?b.exercises:[e];
 add('work',together||b.mode==='emom'?b.work:e.work??b.work,together?b.label:e.name||'Work',i+1,count,exercises);
 const rest=together||b.mode==='emom'?b.rest:e.rest??b.rest;if(rest>0&&(i<count-1||b.mode==='emom'))add('rest',rest,b.restLabel||'Recover',i+1,count,[]);
 }
 }else add(b.mode==='rest'?'rest':'work',isOpen(b)?Infinity:b.duration,b.mode==='rest'?b.label:names[b.mode],1,1,b.exercises);
 group[group.length-1].last=true;phases.push(...group);
 }return phases;
}
export function createSession(phases:Phase[],now:number):Session{return {index:0,phaseMs:0,totalMs:0,anchor:now,paused:false,done:phases.length===0,scores:[]};}
function account(s:Session,p:Phase,ms:number):Session {
 if(p.kind==='prepare'||p.mode==='rest')return s;
 const scores=s.scores.map(x=>({...x}));let score=scores.find(x=>x.key===p.key);
 if(!score){score={key:p.key,label:p.blockLabel,mode:p.mode,elapsed:0,intervals:0,rounds:0,reps:0,status:'timed',confirmed:false};scores.push(score);}
 score.elapsed+=ms/1000;return {...s,scores};
}
function advance(s:Session,p:Phase,early=false):Session {
 const scores=s.scores.map(x=>({...x}));const score=scores.find(x=>x.key===p.key);
 if(score){if(p.kind==='work'&&['emom','tabata','intervals'].includes(p.mode))score.intervals++;if(p.last){score.status=p.mode==='fortime'?(early?'finished':'capped'):p.mode==='stopwatch'?(early?'finished':'capped'):'timed';}}
 return {...s,scores,index:s.index+1,phaseMs:0};
}
export function tick(state:Session,phases:Phase[],now:number):Session {
 if(state.paused||state.done)return state;let s={...state};let remaining=Math.max(0,now-state.anchor);s.anchor=now;
 while(!s.done){const p=phases[s.index];if(!p){s.done=true;break;}const amount=Math.min(remaining,Math.max(0,p.duration*1000-s.phaseMs));s=account(s,p,amount);s.phaseMs+=amount;s.totalMs+=amount;remaining-=amount;
 if(s.phaseMs>=p.duration*1000){s=advance(s,p);s.done=s.index>=phases.length;}else break;
 }return s;
}
export function pause(s:Session,p:Phase[],now:number){return {...tick(s,p,now),paused:true};}
export function resume(s:Session,now:number){return {...s,anchor:now,paused:false};}
export function finishPhase(s:Session,p:Phase[],now:number,expectedIndex=s.index):Session {let next=tick(s,p,now);if(next.done||next.index!==expectedIndex)return next;const phase=p[next.index];if(!['fortime','stopwatch'].includes(phase.mode))return next;next=advance(next,phase,true);return {...next,done:next.index>=p.length,anchor:now};}
export function fmt(seconds:number):string {const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;}
export function duration(w:Workout){const budget=stats(w);return budget.open?Infinity:budget.seconds;}
export function durationLabel(w:Workout):string {const budget=stats(w);return budget.open?(budget.seconds>0?`${fmt(budget.seconds)} timed + open work`:'Open ended'):fmt(budget.seconds);}
export function scoreText(s:Score){if(s.mode==='amrap')return `${s.rounds} rounds + ${s.reps} reps`;if(['fortime','stopwatch'].includes(s.mode))return `${fmt(s.elapsed)}${s.status==='capped'?' · capped':s.status==='stopped'?' · stopped':''}`;return `${s.intervals} intervals${s.confirmed?' · completed':' · timed'}`;}
export function scoreTemplates(w:Workout):Score[]{const map=new Map<string,Score>();for(const p of compileWorkout(w)){if(p.kind==='prepare'||p.mode==='rest')continue;if(!map.has(p.key))map.set(p.key,{key:p.key,label:p.blockLabel,mode:p.mode,elapsed:0,intervals:0,rounds:0,reps:0,status:'timed',confirmed:false});}return [...map.values()];}

export function incrementRounds(s:Session,p:Phase[],now:number,expectedIndex:number,delta:number):Session {const next=tick(s,p,now);if(next.done||next.index!==expectedIndex||p[next.index].mode!=='amrap')return next;return {...next,scores:next.scores.map(a=>a.key===p[next.index].key?{...a,rounds:Math.max(0,a.rounds+delta)}:a)};}

export function compatibleWorkoutEdit(before:Workout,after:Workout){
 const shape=(w:Workout)=>({
  blocks:w.blocks.map(b=>[b.id,b.mode,b.repeat,isOpen(b),b.exerciseFlow??'rotate',b.mode==='emom'&&b.exerciseFlow!=='together'?b.exercises.length:null]),
  phases:compileWorkout(w).map(p=>[p.key,p.mode,p.kind,p.duration===Infinity?'open':p.duration,p.round,p.rounds]),
 });
 return JSON.stringify(shape(before))===JSON.stringify(shape(after));
}
