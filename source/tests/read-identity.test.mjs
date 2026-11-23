import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
test('reading identity never attempts database writes, including an existing Sites session',async()=>{
 const user={userId:'crew-profile:local',aliases:['crew-profile:local','sites-email:legacy']};
 let source=readFileSync('lib/server.ts','utf8').replace(/^import .*;\n/gm,'');
 source='const env={}; const getChatGPTUser=async()=>('+JSON.stringify(user)+');\n'+source;
 const mod=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
 assert.deepEqual(await mod.identity(),user);
});
