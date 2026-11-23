// Read-only, local-state synchronization regression test.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(require('node:path').join(__dirname,'../frontend/index.html'),'utf8');
const start=s.indexOf('let companyD1Sync='),end=s.indexOf('async function loadLive()',start);
assert(start>=0 && end>start,'Company sync module missing');
const local={name:'Acme',id:'abc',favorite:true,notes:'Do not overwrite',url:'https://acme.example',monitoring:'not_configured'};
const data={companies:[local],removedCompanyNames:['Hidden']};let saves=0,renders=0;
const ctx={data,view:'companies',console,API_BASE:'https://example.invalid',nameKey:x=>String(x).toLowerCase(),save:()=>saves++,render:()=>renders++,AbortSignal,fetch:async()=>({ok:true,json:async()=>({ok:true,companies:[{id:1,name:'Acme',monitoring_status:'active',careers_url:'https://new.example',website_url:'https://different.example'},{id:2,name:'Second',monitoring_status:'not_configured',careers_url:null},{id:3,name:'Hidden',monitoring_status:'active'}]})})};
vm.createContext(ctx);vm.runInContext(s.slice(start,end)+';globalThis.runSync=syncCompanyCatalog;',ctx);
(async()=>{await ctx.runSync();assert.equal(data.companies.length,2);assert.equal(local.favorite,true);assert.equal(local.notes,'Do not overwrite');assert.equal(local.url,'https://acme.example');assert.equal(local.monitoring,'active');assert.equal(data.companies[1].monitoring,'not_configured');assert.equal(saves,1);assert.equal(renders,1);console.log('PASS: D1 sync preserves notes, favorites, exclusions and adds missing companies');})().catch(e=>{console.error(e);process.exitCode=1});
