const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../backend/worker.js'),'utf8');

// Cloudflare Workers throws TypeError before any network request when
// redirect:'error' is passed to fetch. Check every ATS request, not just Cboe.
assert(!/redirect\s*:\s*['"]error['"]/.test(src), 'Cloudflare-incompatible redirect mode found');
assert((src.match(/redirect\s*:\s*['"]manual['"]/g)||[]).length >= 5, 'all ATS and Workday detail fetches must reject redirects');

const begin=src.indexOf('function workdaySite(raw)');
const end=src.indexOf('// V42: Workable',begin);
const phenomBegin=src.indexOf('async function getPhenomJobs(');
const phenomEnd=src.indexOf('async function getATSJobs(',phenomBegin);
assert(begin>=0&&end>begin&&phenomBegin>=0&&phenomEnd>phenomBegin);

const requests=[];
const context={URL,console,AbortSignal,encodeURIComponent,fetch:async(url,init)=>{
 requests.push({url,redirect:init.redirect});
 assert.equal(init.redirect,'manual');
 // A response redirect must never be followed to a new host.
 return {ok:false,status:302,headers:{get:()=>null}};
}};
vm.createContext(context);
vm.runInContext(src.slice(begin,end)+src.slice(phenomBegin,phenomEnd)+';globalThis.testATS={getWorkdayJobs,getPhenomJobs};',context);

(async()=>{
 const wdDiag={},phDiag={};
 const wd=await context.testATS.getWorkdayJobs({careers:'https://hrhub.wd3.myworkdayjobs.com/en-US/Euronext_Career_Page'},{probe:true,diagnostic:wdDiag});
 const ph=await context.testATS.getPhenomJobs({board:'careers.cboe.com'},{probe:true,diagnostic:phDiag});
 assert.equal(wd,null);
 assert.equal(ph,null);
 assert.equal(wdDiag.error,'HTTP 302');
 assert.equal(phDiag.error,'HTTP 302');
 assert.equal(requests.length,2,'redirect response should not trigger another request');
 assert(requests[0].url.includes('myworkdayjobs.com'));
 assert.equal(requests[1].url,'https://careers.cboe.com/widgets');
 console.log('PASS: Cloudflare-compatible redirects, strict manual 3xx rejection for Euronext/Cboe');
})().catch(e=>{console.error(e);process.exitCode=1});
