// Mock Cloudflare D1; no network requests or writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const code=fs.readFileSync(path.join(__dirname,'../backend/worker.js'),'utf8');
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
 const sample=Array.from({length:260},(_,i)=>({id:i+1,name:'Company '+i,monitoring_status:'not_configured',source_type:'manual'}));
 let queries=0;
 const env={DB:{prepare(sql){queries++;assert.match(sql,/SELECT id,name,sector,location,website_url,careers_url/);return {all:async()=>({results:sample})};}}};
 const origin='https://career-radar-miriam.miriam-cpnh.workers.dev';
 const res=await worker.fetch(new Request('https://career-radar-api.miriam-cpnh.workers.dev/api/companies',{headers:{Origin:origin}}),env);
 const result=await res.json();
 assert.equal(res.status,200);assert.equal(result.companies.length,260);
 assert.equal(result.companies[259].monitoring_status,'not_configured');
 assert.equal(res.headers.get('access-control-allow-origin'),origin);
 assert.equal(queries,1);
 console.log('PASS: 260-company read-only catalog response with CORS');
})().catch(e=>{console.error(e);process.exitCode=1});
