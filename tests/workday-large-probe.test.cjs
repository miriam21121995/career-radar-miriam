const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'../backend/worker.js'),'utf8');
const begin=code.indexOf('function workdaySite(raw)'),end=code.indexOf('// V42: Workable',begin);
assert(begin>=0&&end>begin);
const requests=[];
let total=655;
const ctx={URL,AbortSignal,encodeURIComponent,console,fetch:async(url,opts)=>{
  const body=JSON.parse(opts.body);requests.push({url,offset:body.offset});
  const size=Math.min(20,total-body.offset);
  return {ok:true,json:async()=>({total,jobPostings:Array.from({length:size},(_,i)=>{
   const n=body.offset+i;
   return {title:'Role '+n,externalPath:'/job/London/Role_'+n,locationsText:'London'};
  })})};
}};
vm.createContext(ctx);
vm.runInContext(code.slice(begin,end)+';globalThis.read=getWorkdayJobs;',ctx);
(async()=>{
 const careers='https://largecorp.wd3.myworkdayjobs.com/en-US/Careers';
 const large=await ctx.read({careers},{probe:true});
 assert.equal(large.length,20);
 assert.equal(large.reportedTotal,655);
 assert.equal(large.partial,true);
 assert.equal(large.probeLimitExceeded,300);
 assert.equal(requests.length,1,'large board probe must avoid 15 sequential fetches');
 requests.length=0;
 const importJobs=await ctx.read({careers},{probe:false});
 assert.equal(importJobs.length,300);
 assert.equal(importJobs.partial,true);
 assert.equal(requests.length,15,'import remains capped and must not pretend completeness');
 requests.length=0;total=111;
 const small=await ctx.read({careers:'https://hrhub.wd3.myworkdayjobs.com/en-US/Euronext_Career_Page'},{probe:true});
 assert.equal(small.length,111);
 assert.equal(small.partial,false);
 assert.equal(small.probeLimitExceeded,undefined);
 assert.equal(requests.length,6);
 console.log('PASS: generic oversized Workday board fast safe probe, Euronext unchanged');
})().catch(e=>{console.error(e);process.exitCode=1});