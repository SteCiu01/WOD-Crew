import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {statsQuery,rosterQuery} from '../lib/stats-query.ts';
import {periodWindow} from '../lib/crew-stats.ts';
import {backfillMembers} from '../lib/member-store.ts';
import {testDatabase} from './db-helper.mjs';
test('two Alex browser profiles merge into one crew member without losing today’s result',async()=>{
 const db=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));
 db.exec("INSERT INTO workouts(request_key,owner_id,creator,definition,created_at) VALUES('w','old-profile','Alex','{}','2026-10-06')");
 const insert=db.prepare("INSERT INTO attempts(request_key,wod_id,user_id,athlete,scores,source,style,notes,created_at) VALUES(?,1,? ,?,'[]','manual','rx','',?)");
 insert.run('old','old-profile','Alex','2026-10-06T17:00:00.000Z');
 insert.run('new','new-profile','Alex','2026-10-20T17:15:00.000Z');
 insert.run('jamie','jamie-profile','Jamie','2026-10-20T18:00:00.000Z');
 const adapter={prepare(query){let args=[];return {bind(...v){args=v;return this;},async all(){return {results:db.prepare(query).all(...args)};},async run(){return db.prepare(query).run(...args);}};},async batch(statements){for(const s of statements)await s.run();}};await backfillMembers(adapter);await backfillMembers(adapter);
 const roster=db.prepare(rosterQuery).all();assert.deepEqual(roster.map(x=>x.athlete).sort(),['Alex','Jamie']);
 const alex=roster.find(x=>x.athlete==='Alex').member_id;
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE member_id=?').get(alex).n,2);
 assert.equal(db.prepare('SELECT creator_member_id FROM workouts WHERE id=1').get().creator_member_id,alex);
 const q=statsQuery(['2026-10-20T00:00:00.000Z','2026-10-21T00:00:00.000Z']);
 assert.equal(db.prepare(q.sql).all(...q.params).find(x=>x.member_id===alex).count,1);
 db.close();
});
test('Warsaw DST week keeps seven calendar days with a 25-hour Sunday',()=>{
 const previous=process.env.TZ;process.env.TZ='Europe/Warsaw';
 try{const w=periodWindow('week',new Date(2026,9,25));assert.equal(w.boundaries.length,8);assert.equal((Date.parse(w.boundaries[7])-Date.parse(w.boundaries[6]))/3600000,25);}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
