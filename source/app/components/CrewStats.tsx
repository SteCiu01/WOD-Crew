'use client';
import {counted,plural} from '../../lib/language';
import {useEffect,useMemo,useState} from 'react';
import {Activity,CalendarDays,ChevronLeft,ChevronRight,RefreshCw} from 'lucide-react';
import {periodWindow,shiftPeriod,activityBuckets,type Period,type ActivitySummary} from '../../lib/crew-stats';
import {api} from './ui';

type Totals=Omit<ActivitySummary,'id'|'name'|'mine'>;
const empty:Totals={counts:[],dayCounts:[],days:[],total:0,totalDays:0,lifetime:{workouts:0,days:0}};
export default function CrewStats({currentMemberId}:{currentMemberId:number}){
 const [period,setPeriod]=useState<Period>('month'),[anchor,setAnchor]=useState(()=>new Date());
 const [selected,setSelected]=useState(String(currentMemberId)),[members,setMembers]=useState<ActivitySummary[]>([]),[crew,setCrew]=useState<Totals>(empty);
 const [metric,setMetric]=useState<'workouts'|'days'>('workouts'),[monthGroup,setMonthGroup]=useState<'days'|'weeks'>('weeks');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[activeBar,setActiveBar]=useState<number|null>(null),[loadedRange,setLoadedRange]=useState('');
 const timeZone=useMemo(()=>Intl.DateTimeFormat().resolvedOptions().timeZone,[]);
 const range=useMemo(()=>periodWindow(period,anchor),[period,anchor]);
 const rangeKey=JSON.stringify([range.boundaries,currentMemberId,timeZone]),waiting=loading||loadedRange!==rangeKey;
 useEffect(()=>{let active=true;setLoading(true);setError('');setActiveBar(null);
  api('/api/stats?boundaries='+encodeURIComponent(JSON.stringify(range.boundaries))+'&member='+currentMemberId+'&timeZone='+encodeURIComponent(timeZone)).then(data=>{if(active){setMembers(data.members);setCrew(data.crew);setLoadedRange(rangeKey);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[range,rangeKey,reload,currentMemberId,timeZone]);
 useEffect(()=>{setSelected(String(currentMemberId));},[currentMemberId]);
 useEffect(()=>{setActiveBar(null);},[metric,monthGroup,selected]);
 const member=members.find(m=>m.id===selected),activity=member??crew;
 const group=period==='year'?'months':period==='month'?monthGroup:'days';
 const buckets=activityBuckets(range.dates,activity.days,group),weekly=period==='month'?activityBuckets(range.dates,activity.days,'weeks'):[];
 const values=buckets.map(b=>metric==='workouts'?b.workouts:b.days);
 const max=Math.max(1,...values),total=metric==='workouts'?activity.total:activity.totalDays;
 const dateLabel=(d:Date)=>d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
 const last=new Date(range.end);last.setDate(last.getDate()-1);
 const title=period==='year'?String(range.start.getFullYear()):period==='month'?range.start.toLocaleDateString('en-GB',{month:'long',year:'numeric'}):dateLabel(range.start)+' – '+dateLabel(last)+' '+last.getFullYear();
 const now=periodWindow(period,new Date());
 const bucketLabel=(i:number)=>group==='months'?buckets[i].start.toLocaleDateString('en-GB',{month:'long',year:'numeric'}):group==='weeks'?dateLabel(buckets[i].start)+' – '+dateLabel(buckets[i].end):dateLabel(buckets[i].start);
 const unit=metric==='workouts'?'workouts':'training days',unitFor=(n:number)=>plural(n,metric==='workouts'?'workout':'training day'),picked=activeBar!==null&&buckets[activeBar]?activeBar:null;
 const ranked=[...members].sort((a,b)=>(metric==='workouts'?b.total-a.total:b.totalDays-a.totalDays)||a.name.localeCompare(b.name));

 return <main className="stats-page page-width">
  <div className="stats-heading"><div><span className="eyebrow lime">EVERY EFFORT ADDS UP</span><h1>Crew stats<span className="lime">.</span></h1><p className="muted">Your effort. Your consistency. Over time.</p></div><button className="icon-btn" aria-label="Refresh crew stats" onClick={()=>setReload(n=>n+1)}><RefreshCw size={20} className={loading?'spin':''}/></button></div>
  <div className="stats-toolbar"><div className="segmented" aria-label="Stats period">{(['week','month','year'] as Period[]).map(p=><button key={p} aria-pressed={period===p} className={period===p?'active':''} onClick={()=>{setActiveBar(null);setPeriod(p);}}>{p[0].toUpperCase()+p.slice(1)}</button>)}</div><label className="field"><span>Activity for</span><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">Whole crew</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}{m.mine?' (you)':''}</option>)}</select></label></div>
  <div className="stats-date-nav"><button className="icon-btn" aria-label={'Previous '+period} onClick={()=>setAnchor(shiftPeriod(period,anchor,-1))}><ChevronLeft/></button><div><h2>{title}</h2><button className="text-btn lime" onClick={()=>setAnchor(new Date())}>This {period}</button></div><button className="icon-btn" aria-label={'Next '+period} disabled={range.start>=now.start} onClick={()=>setAnchor(shiftPeriod(period,anchor,1))}><ChevronRight/></button></div>
  {error?<section className="panel"><p className="error" role="alert">{error}</p><button className="btn secondary" onClick={()=>setReload(n=>n+1)}>Try again</button></section>:waiting?<section className="panel loading-state" role="status"><RefreshCw className="spin"/> Loading crew activity…</section>:<>
   <div className="activity-metrics" role="group" aria-label="Activity measure"><button className={'metric-card panel '+(metric==='workouts'?'selected':'')} aria-pressed={metric==='workouts'} onClick={()=>setMetric('workouts')}><Activity size={21}/><span>Workouts</span><strong>{activity.total}</strong><small>Every saved attempt</small></button><button className={'metric-card panel days-metric '+(metric==='days'?'selected':'')} aria-pressed={metric==='days'} onClick={()=>setMetric('days')}><CalendarDays size={21}/><span>Training days</span><strong>{activity.totalDays}</strong><small>Each calendar day once</small></button></div>
   <section className={'panel activity-panel '+(metric==='days'?'days-activity':'')}>
    <div className="row between activity-title"><div><span className="eyebrow">{member?member.name:'WHOLE CREW'}</span><h2>{metric==='workouts'?'Workouts':'Training days'}</h2></div><span className="activity-period-total">{total}<small>this {period}</small></span></div>
    <div className="chart-controls">{period==='month'&&<div className="segmented" aria-label="Chart grouping"><button className={monthGroup==='days'?'active':''} aria-pressed={monthGroup==='days'} onClick={()=>setMonthGroup('days')}>Daily</button><button className={monthGroup==='weeks'?'active':''} aria-pressed={monthGroup==='weeks'} onClick={()=>setMonthGroup('weeks')}>Weekly</button></div>}</div>
    <p className="chart-caption" aria-live="polite">{picked===null?'Tap a bar for '+(group==='weeks'?'weekly':group==='months'?'monthly':'daily')+' '+unit+'.':bucketLabel(picked)+' · '+values[picked]+' '+unitFor(values[picked])}</p>
    <div className="activity-chart-with-axis"><div className="chart-y-axis" aria-hidden="true"><span>{max}</span><span>{Math.floor(max/2)}</span><span>0</span></div><div className={'activity-chart chart-'+(group==='weeks'?'week':period)} role="group" aria-label={title+': '+total+' '+unitFor(total)}>
     {buckets.map((b,i)=>{const label=group==='months'?b.start.toLocaleDateString('en-GB',{month:'short'}):group==='weeks'?'W'+(i+1):period==='week'?b.start.toLocaleDateString('en-GB',{weekday:'short'}):String(b.start.getDate());const shown=group!=='days'||period!=='month'||i===0||(i+1)%5===0||i===buckets.length-1;
      return <button key={i} className={'chart-column '+(picked===i?'selected':'')} aria-pressed={picked===i} aria-label={bucketLabel(i)+': '+values[i]+' '+unitFor(values[i])} title={bucketLabel(i)+': '+values[i]+' '+unitFor(values[i])} onClick={()=>setActiveBar(i)}><span className="chart-bar-track"><span className={'chart-bar '+(values[i]?'':'zero')} style={{height:(values[i]?Math.max(3,values[i]/max*100):1)+'%'}}/>{group==='weeks'&&values[i]>0&&<span className="bar-value">{values[i]}</span>}</span><small>{shown?label:'\u00a0'}</small></button>;
     })}</div></div>
    {activity.total===0&&<p className="hint center">No results in this period. Log a workout or choose another period.</p>}
    {period==='month'&&group==='weeks'&&<p className="hint center">Monday–Sunday weeks, clipped to this month. A month can span 4–6 weeks.</p>}
   </section>
   {period==='month'&&<section className="panel weekly-summary"><span className="eyebrow">WEEK BY WEEK</span><h2>Monthly momentum</h2><p className="hint">Weekly totals for workouts and distinct training days.</p><div className="weekly-table-wrap"><table className="weekly-table"><thead><tr><th>Week</th><th>WODs</th><th>Days</th></tr></thead><tbody>{weekly.map((row,i)=><tr key={i}><th>W{i+1}<small>{row.start.getDate()}–{row.end.getDate()} {row.end.toLocaleDateString('en-GB',{month:'short'})}</small></th><td>{row.workouts}</td><td>{row.days}</td></tr>)}</tbody></table></div></section>}
   <section className="panel lifetime-panel"><div><span className="eyebrow">ALL TIME · {member?member.name:'WHOLE CREW'}</span><h2>The bigger picture</h2></div><div className="lifetime-values"><div><Activity size={18}/><strong>{activity.lifetime.workouts}</strong><span>{plural(activity.lifetime.workouts,'workout')}</span></div><div><CalendarDays size={18}/><strong>{activity.lifetime.days}</strong><span>{plural(activity.lifetime.days,'training day')}</span></div></div></section>
   <section className="panel crew-totals"><div className="row between"><h2>The crew</h2><span className="muted">{title}</span></div><p className="hint">{counted(members.filter(m=>m.total>0).length,'active member')} · Select someone to explore their activity.</p>{ranked.map((m,i)=><button className={'member-stat '+(selected===m.id?'active':'')} key={m.id} onClick={()=>setSelected(m.id)}><span className="member-rank">{i+1}</span><span className="avatar">{m.name.slice(0,2).toUpperCase()}</span><span className="member-stat-main"><strong>{m.name}{m.mine&&<small className="you">you</small>}</strong><small>{counted(m.total,'workout')} · {counted(m.totalDays,'training day')}</small></span><span className="member-total">{metric==='workouts'?m.total:m.totalDays}<small>{metric==='workouts'?'WODs':'days'}</small></span></button>)}</section>
   <p className="hint stats-footnote">Workouts count saved attempts, including repeats and partial efforts. Training days count distinct calendar dates: several workouts on one day count as one day. Whole-crew days count each date once when anyone trained. Edit a result’s Workout date to correct its place in these statistics. Older results use their original save date in {timeZone} until you set a workout date. Archived WODs and removed members keep their history; deleted results no longer count.</p>
  </>}
 </main>;
}
