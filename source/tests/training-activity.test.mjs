import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as calendar from '../lib/crew-stats.ts';
import * as query from '../lib/stats-query.ts';
import {testDatabase} from './db-helper.mjs';

test('training dates validate actual calendar days and remain stable across timezones',()=>{
 assert.equal(typeof calendar.validateTrainingDate,'function');
 assert.equal(calendar.validateTrainingDate('2024-02-29'),'2024-02-29');
 for(const date of ['2026-02-29','2026-02-30','2026-13-01','2026-1-01','','bad'])assert.throws(()=>calendar.validateTrainingDate(date));
 assert.equal(calendar.calendarDate('2026-10-10T23:18:15.087Z','Europe/Warsaw'),'2026-10-11');
 assert.equal(calendar.calendarDate('2026-10-10T23:18:15.087Z','America/New_York'),'2026-10-10');
});

test('multiple attempts on a shared day count as workouts but only one training day per member or crew',()=>{
 assert.equal(typeof calendar.summarizeActivity,'function');
 const rows=[{member_id:1,day:'2026-10-09',count:2},{member_id:1,day:'2026-10-10',count:1},{member_id:2,day:'2026-10-09',count:1},{member_id:1,day:'2025-01-01',count:1}];
 const data=calendar.summarizeActivity([{member_id:1,athlete:'Alex'},{member_id:2,athlete:'Jamie'}],rows,['2026-10-01','2026-11-01'],1);
 assert.equal(data.members[0].total,3);assert.equal(data.members[0].totalDays,2);assert.deepEqual(data.members[0].dayCounts,[2]);
 assert.deepEqual(data.members[0].lifetime,{workouts:4,days:3});assert.equal(data.crew.total,4);assert.equal(data.crew.totalDays,2);assert.deepEqual(data.crew.lifetime,{workouts:5,days:3});
});

test('weekly and cumulative chart values retain zero weeks and count days once',()=>{
 assert.equal(typeof calendar.activityBuckets,'function');const dates=calendar.periodWindow('month',new Date(2026,9,20)).dates;
 const days=[{date:'2026-10-01',workouts:2},{date:'2026-10-02',workouts:1},{date:'2026-10-20',workouts:3}];
 const weeks=calendar.activityBuckets(dates,days,'weeks');assert.deepEqual(weeks.map(x=>x.workouts),[3,0,0,3,0]);assert.deepEqual(weeks.map(x=>x.days),[2,0,0,1,0]);assert.deepEqual(weeks.map(x=>x.cumulativeWorkouts),[3,3,3,6,6]);assert.deepEqual(weeks.map(x=>x.cumulativeDays),[2,2,2,3,3]);
});

test('yearly days metric counts training dates, not active months',()=>{
 assert.equal(typeof calendar.activityBuckets,'function');const dates=calendar.periodWindow('year',new Date(2026,9,20)).dates;
 const months=calendar.activityBuckets(dates,[{date:'2026-01-02',workouts:2},{date:'2026-01-03',workouts:1},{date:'2026-10-20',workouts:3}],'months');assert.equal(months.length,12);assert.equal(months[0].days,2);assert.equal(months[9].days,1);assert.equal(months.at(-1).cumulativeDays,3);
});

test('activity SQL returns explicit training dates while preserving legacy save timestamps',()=>{
 assert.equal(typeof query.dailyActivityQuery,'string');const {sql}=testDatabase();
 sql.exec("INSERT INTO crew_members(id,name,name_key,created_at) VALUES(1,'S','s','now'); INSERT INTO workouts(id,request_key,owner_id,creator,definition,created_at) VALUES(1,'w','u','S','{}','now')");
 sql.exec("INSERT INTO attempts(request_key,wod_id,user_id,member_id,athlete,scores,source,style,notes,created_at,performed_on) VALUES('a',1,'u',1,'S','[]','manual','rx','','2026-10-11T12:00:00.000Z','2026-10-09'),('b',1,'u',1,'S','[]','manual','rx','','2026-10-11T12:00:00.000Z','2026-10-09'),('c',1,'u',1,'S','[]','manual','rx','','2026-10-10T23:30:00.000Z',NULL)");
 const rows=sql.prepare(query.dailyActivityQuery).all();assert.equal(rows.find(x=>x.day==='2026-10-09').count,2);assert.equal(rows.find(x=>x.day==='2026-10-10T23:30:00.000Z').count,1);
 assert.equal(sql.prepare('SELECT created_at FROM attempts WHERE request_key=?').get('a').created_at,'2026-10-11T12:00:00.000Z');
});
