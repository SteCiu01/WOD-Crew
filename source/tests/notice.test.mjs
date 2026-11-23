import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
test('the notice close button dismisses immediately and auto-dismiss cancels on unmount',t=>{
 assert(existsSync('app/components/Notice.tsx'),'A dismissible notification component is missing');
 t.mock.timers.enable({apis:['setTimeout']});let cleanup,closed=0;
 const source=ts.transpileModule(readFileSync('app/components/Notice.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};new Function('require','exports',source)(name=>name==='react'?{useEffect:fn=>{cleanup=fn();}}:require(name),exports);
 const notice=exports.default({message:'Saved',onClose:()=>{closed++;}});
 const button=notice.props.children.find(child=>child?.type==='button');assert.equal(typeof button.props.onClick,'function');button.props.onClick();assert.equal(closed,1);
 t.mock.timers.tick(10000);assert.equal(closed,2);cleanup();
 exports.default({message:'Another save',onClose:()=>{closed++;}});cleanup();t.mock.timers.tick(10000);assert.equal(closed,2);
});
