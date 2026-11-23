import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readDispatchIdentity} from '../lib/dispatch-identity.ts';
const identity=(headers,site='test-site')=>readDispatchIdentity(new Headers(headers),site);
test('recognizes Sites authenticated-email sessions without an opaque ID',async()=>{
 const user=await identity({'oai-authenticated-user-email':'alex@example.test','oai-authenticated-user-full-name':'Alex%20Sample','oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'});
 assert.ok(user);assert.equal(user.fullName,'Alex Sample');assert.match(user.userId,/^sites-email:/);assert.ok(!user.userId.includes('alex'));
});
test('prefers opaque platform ID and retains legacy alias for existing ownership',async()=>{const legacy=await identity({'oai-authenticated-user-email':'alex@example.test'});const current=await identity({'oai-authenticated-user-email':'alex@example.test','oai-authenticated-user-id':'opaque-123'});assert.equal(current.userId,'opaque-123');assert.equal(current.legacyUserId,legacy.userId);});
test('unauthenticated requests and arbitrary names do not establish identity',async()=>{assert.equal(await identity({}),null);assert.equal(await identity({'oai-authenticated-user-full-name':'Alex'}),null);assert.equal(await identity({'oai-authenticated-user-email':'   '}),null);});
test('legacy identities are normalized, site-scoped, and distinct by user',async()=>{const a=await identity({'oai-authenticated-user-email':'Alex@Example.test'});const b=await identity({'oai-authenticated-user-email':'alex@example.test'});const c=await identity({'oai-authenticated-user-email':'friend@example.test'});const d=await identity({'oai-authenticated-user-email':'alex@example.test'},'other-site');assert.equal(a.userId,b.userId);assert.notEqual(a.userId,c.userId);assert.notEqual(a.userId,d.userId);});
test('public visitors get a stable site-scoped identity from an unguessable local profile key',async()=>{
 const key='wc_1234567890abcdef1234567890abcdef';
 const a=await identity({'x-wod-crew-profile':key});const b=await identity({'x-wod-crew-profile':key});const c=await identity({'x-wod-crew-profile':key},'other-site');
 assert.ok(a);assert.match(a.userId,/^crew-profile:/);assert.equal(a.userId,b.userId);assert.notEqual(a.userId,c.userId);assert.equal(a.email,'');
});
test('local profile is primary while an existing ChatGPT identity remains an ownership alias',async()=>{
 const key='wc_abcdef1234567890abcdef1234567890';
 const local=await identity({'x-wod-crew-profile':key,'oai-authenticated-user-email':'alex@example.test','oai-authenticated-user-id':'opaque-123'});
 assert.match(local.userId,/^crew-profile:/);assert.deepEqual([...local.aliases],[local.userId,'opaque-123',local.legacyUserId]);
});
test('malformed public profile keys are rejected',async()=>{assert.equal(await identity({'x-wod-crew-profile':'Alex'}),null);assert.equal(await identity({'x-wod-crew-profile':'wc_short'}),null);});
