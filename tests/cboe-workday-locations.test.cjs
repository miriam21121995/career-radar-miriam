const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../backend/worker.js'),'utf8');
const begin=source.indexOf('function workdaySite(raw)');
const end=source.indexOf('// V42: Workable',begin);
assert(begin>=0&&end>begin);
let requests=[];
const ctx={URL,AbortSignal,encodeURIComponent,console,fetch:async(url,opts)=>{
 requests.push({url,method:opts.method||'GET',redirect:opts.redirect});
 if(url.endsWith('/jobs'))return {ok:true,json:async()=>({total:2,jobPostings:[
  {title:'Senior Software Engineer Realtime',externalPath:'/job/London/Realtime_R-4581',locationsText:'2 Locations'},
  {title:'UX Owner',externalPath:'/job/Amsterdam/Owner_R-4711',locationsText:'Amsterdam'}
 ]})};
 if(url.includes('/job/London/Realtime_R-4581'))return {ok:true,json:async()=>({jobPostingInfo:{location:'London, United Kingdom',additionalLocations:['Amsterdam, Netherlands']}})};
 throw Error('unexpected request: '+url);
}};
vm.createContext(ctx);
vm.runInContext(source.slice(begin,end)+';globalThis.wd=getWorkdayJobs;',ctx);
(async()=>{
 let jobs=await ctx.wd({careers:'https://cboe.wd1.myworkdayjobs.com/en-US/External_Career_CBOE'},{probe:true});
 assert.equal(jobs.length,2);
 assert.equal(jobs[0].location.name,'London, United Kingdom / Amsterdam, Netherlands');
 assert.equal(jobs[1].location.name,'Amsterdam');
 assert.equal(jobs.locationCoverageIncomplete,false);
 assert.equal(jobs.partial,false);
 assert.equal(requests.length,2);
 assert.equal(requests[1].redirect,'manual');
 requests=[];
 const other=await ctx.wd({careers:'https://hrhub.wd3.myworkdayjobs.com/en-US/Euronext_Career_Page'},{probe:true});
 assert.equal(requests.length,1,'Other Workday tenants must not incur extra detail requests');
 assert.equal(other[0].location.name,'2 Locations');
 console.log('PASS: Cboe multi-location roles include Amsterdam; unrelated Workday boards unchanged');
})().catch(e=>{console.error(e);process.exitCode=1});