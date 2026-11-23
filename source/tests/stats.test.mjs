import {test} from 'node:test';
import assert from 'node:assert/strict';
const stats=await import('../lib/crew-stats.ts').catch(()=>({}));
test('calendar periods start Monday, include leap days and navigate across years',()=>{
 assert.equal(typeof stats.periodWindow,'function','Calendar stats are not implemented');
 const w=stats.periodWindow('week',new Date(2026,9,11));assert.equal(w.start.getDay(),1);assert.equal(w.start.getDate(),5);assert.equal(w.boundaries.length,8);
 const m=stats.periodWindow('month',new Date(2024,1,15));assert.equal(m.boundaries.length,30);
 const y=stats.periodWindow('year',new Date(2026,9,8));assert.equal(y.boundaries.length,13);assert.equal(y.end.getFullYear(),2027);
 assert.equal(stats.shiftPeriod('month',new Date(2026,0,31),1).getMonth(),1);
});
test('stats rejects invalid and unordered bucket boundaries',()=>{
 assert.equal(typeof stats.validateBoundaries,'function','Stats validation is not implemented');
 assert.throws(()=>stats.validateBoundaries(['bad','bad']));
 assert.throws(()=>stats.validateBoundaries(['2026-10-02T00:00:00.000Z','2026-10-01T00:00:00.000Z']));
});
