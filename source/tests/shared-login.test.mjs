import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function page(){
 const source=ts.transpileModule(readFileSync('app/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};const require=name=>name==='./chatgpt-auth'?{requireChatGPTUser:async()=>{throw Error('ChatGPT sign-in requested');}}:name==='./components/Crew'?{default:'Crew'}:{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 vm.runInNewContext(source,{exports,require});return async()=>{let result=await exports.default({searchParams:Promise.resolve({wod:'42'})});while(typeof result?.type==='function')result=await result.type(result.props);return result;};
}
test('shared links open Crew without any ChatGPT identity or login redirect',async()=>{const result=await page()();assert.equal(result.type,'Crew');assert.equal(result.props.initialName,'');});
