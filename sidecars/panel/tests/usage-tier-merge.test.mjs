import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

// The helpers live inside the usage-ui factory (the panel bundle only inlines
// the factory body), so tests extract the marked block directly from source.
const source=readFileSync(new URL('../../../compat/usage-ui.cjs',import.meta.url),'utf8');
const markerStart=source.indexOf('// usage-model-tiers:start');
const markerEnd=source.indexOf('// usage-model-tiers:end');
assert.ok(markerStart>0&&markerEnd>markerStart,'usage-model-tiers markers must exist in compat/usage-ui.cjs');
const {baseModelName,mergeModelTiers,TIER_SUFFIX_RE}=new Function(source.slice(markerStart,markerEnd)+'; return usageTierHelpers;')();

test('baseModelName strips effort-tier suffixes',()=>{
  assert.equal(baseModelName('Gemini 4 Neon (High)'),'Gemini 4 Neon');
  assert.equal(baseModelName('Gemini 4 Neon (Medium)'),'Gemini 4 Neon');
  assert.equal(baseModelName('Gemini 4 Neon (Low)'),'Gemini 4 Neon');
  assert.equal(baseModelName('Gemini 4 Neon (XHigh)'),'Gemini 4 Neon');
  assert.equal(baseModelName('Claude Sonnet 4.6 (Thinking)'),'Claude Sonnet 4.6');
  assert.equal(baseModelName('GPT-OSS 120B (Max)'),'GPT-OSS 120B');
  assert.equal(baseModelName('Gemini 3.8 Flash (Tiered)'),'Gemini 3.8 Flash');
});

test('baseModelName is case-insensitive and trims whitespace',()=>{
  assert.equal(baseModelName('Gemini 4 Neon (high)'),'Gemini 4 Neon');
  assert.equal(baseModelName('gemini-4-neon (THINKING)'),'gemini-4-neon');
  assert.equal(baseModelName('Gemini 4 Neon  (Low)  '),'Gemini 4 Neon');
});

test('baseModelName keeps role, variant and trial suffixes separate',()=>{
  assert.equal(baseModelName('Gemini 4 Hydrogen (Orchestrator)'),'Gemini 4 Hydrogen (Orchestrator)');
  assert.equal(baseModelName('Orchestrator (Neon)'),'Orchestrator (Neon)');
  assert.equal(baseModelName('Orchestrator (Carbon)'),'Orchestrator (Carbon)');
  assert.equal(baseModelName('Gemini 4 Neon (Trial)'),'Gemini 4 Neon (Trial)');
  assert.equal(baseModelName('Gemini (Internal BYOM)'),'Gemini (Internal BYOM)');
  assert.equal(baseModelName('Gemini 4 Neon'),'Gemini 4 Neon');
  // A tier word not in a trailing parenthesized suffix is left alone.
  assert.equal(baseModelName('thinking-model'),'thinking-model');
});

test('baseModelName edge inputs',()=>{
  assert.equal(baseModelName(''),'');
  assert.equal(baseModelName(undefined),'');
  assert.equal(baseModelName(null),'');
  assert.equal(baseModelName(42),'42');
  assert.equal(baseModelName('(High)'),'(High)');
  assert.equal(TIER_SUFFIX_RE.test('Gemini 4 Neon'),false);
});

const counters=(total,requests=1,uncached=0,cacheRead=0,cacheWrite=0,output=0)=>({total,requests,uncached,cacheRead,cacheWrite,output});

test('mergeModelTiers rolls tiers of the same base model into one row',()=>{
  const {merged,changed}=mergeModelTiers({
    'model_placeholder_m532':counters(100,2,60,30,10,0),
    'model_placeholder_m533':counters(50,1,20,25,5,0),
    'model_placeholder_m534':counters(25,1,10,10,5,0),
  },m=>({'model_placeholder_m532':'Gemini 4 Neon (High)','model_placeholder_m533':'Gemini 4 Neon (Medium)','model_placeholder_m534':'Gemini 4 Neon (Low)'})[m]||m,baseModelName);
  assert.equal(changed,true);
  assert.deepEqual(Object.keys(merged).sort(),['Gemini 4 Neon']);
  assert.equal(merged['Gemini 4 Neon'].total,175);
  assert.equal(merged['Gemini 4 Neon'].requests,4);
  assert.equal(merged['Gemini 4 Neon'].cacheRead,65);
  assert.equal(merged['Gemini 4 Neon'].tiers.High.total,100);
  assert.equal(merged['Gemini 4 Neon'].tiers.Medium.total,50);
  assert.equal(merged['Gemini 4 Neon'].tiers.Low.total,25);

  const flash=mergeModelTiers({
    'Gemini 3.8 Flash (Tiered)':counters(120,2,20,80,20,0),
    'Gemini 3.8 Flash (High)':counters(60,1,10,40,10,0),
    'Gemini 3.8 Flash (Medium)':counters(30,1,10,15,5,0),
  },m=>m,baseModelName);
  assert.deepEqual(Object.keys(flash.merged),['Gemini 3.8 Flash']);
  assert.equal(flash.merged['Gemini 3.8 Flash'].total,210);
  assert.equal(flash.merged['Gemini 3.8 Flash'].tiers.Tiered.total,120);
  assert.equal(flash.merged['Gemini 3.8 Flash'].tiers.High.total,60);
  assert.equal(flash.merged['Gemini 3.8 Flash'].tiers.Medium.total,30);
});

test('mergeModelTiers keeps non-tier models untouched and tiers null',()=>{
  const {merged,changed}=mergeModelTiers({
    'gemini-2.5-pro':counters(10,1),
    'Gemini 4 Hydrogen (Orchestrator)':counters(5,1),
  },m=>m,baseModelName);
  assert.equal(changed,false);
  assert.equal(merged['gemini-2.5-pro'].total,10);
  assert.equal(merged['gemini-2.5-pro'].tiers,null);
  assert.equal(merged['Gemini 4 Hydrogen (Orchestrator)'].total,5);
  assert.equal(merged['Gemini 4 Hydrogen (Orchestrator)'].tiers,null);
});

test('mergeModelTiers derived cache-hit rate matches the raw per-tier blend',()=>{
  const raw={
    'a (High)':counters(100,2,20,60,20,10),
    'a (Low)':counters(40,1,30,5,5,0),
  };
  const {merged}=mergeModelTiers(raw,m=>m,baseModelName);
  const hitInput=(merged.a.uncached||0)+(merged.a.cacheRead||0)+(merged.a.cacheWrite||0);
  const mergedHit=merged.a.cacheRead/hitInput;
  const perTier=Object.values(raw).map(r=>({read:r.cacheRead,input:r.uncached+r.cacheRead+r.cacheWrite}));
  const rawHit=perTier.reduce((n,x)=>n+x.read,0)/perTier.reduce((n,x)=>n+x.input,0);
  assert.equal(mergedHit,rawHit);
  assert.equal(hitInput>0,true);
});

test('mergeModelTiers handles missing or partial counters and empty data',()=>{
  const {merged:empty,changed:emptyChanged}=mergeModelTiers({},m=>m,baseModelName);
  assert.deepEqual(empty,{});assert.equal(emptyChanged,false);
  const {merged,changed}=mergeModelTiers({'x (High)':{total:7}},m=>m,baseModelName);
  assert.equal(changed,true);
  assert.equal(merged.x.total,7);
  assert.equal(merged.x.requests,0);
  assert.equal(merged.x.tiers.High.total,7);
  const {merged:unchanged,changed:c2}=mergeModelTiers(null,m=>m,baseModelName);
  assert.deepEqual(unchanged,{});assert.equal(c2,false);
});

test('mergeModelTiers preserves per-tier rows when toBase keeps canonical names (unmerged toggle)',()=>{
  const map={
    'model_placeholder_m532':'Gemini 4 Neon (High)',
    'model_placeholder_m533':'Gemini 4 Neon (Medium)',
    'model_placeholder_m534':'Gemini 4 Neon (Low)',
  };
  const {merged,changed}=mergeModelTiers({
    'model_placeholder_m532':counters(100,2,60,30,10,0),
    'model_placeholder_m533':counters(50,1,20,25,5,0),
    'model_placeholder_m534':counters(25,1,10,10,5,0),
  },m=>map[m]||m,m=>m);
  assert.equal(changed,true);
  assert.deepEqual(Object.keys(merged).sort(),['Gemini 4 Neon (High)','Gemini 4 Neon (Low)','Gemini 4 Neon (Medium)']);
  assert.equal(merged['Gemini 4 Neon (High)'].tiers,null);
  assert.equal(merged['Gemini 4 Neon (Medium)'].total,50);
});
