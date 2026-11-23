// Node built-in tests — no paid services or production calls.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname,'../frontend/index.html'),'utf8');
const from = source.indexOf('const GEO_COUNTRY_ALIASES');
const to = source.indexOf('function filteredJobs()',from);
assert(from > 0 && to > from,'Geographic V46 module missing');
const jobs = [
 {location:'Amsterdam, Netherlands', remote:false},
 {location:'London, UK', remote:false},
 {location:'Remote (Europe)', remote:true},
 {location:'Remote - USA', remote:true},
 {location:'Milano, Italia', remote:false},
 {location:'Tokyo, Japan', remote:false}
];
const ctx = {console, filters:{jobRegion:[],jobCountry:[],jobGeoCity:[],jobCity:[]},
 allJobs:()=>jobs, isRemotePosition:j=>Boolean(j.remote),
 workModeForJob:j=>({value:j.remote?'Remoto':''}), multiContains:()=>false};
vm.createContext(ctx);
vm.runInContext(source.slice(from,to)+';globalThis.testGeo={geoOf,geoJobPass,geoFacets,geoAvailableCountries,geoAvailableCities,locationFilterPass};',ctx);
const g=ctx.testGeo;
assert.deepEqual([...g.geoOf(jobs[0]).countries],['NL']);
assert.deepEqual([...g.geoOf(jobs[0]).cities],['Amsterdam']);
assert.deepEqual([...g.geoOf(jobs[2]).regions],['Europa']);
assert.equal(g.geoOf(jobs[2]).cities.length,0,'Remote (Europe) is not a city');
assert.deepEqual([...g.geoOf({location:'New York, NY'}).countries],['US']);
assert.deepEqual([...g.geoOf({location:'Paris / Amsterdam'}).countries],['FR','NL']);
ctx.filters.jobRegion=['Europa'];ctx.filters.jobCountry=['NL'];ctx.filters.jobGeoCity=['Amsterdam'];
assert.equal(g.geoJobPass(jobs[0]),true);
assert.equal(g.geoJobPass(jobs[1]),false);
assert.equal(g.geoJobPass(jobs[2]),true,'European remote role must pass');
assert.equal(g.geoJobPass(jobs[3]),true,'Remote role outside selected region must pass');
assert.equal(g.geoJobPass(jobs[4]),false);
assert.equal(g.geoJobPass(jobs[5]),false);
const facets=g.geoFacets();
assert(facets.regions.includes('Europa'));
assert(g.geoAvailableCountries(facets).includes('NL'));
assert(!g.geoAvailableCountries(facets).includes('JP'));
assert(g.geoAvailableCities(facets).includes('Amsterdam'));
assert(!g.geoAvailableCities(facets).includes('Tokyo'));
console.log('PASS: geographic cascade, remote inclusion, dynamic facets and ambiguous locations');
