/** Offline review builder. Reads the canonical local catalogs; never fetches sources.
 * Runtime imports only the frozen, reviewed conversion-plans.json artifact.
 * New or changed prescriptions must be reviewed here and in conversion.test.mjs.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const entries=['wod-catalog','wod-daily-examples'].flatMap(f=>JSON.parse(readFileSync(new URL(`./${f}.json`,import.meta.url),'utf8')).examples);
const plans={};
const join=(...parts)=>parts.filter(Boolean).join(' · ');
const exercise=(name,reps='')=>({name,reps});
const timed=(mode,label,exercises,seconds,extra={})=>({mode,label,exercises,duration:seconds??1,...(seconds===null?{uncapped:true}:{}),...extra});
const rest=(seconds,label='Prescribed recovery')=>timed('rest',label,[],seconds);
const indefinite=(label,exercises,extra={})=>timed('fortime',label,exercises,null,extra);
const interval=(mode,label,exercises,rounds,work=60,recovery=0,flow='rotate')=>timed(mode,label,exercises,1,{rounds,work,rest:recovery,exerciseFlow:flow});
const manual=(plan,...limitations)=>{plan.status='manual-conditional';plan.limitations.push(...limitations);return plan;};
const words={Three:3,three:3,Five:5,five:5};
const num=s=>Number(s)||words[s];

// Every accepted line category has been checked against all 411 local entries.
// These are used ONLY to produce explicit frozen plans, never as import fallbacks.
function movement(line){
 let s=line.trim().replace(/[.*]+$/,'').replace(/\s+for time$/i,'');
 const details=[];
 s=s.replace(/\(([^)]+)\)/g,(_,v)=>{details.push(v);return '';}).trim();
 let m;
 if(/^Calorie row$/i.test(s))return exercise('Row','calories');
 if((m=s.match(/^(\d+) × (\d+)-foot (.+)$/i)))return finish(m[3],join(`${m[1]} × ${m[2]} feet`,...details));
 if(/^1,065-foot versa climb or /i.test(s))return exercise('Versa climb or row or ski','1,065 feet versa climb OR 1,065 meters row/ski');
 if((m=s.match(/^135 pound (.+), (\d+) reps$/i)))return exercise(m[1],join(m[2]+' reps','135 lb',...details));
 if((m=s.match(/^(\d+)-rep-max (.+)$/i))||(m=s.match(/^(\d+)RM (.+)$/i)))return exercise(m[2],join(m[1]+'RM',...details));
 if((m=s.match(/^Complete (\d+) calories on a fan bike$/i)))return exercise('Fan bike',m[1]+' calories');
 if((m=s.match(/^(Run|Row|Swim|Sprint)\s+([\d,.\/]+\s*(?:miles?|meters?|km|m|k)?)\b\s*(.*)$/i))){
  return exercise(m[1][0].toUpperCase()+m[1].slice(1).toLowerCase(),join(m[2],m[3],...details));
 }
 s=s.replace(/^Max(?:-reps?|-set| reps?)?\s+/i,()=>{details.unshift('max reps');return '';});
 if((m=s.match(/^(\d+(?:,\d{3})*(?:\.\d+)?(?:\/\d+)?(?:[mKk])?)(?:-|\s+)(minute|second|meter|mile|foot|yard|calorie|m|inches?)\s+(?:of\s+)?(.+)$/i))){
  let name=m[3];
  // Distance belongs to the prescription, including a station's shuttle length.
  if((m[2].toLowerCase()==='minute'||m[2].toLowerCase()==='second')&&/^\d+-foot\b/.test(name)){
   const d=name.match(/^(\d+-foot)\s+(.*)$/);name=d[2];details.push(d[1]+' shuttles');
  }
  const unit=m[2].toLowerCase(),units={m:'meters',foot:'feet',inch:'inches',inches:'inches'};
  return finish(name,join(m[1]+' '+(units[unit]??unit+(Number(m[1])===1?'':'s')),...details));
 }
 if((m=s.match(/^(\d+(?:,\d{3})*(?:\.\d+)?(?:\/\d+)?(?:[mKk])?)\s+(.+)$/))){
  if(/[mKk]$/.test(m[1]))return finish(m[2],join(m[1],...details));
  return finish(m[2],join(m[1]+(Number(m[1])===1?' rep':' reps'),...details));
 }
 if((m=s.match(/^(.+),\s*(\d+ reps?|[\d.]+ body weight|body ?weight)$/i)))return finish(m[1],join(m[2],...details));
 if((m=s.match(/^Bodyweight (.+)$/i)))return finish(m[1],join('bodyweight',...details));
 return finish(s,join(...details));
}
function finish(s,detail){
 const pieces=s.split(/,\s*/);let name=pieces.shift().trim();
 if(pieces.length)detail=join(detail,...pieces);
 name=name.replace(/^bodyweight\s+/i,()=>{detail=join(detail,'bodyweight');return '';});
 name=name.replace(/^(\d+)-meter\s+/i,(_,v)=>{detail=join(detail,v+' meters per shuttle');return '';});
 name=name.replace(/\s+with a (\d+-lb plate overhead)$/i,(_,v)=>{detail=join(detail,v);return '';});
 name=name.replace(/\s+to (\d+ (?:feet|foot))$/i,(_,v)=>{detail=join(detail,'to '+v);return '';});
 if(/^\d|:|\b(?:rounds?|minutes?|seconds?|reps?)\b/i.test(name))throw new Error('Unreviewed movement line: '+s);
 return exercise(name,detail);
}

const instruction=/^(?:[♀♂]|Rx|Intermediate:|Beginner:|\d+ reps for time|For (?:time|load|reps)|With a partner|With a \d+-minute time cap|Time Cap|Then\b|After\b|Each round\b|Every\b|If a round\b|Progression\b|Score\b|Unbroken\b|One unbroken\b|End the hold\b|Equipment\b|Use a\b|Burpee standard\b|Burpee pull-up standard\b|For the runs\b|Keep the\b|Split the\b|Divide the\b|Both partners\b|Partners divide\b|Only one partner\b|Switch the\b|Rope-climb\b|Preferred bar\b|Rest\b|\d+ minutes? rest\b|As long as possible|As many reps as possible:|Establish a\b|Limit each lift|Start the clean|With a single kettlebell for time)/i;
const roundPattern=/(\d+|Three|Five)\s+rounds?\b/i;
const ladderPattern=/^(\d+(?:-\d+){2,})(?:\s+reps.*)?$/i;
function rows(e){return e.prescription.filter(s=>!instruction.test(s)&&!roundPattern.test(s)&&!ladderPattern.test(s)&&!/^Complete as many|^As many rounds|^AMRAP|^On (?:a|an)|^Max rounds/i.test(s));}

// Loads are assigned by equipment/movement affinity; unmatched source equipment
// stays in notes. A global barbell load must never turn Fran's pull-ups weighted.
const affinities=[
 [/deadlift/i,/deadlift|SDHP|sumo deadlift high pull/i],
 [/bench press/i,/bench press/i],
 [/back squat/i,/back squat/i],
 [/front squat/i,/front squat|\bsquat$/i],
 [/overhead squat/i,/overhead squat/i],
 [/shoulder press/i,/shoulder press/i],
 [/push press/i,/push press|SDHP and press/i],
 [/shoulder.to.overhead/i,/shoulder.to.overhead/i],
 [/push jerk|\bjerks?\b/i,/push jerk|jerk/i],
 [/snatch/i,/snatch/i],
 [/clean/i,/clean/i],
 [/thruster/i,/thruster/i],
 [/kettlebell swing|goblet squat/i,/kettlebell|pood|KB\b/i],
 [/barbell.*step.up/i,/step.up|box/i],
 [/box jump|step.up|step.over/i,/box/i],
 [/wall.ball|medicine.ball clean|ball slam/i,/medicine ball|med ball|wall.ball|\bball\b/i],
 [/rope climb/i,/rope/i],
 [/weighted pull.up/i,/pull.up/i],
 [/farmers carry|waiters walk|dumbbell/i,/dumbbell|DBs?\b|farmers carry|power snatch|pull-ups/i],
 [/sandbag/i,/sandbag/i],
 [/sled/i,/sled/i],
];
const barbell=/deadlift|squats?|cleans?|snatch|jerk|thruster|press|shoulder.to.overhead|sumo deadlift/i;
const unweighted=/^(?:squats?|air squats?|pistols?|.*single.leg squats?|.*one.leg.*squats?|.*push.ups?|.*handstand.*|wall climbs?|burpees?(?: over.*)?|.*pull.ups?|.*muscle.ups?|jumping squats?)$/i;
function attachLoads(e,x){
 const lines=[...e.loads,...e.prescription.filter(s=>/^[♀♂]|^(?:Deadlifts:|Sled load:|Rx’d:)/i.test(s))];
 const chunks=lines.flatMap(line=>{
  line=line.replace(/^Men:\s*/,'♂ ').replace(/^Women:\s*/,'♀ ');
  const genders=[...line.matchAll(/([♀♂])\s*:?\s*([^♀♂]+)/g)];
  return (genders.length?genders.map(m=>[m[1],m[2]]):[['',line.replace(/^Rx’d:\s*/,'')]])
   .flatMap(([gender,part])=>part.split(/,\s*|;\s*| and (?:a )?(?=\d)/).map(chunk=>({gender,chunk:chunk.trim().replace(/^and /,'')})));
 });
 const relevant=[],context=x.name+' '+x.reps;
 const isUnweighted=unweighted.test(x.name)&&!/^weighted /i.test(x.name);
 const barbellMove=(barbell.test(x.name)||/barbell|front.rack weighted lunge/i.test(x.name))&&!isUnweighted&&!/dumbbell|kettlebell|sandbag|medicine.ball/i.test(x.name);
 const specific=affinities.find(([re])=>re.test(x.name));
 const hasSpecific=chunks.some(({chunk})=>specific?.[1].test(chunk)&&!/(?:dumbbell|kettlebell|barbell|box|rope|ball)/i.test(chunk));
 for(const {gender,chunk} of chunks){
  let applies=false;
  if(/\bvest\b|body armor|^Equipment:/i.test(chunk))continue;
  if(/ for /i.test(chunk)){
   const target=chunk.split(/ for /i)[1];
   if(/farmers carry/i.test(x.name))applies=/farmers carry/i.test(target);
   else if(/snatch/i.test(x.name))applies=/snatch/i.test(target);
   else applies=specific?.[1].test(target)??false;
  }else if(/\bdumbbells?\b|\bDBs?\b/i.test(chunk)){
   applies=/dumbbell|weighted pull.up|farmers carry|waiters walk|weighted (?:walking|jumping) lunge/i.test(context)&&!/kettlebell/.test(context);
  }else if(/kettlebell|pood|\bKB\b/i.test(chunk)){
   applies=/kettlebell|goblet squat/i.test(context);
  }else if(/sandbag/i.test(chunk))applies=/sandbag/i.test(context);
  else if(/\bbarbell\b/i.test(chunk))applies=barbellMove&&!hasSpecific;
  else if(/box/i.test(chunk))applies=/box|step.up/i.test(x.name);
  else if(/medicine.ball|med ball|\bball\b|wall.ball/i.test(chunk))applies=/wall.ball|medicine.ball|ball slam/i.test(context);
  else if(/rope/i.test(chunk))applies=/rope climb/i.test(x.name);
  else if(/ruck|backpack/i.test(chunk))applies=/weighted.*step.up|step.up.*(?:backpack|ruck)/i.test(context)||e.firstPosted==='2024-07-27'&&/step.up/i.test(x.name);
  else if(/plate/i.test(chunk))applies=/plate|overhead (?:walking lunge|walk)|front.rack weighted lunge/i.test(context);
  else if(specific?.[1].test(chunk)&&/\d|[¾½¼]|body ?weight/i.test(chunk))applies=true;
  else if(/^\d+(?:\.\d+)?(?:\/\d+)?[ -]?(?:lb\.?|kg)(?:\.|\s*)$/i.test(chunk)||/^Bodyweight$/i.test(chunk)){
   applies=barbellMove||/dumbbell|kettlebell|medicine.ball|Turkish get.up|weighted pull.up|walking lunge.*kettlebell|overhead walk|DB /i.test(x.name);
  }
  if(isUnweighted&&!/box/i.test(chunk))applies=false;
  if(applies)relevant.push((gender?gender+' ':'')+chunk);
 }
 const reps=join(x.reps,...new Set(relevant));
 if(reps.length>150)throw new Error(`${e.name}: details exceed 150: ${x.name}: ${reps}`);
 return {...x,reps};
}
const moves=(e,lines=rows(e))=>lines.map(movement).map(x=>attachLoads(e,x));
function base(e,format,mode,blocks){return {name:e.name,reviewed:true,format,status:'supported',mode,limitations:[],blocks};}
function ordinary(e){
 const text=e.prescription.join(' '),heading=e.prescription.find(s=>roundPattern.test(s)),rounds=heading?num(heading.match(roundPattern)[1]):1;
 const ladder=e.prescription.map(s=>s.match(ladderPattern)?.[1]).find(Boolean);
 const repetitions=ladder??e.prescription.map(s=>s.match(/^(\d+(?:-\d+){2,}) reps?/i)?.[1]).find(Boolean);
 let xs=moves(e);
 if(repetitions)xs=xs.map(x=>({...x,reps:join(repetitions+' reps, by round',x.reps)}));
 if(!xs.length)throw new Error(e.name+': no reviewed movements');
 const clock=e.prescription[0].match(/\b(?:in|for) (\d+) minutes?/i)??e.prescription[0].match(/^AMRAP (\d+)/i);
 if(clock&&/as many|AMRAP/i.test(e.prescription[0]))return base(e,'AMRAP','amrap',[timed('amrap',e.name,xs,Number(clock[1])*60)]);
 const recovery=e.prescription.map(s=>s.match(/^(?:Rest (?:exactly )?)?(\d+) (minutes?|seconds?)(?: rest| between|$)/i)).find(Boolean);
 if(recovery&&rounds>1){
  const seconds=Number(recovery[1])*(recovery[2].startsWith('minute')?60:1),bs=[];
  for(let i=0;i<rounds;i++){bs.push(indefinite(`Round ${i+1} of ${rounds}`,xs));if(i<rounds-1)bs.push(rest(seconds));}
  const p=base(e,'For-time efforts with fixed recoveries','intervals',bs);
  if(!/each for time/i.test(text))manual(p,'The timer scores each work effort separately. Record full elapsed time including prescribed recoveries in result notes.');
  if(/score the full elapsed time/i.test(text))manual(p,'The timer scores each effort separately; record the sum of all five work times plus 12 minutes of recovery as the full elapsed result.');
  return p;
 }
 const cap=text.match(/Time Cap:\s*(\d+)\s*min/i)??text.match(/(\d+)-minute time cap/i);
 const p=base(e,repetitions?'Rep ladder, one for-time clock':rounds>1?'Rounds, one for-time clock':'For-time sequence','fortime',[timed('fortime',e.name,xs,cap?Number(cap[1])*60:null,rounds>1?{prescriptionRounds:rounds}:{})]);
 return p;
}

function stations(e,names,rounds,seconds,recovery,finalRest=false){
 const bs=[];for(let i=0;i<rounds;i++){bs.push(interval('intervals',`Round ${i+1} of ${rounds}`,moves(e,names),1,seconds));if(i<rounds-1||finalRest)bs.push(rest(recovery));}
 return base(e,'Timed stations with fixed recoveries','intervals',bs);
}
function tabatas(e,names,extraRest){
 const bs=[];names.forEach((name,i)=>{bs.push(interval('tabata',`Tabata ${name}`,moves(e,[name]),8,20,10,'together'));bs.push(rest(10+(i<names.length-1?extraRest:0),i<names.length-1&&extraRest?'Final 10s + prescribed recovery':'Final 10-second recovery'));});
 return base(e,'Tabata, eight efforts per movement','tabata',bs);
}
function sequence(e,sections,cap=null){
 // Preserve source movement order, full section repetitions, and ONE score.
 // A repeat on a ForTime block would incorrectly restart that score.
 const xs=sections.flatMap(([cue,lines])=>moves(e,lines).map(x=>({...x,reps:join(x.reps,cue)})));
 return base(e,'Ordered sections, one for-time clock','fortime',[timed('fortime',e.name,xs,cap)]);
}
function buyin(e,minutes){
 const xs=moves(e,e.prescription.slice(1).filter(s=>!instruction.test(s)));
 return base(e,'Buy-in then AMRAP on the same clock','amrap',[timed('amrap',e.name,xs.map((x,i)=>({...x,reps:join(x.reps,i===0?'buy-in once':'repeat in remaining time after buy-in')})),minutes*60)]);
}

// Explicitly reviewed scope boundaries for every nested sequence. Numbers refer
// to source line indexes, not inferred indentation or an open-ended regex scope.
const sections={
 '2007 Hopper':[['Buy-in once',[1]],['5 rounds, after row',[4,5]]],
 'Alec':[['Section 1: 3 rounds',[2,3,4]],['Section 2: once',[6,7,8]],['Section 3: 5 rounds',[11,12,13]]],
 'City 100':[['Buy-in once',[1]],['10 rounds, alternate partner roles',[4,5,6]]],
 'DVB':[['Section 1: once',[1]],['Section 2: 8 rounds',[3,4]],['Section 3: once',[5]],['Section 4: 4 rounds',[7,8]],['Section 5: once',[9]],['Section 6: 2 rounds',[11,12]]],
 'Estrada':[['Buy-in once',[0]],['3 rounds, after step-ups',[3,4,5]]],
 'FERN':[['Section 1: once',[2]],['Section 2: 9 rounds',[4,5]],['Section 3: 3 rounds',[7,8,9]]],
 'Gage':[['Buy-in once',[1]],['3 rounds',[3,4,5,6]],['Cash-out once',[7]]],
 'Goose':[['Buy-in once',[1]],['7 rounds',[3,4,5]],['Cash-out once',[6]]],
 'Jonathon Farmer':[['Buy-in once',[1]],['2 rounds',[4,5,6,7,8,9]],['Cash-out once',[11]]],
 'Josh-O':[['Section 1: once',[1]],['Section 2: 2 rounds',[3,4,5]],['Section 3: once',[7]],['Section 4: 2 rounds',[9,10,11]],['Section 5: once',[13]]],
 'Josie':[['Buy-in once',[1]],['3 rounds',[3,4,5]],['Cash-out once',[6]]],
 'Leehan':[['7 rounds',[1,2,3]],['Cash-out once',[4]]],
 'Locke':[['Buy-in once',[1]],['7 rounds',[4,5,6]],['Cash-out once',[8]]],
 'Lorenzo':[['Buy-in once',[1]],['5 rounds',[4,5,6]],['Cash-out once',[8]]],
 'Muller':[['Buy-in once',[1,2]],['5 rounds',[5,6]],['Cash-out once',[8,9]]],
 'Northrup':[['Buy-in once',[1]],['3 rounds',[3,4,5]],['Cash-out once',[6]]],
 'Operation Red Wings':[['Buy-in once',[1]],['16 rounds',[4,5]],['Cash-out once',[7]]],
 'Pat':[['Buy-in once',[1]],['14 rounds',[3,4,5]],['Cash-out once',[7]]],
 'Rich':[['Buy-in once',[1]],['10 rounds',[3,4]],['Cash-out once',[5]]],
 'Ryan Comas':[['Buy-in once',[1]],['10 rounds',[4,5,6,7,8]],['Cash-out once',[10]]],
 'Ryan SO':[['Buy-in once',[1]],['Section 2: 4 rounds',[4,5,6]],['Section 3: 3 rounds',[9,10,11]],['Cash-out once',[13]]],
 'Schmalls':[['Buy-in once',[1]],['2 rounds',[4,5,6,7,8]],['Cash-out once',[10]]],
 'Servais':[['Buy-in once',[1]],['8 rounds',[3,4,5]],['Cash-out once',[7,8]]],
 'Timothy Helton':[['Buy-in once',[1]],['10 rounds',[4,5,6,7,8]]],
 'TommyG3x':[['Buy-in once',[1]],['Section 2: 3 rounds',[3,4,5]],['Section 3: 3 rounds',[7,8]],['Cash-out once',[10]]],
 'TPT9000':[['Buy-in once',[1]],['9 rounds',[3,4,5,6]]],
 'Wade':[['Buy-in once',[1]],['4 rounds',[3,4,5]],['Cash-out once',[6]]],
 'Wes':[['Buy-in once',[1]],['14 rounds',[3,4,5]],['Cash-out once',[6]]],
};

function sectionLine(e,i){
 const line=e.prescription[i];if(line===undefined)throw new Error(e.name+': wrong section index '+i);
 return line.replace(/^Then,?\s*(?:a\s+)?/i,'').replace(/; each partner carries a plate\.$/i,' with a plate').replace(/\.$/,'');
}

function reviewed(e){
 if(e.timer){
  const bs=[];
  e.timer.segments.forEach((s,i)=>{
   bs.push(interval(e.timer.mode,`${e.timer.mode.toUpperCase()} section ${i+1}`,moves(e,s.exercises),s.rounds,e.timer.mode==='tabata'?20:60,e.timer.mode==='tabata'?10:0,s.flow));
   const recovery=s.restAfter+(e.timer.mode==='tabata'?10:0);if(recovery)bs.push(rest(recovery,s.restAfter?'Prescribed recovery':'Final 10-second recovery'));
  });
  const p=base(e,e.timer.mode==='emom'?'Daily EMOM, explicit stations/progression':'Daily Tabata, explicit movement sets',e.timer.mode,bs);
  if(/until failure/i.test(e.prescription.join(' ')))manual(p,'End the workout manually when a minute is unfinished; record the last fully completed minute.');
  if(e.measure==='weight')manual(p,'Change and record loads manually as prescribed; interval completion does not calculate a load score.');
  if(e.firstPosted==='2024-09-27')manual(p,'Record the sum of ring muscle-ups manually; the engine records completed intervals.');
  if(e.timer.mode==='tabata')manual(p,'Record prescribed rep, calorie, or hold-second totals in result notes; interval completion is not the source score.');
  return p;
 }
 if(sections[e.name]){
  const cap=e.name==='FERN'?3600:e.name==='2007 Hopper'?1200:null;
  const p=sequence(e,sections[e.name].map(([cue,indexes])=>[cue,indexes.map(i=>sectionLine(e,i))]),cap);
  if(e.name==='City 100'){
   p.blocks[0].exercises.push(exercise('Front-rack barbell hold','Partner holds throughout the other partner’s full complex; exchange roles each round'));
   manual(p,'Partners coordinate simultaneous holds and role exchanges manually.');
  }
  if(e.name==='Timothy Helton'){
   p.blocks.push(timed('stopwatch','Heavy single back squat', [exercise('Back squat','1 heavy rep per team member')],null));
   manual(p,'Finish the team for-time sequence before starting heavy singles. Record each athlete’s load in notes; load scoring is manual.');
  }
  return p;
 }
 if(/\b[135]RM$/.test(e.name)){
  const reps=e.name.match(/([135])RM$/)[1];
  return manual(base(e,'Strength, rep maximum','stopwatch',[timed('stopwatch',e.name,[movement(`${reps}RM `+e.name.replace(/ [135]RM$/,'').toLowerCase())],null)]),'Allow unrestricted recovery and record the heaviest successful load in result notes. Stopwatch elapsed time is not the load score.');
 }
 if(/^As long as possible:/.test(e.prescription[0]))return manual(base(e,'Unbroken hold, count up','stopwatch',[timed('stopwatch',e.name,moves(e),null)]),'Finish the stopwatch immediately when the source hold-ending condition occurs.');
 if(/^As many reps as possible:/.test(e.prescription[0]))return manual(base(e,'Unbroken max-rep attempt','stopwatch',[timed('stopwatch',e.name,moves(e).map(x=>({...x,reps:join('max reps, one unbroken set',x.reps)})),null)]),'End the attempt on the prescribed break condition and record completed reps in result notes; the stopwatch measures elapsed time.');
 switch(e.name){
  case 'Chelsea':return manual(base(e,'EMOM with conditional continuation','emom',[interval('emom',e.name,moves(e,['5 pull-ups','10 push-ups','15 squats']),30,60,0,'together')]),'If a round overruns its minute, keep working through the minute signals until 30:00 and count completed rounds manually. Progression reps must be edited before starting.');
  case 'Fight Gone Bad':return manual(stations(e,['Wall-ball shots','Sumo deadlift high pulls','Box jumps','Push presses','Row (calories)'],3,60,60),'Record total reps/calories across all 15 stations in result notes.');
  case 'Hope':return manual(stations(e,e.prescription.slice(1,6),3,60,60),'Record total reps across all 15 stations in result notes.');
  case 'Santora':return manual(stations(e,e.prescription.slice(1,6),3,60,60),'Record total reps across all 15 stations, including the prescribed forward/back shuttle standard, in result notes.');
  case 'Tabata This!':return manual(tabatas(e,['Row','Squat','Pull-up','Push-up','Sit-up'],60),'Record each movement’s lowest interval count in notes; rowing is scored in calories.');
  case 'Tabata Something Else':return manual(tabatas(e,['Pull-up','Push-up','Sit-up','Squat'],0),'Record the sum of reps across all 32 intervals in result notes.');
  case 'Coffland':return manual(base(e,'Accumulated hang with release-triggered work','fortime',[indefinite(e.name,[exercise('Pull-up bar hang','6 minutes accumulated hanging; resume after each penalty'),exercise('Run','800 meters after every bar release'),exercise('Push-ups','30 reps after every bar release')])]),'Track accumulated hanging time separately. Keep this overall stopwatch running during every release penalty; finish only after 6 minutes of total hanging. The engine cannot accumulate hang-only time or detect releases.');
  case 'CrossFit Total':case 'The Other Total':{
   const xs=e.prescription.slice(1,4).map(movement);
   return manual(base(e,'Sequential maximum lifts, unrestricted recovery','stopwatch',[timed('stopwatch',e.name,xs,null)]),'Finish each lift’s attempts before moving to the next. Record and sum successful maxima manually; stopwatch time is not the score.');
  }
  case 'Gwen':return manual(base(e,'Three strength sets, unrestricted recovery','stopwatch',[timed('stopwatch',e.name,[exercise('Clean & jerk','15-12-9 reps in separate unbroken sets; same load; touch-and-go; unrestricted rest')],null)]),'Rest freely between the three sets and record the unchanged load manually. No timed recovery is prescribed.');
  case 'Lane':case 'Lynne':{
   const xs=e.name==='Lane'?[exercise('Hang power snatches','max reps · ¾ bodyweight'),exercise('Handstand push-ups','max reps')]:[exercise('Bench press','max reps · bodyweight'),exercise('Pull-ups','max reps')];
   xs.forEach(x=>{x.reps+=' · each of 5 rounds';});
   return manual(base(e,'Five max-rep rounds, unrestricted recovery','stopwatch',[timed('stopwatch',e.name,xs,null)]),'Complete five rounds. Record each set’s reps and take unrestricted recovery. The single running stopwatch does not score max reps.');
  }
  case 'Dominic J. Hall':return base(e,'Running-clock windows: 0:00–12:23 / rest / 15:00–48:00','intervals',[
   timed('amrap','0:00–12:23 · max step-ups',moves(e,['Max-reps box step-ups']),743),rest(157,'12:23–15:00 · prescribed recovery'),timed('amrap','15:00–48:00 · AMRAP',moves(e,['9 deadlifts','400-m run','22 push-ups']),1980)]);
  case "Jack's Triangle":return manual(base(e,'Running-clock windows: 2 / 19 / 2 minutes','intervals',[
   timed('amrap','0:00–2:00 · deadlifts',moves(e,['Max deadlifts (155/225 lb)']),120),timed('amrap','2:00–21:00 · AMRAP',moves(e,e.prescription.slice(5,9)),1140),timed('amrap','21:00–23:00 · deadlifts',moves(e,['Max deadlifts (155/225 lb)']),120)]),'Record the sum of reps across all three windows as the source result. Windows run back-to-back with no reset of elapsed workout time.');
  case 'Finseth':return buyin(e,18);
  case 'Garbo':return buyin(e,21);
  case 'Tiff':return buyin(e,25);
  case 'Wesley':return buyin(e,35);
  case 'Foo':return base(e,'Uncapped buy-in, then a separate 20-minute AMRAP','intervals',[indefinite('Bench press buy-in',moves(e,[e.prescription[1]])),timed('amrap','20-minute AMRAP after buy-in',moves(e,e.prescription.slice(3)),1200)]);
  case 'Gale Force':return base(e,'30-minute AMRAP then group cash-out','intervals',[timed('amrap','30-minute AMRAP',moves(e,e.prescription.slice(1,4)),1800),indefinite('Group cash-out',[exercise('Squats','19 reps together, after 30:00')])]);
  case 'Nukes':return base(e,'Three running-clock windows with one run buy-in each','intervals',[8,10,12].map((minutes,i)=>timed('amrap',`${minutes}-minute window ${i+1}`,moves(e,e.prescription.slice(i*3+1,i*3+3)).map((x,j)=>({...x,reps:join(x.reps,j===0?'buy-in once':'max reps in remaining window time')})),minutes*60)));
  case 'Scooter':return manual(base(e,'30-minute partner AMRAP then 5-minute load window','intervals',[timed('amrap','0:00–30:00 · partner AMRAP',moves(e,e.prescription.slice(1,5)),1800),interval('intervals','30:00–35:00 · heavy partner deadlift',[exercise('Partner deadlift','1RM · record maximum load')],1,300,0,'together')]),'Alternate full rounds with your partner; record the maximum partner deadlift load manually. Solo alternative recovery is described in source notes and is not auto-triggered.');
  case 'Dragon':return manual(base(e,'Two uncapped runs and two four-minute load windows','intervals',[
   indefinite('First 5K run',[exercise('Run','5K')]),interval('intervals','First 4-minute load window',[exercise('Deadlift','4RM · record maximum load')],1,240,0,'together'),indefinite('Second 5K run',[exercise('Run','5K')]),interval('intervals','Second 4-minute load window',[exercise('Push jerk','4RM · record maximum load')],1,240,0,'together')]),'Record both 4RM loads manually; for an overall elapsed result add the two run times and eight minutes of lifting.');
  case 'Dallas 5':{
   const bs=[],groups=[['Burpees'],['7 deadlifts','7 box jumps'],['Turkish get-ups'],['7 snatches','7 push-ups'],['Row (calories)']];
   groups.forEach((group,i)=>{bs.push(timed('amrap',`Station ${i+1} of 5`,moves(e,group),300));if(i<4)bs.push(rest(60));});
   return base(e,'Five five-minute AMRAP stations with one-minute recoveries','intervals',bs);
  }
  case 'Manuel':{
   const xs=moves(e,['Rope climbs','Squats','Push-ups','Run']);[180,120,120,180].forEach((seconds,i)=>{xs[i].work=seconds;xs[i].rest=0;xs[i].reps=i===3?'400 meters; recover until this 3-minute window expires':'max reps in station window';});
   return base(e,'Five rounds of 3 / 2 / 2 / 3-minute stations','intervals',[interval('intervals',e.name,xs,5)]);
  }
  case 'Time Priority Angie':return manual(base(e,'Four consecutive three-minute stations','intervals',[interval('intervals',e.name,moves(e,['Pull-ups','Push-ups','Sit-ups','Air squats']),1,180)]),'Record completed reps for each movement in result notes; the timer scores station completion.');
  case 'Tama':{
   const p=ordinary(e),loads=[['35','45'],['65','95'],['95','135']];let stage=0;
   for(const x of p.blocks[0].exercises)if(/farmers carry/i.test(x.name)){
    const distance=x.reps.split(' · ')[0],pair=loads[stage++];x.reps=join(distance,`♀ ${pair[0]} lb`,`♂ ${pair[1]} lb`);
   }
   return p;
  }
  case 'Nunez':{
   const p=ordinary(e),loads=[['65','95'],['125','185'],['155','225']];let stage=0;
   for(const x of p.blocks[0].exercises)if(/squat/i.test(x.name)){
    const quantity=x.reps.split(' · ')[0],pair=loads[stage++];x.reps=join(quantity,`♀ ${pair[0]} lb`,`♂ ${pair[1]} lb`);
   }
   return p;
  }
  case 'Gunny':{
   const p=ordinary(e);for(const x of p.blocks[0].exercises)if(/run/i.test(x.name))x.reps=join(x.reps,'carry 50 lb');return p;
  }
  case 'The Ghost':return manual(stations(e,['Row (calories)','Burpees','Double-unders'],6,60,60,true),'Record the sum of rowing calories, burpees and double-unders in result notes.');
  case 'The Chief':{
   const bs=[];for(let i=0;i<5;i++){bs.push(timed('amrap',`Cycle ${i+1} of 5`,moves(e,e.prescription.slice(1,4)),180));bs.push(rest(60));}
   return base(e,'Five three-minute AMRAPs, one minute after each','intervals',bs);
  }
  case 'Drew':{
   const bs=[];for(const i of [2,4,6,8,9]){
    const [label,list]=e.prescription[i].split(': ');bs.push(indefinite(label,moves(e,list.split(', '))));if(i<8)bs.push(rest(30));
   }
   return manual(base(e,'Named sequence with three fixed recoveries','intervals',bs),'Keep the named rounds in order. For full elapsed time add all work times plus 90 seconds of prescribed recovery.');
  }
  case 'Hidalgo':return manual(base(e,'Run / work / run with fixed recoveries','intervals',[
   indefinite('First run',moves(e,[e.prescription[1]])),rest(120),indefinite('Middle sequence',moves(e,e.prescription.slice(3,8))),rest(120),indefinite('Final run',moves(e,[e.prescription[9]]))]),'For full elapsed time add all three work times and four minutes of recovery.');
  case 'Peyton':return manual(base(e,'Interrupted 20-minute AMRAP then uncapped run','intervals',[
   timed('amrap','20-minute AMRAP with rope interruptions',moves(e,e.prescription.slice(1,3)).concat(exercise('Double-unders','40 reps at 0:00 and every 2:00 through 18:00; interrupt and resume AMRAP')),1200),indefinite('Run after 20:00',[exercise('Run','2 miles')])]),'Cue double-unders manually at 0:00, 2:00, …, 18:00 while the 20-minute clock continues. The engine cannot trigger overlapping cues while preserving a single AMRAP score.');
  case 'Shawn':return manual(base(e,'Five-mile run with event-triggered interruptions','fortime',[indefinite(e.name,[exercise('Run','5 miles total; resume five-minute run intervals after each interruption'),exercise('Squats','50 reps after each 5 minutes of running'),exercise('Push-ups','50 reps after each 5 minutes of running')])]),'Track running-only five-minute intervals separately while this overall clock continues. Squat/push-up time does not count toward each run interval.');
  case 'T.J.':return manual(base(e,'Repeat cycle until accumulated thruster target','fortime',[indefinite(e.name,moves(e,e.prescription.slice(1,4)).map(x=>({...x,reps:join(x.reps,'repeat cycle until 100 total thrusters')}))) ]),'Track cumulative thrusters manually. Stop after reaching 100 thrusters; no fixed round count or time cap is prescribed.');
  case 'Otis':return manual(base(e,'Ascending AMRAP rep ladder','amrap',[timed('amrap',e.name,[exercise('Back squat','1-2-3-… reps by round · 1½ bodyweight'),exercise('Shoulder press','1-2-3-… reps by round · ¾ bodyweight'),exercise('Deadlift','1-2-3-… reps by round · 1½ bodyweight')],900)]),'Increase all three movements by one rep after each completed round; track the current ladder step manually.');
  case 'Twelve Days of Christmas':return manual(base(e,'Descending cumulative movement ladder, one clock','fortime',[indefinite(e.name,moves(e,e.prescription.slice(1,13)).map((x,i)=>({...x,reps:join(x.reps,`introduced round ${i+1}; in rounds ${i+1}–12, perform in descending movement order`)})))]),'Follow the complete descending sequence in the source notes: each round adds its new movement first, then all earlier movements in reverse order. The engine cannot highlight changing subsets of movements within one for-time clock.');
  case 'Maxim 56':return sequence(e,[['Buy-in per partner',['56-second handstand hold or wall sit']],['Then each athlete',['56 burpees','56 flutter kicks (4-count)','56 walking lunges','56 hand-release push-ups','56 air squats']],['Cash-out',['5,600-meter run']]]);
  case 'Carse':{
   const p=ordinary(e);p.blocks[0].exercises.unshift(exercise('Bear crawl','50 meters at the start of each round'));return p;
  }
  case 'Brenton':{
   const p=ordinary(e);p.blocks[0].exercises.push(exercise('Burpees','3 reps after each 5 broad jumps'));
   return manual(p,'Count groups of five broad jumps and perform three burpees after each group within the same overall clock.');
  }
  case 'Marguerita':{
   const p=ordinary(e);p.format='Fifty repetitions of the five-movement sequence';p.blocks[0].prescriptionRounds=50;p.blocks[0].exercises.forEach(x=>{x.reps='1 rep per cycle';});return p;
  }
  case 'Fournier':return sequence(e,[['Once, in order',['50 shoulder-to-overheads','50-foot arm-over-arm sled pull','40 burpees','50-foot arm-over-arm sled pull','30 sumo deadlift high pulls','50-foot arm-over-arm sled pull']]]);
  case 'Nasty Girls':{const p=ordinary(e);p.blocks[0].exercises[2]=exercise('Hang power cleans','10 reps · 135 lb');return p;}
  default:return ordinary(e);
 }
}

const errors=[];
for(const e of entries){try{
 const p=reviewed(e);
 if(!p.blocks.length||p.blocks.length>40)throw new Error(e.name+': invalid block count');
 for(const b of p.blocks){
  if(b.exercises.length>30)throw new Error(e.name+': too many exercises');
  for(const x of b.exercises){
   if(!x.name||x.name.length>150||x.reps.length>150||/\d|^(?:Then|Complete|For |On |Rest|AMRAP|Rx|After|Etc)/i.test(x.name))throw new Error(`${e.name}: unreviewed movement ${JSON.stringify(x)}`);
  }
 }
 // Source arrays are verification snapshots, never another editorial source.
 p.source={prescription:e.prescription,loads:e.loads,...(e.timer?{timer:e.timer}:{})};
 p.sourceSha256=createHash('sha256').update(JSON.stringify(p.source)).digest('hex');
 plans[e.id]=p;
}catch(error){errors.push(e.name+': '+error.message);}}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else{
writeFileSync(new URL('./conversion-plans.json',import.meta.url),JSON.stringify(plans,null,2)+'\n');
const {exampleTiming}=await import('./wod-examples.ts');
const audit=entries.map(e=>{const p=plans[e.id];return {id:e.id,name:p.name,format:p.format,status:p.status,mode:p.mode,seconds:exampleTiming(e).seconds,workBlocks:p.blocks.filter(b=>b.mode!=='rest').length,restBlocks:p.blocks.filter(b=>b.mode==='rest').length,restSeconds:p.blocks.filter(b=>b.mode==='rest').reduce((n,b)=>n+b.duration,0),sourceSha256:p.sourceSha256,manualActions:p.limitations};});
writeFileSync(new URL('./conversion-audit.json',import.meta.url),JSON.stringify(audit,null,2)+'\n');
console.log(`Wrote ${entries.length} reviewed plans (${Object.values(plans).filter(p=>p.status==='manual-conditional').length} require manual cues/scoring).`);
}
