const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../backend/worker.js'),'utf8');
const start=source.indexOf('function workdaySite(raw)');
const end=source.indexOf('// V42: Workable',start);
assert(start>=0&&end>start);
let globalCount=680,emeaCount=135,facetsEnabled=true,unknownLabel=false,facetMode='nested',requests=[];
const ctx={URL,AbortSignal,encodeURIComponent,Intl,console,fetch:async(url,opts)=>{
 const input=JSON.parse(opts.body);
 requests.push(input);
 assert.equal(opts.redirect,'manual');
 const selected=input.appliedFacets.locationHierarchy1||input.appliedFacets.locationCountry||[];
 const isFiltered=selected.length>0;
 const total=isFiltered?emeaCount:globalCount;
 const pageSize=Math.min(20,Math.max(0,total-input.offset));
 const first=Array.from({length:pageSize},(_,i)=>{
  const n=input.offset+i;
  return {title:'Position '+n,externalPath:'/job/London/Position_'+n,locationsText:'London'};
 });
 return {ok:true,json:async()=>({
  total,jobPostings:first,
  facets:facetsEnabled?facetMode==='nested'?[{facetParameter:'locationMainGroup',values:[
   {facetParameter:'locationHierarchy2',descriptor:'Workplace',values:[{id:'Z1',descriptor:'Onsite',count:100}]},
   {facetParameter:'locationHierarchy1',descriptor:'Country',values:[
   {id:'A1',descriptor:'United Kingdom',count:70},
   {id:'A2',descriptor:'Poland',count:35},
   {id:'A3',descriptor:'Romania',count:30},
   {id:'B1',descriptor:'India',count:300},
   {id:'B2',descriptor:unknownLabel?'Unknownia':'United States of America',count:245}
  ]}
  ]}]:[{facetParameter:'locationCountry',values:[
   {id:'A1',descriptor:'United Kingdom',count:70},
   {id:'A2',descriptor:'Poland',count:35},
   {id:'A3',descriptor:'Romania',count:30},
   {id:'B1',descriptor:'India',count:300},
   {id:'B2',descriptor:unknownLabel?'Unknownia':'United States of America',count:245}
  ]}]:[]
 })};
}};
vm.createContext(ctx);
vm.runInContext(source.slice(start,end)+';globalThis.getLseg=getWorkdayJobs;',ctx);
(async()=>{
 const spec={careers:'https://lseg.wd3.myworkdayjobs.com/en-US/Careers'};
 const jobs=await ctx.getLseg(spec,{probe:true});
 assert.equal(jobs.reportedTotal,135);
 assert.equal(jobs.globalTotal,680);
 assert.equal(jobs.length,135);
 assert.equal(jobs.partial,false);
 assert.equal(jobs.scope,'EMEA');
 assert.deepEqual([...jobs.scopeCountries],['United Kingdom','Poland','Romania']);
 assert.equal(requests.length,8);
 for(const q of requests.slice(1)){
  assert.equal(q.appliedFacets.locationHierarchy1.join(','),'A1,A2,A3');
  assert.equal(q.appliedFacets.locationHierarchy1.includes('B1'),false);
 }
 requests=[];unknownLabel=true;
 const diagnostic={};
 const unsafe=await ctx.getLseg(spec,{probe:true,diagnostic});
 assert.equal(unsafe,null);
 assert.match(diagnostic.error,/Paesi non classificati/);
 assert.equal(requests.length,1);
 requests=[];unknownLabel=false;facetsEnabled=false;
 const missing=await ctx.getLseg(spec,{probe:true,diagnostic:{}});
 assert.equal(missing,null);
 assert.equal(requests.length,1);
 requests=[];facetsEnabled=true;emeaCount=420;
 const oversized=await ctx.getLseg(spec,{probe:true});
 assert.equal(oversized.reportedTotal,420);
 assert.equal(oversized.partial,true);
 assert.equal(oversized.probeLimitExceeded,300);
 assert.equal(requests.length,2);
 requests=[];emeaCount=135;facetMode='flat';
 const flat=await ctx.getLseg(spec,{probe:true});
 assert.equal(flat.length,135);
 assert.equal(flat.partial,false);
 assert.equal(requests[1].appliedFacets.locationCountry.join(','),'A1,A2,A3');
 console.log('PASS: LSEG country scoped EMEA, no global first-page truncation, fail-closed missing/unknown facets, safe oversize');
})().catch(e=>{console.error(e);process.exitCode=1});
