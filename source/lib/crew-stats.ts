export type Period='week'|'month'|'year';
export type CrewMember={id:string;name:string;mine:boolean;counts:number[];total:number};
export function periodWindow(period:Period,anchor:Date){
 const start=new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate());
 if(period==='week')start.setDate(start.getDate()-(start.getDay()+6)%7);
 if(period==='month')start.setDate(1);
 if(period==='year')start.setMonth(0,1);
 const end=new Date(start);
 if(period==='week')end.setDate(end.getDate()+7);
 if(period==='month')end.setMonth(end.getMonth()+1);
 if(period==='year')end.setFullYear(end.getFullYear()+1);
 const dates:Date[]=[];const cursor=new Date(start);
 while(cursor<end){dates.push(new Date(cursor));if(period==='year')cursor.setMonth(cursor.getMonth()+1);else cursor.setDate(cursor.getDate()+1);}
 return {start,end,dates,boundaries:[...dates,end].map(d=>d.toISOString())};
}
export function shiftPeriod(period:Period,anchor:Date,direction:number){
 const d=periodWindow(period,anchor).start;
 if(period==='week')d.setDate(d.getDate()+7*direction);
 if(period==='month')d.setMonth(d.getMonth()+direction);
 if(period==='year')d.setFullYear(d.getFullYear()+direction);
 return d;
}
export function validateBoundaries(value:unknown):string[]{
 if(!Array.isArray(value)||value.length<2||value.length>32)throw new Error('Invalid stats period.');
 let previous=-Infinity;
 for(const v of value){const n=typeof v==='string'?Date.parse(v):NaN;if(!Number.isFinite(n)||new Date(n).toISOString()!==v||n<=previous)throw new Error('Invalid stats dates.');previous=n;}
 if(Date.parse(value.at(-1))-Date.parse(value[0])>367*86400000)throw new Error('Invalid stats range.');
 return value;
}
export function displayDate(value:string){return new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}

export function monthlyWeeks(dates:Date[],values:number[]){
 const rows:{start:Date;end:Date;count:number;running:number}[]=[];let running=0;
 dates.forEach((date,i)=>{const count=values[i]??0;running+=count;const last=rows.at(-1);
  if(last&&date.getDay()!==1){last.end=date;last.count+=count;last.running=running;}
  else rows.push({start:date,end:date,count,running});
 });return rows;
}

export function assembleStats(roster:{member_id:number;athlete:string}[],counts:{member_id:number;bucket:number;count:number}[],buckets:number,currentMember:number):CrewMember[]{
 const members=roster.map(r=>({id:String(r.member_id),name:r.athlete,mine:r.member_id===currentMember,counts:Array(buckets).fill(0) as number[],total:0}));
 const byId=new Map(members.map(m=>[m.id,m]));
 for(const row of counts){const m=byId.get(String(row.member_id));if(m&&Number.isInteger(row.bucket)&&row.bucket>=0&&row.bucket<buckets){m.counts[row.bucket]=Number(row.count);m.total+=Number(row.count);}}
 return members.sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
}

export function localDate(date=new Date()){
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function validateTrainingDate(value:unknown):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||!Number.isFinite(Date.parse(value+'T00:00:00.000Z'))||new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)!==value)throw new Error('Enter a valid workout date.');
 return value;
}
export function calendarDate(timestamp:string,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp));
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
}
export type ActivityDay={date:string;workouts:number};
export type ActivitySummary=CrewMember & {dayCounts:number[];totalDays:number;days:ActivityDay[];lifetime:{workouts:number;days:number}};
export function summarizeActivity(roster:{member_id:number;athlete:string}[],rows:{member_id:number;day:string;count:number}[],boundaries:string[],currentMember:number){
 const memberDays=new Map<number,Map<string,number>>(),crewDays=new Map<string,number>();
 for(const row of rows){if(!memberDays.has(row.member_id))memberDays.set(row.member_id,new Map());const days=memberDays.get(row.member_id)!;days.set(row.day,(days.get(row.day)??0)+Number(row.count));crewDays.set(row.day,(crewDays.get(row.day)??0)+Number(row.count));}
 const summary=(dayMap:Map<string,number>)=>{
  const counts=Array(boundaries.length-1).fill(0) as number[],dayCounts=[...counts],days:ActivityDay[]=[];let lifetimeWorkouts=0;
  for(const [date,workouts]of dayMap){lifetimeWorkouts+=workouts;if(date<boundaries[0]||date>=boundaries.at(-1)!)continue;
   const bucket=boundaries.findIndex((end,i)=>i>0&&date<end)-1;counts[bucket]+=workouts;dayCounts[bucket]++;days.push({date,workouts});
  }
  return {counts,dayCounts,days:days.sort((a,b)=>a.date.localeCompare(b.date)),total:counts.reduce((a,b)=>a+b,0),totalDays:days.length,lifetime:{workouts:lifetimeWorkouts,days:dayMap.size}};
 };
 const members=roster.map(r=>({id:String(r.member_id),name:r.athlete,mine:r.member_id===currentMember,...summary(memberDays.get(r.member_id)??new Map())})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
 return {members,crew:summary(crewDays)};
}
export function activityBuckets(dates:Date[],days:ActivityDay[],group:'days'|'weeks'|'months'){
 const rows:{start:Date;end:Date;workouts:number;days:number;cumulativeWorkouts:number;cumulativeDays:number}[]=[];
 for(const date of dates){const last=rows.at(-1);if(group==='weeks'&&last&&date.getDay()!==1)last.end=date;else rows.push({start:date,end:date,workouts:0,days:0,cumulativeWorkouts:0,cumulativeDays:0});}
 for(const day of days){const row=rows.find(r=>day.date>=localDate(r.start)&&(group==='months'?day.date.slice(0,7)===localDate(r.start).slice(0,7):day.date<=localDate(r.end)));if(row){row.workouts+=day.workouts;row.days++;}}
 let workouts=0,trainingDays=0;for(const row of rows){workouts+=row.workouts;trainingDays+=row.days;row.cumulativeWorkouts=workouts;row.cumulativeDays=trainingDays;}return rows;
}
