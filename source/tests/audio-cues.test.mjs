import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timerCue} from '../lib/audio-cues.ts';
const phase={kind:'work',round:2,rounds:8};
test('short intervals still announce start before countdown',()=>{assert.equal(timerCue(phase,3,true),'work');assert.equal(timerCue(phase,2,false),'tick');});
test('rest and preparation have distinct cues',()=>{assert.equal(timerCue({...phase,kind:'rest'},10,true),'rest');assert.equal(timerCue({...phase,kind:'prepare'},10,true),'ready');});
test('no repeated work cues during interval or at zero',()=>{assert.equal(timerCue(phase,20,false),null);assert.equal(timerCue(phase,0,false),null);});
