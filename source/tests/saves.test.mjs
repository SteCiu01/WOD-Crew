import {test} from 'node:test';
import assert from 'node:assert/strict';
import {samePayload} from '../lib/saves.ts';
test('retry can acknowledge only the original workout or result payload',()=>{assert.equal(samePayload(['Alice',4,'rx'],['Alice',4,'rx']),true);assert.equal(samePayload(['Alice',4,'rx'],['Alice',5,'rx']),false);assert.equal(samePayload(['Alice',4,'rx'],['Alice',4,'scaled']),false);});
test('a recovered save stays idempotent when the gateway adds an opaque identity',async()=>{const {scopedSaveKey}=await import('../lib/saves.ts');const old={userId:'email-hash',legacyUserId:'email-hash'};const migrated={userId:'opaque-id',legacyUserId:'email-hash'};assert.equal(scopedSaveKey(old,'same-uuid'),scopedSaveKey(migrated,'same-uuid'));});
