import type {Workout,Block,Mode,Exercise} from './workout';
import reviewedPlans from './conversion-plans.json' with {type:'json'};

type ExampleTimer={mode:'emom'|'tabata';label:string;segments:{rounds:number;exercises:string[];flow:'together'|'rotate';restAfter:number}[]};
export type WodExample={id:string;name:string;sourceUrl:string;family:string[];measure:string|null;prescription:string[];loads:string[];firstPosted?:string|null;timer?:ExampleTimer};
type PlannedBlock={mode:Mode;label:string;duration:number;uncapped?:boolean;prescriptionRounds?:number;rounds?:number;work?:number;rest?:number;exerciseFlow?:'together'|'rotate';exercises:Exercise[]};
export type ExampleConversion={name:string;reviewed:boolean;format:string;status:'supported'|'manual-conditional';mode:Mode;limitations:string[];blocks:PlannedBlock[];source:{prescription:string[];loads:string[];timer?:ExampleTimer};sourceSha256:string};
const plans=reviewedPlans as Record<string,ExampleConversion>;
const analyzed=new WeakMap<WodExample,{plan:ExampleConversion;timing:ExampleTiming}>();
type ExampleTiming={mode:Mode;manual:boolean;seconds:number|null;label:string};

function blockSeconds(b:PlannedBlock):number|null{
 if(b.uncapped)return null;
 const rounds=b.rounds??1,work=b.work??60,rest=b.rest??0;
 if(b.mode==='emom')return rounds*(work+rest);
 if(b.mode==='tabata'||b.mode==='intervals'){
  if(b.exerciseFlow==='together')return rounds*(work+rest)-rest;
  return rounds*b.exercises.reduce((n,e)=>n+(e.work??work)+(e.rest??rest),0)-(b.exercises.at(-1)?.rest??rest);
 }
 return b.duration;
}
function analyze(e:WodExample){
 const cached=analyzed.get(e);if(cached)return cached;
 const plan=plans[e.id];
 if(!plan||plan.name!==e.name||JSON.stringify(plan.source)!==JSON.stringify({prescription:e.prescription,loads:e.loads,...(e.timer?{timer:e.timer}:{})})){
  throw new Error(`The example “${e.name}” needs a reviewed conversion plan before import.`);
 }
 const totals=plan.blocks.map(blockSeconds),seconds=totals.includes(null)?null:totals.reduce<number>((sum,n)=>sum+(n??0),0);
 const manual=seconds===null;
 const clock=seconds===null?'Uncapped · finish work manually':`${seconds/60} minutes of prescribed timing`;
 const label=(e.timer?.label??`${plan.format} · ${clock}`)+(plan.status==='manual-conditional'?' · manual cues/scoring in notes':'');
 const result={plan,timing:{mode:plan.mode,manual,seconds,label}};
 analyzed.set(e,result);return result;
}

export function exampleMode(e:WodExample):Mode{return analyze(e).plan.mode;}
export function exampleTiming(e:WodExample):ExampleTiming{return analyze(e).timing;}
export function exampleConversionInfo(e:WodExample){
 const {plan}=analyze(e);
 return {format:plan.format,status:plan.status,limitations:plan.limitations};
}

/** Materialize only on import. Catalog renders reuse analysis and never create IDs.
 * Plans keep a continuous for-time score in one block. A source round count is
 * descriptive; block.repeat would incorrectly restart its clock.
 */
export function workoutFromExample(e:WodExample):Workout{
 const {plan,timing}=analyze(e);
 const blocks:Block[]=plan.blocks.map(b=>({
  id:globalThis.crypto.randomUUID(),mode:b.mode,label:b.label,duration:b.duration,
  ...(b.uncapped?{uncapped:true}:{}),...(b.prescriptionRounds?{prescriptionRounds:b.prescriptionRounds}:{}),
  rounds:b.rounds??1,work:b.work??60,rest:b.rest??0,restLabel:'Prescribed recovery',exerciseFlow:b.exerciseFlow??'together',repeat:1,
  exercises:b.exercises.map(x=>({...x})),
 }));
 const notes=[
  ...e.prescription,
  ...(e.loads.length?['Loads / equipment: '+e.loads.join(' · ')]:[]),
  'Source: '+e.sourceUrl,
  ...(e.family.includes('daily')&&e.firstPosted?['Source WOD date: '+e.firstPosted]:[]),
  'Timer: '+timing.label,
  ...(plan.limitations.length?['Manual cues: '+plan.limitations.join(' ')]:[]),
 ].join('\n');
 return {title:e.name,notes,prepare:10,repeat:1,blocks};
}

export type ExampleImport={memberId:number;requestKey:string;workout:Workout};
export function exampleImport(cache:Map<string,ExampleImport>,example:WodExample,memberId:number){
 const key=memberId+':'+example.id;
 if(!cache.has(key))cache.set(key,{memberId,requestKey:globalThis.crypto.randomUUID(),workout:workoutFromExample(example)});
 return cache.get(key)!;
}
