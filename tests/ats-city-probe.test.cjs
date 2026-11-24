const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'../backend/worker.js'),'utf8');
const begin=code.indexOf('function probeCityJobs(');
const end=code.indexOf('async function probePublicBoard(',begin);
assert(begin>=0&&end>begin);
const ctx={};vm.createContext(ctx);vm.runInContext(code.slice(begin,end)+';globalThis.run=probeCityJobs;',ctx);
const jobs=[
 {title:'Senior Software Engineer',location:{name:'London, UK / Amsterdam, Netherlands'},absolute_url:'https://careers.cboe.com/1'},
 {title:'Lead UX',location:{name:'Amsterdam, Netherlands'},absolute_url:'https://careers.cboe.com/2'},
 {title:'Marketing',location:{name:'London, UK'},absolute_url:'https://careers.cboe.com/3'}
];
const result=ctx.run(jobs,'Amsterdam');
assert.equal(result.total,2);assert.equal(result.city,'Amsterdam');
assert.deepEqual([...result.roles.map(x=>x.title)],['Senior Software Engineer','Lead UX']);
assert.equal(ctx.run(jobs,''),null);
assert.equal(ctx.run(jobs,'A'.repeat(61)),null);
console.log('PASS: read-only city coverage counts multi-location Amsterdam roles');
