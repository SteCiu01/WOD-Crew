#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const catalogRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const artifactFiles=['lib/wod-catalog.json','lib/wod-daily-examples.json','lib/catalog-review.json','lib/catalog.ts','lib/wod-examples.ts','lib/conversion-plans.json','lib/conversion-audit.json','lib/conversion-review.mjs','lib/workout.ts','lib/language.ts','app/components/WodExamples.tsx'];
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function catalogManifest(root=catalogRoot){
 const benchmarks=JSON.parse(readFileSync(resolve(root,'lib/wod-catalog.json'),'utf8'));
 const daily=JSON.parse(readFileSync(resolve(root,'lib/wod-daily-examples.json'),'utf8'));
 const review=JSON.parse(readFileSync(resolve(root,'lib/catalog-review.json'),'utf8'));
 const entries=[...benchmarks.examples,...daily.examples];
 if(benchmarks.examples.length!==399||benchmarks.sourceCount!==399||daily.examples.length!==12||new Set(entries.map(e=>e.id)).size!==411)throw new Error('Expected all 399 benchmarks and 12 distinct daily entries.');
 const files=Object.fromEntries(artifactFiles.map(file=>[file,sha256(readFileSync(resolve(root,file)))]));
 return {version:2,algorithm:'sha256',counts:{benchmarks:399,daily:12,total:411,prescriptionLines:entries.reduce((n,e)=>n+e.prescription.length,0),loadLines:entries.reduce((n,e)=>n+e.loads.length,0),rewrittenLines:review.rewrittenLines.length},provenance:'Existing local snapshots; retrieval metadata is historical, not fresh verification.',files,sha256:sha256(artifactFiles.map(file=>`${file}\0${files[file]}\n`).join(''))};
}
export const manifestText=root=>JSON.stringify(catalogManifest(root),null,2)+'\n';

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(!(args.length===0||(args.length===1&&args[0]==='--check')||(args.length===2&&args[0]==='--out')))throw new Error('Usage: node scripts/sync-wod-catalog.mjs [--check | --out DESTINATION_SOURCE]');
 const expected=manifestText(catalogRoot),manifestPath=resolve(catalogRoot,'lib/catalog-manifest.json');
 if(args[0]==='--check'){
  if(readFileSync(manifestPath,'utf8')!==expected)throw new Error('Catalog manifest is stale. Run node scripts/sync-wod-catalog.mjs.');
 }else{
  writeFileSync(manifestPath,expected);
  if(args[0]==='--out'){
   const destination=resolve(args[1]);mkdirSync(destination,{recursive:true});
   if(destination!==catalogRoot)for(const file of [...artifactFiles,'lib/catalog-manifest.json']){
    mkdirSync(dirname(resolve(destination,file)),{recursive:true});
    copyFileSync(resolve(catalogRoot,file),resolve(destination,file));
   }
  }
 }
 console.log(`Catalog: 399 benchmarks + 12 daily; sha256 ${JSON.parse(expected).sha256}`);
}
