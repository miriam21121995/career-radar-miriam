const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=fs.readFileSync(require('node:path').join(__dirname,'../backend/worker.js'),'utf8');
const start=src.indexOf('async function ensureSourceHealth('),end=src.indexOf('async function runScheduledSource(',start);
assert(start>0&&end>start,'Health writer not found');
(async()=>{
 const writes=[],env={
  DB:{prepare(sql){return {
   bind(...args){this.args=args;return this},
   async run(){writes.push({sql,args:this.args||[]});return {meta:{changes:1}}},
   async first(){return {n:37}}
  }}}
 };
 let next={partial:true,imported:300,total:680};
 const ctx={Date,console,runScheduledSource:async()=>next};
 vm.createContext(ctx);
 vm.runInContext(src.slice(start,end)+';globalThis.recordSource=trackSourceRun;',ctx);
 const entries=[['source-1',{ats:'workday',board:'lseg-Careers',name:'LSEG'}]];
 function last(){return writes.filter(x=>x.sql.includes('INSERT INTO source_health')).at(-1)}
 await ctx.recordSource(env,Date.now(),0,entries);
 assert.equal(last().args[2],'partial','truncated feed must never be marked successful');
 assert.match(last().args[5],/300 su 680/);
 assert.equal(last().args[6],37,'active jobs count is reported even if partial');
 next={partial:false,imported:111,total:111};
 await ctx.recordSource(env,Date.now(),0,entries);
 assert.equal(last().args[2],'success');
 assert.equal(last().args[5],null);
 ctx.runScheduledSource=async()=>{throw Error('ATS HTTP 403')};
 // Code's global reference resolves the updated context function.
 await assert.rejects(ctx.recordSource(env,Date.now(),0,entries),/ATS HTTP 403/);
 assert.equal(last().args[2],'error');
 assert.match(last().args[5],/403/);
 console.log('PASS: partial feed is not success; complete and failed feeds reported accurately');
})().catch(e=>{console.error(e);process.exitCode=1});
