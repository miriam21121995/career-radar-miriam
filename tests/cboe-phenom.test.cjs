const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=fs.readFileSync(require('node:path').join(__dirname,'../backend/worker.js'),'utf8');
const start=src.indexOf('async function getPhenomJobs('),end=src.indexOf('async function getATSJobs(',start);
assert(start>=0&&end>start,'Phenom connector missing');
const seen=[];
const ctx={
 console,AbortSignal,encodeURIComponent,
 fetch:async(url,opts)=>{
  assert.equal(url,'https://careers.cboe.com/widgets');
  const input=JSON.parse(opts.body);seen.push(input.from);
  return {ok:true,json:async()=>({refineSearch:{data:{totalHits:2,jobs:[
   {title:'Software Engineer',jobSeqNo:'R-1',location:'Amsterdam',country:'Netherlands',locale:'en_US'},
   {title:'Project Manager',jobSeqNo:'R-2',location:'Amsterdam',country:'Netherlands',locale:'en_US'}
  ]}}})};
 }};
vm.createContext(ctx);vm.runInContext(src.slice(start,end)+';globalThis.readPhenom=getPhenomJobs;',ctx);
(async()=>{
 const jobs=await ctx.readPhenom({board:'careers.cboe.com',ats:'phenom'},{probe:true});
 assert.equal(jobs.length,2);
 assert.equal(jobs.reportedTotal,2);
 assert.equal(jobs.partial,false);
 assert.equal(jobs[0].location.name,'Amsterdam, Netherlands');
 assert.equal(jobs[0].absolute_url,'https://careers.cboe.com/us/en/job/R-1');
 assert.deepEqual(seen,[0]);
 assert.equal(await ctx.readPhenom({board:'careers.other.com',ats:'phenom'},{probe:true}),null);
 console.log('PASS: guarded Phenom connector, normalized titles and Amsterdam locations');
})().catch(e=>{console.error(e);process.exitCode=1});
