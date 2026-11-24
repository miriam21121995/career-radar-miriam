// Career Radar API V26 (company catalog read-only; atomic refresh leases, safe retries, Teamtailor verified-domain fallback, CPU-saving compact reads; V42 Workable + Recruitee; V41 Workday limited connector + V40 web discovery) — previous features preserved; originally V15.1 — Greenhouse, Lever, Ashby, SmartRecruiters, Workday.
// Cloudflare Worker + D1. CV e candidature private restano nel browser.

// V19: conservative text-derived signals. Explicitly NOT verified employment terms.
function postingSignals(title,location,description){
  const t=String(title||''),loc=String(location||''),d=String(description||'').slice(0,24000);
  const modeText=(loc+' '+t).toLowerCase();
  const remote=/(?:\bremote\b|\bremotely\b|\bfully distributed\b|\bwork from home\b|\bhome.based\b|\bremot[oa]\b|\btelelavoro\b)/i;
  const hybrid=/(?:\bhybrid\b|\bibrid[oa]\b|\bpartly remote\b|\bpartially remote\b)/i;
  let workMode='';
  if(hybrid.test(modeText))workMode='Ibrido';
  else if(remote.test(modeText))workMode='Remoto';
  else {
    // Scan only strong, affirmative work-arrangement statements in the description.
    const positive=(d.match(/(?:work arrangement|working model|work model|work location|location type|modalit[aà] di lavoro|this position is|the role is|position is)\s*[:\-]?\s*[^.\n]{0,95}/gi)||[]).join(' ');
    if(hybrid.test(positive))workMode='Ibrido';
    else if(remote.test(positive) && !/\bnot\s+remote\b|\bno\s+remote\b/i.test(positive))workMode='Remoto';
  }
  let seniority='';
  if(/\b(intern(ship)?|stage|trainee)\b/i.test(t))seniority='Internship';
  else if(/\b(junior|jr\.?|graduate|entry.level)\b/i.test(t))seniority='Junior';
  else if(/\b(senior|sr\.?)\b/i.test(t))seniority='Senior';
  else if(/\b(head of|director|vice president|vp\b|chief\b)\b/i.test(t))seniority='Director / Executive';
  else if(/\b(lead|principal)\b/i.test(t))seniority='Lead / Head';
  let employment='';
  if(/\b(part.time|part time|tempo parziale)\b/i.test(t+' '+d))employment='Part-time';
  else if(/\b(full.time|full time|tempo pieno)\b/i.test(t+' '+d))employment='Full-time';
  let contract='';
  const contractContext=(t+' '+d).slice(0,24000);
  if(/\b(fixed.term contract|fixed term contract|temporary contract|contratto a tempo determinato)\b/i.test(contractContext))contract='Determinato';
  else if(/\b(permanent contract|permanent position|contratto a tempo indeterminato)\b/i.test(contractContext))contract='Indeterminato';
  else if(/\b(freelance|independent contractor|contractor position)\b/i.test(contractContext))contract='Freelance / Contractor';
  else if(/\b(internship contract|internship position|stage curriculare)\b/i.test(contractContext))contract='Stage';
  return {workMode,seniority,employment,contract,derived:true};
}

const FRONTEND_ORIGIN = 'https://career-radar-miriam.miriam-cpnh.workers.dev';
const PAGE_SIZE = 12;
/** @typedef {{ name:string, ats?:string, board:string, region:string, sector:string, location:string, website:string, careers:string }} SourceDefinition */
/** @typedef {{ name:string, ats:string, board:string, region:string, sector:string, location:string, website:string, careers:string }} MonitoredSource */
/** @type {Readonly<Record<string, SourceDefinition>>} */
const SOURCES = Object.freeze({

  remotecom: {name:'Remote',ats:'greenhouse',board:'remotecom',region:'global',sector:'Technology & HR',location:'Remote / globale',website:'https://remote.com/',careers:'https://job-boards.greenhouse.io/remotecom'},
  heritageholdings: {name:'Heritage Holdings',ats:'greenhouse',board:'heritageholdings',region:'global',sector:'Investments & Private Markets',location:'Milano / Parigi / Remote',website:'https://www.heritageholdings.co/',careers:'https://job-boards.greenhouse.io/heritageholdings'},
  fueled: {name:'Fueled',ats:'greenhouse',board:'fueledcareers',region:'global',sector:'Creative & Digital',location:'Remote / globale',website:'https://fueled.com/',careers:'https://job-boards.greenhouse.io/fueledcareers'},

  qonto: {name:'Qonto',ats:'ashby',board:'qonto',region:'global',sector:'Fintech & Banking',location:'Milano / Parigi / Europa',website:'https://qonto.com/',careers:'https://jobs.ashbyhq.com/qonto'},
  mollie: {name:'Mollie',ats:'ashby',board:'mollie',region:'global',sector:'Fintech & Payments',location:'Amsterdam / Milano',website:'https://www.mollie.com/',careers:'https://jobs.ashbyhq.com/mollie'},
  linear: {name:'Linear',ats:'ashby',board:'linear',region:'global',sector:'Technology & Creative',location:'Europa / remoto',website:'https://linear.app/',careers:'https://jobs.ashbyhq.com/linear'},
  imc: {
    name: 'IMC Trading', board: 'imc', region: 'eu', sector: 'Trading & Finance',
    location: 'Amsterdam', website: 'https://www.imc.com/',
    careers: 'https://job-boards.eu.greenhouse.io/imc'
  },
  flowtraders: {
    name: 'Flow Traders', board: 'flowtraders', region: 'global', sector: 'Trading & Finance',
    location: 'Amsterdam', website: 'https://www.flowtraders.com/',
    careers: 'https://job-boards.greenhouse.io/flowtraders'
  },
  gocardless: {
    name: 'GoCardless', board: 'gocardless', region: 'global', sector: 'Trading & Finance',
    location: 'Europa', website: 'https://gocardless.com/',
    careers: 'https://job-boards.greenhouse.io/gocardless'
  },
  davinci: {
    name: 'Da Vinci Derivatives', board: 'davinciderivatives', region: 'global', sector: 'Trading & Finance',
    location: 'Amsterdam', website: 'https://www.davinciderivatives.com/',
    careers: 'https://job-boards.greenhouse.io/davinciderivatives'
  },
  maven: {
    name: 'Maven Securities', board: 'mavensecuritiesholdingltd', region: 'global', sector: 'Trading & Finance',
    location: 'Amsterdam / Londra', website: 'https://www.mavensecurities.com/',
    careers: 'https://job-boards.greenhouse.io/mavensecuritiesholdingltd'
  },
  fiverings: {
    name: 'Five Rings', board: 'fiveringsllc', region: 'global', sector: 'Trading & Finance',
    location: 'Amsterdam / Londra', website: 'https://www.fiverings.com/',
    careers: 'https://job-boards.greenhouse.io/fiveringsllc'
  },
  nextenergy: {
    name: 'NextEnergy Group', board: 'nextenergygroup', region: 'global', sector: 'Energy & Investment',
    location: 'Milano / Londra', website: 'https://www.nextenergygroup.com/',
    careers: 'https://job-boards.greenhouse.io/nextenergygroup'
  },
  gelber: {
    name: 'Gelber Group', board: 'gelbergroup', region: 'global', sector: 'Trading & Finance',
    location: 'Amsterdam / Chicago', website: 'https://www.gelbergroup.com/',
    careers: 'https://job-boards.greenhouse.io/gelbergroup'
  },
  threered: {
    name: '3Red Partners', board: '3redpartners', region: 'global', sector: 'Trading & Finance',
    location: 'Amsterdam / USA', website: 'https://www.3redpartners.com/',
    careers: 'https://job-boards.greenhouse.io/3redpartners'
  },
  radix: {
    name: 'Radix Trading', board: 'radixexperienced', region: 'global', sector: 'Trading & Finance',
    location: 'Amsterdam / USA', website: 'https://www.radixtrading.com/',
    careers: 'https://job-boards.greenhouse.io/radixexperienced'
  },
  drw: {name: 'DRW', ats: 'greenhouse', board: 'drweng', region: 'global', sector: 'Trading & Finance', location: 'Londra / Chicago', website: 'https://www.drw.com/', careers: 'https://job-boards.greenhouse.io/drweng'} ,
  dept: {name: 'DEPT®', ats: 'greenhouse', board: 'dept', region: 'global', sector: 'Creative & Media', location: 'Amsterdam / Rotterdam', website: 'https://www.deptagency.com/', careers: 'https://job-boards.greenhouse.io/dept'} ,
  wppmedia: {name: 'WPP Media', ats: 'greenhouse', board: 'wppmedia', region: 'global', sector: 'Creative & Media', location: 'Amsterdam / Europa', website: 'https://www.wppmedia.com/', careers: 'https://job-boards.greenhouse.io/wppmedia'} ,
  capco: {name: 'Capco', ats: 'greenhouse', board: 'capco', region: 'global', sector: 'Consulting & Finance', location: 'Londra / Europa', website: 'https://www.capco.com/', careers: 'https://job-boards.greenhouse.io/capco'} ,
  adyen: {name: 'Adyen', ats: 'greenhouse', board: 'adyen', region: 'global', sector: 'Fintech & Payments', location: 'Amsterdam / Milano / Parigi', website: 'https://www.adyen.com/', careers: 'https://job-boards.greenhouse.io/adyen'} ,
  monzo: {name: 'Monzo', ats: 'greenhouse', board: 'monzo', region: 'global', sector: 'Fintech & Banking', location: 'Londra / Dublino', website: 'https://monzo.com/', careers: 'https://job-boards.greenhouse.io/monzo'} ,
  bitpanda: {name: 'Bitpanda', ats: 'greenhouse', board: 'bitpanda', region: 'global', sector: 'Fintech & Trading', location: 'Vienna / Berlino', website: 'https://www.bitpanda.com/', careers: 'https://job-boards.greenhouse.io/bitpanda'} ,
  eqtcorporation: {name: 'EQT Corporation', ats: 'greenhouse', board: 'eqtcorporation', region: 'global', sector: 'Energy & Commodities', location: 'Houston / Londra', website: 'https://www.eqt.com/', careers: 'https://job-boards.greenhouse.io/eqtcorporation'} ,
  affirm: {name: 'Affirm', ats: 'greenhouse', board: 'affirm', region: 'global', sector: 'Fintech & Payments', location: 'Europa / Nord America', website: 'https://www.affirm.com/', careers: 'https://job-boards.greenhouse.io/affirm'} ,
  a11: {name: 'A11', ats: 'greenhouse', board: 'projectaservicesgmbhcokg', region: 'global', sector: 'Consulting & Venture', location: 'Berlino', website: 'https://www.a11.global/', careers: 'https://job-boards.greenhouse.io/projectaservicesgmbhcokg'} ,
  coreview: {name: 'CoreView', ats: 'greenhouse', board: 'coreview', region: 'global', sector: 'Technology & SaaS', location: 'Italia / Europa', website: 'https://www.coreview.com/', careers: 'https://job-boards.greenhouse.io/coreview'} ,
  robinhood: {name: 'Robinhood', ats: 'greenhouse', board: 'robinhood', region: 'global', sector: 'Fintech & Trading', location: 'Europa / USA', website: 'https://robinhood.com/', careers: 'https://job-boards.greenhouse.io/robinhood'} ,
  gofundme: {name: 'GoFundMe', ats: 'greenhouse', board: 'gofundme', region: 'global', sector: 'Technology & Consumer', location: 'Europa / USA', website: 'https://www.gofundme.com/', careers: 'https://job-boards.greenhouse.io/gofundme'} ,
  engine: {name: 'Engine', ats: 'greenhouse', board: 'engine', region: 'global', sector: 'Travel & Technology', location: 'USA / remoto', website: 'https://engine.com/', careers: 'https://job-boards.greenhouse.io/engine'} ,
  spotify: {name: 'Spotify', ats: 'lever', board: 'spotify', region: 'global', sector: 'Entertainment & Media', location: 'Europa / globale', website: 'https://www.lifeatspotify.com/', careers: 'https://jobs.lever.co/spotify'} ,
  veepee: {name: 'Veepee', ats: 'lever', board: 'veepee', region: 'global', sector: 'Fashion & Ecommerce', location: 'Milano / Parigi', website: 'https://www.veepee.com/', careers: 'https://jobs.lever.co/veepee'} ,
  bloomwild: {name: 'Bloom & Wild Group', ats: 'lever', board: 'bloomon', region: 'global', sector: 'Consumer & Creative', location: 'Amsterdam / Londra', website: 'https://www.bloomandwild.com/', careers: 'https://jobs.lever.co/bloomon'} ,
  learning360: {name: '360Learning', ats: 'lever', board: '360learning', region: 'global', sector: 'Technology & SaaS', location: 'Parigi / remoto', website: 'https://360learning.com/', careers: 'https://jobs.lever.co/360learning'} ,
  dilitrust: {name: 'DiliTrust', ats: 'lever', board: 'dilitrust', region: 'global', sector: 'Legaltech & SaaS', location: 'Milano / Parigi', website: 'https://www.dilitrust.com/', careers: 'https://jobs.lever.co/dilitrust'} ,
  pigment: {name: 'Pigment', ats: 'lever', board: 'pigment', region: 'global', sector: 'Fintech & Software', location: 'Parigi / Londra', website: 'https://www.gopigment.com/', careers: 'https://jobs.lever.co/pigment'} ,
  insify: {name: 'Insify', ats: 'lever', board: 'insify', region: 'global', sector: 'Insurtech', location: 'Amsterdam', website: 'https://www.insify.nl/', careers: 'https://jobs.lever.co/insify'} ,
  younited: {name: 'Younited', ats: 'lever', board: 'younited', region: 'global', sector: 'Fintech & Banking', location: 'Parigi / Europa', website: 'https://www.younited.com/', careers: 'https://jobs.lever.co/younited'} ,
  arcteryx: {name: 'Arc’teryx', ats: 'lever', board: 'arcteryx.com', region: 'global', sector: 'Fashion & Outdoor', location: 'Amsterdam / Europa', website: 'https://arcteryx.com/', careers: 'https://jobs.lever.co/arcteryx.com'} ,
  netlight: {name: 'Netlight', ats: 'lever', board: 'netlight', region: 'global', sector: 'Technology & Consulting', location: 'Germania / Europa', website: 'https://www.netlight.com/', careers: 'https://jobs.lever.co/netlight'} ,
  justwatch: {name: 'JustWatch', ats: 'lever', board: 'justwatch', region: 'global', sector: 'Entertainment & Media', location: 'Berlino / Londra', website: 'https://www.justwatch.com/', careers: 'https://jobs.lever.co/justwatch'} ,
  cagents: {name: 'CAI', ats: 'lever', board: 'cagents', region: 'global', sector: 'Project Management & Engineering', location: 'Amsterdam / Italia / Europa', website: 'https://cagents.com/', careers: 'https://jobs.lever.co/cagents'}
});

function cors(origin) {
  return origin === FRONTEND_ORIGIN ? {
    'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
    'Vary': 'Origin'
  } : {};
}
function json(body, status = 200, origin = '') {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...cors(origin)
  }});
}
function fail(message, status, origin) { return json({ ok:false, message }, status, origin); }
async function authorized(request, secret) {
  if (!secret || typeof secret !== 'string') return false;
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const submitted = header.slice(7);
  if (!submitted || submitted.length > 2048) return false;
  const enc = new TextEncoder();
  const [a,b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(submitted)),
    crypto.subtle.digest('SHA-256', enc.encode(secret))
  ]);
  let diff = 0; const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i=0;i<x.length;i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function validURL(raw) {
  try { const u = new URL(String(raw||'')); return u.protocol === 'https:' ? u.href : null; }
  catch { return null; }
}
function atsURLs(spec) {
  const b=encodeURIComponent(spec.board);
  return spec.region==='eu' ? [
    `https://boards.eu.greenhouse.io/v1/boards/${b}/jobs?content=true`,
    `https://boards-api.greenhouse.io/v1/boards/${b}/jobs?content=true`
  ] : [`https://boards-api.greenhouse.io/v1/boards/${b}/jobs?content=true`];
}
// Greenhouse returns content as HTML. Keep plain text only: this avoids injecting untrusted HTML in the app.
function descriptionText(html) {
  if (typeof html !== 'string') return '';
  html=html.slice(0,32000); // V25: bound regex CPU cost for very long ATS descriptions
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<\/?(?:p|div|br|li|h[1-6]|ul|ol|section|tr)\b[^>]*>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&#(\d+);/g,(_,n)=>{try{return String.fromCodePoint(Number(n))}catch{return ' '}})
    .replace(/&#x([a-f0-9]+);/gi,(_,n)=>{try{return String.fromCodePoint(parseInt(n,16))}catch{return ' '}})
    .replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n')
    .replace(/\n{3,}/g,'\n\n').trim().slice(0,24000);
}
async function getSmartRecruitersJobs(spec) {
  // Official public postings only; paginate defensively. Full descriptions may be unavailable in list results.
  const board=encodeURIComponent(spec.board);
  const collected=[];
  for (let offset=0;offset<500;offset+=100) {
    const endpoint=`https://api.smartrecruiters.com/v1/companies/${board}/postings?limit=100&offset=${offset}`;
    let body;
    try {
      const r=await fetch(endpoint,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
      if(!r.ok) throw Error('SmartRecruiters HTTP '+r.status);
      body=await r.json();
      if(!Array.isArray(body.content))throw Error('Formato SmartRecruiters non valido');
    } catch(e) { console.warn('SmartRecruiters unavailable',spec.board,String(e));return null; }
    for(const j of body.content){
      const id=String(j.id||j.uuid||'');
      if(!id) continue;
      const location=[j.location?.city,j.location?.region,j.location?.country].filter(Boolean).join(', ');
      // The public list does not guarantee full descriptions. Never generate fictitious requirements.
      const url=`https://jobs.smartrecruiters.com/${encodeURIComponent(spec.board)}/${encodeURIComponent(id)}`;
      collected.push({id,title:String(j.name||''),location:{name:location},absolute_url:url,
        content:String(j.jobAd?.sections?.jobDescription?.text||'')});
    }
    if(body.content.length<100||collected.length>=Number(body.totalFound||Infinity))break;
  }
  return collected;
}
// V32: Teamtailor documents public jobs.rss feeds. Never fetch arbitrary caller supplied hosts.
function rssValue(block,tag){
  const escaped=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=block.match(new RegExp('<'+escaped+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+escaped+'>','i'));
  return m?m[1].replace(/^<!\[CDATA\[|\]\]>$/g,'').trim():'';
}
function rssDecode(v){
  return String(v||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
    .replace(/&apos;|&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>{try{return String.fromCodePoint(Number(n))}catch{return ''}});
}
function parseTeamtailorRSS(xml){
  if(typeof xml!=='string'||!/<rss\b/i.test(xml))throw Error('RSS non valido');
  const items=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  return items.map(m=>{
    const block=m[1];
    const link=rssDecode(rssValue(block,'link'));
    const title=descriptionText(rssDecode(rssValue(block,'title')));
    const guid=rssDecode(rssValue(block,'guid'))||link;
    const desc=rssDecode(rssValue(block,'content:encoded')||rssValue(block,'description'));
    const location=[rssDecode(rssValue(block,'tt:city')),rssDecode(rssValue(block,'tt:country'))].filter(Boolean).join(', ');
    return {id:guid,title,absolute_url:link,location:{name:location},content:desc};
  }).filter(j=>j.title&&validURL(j.absolute_url));
}
// Alternative career domains are fixed and reviewed. Never fetch arbitrary D1 URLs.
const TEAMTAILOR_PUBLIC_DOMAINS=Object.freeze({
  'breega-1704461133':'jobs.breega.com',
  'formulae':'careers.fiaformulae.com'
});
async function getTeamtailorJobs(spec){
  if(!/^[a-z0-9][a-z0-9-]{1,70}$/i.test(spec.board))return null;
  const baseHosts=[spec.board+'.teamtailor.com'];
  if(TEAMTAILOR_PUBLIC_DOMAINS[spec.board])baseHosts.push(TEAMTAILOR_PUBLIC_DOMAINS[spec.board]);
  for(const host of baseHosts){
    const collected=[];
    let valid=true;
    for(let offset=0;offset<600;offset+=200){
      const endpoint=`https://${host}/jobs.rss?per_page=200&offset=${offset}`;
      try{
        const r=await fetch(endpoint,{headers:{Accept:'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(12000),redirect:'manual'});
        if(!r.ok)throw Error('Teamtailor HTTP '+r.status);
        const xml=await r.text();
        if(xml.length>3000000)throw Error('RSS troppo grande');
        const jobs=parseTeamtailorRSS(xml);
        collected.push(...jobs);
        if(jobs.length<200)break;
      }catch(e){
        console.warn('Teamtailor RSS unavailable',host,String(e));valid=false;break;
      }
    }
    if(valid)return [...new Map(collected.map(j=>[j.absolute_url,j])).values()];
  }
  return null;
}

// Cloudflare Workers throws a TypeError for the unsupported 'error' redirect mode.
// Use manual redirect handling so ATS requests stay on reviewed hosts;
// HTTP 3xx responses fail the existing !response.ok checks.
// V22: optional read-only Workday CXS connector. A Workday careers URL must be supplied
// explicitly and reviewed; the tenant / site are never guessed from a company name.
// Workday is an undocumented endpoint. Failures must not close previously indexed jobs.
function workdaySite(raw){
 try{
  const u=new URL(String(raw||''));
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||!/^([a-z0-9][a-z0-9-]{1,62})\.wd[0-9]{1,3}\.myworkdayjobs\.com$/.test(host))return null;
  const tenant=host.split('.')[0];
  let pieces=u.pathname.split('/').filter(Boolean);
  if(/^([a-z]{2})(-[a-z]{2})?$/i.test(pieces[0]||''))pieces=pieces.slice(1);
  const site=pieces[0]||'';
  if(!/^[a-z0-9][a-z0-9_-]{0,100}$/i.test(site))return null;
  return {host,tenant,site,careers:'https://'+host+'/'+site};
 }catch{return null}
}
// Workday list entries can have "2 Locations"; inspect detail for ambiguous Cboe jobs.
function workdayLocationLabel(v){
 if(typeof v==='string')return v.trim();
 if(v&&typeof v==='object')return String(v.descriptor||v.name||v.location||'').trim();
 return '';
}
// LSEG's global Workday board has hundreds of jobs. Apply the verified country
// facet BEFORE paging; never filter only the first N global jobs.
const LSEG_EMEA_CODES=new Set(('AD AE AL AM AO AT AZ BA BE BF BG BH BI BJ BW BY CD CF CG CH CI CM CV CY CZ DE DJ DK DZ EE EG ER ES ET FI FO FR GA GB GE GG GH GI GM GN GQ GR GW HR HU IE IL IM IQ IR IS IT JE JO KE KM KW LB LI LR LS LT LU LV LY MA MC MD ME MG MK ML MR MT MU MW MZ NA NE NG NL NO OM PL PS PT QA RE RO RS RU RW SA SC SD SE SH SI SJ SK SL SM SN SO SS ST SY SZ TD TG TN TR TZ UA UG VA XK YE YT ZA ZM ZW KZ').split(' '));
// Build this lookup only once per Worker isolate to stay inside Free CPU quotas.
const LSEG_ISO_BY_NAME=(()=>{
 const map=new Map(),display=new Intl.DisplayNames(['en'],{type:'region'});
 const normalize=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en').replace(/[^a-z0-9]+/g,' ').trim();
 for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){
  const code=String.fromCharCode(a,b),name=display.of(code);
  if(name!==code){const key=normalize(name);if(!map.has(key)||LSEG_EMEA_CODES.has(code))map.set(key,code)}
 }
 return map;
})();
function lsegCountryCode(raw){
 const normalize=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en').replace(/[^a-z0-9]+/g,' ').trim();
 const value=normalize(raw);if(!value)return null;
 const exceptions={
  'united states of america':'US','usa':'US','u s a':'US','u s':'US',
  'united kingdom of great britain and northern ireland':'GB','great britain':'GB','uk':'GB',
  'czech republic':'CZ','turkey':'TR','republic of turkiye':'TR','uae':'AE',
  'south korea':'KR','republic of korea':'KR','north korea':'KP',
  'russia':'RU','russian federation':'RU','ivory coast':'CI','cape verde':'CV',
  'viet nam':'VN','taiwan':'TW','moldova':'MD','republic of moldova':'MD',
  'tanzania':'TZ','bolivia':'BO','venezuela':'VE','brunei':'BN','laos':'LA',
  'hong kong sar':'HK','macao sar':'MO','macau':'MO','palestinian territories':'PS',
  'netherlands the':'NL','the netherlands':'NL','sri lanka':'LK','kosovo':'XK',
  'democratic republic of congo':'CD','dr congo':'CD','congo brazzaville':'CG',
  'eswatini':'SZ','swaziland':'SZ','north macedonia':'MK','reunion':'RE'
 };
 if(exceptions[value])return exceptions[value];
 if(/^[a-z]{2}$/.test(value))return value.toUpperCase();
 return LSEG_ISO_BY_NAME.get(value)||null;
}
async function getLsegEmeaJobs(site,{probe=false,diagnostic=null}={}){
 const url='https://'+site.host+'/wday/cxs/'+encodeURIComponent(site.tenant)+'/'+encodeURIComponent(site.site)+'/jobs';
 const page=async(appliedFacets,offset)=>{
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
   body:JSON.stringify({appliedFacets,limit:20,offset,searchText:''}),
   signal:AbortSignal.timeout(12000),redirect:'manual'});
  if(!res.ok)throw Error('Workday HTTP '+res.status);
  const data=await res.json();
  if(!Array.isArray(data.jobPostings))throw Error('Formato JSON Workday inatteso');
  return data;
 };
 try{
  const first=await page({},0),globalTotal=Number(first.total)||first.jobPostings.length;
  // Prefer site-declared country facets; names/UUIDs vary by Workday tenant.
  const facet=(Array.isArray(first.facets)?first.facets:[]).find(f=>
   /country/i.test(String(f.facetParameter||''))&&Array.isArray(f.values)&&f.values.length>0);
  if(!facet){
   if(diagnostic)diagnostic.error='LSEG: filtro Paese Workday non disponibile; nessun annuncio importato per evitare copertura parziale';
   return null;
  }
  const selected=[],unknown=[];
  for(const v of facet.values){
   const label=String(v.descriptor||v.name||v.label||'').trim();
   const code=lsegCountryCode(label);
   if(!code){unknown.push(label.slice(0,90));continue}
   if(LSEG_EMEA_CODES.has(code)&&typeof v.id==='string'&&v.id.length<=120)selected.push({id:v.id,country:label});
  }
  const facetHasMore=Number(facet.totalValues||facet.totalValueCount||facet.valuesTotal||0)>facet.values.length;
  if(!selected.length||unknown.length||facetHasMore){
   if(diagnostic)diagnostic.error='LSEG: filtro geografico incompleto ('+
     (unknown.length?'Paesi non classificati: '+unknown.slice(0,5).join(', '):'')+
     (facetHasMore?' ulteriori Paesi non elencati':'')+'). Monitoraggio sospeso';
   return null;
  }
  const appliedFacets={[facet.facetParameter]:selected.map(x=>x.id)};
  const jobs=[],seen=new Set(),max=300;let total=0;
  for(let offset=0;offset<max;offset+=20){
   let data;
   try{data=await page(appliedFacets,offset)}
   catch(e){if(!jobs.length)throw e;jobs.partial=true;break}
   if(offset===0){
    total=Number(data.total)||data.jobPostings.length;
    // Some Workday tenants silently ignore unknown facet keys.
    if(total>=globalTotal&&globalTotal>selected.length){
     if(diagnostic)diagnostic.error='LSEG: filtro geografico non applicato dal server';
     return null;
    }
   }
   for(const item of data.jobPostings){
    const path=String(item.externalPath||'');
    if(!path.startsWith('/job/')||path.startsWith('//')||path.length>600||!String(item.title||'').trim())continue;
    const canonical='https://'+site.host+'/'+encodeURIComponent(site.site)+path;
    if(seen.has(canonical))continue;seen.add(canonical);
    jobs.push({id:path.split('/').pop()||path,title:String(item.title).trim(),
     location:{name:String(item.locationsText||'')},absolute_url:canonical,
     content:[item.bulletFields?.join(' · ')||'',item.remoteType||''].filter(Boolean).join('\n')});
   }
   if(probe&&total>max){jobs.partial=true;jobs.probeLimitExceeded=max;break}
   if(data.jobPostings.length<20||offset+20>=total)break;
  }
  jobs.partial=Boolean(jobs.partial||total>max||jobs.length<total);
  jobs.reportedTotal=total;jobs.globalTotal=globalTotal;jobs.scope='EMEA';
  jobs.scopeCountries=selected.map(x=>x.country);
  return jobs;
 }catch(e){
  if(diagnostic&&!diagnostic.error)diagnostic.error=String(e?.name)==='TimeoutError'?'Timeout nella verifica EMEA':String(e?.message||e).slice(0,100);
  console.warn('LSEG EMEA country-scoped feed unavailable',String(e));
  return null;
 }
}
async function getWorkdayJobs(spec,{probe=false,diagnostic=null}={}){
 const site=workdaySite(spec.careers);
 if(!site)return null;
 if(site.tenant.toLowerCase()==='lseg'&&site.site.toLowerCase()==='careers')return getLsegEmeaJobs(site,{probe,diagnostic});
 /** @type {Array<any> & {partial?:boolean,reportedTotal?:number}} */
 // The probe must cover the same range as the scheduled importer. A board with
  // more than 20 jobs is not inherently incomplete.
  const jobs=[];const seen=new Set(),max=300;
 const isCboe=site.tenant.toLowerCase()==='cboe'&&site.site.toLowerCase()==='external_career_cboe';
 const ambiguousLocations=[];
 let total=0;
 for(let offset=0;offset<max;offset+=20){
  try{
   const response=await fetch(`https://${site.host}/wday/cxs/${encodeURIComponent(site.tenant)}/${encodeURIComponent(site.site)}/jobs`,{
    method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({appliedFacets:{},limit:20,offset,searchText:''}),
    signal:AbortSignal.timeout(12000),redirect:'manual'});
   if(!response.ok){
      if(diagnostic)diagnostic.error='HTTP '+response.status+(response.headers.get('cf-mitigated')==='challenge'?' (verifica anti-bot)':'');
      throw Error('Workday HTTP '+response.status);
    }
   const data=await response.json();
   if(!Array.isArray(data.jobPostings)){if(diagnostic)diagnostic.error='Formato JSON Workday inatteso';throw Error('Workday payload non valido')}
   if(offset===0)total=Number(data.total)||data.jobPostings.length;
   for(const x of data.jobPostings){
    const path=String(x.externalPath||'');
    if(!path.startsWith('/job/')||path.startsWith('//')||path.length>600||!String(x.title||'').trim())continue;
    const canonical=`https://${site.host}/${encodeURIComponent(site.site)}${path}`;
    if(seen.has(canonical))continue;
    seen.add(canonical);
    const listLocation=String(x.locationsText||'');
    jobs.push({id:path.split('/').pop()||path,title:String(x.title||'').trim(),
     location:{name:listLocation},absolute_url:canonical,
     content:[x.bulletFields?.join(' · ')||'',x.remoteType||''].filter(Boolean).join('\n')});
    if(isCboe&&/\b(?:multiple|\d+)\s+locations?\b/i.test(listLocation))ambiguousLocations.push({index:jobs.length-1,path});
   }
   // A probe is read-only: avoid fetching hundreds of pages merely to confirm
    // that a large board (e.g. LSEG) exceeds the current safe import cap.
    // Never claim this board is complete or allow activation in that case.
    if(probe&&total>max){jobs.partial=true;jobs.probeLimitExceeded=max;break}
    if(data.jobPostings.length<20||offset+20>=total)break;
  }catch(e){
   // A partial Workday snapshot is not a full picture. Keep previously imported rows.
   if(!jobs.length){
      if(diagnostic&&!diagnostic.error)diagnostic.error=String(e?.name)==='TimeoutError'?'Timeout dopo 12 secondi':'Connessione non riuscita ('+String(e?.name||'errore di rete').slice(0,50)+')';
      console.warn('Workday feed unavailable',site.host,site.site,String(e));return null}
   jobs.partial=true;break;
  }
 }
 // Bound the number of extra Workday subrequests to protect the Cloudflare Free quota.
 // Keep the original entry if its detail is unavailable and report incomplete locations.
 if(isCboe&&ambiguousLocations.length){
  const limit=24,selected=ambiguousLocations.slice(0,limit);
  let incomplete=ambiguousLocations.length>limit;
  for(let i=0;i<selected.length;i+=4){
   await Promise.all(selected.slice(i,i+4).map(async ({index,path})=>{
    try{
     const endpoint='https://'+site.host+'/wday/cxs/'+encodeURIComponent(site.tenant)+'/'+encodeURIComponent(site.site)+path;
     const r=await fetch(endpoint,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000),redirect:'manual'});
     if(!r.ok)throw Error('Workday detail HTTP '+r.status);
     const json=await r.json(),info=json?.jobPostingInfo||{};
     const locs=[info.location,...(Array.isArray(info.additionalLocations)?info.additionalLocations:[])].map(workdayLocationLabel).filter(Boolean);
     const unique=[...new Set(locs)];
     if(!unique.length)throw Error('Sedi non disponibili');
     jobs[index].location.name=unique.join(' / ');
    }catch(e){incomplete=true;console.warn('Workday location detail unavailable',site.host,String(e))}
   }));
  }
  jobs.locationCoverageIncomplete=incomplete;
 }
 jobs.partial=Boolean(jobs.partial||total>max);
 jobs.reportedTotal=total;
 return jobs;
}

// V42: Workable's documented public careers endpoint; no company credentials used.
async function getWorkableJobs(spec){
  const slug=String(spec.board||'');
  if(!/^[a-z0-9][a-z0-9-]{1,70}$/i.test(slug))return null;
  try{
    const res=await fetch('https://www.workable.com/api/accounts/'+encodeURIComponent(slug)+'?details=true',{
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(16000)});
    if(!res.ok)throw Error('Workable HTTP '+res.status);
    const data=await res.json();if(!Array.isArray(data.jobs))throw Error('Workable response non valida');
    return data.jobs.map(j=>({
      id:String(j.shortcode||j.code||j.id||''),title:String(j.title||''),
      location:{name:[j.city,j.state,j.country].filter(Boolean).join(', ')||(j.workplace_type==='remote'?'Remote':'')},
      absolute_url:String(j.application_url||j.url||j.shortlink||''),
      content:[j.description||'',j.department||'',j.employment_type||'',j.industry||'',j.experience||'',j.workplace_type|| (j.telecommuting?'remote':'')].filter(Boolean).join('\n\n')
    })).filter(j=>j.title&&validURL(j.absolute_url));
  }catch(e){console.warn('Workable feed unavailable',slug,String(e));return null}
}
// V42: Recruitee public offers feed. From February 2027 the Careers Site JSON API
// requires per-company tokens; handle unauthorised feeds as unavailable (never close jobs).
async function getRecruiteeJobs(spec){
  const slug=String(spec.board||'');
  if(!/^[a-z0-9][a-z0-9-]{1,70}$/i.test(slug))return null;
  try{
    const res=await fetch('https://'+slug+'.recruitee.com/api/offers/',{
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(16000),redirect:'manual'});
    if(!res.ok)throw Error('Recruitee HTTP '+res.status);
    const data=await res.json();if(!Array.isArray(data.offers))throw Error('Recruitee response non valida');
    return data.offers.map(j=>({
      id:String(j.id||j.slug||''),title:String(j.title||''),
      location:{name:[j.city,j.country].filter(Boolean).join(', ')||(Array.isArray(j.locations)?j.locations.map(x=>x.city||x.name||'').filter(Boolean).join(' / '):'')},
      absolute_url:String(j.careers_url||j.url||''),
      content:[j.description||'',j.requirements||'',j.department||'',j.employment_type||'',j.remote?'Remote':''].filter(Boolean).join('\n\n')
    })).filter(j=>j.title&&validURL(j.absolute_url));
  }catch(e){console.warn('Recruitee feed unavailable',slug,String(e));return null}
}

async function getPhenomJobs(spec,{probe=false,diagnostic=null}={}){
 if(spec.board!=='careers.cboe.com')return null;
 // Cboe's public jobs page currently has >100 positions; probe and import
  // must use the same cap to avoid falsely rejecting a complete source.
  const jobs=[],seen=new Set(),cap=300,size=50;let total=0;
 for(let from=0;from<cap;from+=size){
  try{
   const r=await fetch('https://careers.cboe.com/widgets',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({ddoKey:'refineSearch',jobs:true,from,size,pageName:'search-results',sort:{order:'desc',field:'dateCreated'}}),signal:AbortSignal.timeout(12000),redirect:'manual'});
   if(!r.ok){if(diagnostic)diagnostic.error='HTTP '+r.status;throw Error('Phenom HTTP '+r.status)}
   const data=await r.json(),result=data?.refineSearch?.data;
   if(!Array.isArray(result?.jobs)){if(diagnostic)diagnostic.error='Formato JSON Phenom inatteso';throw Error('Phenom payload non valido')}
   if(from===0)total=Number(result.totalHits)||result.jobs.length;
   for(const item of result.jobs){
    const title=String(item.title||item.jobTitle||'').trim(),id=String(item.jobSeqNo||item.jobId||item.id||'').trim();
    if(!title||!id)continue;
    const parts=String(item.locale||'en_US').split('_'),lang=/^[a-z]{2}$/i.test(parts[0]||'')?parts[0].toLowerCase():'en',country=/^[a-z]{2}$/i.test(parts[1]||'')?parts[1].toLowerCase():'us';
    const link='https://careers.cboe.com/'+country+'/'+lang+'/job/'+encodeURIComponent(id);
    if(seen.has(link))continue;seen.add(link);
    jobs.push({id,title,absolute_url:link,location:{name:[item.location||'',item.country||''].filter(Boolean).join(', ')},content:[item.description||item.descriptionTeaser||'',item.category||'',item.department||''].filter(Boolean).join('\n\n')});
   }
   if(result.jobs.length<size||from+size>=total)break;
  }catch(e){if(diagnostic&&!diagnostic.error)diagnostic.error=e?.name==='TimeoutError'?'Timeout dopo 12 secondi':'Connessione non riuscita ('+String(e?.name||'errore di rete').slice(0,50)+')';console.warn('Phenom source unavailable',spec.board,String(e));if(!jobs.length)return null;jobs.partial=true;break}
 }
 jobs.reportedTotal=total;jobs.partial=Boolean(jobs.partial||total>cap||jobs.length<total);
 return jobs;
}
async function getATSJobs(spec,options={}) {
  if (spec.ats === 'phenom') return await getPhenomJobs(spec,options);
  if (spec.ats === 'workable') return await getWorkableJobs(spec);
  if (spec.ats === 'recruitee') return await getRecruiteeJobs(spec);
  if (spec.ats === 'workday') return await getWorkdayJobs(spec,options);
  if (spec.ats === 'teamtailor') return await getTeamtailorJobs(spec);
  if (spec.ats === 'smartrecruiters') return await getSmartRecruitersJobs(spec);
  // Ashby read-only public posting API. Only configured boards are used for scheduled import.
  if (spec.ats === 'ashby') {
    try {
      const endpoint='https://api.ashbyhq.com/posting-api/job-board/'+encodeURIComponent(spec.board);
      const response=await fetch(endpoint,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(14000)});
      if (!response.ok) throw Error('Ashby HTTP '+response.status);
      const body=await response.json();
      if (!Array.isArray(body.jobs)) throw Error('Ashby payload non valido');
      return body.jobs.filter(j=>j.isListed!==false).map(j=>({
        id:String(j.id||j.jobUrl||''),title:String(j.title||''),
        location:{name:String(j.location||j.address?.postalAddress?.addressLocality||'')},
        absolute_url:j.jobUrl||j.applyUrl,
        content:[j.descriptionPlain||j.descriptionHtml||'', j.department||'', j.team||'',j.employmentType||''].join('\n\n')
      }));
    } catch(e) {console.warn('Ashby feed unavailable',spec.board,String(e));return null;}
  }
  if (spec.ats === 'lever') {
    const endpoints=[`https://api.lever.co/v0/postings/${encodeURIComponent(spec.board)}?mode=json`,
      `https://api.eu.lever.co/v0/postings/${encodeURIComponent(spec.board)}?mode=json`];
    for(const endpoint of endpoints)try {
      const r = await fetch(endpoint, {headers:{Accept:'application/json'}, signal:AbortSignal.timeout(12000)});
      if (!r.ok) throw Error('Lever HTTP '+r.status);
      const arr = await r.json();
      if (!Array.isArray(arr)) throw Error('Lever payload non valido');
      return arr.map(j=>({
        id:String(j.id||''), title:String(j.text||''),
        location:{name:String(j.categories?.location||j.categories?.allLocations?.join(' / ')||'')},
        absolute_url:j.hostedUrl,
        content:[j.descriptionPlain||j.description||'',...(Array.isArray(j.lists)?j.lists.map(x=>(x.text||'')+'\n'+(x.content||'')):[]), j.additionalPlain||j.additional||''].join('\n\n')
      }));
    } catch(e) {console.warn('Lever endpoint unavailable:',endpoint,String(e));}
    return null;
  }
  for (const endpoint of atsURLs(spec)) {
    try {
      const r=await fetch(endpoint, {headers:{Accept:'application/json'},signal:AbortSignal.timeout(16000)});
      if (!r.ok) continue;
      const result=await r.json();
      if (Array.isArray(result.jobs)) return result.jobs;
    } catch(e) { console.warn('Greenhouse feed unavailable:', spec.board, String(e)); }
  }
  return null;
}
// V12: D1-approved public board registry. No anonymous writes or user secrets in the browser.
// Companies whose source_type is one of the supported ATS, monitoring_status is active,
// and whose careers_url parses to a strictly allowlisted board are picked up on each cron run.
async function monitoredSources(env){
  /** @type {Array<[string, MonitoredSource]>} */
  const registry=Object.entries(SOURCES).map(([id,s])=>[id,{...s,ats:s.ats||'greenhouse'}]);
  const identifiers=new Set(registry.map(([id,s])=>s.ats+':'+s.board.toLowerCase()));
  if(!env.DB)return registry;
  const rows=await env.DB.prepare(`SELECT name,sector,location,website_url,careers_url,source_type
    FROM companies WHERE monitoring_status='active'
      AND source_type IN ('greenhouse','lever','ashby','smartrecruiters','teamtailor','workday','workable','recruitee','phenom') AND careers_url IS NOT NULL`).all();
  for(const row of rows.results||[]){
    const validated=publicBoardSpec(row.careers_url);
    if(!validated||validated.ats!==row.source_type)continue;
    const key=validated.ats+':'+validated.board.toLowerCase();
    if(identifiers.has(key))continue;
    identifiers.add(key);
    const id='custom-'+validated.ats+'-'+validated.board.toLowerCase().replace(/[^a-z0-9-]/g,'-');
    registry.push([id,{...validated,name:String(row.name||'').slice(0,160),sector:row.sector||'Da classificare',
      location:row.location||'',website:validURL(row.website_url)||validated.careers}]);
  }
  return registry.slice(0,180);
}
async function refreshCompany(request, env, origin, slug) {
  const spec=(await monitoredSources(env)).find(([id])=>id===slug)?.[1];
  if (!spec) return fail('Azienda non configurata',404,origin);
  if (!env.ADMIN_TOKEN) return fail('ADMIN_TOKEN non configurato',503,origin);
  if (!(await authorized(request,env.ADMIN_TOKEN))) return fail('Secret amministratore non valido',401,origin);
  let input;
  try { input=await request.json(); } catch { return fail('JSON non valido',400,origin); }
  const offset=input.offset, runId=input.runId??null;
  if (!Number.isInteger(offset)||offset<0||offset>10000||
      (runId!==null&&(!Number.isInteger(runId)||runId<1))||
      (offset>0 && runId===null)) return fail('Parametri del refresh non validi',400,origin);
  const payload=await getATSJobs(spec);
  if (!payload) return fail('Fonte Careers temporaneamente non raggiungibile',502,origin);
  const jobs=payload.filter(j=>validURL(j.absolute_url)&&typeof j.title==='string'&&j.title.trim());
  if (offset>jobs.length) return fail('Offset fuori intervallo: riparti da zero',400,origin);
  const db=env.DB;
  await db.prepare(`INSERT INTO companies
    (name,sector,location,website_url,careers_url,source_type,monitoring_status,last_checked_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET monitoring_status='active',last_checked_at=CURRENT_TIMESTAMP`)
    .bind(spec.name,spec.sector,spec.location,spec.website,spec.careers,(spec.ats||'greenhouse'),'active').run();
  const company=await db.prepare('SELECT id FROM companies WHERE name=?').bind(spec.name).first();
  if (!company) return fail('Impossibile recuperare l’azienda dal database',500,origin);
  let currentRun=runId;
  if (offset===0) {
    const result=await db.prepare('INSERT INTO refresh_runs (status) VALUES (?)').bind('running').run();
    currentRun=result.meta.last_row_id;
  } else {
    const previous=await db.prepare('SELECT id,status FROM refresh_runs WHERE id=?').bind(currentRun).first();
    if (!previous||previous.status!=='running') return fail('Sessione scaduta o già completata. Ricomincia.',409,origin);
  }
  const slice=jobs.slice(offset,offset+PAGE_SIZE);
  const urls=slice.map(j=>validURL(j.absolute_url));
  let seen=new Set();
  if (urls.length) {
    const q=urls.map(()=>'?').join(',');
    const old=await db.prepare(`SELECT job_url FROM jobs WHERE job_url IN (${q})`).bind(...urls).all();
    seen=new Set((old.results||[]).map(j=>j.job_url));
  }
  const newJobs=urls.filter(u=>!seen.has(u)).length;
  if (slice.length) {
    const statements=slice.map((job,i)=>db.prepare(`INSERT INTO jobs
      (company_id,external_id,title,location,job_url,apply_url,description,status)
      VALUES (?,?,?,?,?,?,?,'active')
      ON CONFLICT(job_url) DO UPDATE SET
        company_id=excluded.company_id,
        external_id=excluded.external_id,
        title=excluded.title,
        location=excluded.location,
        apply_url=excluded.apply_url,
        description=CASE WHEN length(COALESCE(excluded.description,''))>0 THEN excluded.description ELSE jobs.description END,
        status='active',last_seen_at=CURRENT_TIMESTAMP`)
      .bind(company.id,String(job.id||''),job.title.trim(),String(job.location?.name||''),urls[i],urls[i],descriptionText(job.content||'')));
    await db.batch(statements);
  }
  const processed=offset+slice.length;
  const done=processed>=jobs.length;
  if (done) {
    if(jobs.length>0&&!payload.partial) await markMissingClosed(db,company.id,jobs);
    await db.prepare(`UPDATE refresh_runs SET status='success',completed_at=CURRENT_TIMESTAMP,
      companies_checked=1,jobs_found=?,jobs_new=jobs_new+? WHERE id=?`)
      .bind(jobs.length,newJobs,currentRun).run();
  } else {
    await db.prepare('UPDATE refresh_runs SET jobs_found=?,jobs_new=jobs_new+? WHERE id=?')
      .bind(processed,newJobs,currentRun).run();
  }
  return json({ok:true,source:slug,company:spec.name,total:jobs.length,processed,newJobs,
    done,runId:currentRun},200,origin);
}

// Mark old postings closed only after a complete, successful fetch + import.
// The database retains them for audit; /api/jobs shows active postings by default.
async function markMissingClosed(db,companyId,currentJobs){
  const ids=currentJobs.map(j=>String(j.id||''));
  // Compare external IDs rather than timestamps so a rapid refresh is deterministic.
  const rows=await db.prepare("SELECT id,external_id FROM jobs WHERE company_id=? AND status=\'active\'").bind(companyId).all();
  const seen=new Set(ids);
  const stale=(rows.results||[]).filter(j=>!seen.has(String(j.external_id||'')));
  for(let offset=0;offset<stale.length;offset+=50){
    const batch=stale.slice(offset,offset+50).map(j=>db.prepare("UPDATE jobs SET status='closed' WHERE id=?").bind(j.id));
    if(batch.length)await db.batch(batch);
  }
  return stale.length;
}

// Scheduled import executes inside Cloudflare; the ADMIN_TOKEN is never exposed to the browser.
// Configure cron `*/30 * * * *` in Cloudflare Worker > Settings > Triggers.
// Three sources per run. With 36 sources the rotation takes ~6 hours at */30 cron.

// V31: source-level diagnostics. Created lazily on the first real refresh;
// the existing jobs, companies and refresh_runs tables are left untouched.
async function ensureSourceHealth(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS source_health (
    source_key TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    status TEXT NOT NULL,
    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success_at TEXT,
    error_at TEXT,
    error_text TEXT,
    jobs_found INTEGER,
    jobs_new INTEGER,
    duration_ms INTEGER
  )`).run();
}
function sourceKey(spec){return (spec.ats||'greenhouse')+':'+String(spec.board||'').toLowerCase()}
async function trackSourceRun(env,scheduledTime,sourceIndex,entries){
  const [slug,spec]=entries[sourceIndex];
  const started=Date.now();
  // Do not let telemetry failure break the import.
  let healthAvailable=false;
  try{await ensureSourceHealth(env.DB);healthAvailable=true}
  catch(e){console.error('Source health schema unavailable',String(e))}
  let failure=null;
  try {await runScheduledSource(env,scheduledTime,sourceIndex,entries)}
  catch(e){failure=e}
  if(healthAvailable){
    try{
      let found=null;
      if(!failure){
        const result=await env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs j
          JOIN companies c ON c.id=j.company_id WHERE c.name=? AND j.status='active'`).bind(spec.name).first();
        found=Number(result?.n)||0;
      }
      const status=failure?'error':'success';
      await env.DB.prepare(`INSERT INTO source_health
        (source_key,source_name,status,checked_at,success_at,error_at,error_text,jobs_found,duration_ms)
        VALUES (?,?,?,CURRENT_TIMESTAMP,CASE WHEN ?='success' THEN CURRENT_TIMESTAMP ELSE NULL END,
          CASE WHEN ?='error' THEN CURRENT_TIMESTAMP ELSE NULL END,?,?,?)
        ON CONFLICT(source_key) DO UPDATE SET
          source_name=excluded.source_name,status=excluded.status,checked_at=CURRENT_TIMESTAMP,
          success_at=CASE WHEN excluded.status='success' THEN CURRENT_TIMESTAMP ELSE source_health.success_at END,
          error_at=CASE WHEN excluded.status='error' THEN CURRENT_TIMESTAMP ELSE source_health.error_at END,
          error_text=excluded.error_text,
          jobs_found=CASE WHEN excluded.status='success' THEN excluded.jobs_found ELSE source_health.jobs_found END,
          duration_ms=excluded.duration_ms`)
        .bind(sourceKey(spec),spec.name,status,status,status,
          failure?String(failure?.message||failure).slice(0,350):null,found,Date.now()-started).run();
    }catch(e){console.error('Source health recording failed',slug,String(e))}
  }
  if(failure)throw failure;
}

async function runScheduledSource(env, scheduledTime, sourceIndex=null, suppliedEntries=null){
  const entries=suppliedEntries||await monitoredSources(env);
  if(!env.DB || !entries.length) return;
  const index=sourceIndex===null?Math.floor((Number(scheduledTime)||Date.now())/(30*60*1000))%entries.length:sourceIndex;
  const [slug,spec]=entries[index];
  const payload=await getATSJobs(spec);
  if(!payload) throw Error('Feed non disponibile: '+slug);
  const jobs=payload.filter(j=>validURL(j.absolute_url)&&typeof j.title==='string'&&j.title.trim());
  const db=env.DB;
  await db.prepare(`INSERT INTO companies (name,sector,location,website_url,careers_url,source_type,monitoring_status,last_checked_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET monitoring_status='active',last_checked_at=CURRENT_TIMESTAMP`)
    .bind(spec.name,spec.sector,spec.location,spec.website,spec.careers,(spec.ats||'greenhouse'),'active').run();
  const company=await db.prepare('SELECT id FROM companies WHERE name=?').bind(spec.name).first();
  if(!company)throw Error('Azienda mancante dopo upsert: '+slug);
  const run=await db.prepare('INSERT INTO refresh_runs (status) VALUES (?)').bind('running').run();
  const runId=run.meta.last_row_id;
  let inserted=0;
  try {
    // Pagination here is for writing: feed is downloaded once, not once per DB batch.
    for(let offset=0;offset<jobs.length;offset+=25){
      const part=jobs.slice(offset,offset+25);
      const urls=part.map(j=>validURL(j.absolute_url));
      const old=await db.prepare(`SELECT job_url FROM jobs WHERE job_url IN (${urls.map(()=>'?').join(',')})`).bind(...urls).all();
      const known=new Set((old.results||[]).map(j=>j.job_url));
      inserted+=urls.filter(u=>!known.has(u)).length;
      const statements=part.map((j,i)=>db.prepare(`INSERT INTO jobs
        (company_id,external_id,title,location,job_url,apply_url,description,status)
        VALUES (?,?,?,?,?,?,?,'active')
        ON CONFLICT(job_url) DO UPDATE SET
        company_id=excluded.company_id,external_id=excluded.external_id,title=excluded.title,
        location=excluded.location,apply_url=excluded.apply_url,
        description=CASE WHEN length(COALESCE(excluded.description,''))>0 THEN excluded.description ELSE jobs.description END,
        status='active',last_seen_at=CURRENT_TIMESTAMP`)
        .bind(company.id,String(j.id||''),j.title.trim(),String(j.location?.name||''),urls[i],urls[i],descriptionText(j.content||'')));
      await db.batch(statements);
    }
    if(jobs.length>0&&!payload.partial) await markMissingClosed(db,company.id,jobs);
    await db.prepare(`UPDATE refresh_runs SET status='success',completed_at=CURRENT_TIMESTAMP,
      companies_checked=1,jobs_found=?,jobs_new=? WHERE id=?`).bind(jobs.length,inserted,runId).run();
    console.log('Scheduled source refreshed',slug,jobs.length,inserted);
  }catch(e){
    await db.prepare(`UPDATE refresh_runs SET status='error',completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(runId).run();
    throw e;
  }
}

const HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Career Radar · API</title><style>body{font:16px system-ui;background:#f4f8f5;color:#183e2c;max-width:720px;margin:55px auto;padding:0 20px}main{background:#fff;padding:28px;border:1px solid #d8e7df;border-radius:16px}a{color:#18533b}.muted{color:#5a6e63}code{background:#eef4ef;padding:3px 6px;border-radius:5px}</style></head><body><main><h1>Career Radar API · V14</h1><p>Backend per fonti Careers Greenhouse, Lever e Ashby; elenco aggiornato su /api/sources.</p><p class="muted">Gli aggiornamenti automatici richiedono un Cron Trigger Cloudflare. Nessuna password viene richiesta dall’interfaccia pubblica. Le operazioni amministrative rimangono protette.</p><p><a href="${FRONTEND_ORIGIN}" rel="noopener noreferrer">Apri Career Radar</a></p><p class="muted">Stato pubblico: <a href="/api/status">/api/status</a> · Fonti: <a href="/api/sources">/api/sources</a></p></main></body></html>`;

// Ricerca esterna su Wikidata: risultati indicativi e da verificare, nessun dato privato.
async function wdFetch(params,timeout=9500){
 const target=new URL('https://www.wikidata.org/w/api.php');
 target.search=new URLSearchParams({format:'json',...params}).toString();
 const res=await fetch(target.toString(),{headers:{Accept:'application/json','User-Agent':'CareerRadarPersonalResearch/1.1 (public Wikidata data)'},signal:AbortSignal.timeout(timeout)});
 if(!res.ok)throw Error('Wikidata HTTP '+res.status);
 return await res.json();
}
function wdClaim(entity,property){return entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value}
function wdItem(v){return typeof v==='object'&&/^Q[0-9]+$/.test(v?.id||'')?v.id:null}
function wdQuantity(v){if(typeof v?.amount!=='string')return null;const n=Number(v.amount);return Number.isFinite(n)&&n>=0?n:null}
function wdWeb(v){if(typeof v!=='string')return null;return validURL(v)}
async function enrichSearchResults(results){
 if(!results.length)return results;
 try{
  const ids=results.map(r=>r.id);
  const data=await wdFetch({action:'wbgetentities',ids:ids.join('|'),props:'claims',languages:'en'},11000);
  const entities=data.entities||{};
  const labelIds=new Set();
  const tuples=results.map(r=>{const e=entities[r.id]||{};const country=wdItem(wdClaim(e,'P17')),industry=wdItem(wdClaim(e,'P452')),instanceOf=wdItem(wdClaim(e,'P31'));for(const id of [country,industry,instanceOf])if(id)labelIds.add(id);return {id:r.id,country,industry,instanceOf,employees:wdQuantity(wdClaim(e,'P1128')),website:wdWeb(wdClaim(e,'P856'))};});
  let labels={};
  if(labelIds.size){try{const lbl=await wdFetch({action:'wbgetentities',ids:[...labelIds].slice(0,100).join('|'),props:'labels',languages:'en'},8000);labels=lbl.entities||{}}catch(e){console.warn('Wikidata label lookup unavailable',String(e))}}
  const label=id=>id?(labels[id]?.labels?.en?.value||''):'';
  return results.map((r,i)=>({...r,country:label(tuples[i].country),industry:label(tuples[i].industry),instanceOf:label(tuples[i].instanceOf),employees:tuples[i].employees,website:tuples[i].website}));
 }catch(e){console.warn('Wikidata enrichment unavailable; basic results preserved',String(e));return results}
}
// Read-only discovery of explicitly provided PUBLIC ATS boards; no writes, no arbitrary fetch URLs.
function publicBoardSpec(raw){
 try {
  const u=new URL(String(raw||''));
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const parts=u.pathname.split('/').filter(Boolean);
  const host=u.hostname.toLowerCase();
  let ats='',board='';
  if(['job-boards.greenhouse.io','job-boards.eu.greenhouse.io','boards.greenhouse.io','boards.eu.greenhouse.io'].includes(host)){
    ats='greenhouse';board=parts[0]||'';
  }else if(host==='jobs.lever.co'){ats='lever';board=parts[0]||'';}
  else if(host==='jobs.ashbyhq.com'){ats='ashby';board=parts[0]||'';}
  else if(host==='careers.smartrecruiters.com'||host==='jobs.smartrecruiters.com'){ats='smartrecruiters';board=parts[0]||'';}
  else if(/^([a-z0-9][a-z0-9-]{1,70})\.teamtailor\.com$/.test(host)){ats='teamtailor';board=host.split('.')[0];}
  else if(host==='apply.workable.com'){ats='workable';board=parts[0]||'';}
  else if(/^([a-z0-9][a-z0-9-]{1,70})\.recruitee\.com$/.test(host)){ats='recruitee';board=host.split('.')[0];}
  else if(host==='careers.cboe.com'&&(/^\/us\/en\/(search-results|careers)\/?$/.test(u.pathname)||u.pathname==='/widgets')){ats='phenom';board='careers.cboe.com';}
  else if(workdaySite(raw)){const wd=workdaySite(raw);ats='workday';board=wd.tenant+'-'+wd.site;}
  // Phenom's reviewed identifier is a hostname containing dots. Never allow
  // hostname-style identifiers for generic ATS boards.
  if(!ats||(ats==='phenom'?board!=='careers.cboe.com':!/^[a-z0-9][a-z0-9_-]{1,140}$/i.test(board)))return null;
  return {ats,board,region:host.includes('.eu.')?'eu':'global',careers:ats==='phenom'?'https://careers.cboe.com/us/en/search-results':ats==='workday'?workdaySite(raw).careers:ats==='teamtailor'?'https://'+host+'/jobs':ats==='recruitee'?'https://'+host+'/':ats==='workable'?'https://apply.workable.com/'+board+'/':'https://'+host+'/'+board};
 }catch{return null;}
}
// Optional read-only location comparison for diagnosing multi-office boards.
function probeCityJobs(jobs,rawCity){
 const city=String(rawCity||'').trim();
 if(!city||city.length>60)return null;
 const key=city.toLocaleLowerCase();
 const matching=jobs.filter(j=>String(j.location?.name||'').toLocaleLowerCase().includes(key));
 return {city,total:matching.length,roles:matching.slice(0,15).map(j=>({
  title:j.title,location:j.location?.name||'',url:j.absolute_url
 }))};
}
async function probePublicBoard(url,origin,env){
 const raw=(url.searchParams.get('url')||'').trim();
 if(raw.length>250)return fail('URL troppo lungo',400,origin);
 const spec=publicBoardSpec(raw);
 if(!spec)return fail('Inserisci una bacheca ATS compatibile: Greenhouse, Lever, Ashby, SmartRecruiters, Teamtailor, Workday, Workable, Recruitee o Phenom (Cboe).',400,origin);
 const diagnostic={};
 const jobs=await getATSJobs(spec,{probe:true,diagnostic});
 if(!jobs){
  const reason=(spec.ats==='workday'||spec.ats==='phenom')&&diagnostic.error?' Diagnostica '+(spec.ats==='workday'?'Workday':'Phenom')+': '+diagnostic.error+'.':'';
  return fail('Bacheca riconosciuta ma feed non raggiungibile.'+reason+' Verifica il link o riprova.',502,origin);
 }
 const valid=jobs.filter(j=>validURL(j.absolute_url)&&String(j.title||'').trim());
 return json({ok:true,ats:spec.ats,board:spec.board,careers:spec.careers,
   total:jobs.reportedTotal||valid.length,partial:Boolean(jobs.partial),importLimit:jobs.probeLimitExceeded||null,scope:jobs.scope||'Global',globalTotal:jobs.globalTotal||null,scopeCountries:jobs.scopeCountries||null,locationCoverageIncomplete:Boolean(jobs.locationCoverageIncomplete),cityMatch:probeCityJobs(valid,url.searchParams.get('city')),sample:valid.slice(0,3).map(j=>({title:j.title,location:j.location?.name||''})),
   monitored:(await monitoredSources(env)).some(([id,s])=>s.ats===spec.ats&&s.board.toLowerCase()===spec.board.toLowerCase()),note:'Feed pubblico verificato. Una nuova fonte va approvata nel database D1 Cloudflare prima del monitoraggio automatico.'},200,origin);
}

async function discoverPublicCompanies(url,origin){
 const query=(url.searchParams.get('query')||'').trim();
 if(query.length<3||query.length>90)return fail('Inserisci tra 3 e 90 caratteri',400,origin);
 try{
  const data=await wdFetch({action:'wbsearchentities',search:query,language:'en',uselang:'en',type:'item',limit:'40'});
  const base=(Array.isArray(data.search)?data.search:[]).filter(x=>/^Q\d+$/.test(x.id||'')).map(x=>({id:x.id,name:String(x.label||'').slice(0,160),description:String(x.description||'').slice(0,400),source:'https://www.wikidata.org/wiki/'+x.id}));
  const results=await enrichSearchResults(base);
  return json({ok:true,source:'Wikidata public search + claims',query,results,disclaimer:'Entity search, not a comprehensive company database. Fields may be missing or out of date. Verify entity type and details.'},200,origin);
 }catch(e){console.error('Wikidata search unavailable',String(e));return fail('La fonte pubblica non risponde, riprova più tardi',502,origin)}
}


// V13: full refresh from a single dashboard action, no admin secret in the browser.
// Only approved Greenhouse/Lever/Ashby sources are processed. A session is
// rate limited and steps are signed using the server-side ADMIN_TOKEN.
const MANUAL_COOLDOWN_MINUTES=30;
function manualOriginAllowed(request){
  return request.headers.get('Origin')===FRONTEND_ORIGIN &&
    ['same-site','cross-site'].includes(request.headers.get('Sec-Fetch-Site')||'cross-site');
}
async function makeSessionToken(secret, id){
  const bytes=new TextEncoder().encode('career-radar-manual-refresh-v1:'+id);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes));
  return Array.from(mac,b=>b.toString(16).padStart(2,'0')).join('');
}
async function safeTokenEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return false;
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
// V25: each manual source has an atomic lease. A terminated Worker leaves
// manual_busy with a timestamp; after 90 seconds a later request may reclaim it.
// Existing refresh_runs columns are reused: no D1 migration is required.
async function recoverExpiredManualLease(env,id=null){
  const clause=id===null?'': ' AND id=?';
  const sql=`UPDATE refresh_runs SET status='manual_running',completed_at=NULL
     WHERE status='manual_busy' AND completed_at<datetime('now','-90 seconds')${clause}`;
  const query=env.DB.prepare(sql);
  return id===null?await query.run():await query.bind(id).run();
}
async function startManualRefresh(request,env,origin){
  if(!manualOriginAllowed(request))return fail('Origine non autorizzata',403,origin);
  if(!env.DB||!env.ADMIN_TOKEN)return fail('DB o secret non configurato',503,origin);
  const entries=await monitoredSources(env);
  if(!entries.length)return fail('Nessuna fonte configurata',404,origin);
  await recoverExpiredManualLease(env);
  let run=await env.DB.prepare(`SELECT id,status,companies_checked,jobs_found,started_at
    FROM refresh_runs WHERE status IN ('manual_running','manual_busy')
      AND started_at>datetime('now','-45 minutes') ORDER BY id DESC LIMIT 1`).first();
  if(!run){
    const recent=await env.DB.prepare(`SELECT id FROM refresh_runs WHERE status IN ('manual_finished','manual_running','manual_busy')
      AND started_at>datetime('now',?) ORDER BY id DESC LIMIT 1`).bind('-'+MANUAL_COOLDOWN_MINUTES+' minutes').first();
    if(recent)return fail('Aggiornamento completo già richiesto di recente. Riprova tra circa 30 minuti.',429,origin);
    const r=await env.DB.prepare(`INSERT INTO refresh_runs (status,companies_checked,jobs_found,jobs_new)
      SELECT 'manual_running',0,?,0 WHERE NOT EXISTS (
      SELECT 1 FROM refresh_runs WHERE status IN ('manual_running','manual_busy')
        AND started_at>datetime('now','-45 minutes'))`).bind(entries.length).run();
    if(!r.meta?.changes)return fail('Un altro aggiornamento è già in esecuzione',409,origin);
    run={id:r.meta.last_row_id,companies_checked:0,jobs_found:entries.length};
  }
  return json({ok:true,runId:run.id,token:await makeSessionToken(env.ADMIN_TOKEN,run.id),
    processed:run.companies_checked||0,total:entries.length,message:'Controllo completo avviato'},200,origin);
}
async function manualRefreshStep(request,env,origin){
  if(!manualOriginAllowed(request))return fail('Origine non autorizzata',403,origin);
  if(!env.DB||!env.ADMIN_TOKEN)return fail('Configurazione incompleta',503,origin);
  let body;try{body=await request.json()}catch{return fail('JSON non valido',400,origin)}
  const id=body?.runId;
  if(!Number.isSafeInteger(id)||id<1||!(await safeTokenEqual(body?.token,await makeSessionToken(env.ADMIN_TOKEN,id))))
    return fail('Sessione non valida',403,origin);
  await recoverExpiredManualLease(env,id);
  const row=await env.DB.prepare(`SELECT id,status,companies_checked,jobs_found,started_at FROM refresh_runs WHERE id=?`).bind(id).first();
  if(!row||!['manual_running','manual_busy','manual_finished'].includes(row.status))return fail('Sessione non trovata',404,origin);
  if(row.status==='manual_finished')return json({ok:true,done:true,processed:row.companies_checked,total:row.jobs_found},200,origin);
  if(!row.started_at||Date.now()-Date.parse(String(row.started_at).replace(' ','T')+'Z')>45*60000)
    return fail('Sessione scaduta: ricarica la pagina',409,origin);
  if(row.status==='manual_busy')return fail('Un controllo è ancora in corso. Riprova tra poco.',409,origin);
  const entries=await monitoredSources(env),cursor=Number(row.companies_checked)||0;
  if(cursor>=entries.length){
    await env.DB.prepare(`UPDATE refresh_runs SET status='manual_finished',completed_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='manual_running'`).bind(id).run();
    return json({ok:true,done:true,processed:cursor,total:entries.length},200,origin);
  }
  // Claim before work, release only after the source returns. A CPU stop leaves
  // manual_busy and will be retried after the lease expires (not skipped).
  const claimed=await env.DB.prepare(`UPDATE refresh_runs SET status='manual_busy',completed_at=CURRENT_TIMESTAMP
    WHERE id=? AND companies_checked=? AND status='manual_running'`).bind(id,cursor).run();
  if(!claimed.meta?.changes)return fail('Un altro controllo è in corso. Riprova.',409,origin);
  const [sourceId,spec]=entries[cursor];
  let success=false,found=0,problem='';
  try{
    await trackSourceRun(env,Date.now(),cursor,entries);
    success=true;
    const count=await env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs j JOIN companies c ON c.id=j.company_id
      WHERE c.name=? AND j.status='active'`).bind(spec.name).first();
    found=count?.n||0;
  }catch(e){problem=String(e?.message||e).slice(0,180);console.error('Manual source failed',sourceId,problem)}
  const processed=cursor+1,done=processed>=entries.length;
  const released=await env.DB.prepare(`UPDATE refresh_runs
    SET status=?,companies_checked=?,completed_at=?
    WHERE id=? AND companies_checked=? AND status='manual_busy'`)
    .bind(done?'manual_finished':'manual_running',processed,done?new Date().toISOString().slice(0,19).replace('T',' '):null,id,cursor).run();
  if(!released.meta?.changes)return fail('Il controllo non ha potuto registrare il progresso.',409,origin);
  return json({ok:true,done,processed,total:entries.length,source:spec.name,success,found,error:problem},200,origin);
}

// V39: explicit, authenticated registration of reviewed company boards.
// A successful ATS probe is necessary but the operator is responsible for matching the board to the company.
async function activateReviewedSources(request,env,origin){
  if(origin!==FRONTEND_ORIGIN)return fail('Richiesta non consentita da questa origine',403,origin);
  if(!env.DB||!env.ADMIN_TOKEN)return fail('Database o ADMIN_TOKEN non configurati',503,origin);
  if(!(await authorized(request,env.ADMIN_TOKEN)))return fail('Credenziale amministratore non valida',401,origin);
  let input;try{input=await request.json()}catch{return fail('Richiesta JSON non valida',400,origin)}
  const list=input?.sources;
  if(!Array.isArray(list)||!list.length||list.length>10)return fail('Seleziona da 1 a 10 fonti',400,origin);
  const approved=[],errors=[],seen=new Set();
  for(const item of list){
    const name=String(item?.name||'').trim(),sector=String(item?.sector||'').trim(),location=String(item?.location||'').trim();
    const board=publicBoardSpec(item?.careers);
    const website=validURL(item?.website)||board?.careers;
    if(!name||name.length>140||sector.length>160||location.length>160||!board){errors.push({name:name.slice(0,80),reason:'Nome o portale non valido'});continue}
    const identity=board.ats+':'+board.board.toLowerCase();
    if(seen.has(identity)){errors.push({name,reason:'Bacheca duplicata in questa richiesta'});continue}
    seen.add(identity);
    try{
      const response=await getATSJobs(board,{probe:true});
      if(!response){errors.push({name,reason:'Feed non disponibile al momento'});continue}
      const usable=response.filter(j=>validURL(j.absolute_url)&&String(j.title||'').trim());
      if(!usable.length){errors.push({name,reason:'Feed senza annunci: attivazione rinviata'});continue}
      if(response.partial){errors.push({name,reason:'Feed parziale: attivazione sospesa per evitare perdita di annunci'});continue}
      // A board is a unique source. Never silently associate it with a second company.
      const sourceInDb=await env.DB.prepare(`SELECT name FROM companies WHERE source_type=? AND careers_url=? AND name<>? LIMIT 1`).bind(board.ats,board.careers,name).first();
      if(sourceInDb){errors.push({name,reason:'Bacheca già assegnata a '+String(sourceInDb.name).slice(0,80)});continue}
      await env.DB.prepare(`INSERT INTO companies
        (name,sector,location,website_url,careers_url,source_type,monitoring_status)
        VALUES (?,?,?,?,?,?,'active')
        ON CONFLICT(name) DO UPDATE SET sector=excluded.sector,location=excluded.location,
        website_url=excluded.website_url,careers_url=excluded.careers_url,
        source_type=excluded.source_type,monitoring_status='active'`)
        .bind(name,sector||'Da classificare',location,website,board.careers,board.ats).run();
      approved.push({name,ats:board.ats,careers:board.careers,found:usable.length});
    }catch(e){console.error('Source activation failed',name,String(e));errors.push({name,reason:'Errore durante la registrazione'})}
  }
  return json({ok:errors.length===0,activated:approved,errors,note:'Le offerte vengono importate con il successivo aggiornamento delle fonti.'},errors.length&&approved.length===0?422:200,origin);
}


// V40: genuine web-indexed Careers discovery using optional Tavily search.
// Explicit admin authorization protects external search quota; never expose keys to the browser.
const VERIFIED_CAREERS_V40 = Object.freeze({
  optiver: 'https://www.optiver.com/join-us',
  ogilvy: 'https://www.ogilvy.com/work-with-us',
  'weber shandwick': 'https://webershandwick.com/careers/jobs'
});
function safeSearchLink(raw){
  try{
    const u=new URL(String(raw||''));
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.length>200)return null;
    const h=u.hostname.toLowerCase();
    if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.test')||h.endsWith('.invalid')||h.endsWith('.onion')||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(':')||!h.includes('.'))return null;
    return u.href;
  }catch{return null;}
}
function careerUrlConfidence(u,company,website){
 let score=0;const parts=String(company||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>3);
 try{const x=new URL(u);const host=x.hostname.replace(/^www\./,'').toLowerCase(),path=x.pathname.toLowerCase();
   if(/careers|career|jobs|join-us|work-with-us|opportunities|vacancies|lavora-con-noi|werken-bij/.test(path))score+=3;
   if(/greenhouse|lever\.co|ashbyhq|smartrecruiters|teamtailor|myworkdayjobs|workable|recruitee/.test(host))score+=1;
   if(website){try{const h=new URL(website).hostname.replace(/^www\./,'').toLowerCase();if(host===h||host.endsWith('.'+h))score+=5;}catch{}}
   if(parts.some(w=>host.includes(w.replace(/s$/,''))))score+=2;
 }catch{}
 return score;
}
async function careersWebDiscovery(request,url,env,origin){
 if(origin!==FRONTEND_ORIGIN)return fail('Origine non autorizzata',403,origin);
 const name=String(url.searchParams.get('company')||'').trim().slice(0,100);
 if(name.length<2||!/^[\p{L}\p{N} .&'’()\/-]+$/u.test(name))return fail('Nome azienda non valido',400,origin);
 const website=safeSearchLink(url.searchParams.get('website')||'');
 const key=name.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 const curated=VERIFIED_CAREERS_V40[key];
 const seed=curated?[{url:curated,title:name+' — sito Careers ufficiale',source:'verified',confidence:'verified'}]:[];
 if(!env.TAVILY_API_KEY){
  return json({ok:true,configured:false,company:name,results:seed,
    message:'Ricerca web automatica non attiva. Configura TAVILY_API_KEY nel backend; i portali già verificati rimangono disponibili.'},200,origin);
 }
 if(!env.ADMIN_TOKEN||!(await authorized(request,env.ADMIN_TOKEN)))return fail('Per la ricerca web inserisci il secret amministratore.',401,origin);
 const q='"'+name.replace(/"/g,'')+'" (careers OR jobs OR vacancies OR "work with us" OR "lavora con noi") official';
 let response;
 try{
   response=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:env.TAVILY_API_KEY,query:q,search_depth:'basic',max_results:6,include_answer:false,include_images:false}),signal:AbortSignal.timeout(14000)});
 }catch(e){return json({ok:false,company:name,results:seed,message:'Ricerca web temporaneamente non disponibile: '+String(e.message||e).slice(0,80)},502,origin)}
 if(!response.ok)return json({ok:false,company:name,results:seed,message:'Servizio di ricerca non disponibile (HTTP '+response.status+'). Verifica i crediti Tavily.'},502,origin);
 let info;try{info=await response.json()}catch{return fail('Risposta motore di ricerca non valida',502,origin)}
 const found=(Array.isArray(info.results)?info.results:[]).map(r=>({url:safeSearchLink(r.url),title:String(r.title||'').slice(0,180),snippet:String(r.content||'').slice(0,250)})).filter(r=>r.url);
 const ranks=found.map(r=>({...r,score:careerUrlConfidence(r.url,name,website),source:'web_search',confidence:'to_review'})).sort((a,b)=>b.score-a.score);
 const unique=new Set(seed.map(r=>r.url));const results=[...seed];for(const r of ranks){if(!unique.has(r.url)){results.push(r);unique.add(r.url)}}
 return json({ok:true,configured:true,company:name,results:results.slice(0,7),message:results.length?'Verifica che i risultati appartengano alla società. Una pagina Careers non implica importazione automatica.':'Nessun risultato indicizzato per questa azienda.'},200,origin);
}

export default {
  async scheduled(event,env,ctx){
    ctx.waitUntil((async()=>{
      // Three independent sources per scheduled slot. Failures are isolated:
      // a broken board cannot prevent importing the other two.
      const entries=await monitoredSources(env);
      if(!entries.length)return;
      const slot=Math.floor((Number(event.scheduledTime)||Date.now())/(30*60*1000));
      for(let i=0;i<Math.min(3,entries.length);i++){
        const idx=(slot*3+i)%entries.length;
        try { await trackSourceRun(env, event.scheduledTime, idx, entries); }
        catch(e){console.error('Scheduled source failed',entries[idx][0],String(e));}
      }
    })());
  },
  async fetch(request, env) {
    const url=new URL(request.url);
    const origin=request.headers.get('Origin')||'';
    if (request.method==='OPTIONS'&&url.pathname.startsWith('/api/')) {
      if (origin!==FRONTEND_ORIGIN) return new Response(null,{status:403});
      return new Response(null,{status:204,headers:{...cors(origin),
        'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':'Authorization, Content-Type',
        'Access-Control-Max-Age':'600'}});
    }
    if (request.method==='GET'&&url.pathname==='/')
      return new Response(HTML,{headers:{'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'X-Frame-Options':'DENY'}});
    if (request.method==='POST'&&url.pathname==='/api/refresh-all/start') {
      try{return await startManualRefresh(request,env,origin)}catch(e){console.error('Manual refresh start failed',e);return fail('Non riesco ad avviare il controllo',500,origin)}
    }
    if (request.method==='POST'&&url.pathname==='/api/refresh-all/step') {
      try{return await manualRefreshStep(request,env,origin)}catch(e){console.error('Manual refresh step failed',e);return fail('Controllo temporaneamente non riuscito',500,origin)}
    }
    if (request.method==='POST'&&url.pathname==='/api/sources/activate') {
      try{return await activateReviewedSources(request,env,origin)}catch(e){console.error('Activation failed',String(e));return fail('Attivazione non riuscita',500,origin)}
    }
    if (request.method==='GET'&&url.pathname==='/api/careers-web-search') return careersWebDiscovery(request,url,env,origin);
    if (request.method==='GET'&&url.pathname==='/api/ats-probe') return await probePublicBoard(url,origin,env);
    if (request.method==='GET'&&url.pathname==='/api/discover') return await discoverPublicCompanies(url,origin);
    if (request.method==='GET'&&url.pathname==='/api/sources') {
      try { const entries=await monitoredSources(env);
        return json({ok:true,sources:entries.map(([id,s])=>({id,name:s.name,careers:s.careers,sector:s.sector,location:s.location,ats:s.ats||'greenhouse',registry:id.startsWith('custom-')?'D1':'configured'})),
          note:'Le nuove fonti D1 devono essere approvate nel pannello Cloudflare. Nessuna scrittura pubblica.'},200,origin);
      }catch(e){console.error('sources registry error',e);return fail('Impossibile caricare le fonti',500,origin)}
    }
    // V26: read-only D1 company catalog for frontend synchronization.
    // No CV, application, credentials or browser-specific data are sent to the API.
    if (request.method==='GET'&&url.pathname==='/api/companies') {
      try {
        const rows=await env.DB.prepare(`SELECT id,name,sector,location,website_url,careers_url,
          source_type,monitoring_status FROM companies ORDER BY name LIMIT 1000`).all();
        return json({ok:true,companies:rows.results||[]},200,origin);
      }catch(e){console.error('company catalog error',e);return fail('Catalogo temporaneamente non disponibile',500,origin)}
    }
    if (request.method==='GET'&&url.pathname==='/api/coverage') {
      try {
        const rows=await env.DB.prepare(`SELECT c.name, c.last_checked_at,
          SUM(CASE WHEN j.status='active' THEN 1 ELSE 0 END) AS jobs, SUM(CASE WHEN j.status='active' AND length(COALESCE(j.description,''))>0 THEN 1 ELSE 0 END) AS descriptions
          FROM companies c LEFT JOIN jobs j ON j.company_id=c.id GROUP BY c.id,c.name,c.last_checked_at`).all();
        const byName=new Map((rows.results||[]).map(r=>[r.name,r]));
        let health=[];
        try{
          const audit=await env.DB.prepare(`SELECT source_key,status,checked_at,success_at,
            error_at,error_text,jobs_found,duration_ms FROM source_health`).all();
          health=audit.results||[];
        }catch(e){console.info('Source diagnostics pending first refresh')}
        const byKey=new Map(health.map(item=>[item.source_key,item]));
        const sources=(await monitoredSources(env)).map(([id,s])=>{
          const row=byName.get(s.name);
          const item=byKey.get(sourceKey(s));
          return {id,name:s.name,jobs:row?.jobs||0,descriptions:row?.descriptions||0,
            lastChecked:row?.last_checked_at||null,careers:s.careers,ats:s.ats||'greenhouse',
            lastAttempt:item?.checked_at||null,lastSuccess:item?.success_at||null,
            lastError:item?.error_at||null,errorText:item?.error_text||null,
            lastResult:item?.status||'unknown',durationMs:item?.duration_ms??null};
        });
        const checked=sources.filter(s=>Boolean(s.lastChecked)).length;
        const withJobs=sources.filter(s=>Number(s.jobs)>0).length;
        const neverChecked=sources.filter(s=>!s.lastChecked).map(s=>s.id);
        const last=await env.DB.prepare('SELECT id,status,completed_at,jobs_found,jobs_new FROM refresh_runs ORDER BY id DESC LIMIT 1').first();
        return json({ok:true,sources,totalSources:sources.length,checkedSources:checked,
          sourcesWithJobs:withJobs,neverChecked,lastRun:last||null,
          automaticRotation:'3 fonti ogni 30 minuti; durata ciclo dipendente dal numero di fonti approvate',
          diagnosticsVersion:31,
          note:'Il conteggio include solo le bacheche collegate, non il mercato mondiale. Fonti senza dati non sono necessariamente vuote.'},200,origin);
      }catch(e){console.error('coverage error',e);return fail('Copertura temporaneamente non disponibile',500,origin)}
    }
    if (request.method==='GET'&&url.pathname==='/api/status') {
      try {
        const [company,job,last]=await Promise.all([
          env.DB.prepare('SELECT COUNT(*) total FROM companies').first(),
          env.DB.prepare("SELECT COUNT(*) total FROM jobs WHERE status='active'").first(),
          env.DB.prepare('SELECT status,completed_at FROM refresh_runs ORDER BY id DESC LIMIT 1').first(),
        ]);
        return json({ok:true,database:'connected',companies:company.total,jobs:job.total,last_refresh:last||null},200,origin);
      } catch(e) { console.error('status DB error',e);return fail('Errore nel database',500,origin); }
    }
    // V14: load one description only when an offer is selected. Public read-only.
    const detailMatch=url.pathname.match(/^\/api\/job\/(\d+)$/);
    if (request.method==='GET'&&detailMatch) {
      try {
        const item=await env.DB.prepare(`SELECT j.id,j.description,j.status,j.job_url FROM jobs j WHERE j.id=? AND j.status='active'`).bind(Number(detailMatch[1])).first();
        if(!item)return fail('Annuncio non trovato o non attivo',404,origin);
        return json({ok:true,job:item},200,origin);
      }catch(e){console.error('job detail error',e);return fail('Dettaglio temporaneamente non disponibile',500,origin)}
    }
    if (request.method==='GET'&&url.pathname==='/api/jobs') {
      try {
        const limit=Math.min(200,Math.max(1,parseInt(url.searchParams.get('limit')||'50',10)||50));
        const offset=Math.min(50000,Math.max(0,parseInt(url.searchParams.get('offset')||'0',10)||0));
        const compact=url.searchParams.get('compact')==='1';
        // Reading the description within the Worker allows compact network responses while exposing
        // derived work arrangement and metadata for filters (no extra D1 migration).
        // V24: compact requests must never hydrate 200 full descriptions in JS.
        // Only a bounded excerpt is read for conservative derived signals; full text
        // remains stored in D1 and accessible at /api/job/:id.
        const descriptionColumn=compact
          ? "substr(COALESCE(j.description,''),1,1200) AS description, CASE WHEN length(COALESCE(j.description,''))>0 THEN 1 ELSE 0 END AS description_present"
          : "j.description";
        const results=await env.DB.prepare(`SELECT j.id,j.title,j.location,j.job_url,j.apply_url,
          j.first_seen_at,j.last_seen_at,j.status,${descriptionColumn},c.name AS company,
          c.sector AS company_sector,c.website_url AS company_website,c.careers_url AS company_careers
          FROM jobs j JOIN companies c ON c.id=j.company_id
          WHERE j.status='active'
          ORDER BY j.first_seen_at DESC,j.id DESC LIMIT ? OFFSET ?`).bind(limit,offset).all();
        const jobs=(results.results||[]).map(j=>{
          const signals=postingSignals(j.title,j.location,j.description);
          const hasDescription=compact?Number(j.description_present||0):Number(Boolean(j.description));
          const {description_present,...rest}=j;
          return {...rest,work_mode:signals.workMode,seniority_derived:signals.seniority,
            employment_derived:signals.employment,contract_derived:signals.contract,
            has_description:hasDescription,description:compact?'':j.description};
        });
        return json({ok:true,jobs,limit,offset},200,origin);
      } catch(e) { console.error('jobs DB error',e);return fail('Errore nel recupero degli annunci',500,origin); }
    }
    const match=url.pathname.match(/^\/api\/refresh\/([a-z0-9-]+)$/);
    if (request.method==='POST'&&match) {
      try { return await refreshCompany(request,env,origin,match[1]); }
      catch(e) { console.error('refresh error',e);return fail('Errore durante il refresh. Riprova.',500,origin); }
    }
    return fail('Endpoint inesistente',404,origin);
  }
};