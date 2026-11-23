import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function testDatabase(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 let tail=Promise.resolve();
 const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async all(){return {results:sql.prepare(query).all(...values)};},async first(){return sql.prepare(query).get(...values)??null;},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}};}};},batch(statements){const next=tail.then(async()=>{sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}});tail=next.catch(()=>{});return next;}};
 return {sql,db};
}
