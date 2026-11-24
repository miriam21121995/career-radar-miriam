const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=fs.readFileSync(require('node:path').join(__dirname,'../backend/worker.js'),'utf8');
const wdStart=src.indexOf('function workdaySite(raw)');
const wdEnd=src.indexOf('// V42: Workable',wdStart);
const phStart=src.indexOf('async function getPhenomJobs(');
const phEnd=src.indexOf('async function getATSJobs(',phStart);
assert(wdStart>0&&wdEnd>wdStart&&phStart>0&&phEnd>phStart);
(async()=>{
  let workdayRequests=0,phenomRequests=0;
  const ctx={URL,AbortSignal,encodeURIComponent,console,fetch:async(url,opts)=>{
    const body=JSON.parse(opts.body);
    if(url.includes('myworkdayjobs.com')){
      workdayRequests++;
      const offset=body.offset;
      return {ok:true,json:async()=>({total:112,jobPostings:Array.from({length:Math.min(20,112-offset)},(_,i)=>{
        const n=offset+i;
        return {title:'Role '+n,externalPath:'/job/Milan/Role_'+n,locationsText:'Milan, Italy'};
      })})};
    }
    if(url==='https://careers.cboe.com/widgets'){
      phenomRequests++;
      const from=body.from;
      return {ok:true,json:async()=>({refineSearch:{data:{totalHits:112,jobs:Array.from({length:Math.min(50,112-from)},(_,i)=>{
        const n=from+i;
        return {title:'Role '+n,jobSeqNo:'R-'+n,location:'Amsterdam',country:'Netherlands',locale:'en_US'};
      })}}})};
    }
    throw Error('Unexpected fetch: '+url);
  }};
  vm.createContext(ctx);
  vm.runInContext(src.slice(wdStart,wdEnd)+src.slice(phStart,phEnd)+';globalThis.readers={workday:getWorkdayJobs,phenom:getPhenomJobs};',ctx);
  const a=await ctx.readers.workday({careers:'https://hrhub.wd3.myworkdayjobs.com/en-US/Euronext_Career_Page'},{probe:true});
  assert.equal(a.reportedTotal,112);assert.equal(a.length,112);assert.equal(a.partial,false);assert.equal(workdayRequests,6);
  const b=await ctx.readers.phenom({board:'careers.cboe.com'},{probe:true});
  assert.equal(b.reportedTotal,112);assert.equal(b.length,112);assert.equal(b.partial,false);assert.equal(phenomRequests,3);
  console.log('PASS: Euronext Workday and Cboe Phenom complete pagination above old probe caps');
})().catch(e=>{console.error(e);process.exitCode=1});
