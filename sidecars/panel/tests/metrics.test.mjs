import test from 'node:test';
import assert from 'node:assert/strict';
import { trajectoryMetrics, quotaMetrics, seconds } from '../metrics.mjs';
import { countdown, smallCount } from '../format.mjs';
import { MetricsStore } from '../store.mjs';

const chat = (id, tokens, duration, thinking = '100', ttft = '2s') => ({ chatModel: { usage: { messageId: id, inputTokens:'1000', outputTokens:String(Number(tokens)+Number(thinking)), responseOutputTokens:String(tokens), thinkingOutputTokens:thinking }, streamingDuration:duration, timeToFirstToken:ttft } });

test('TPS aligns total outputTokens (including thinking) with streamingDuration, separate from TTFT and E2E speed', () => {
  const data = trajectoryMetrics({ trajectory:{ generatorMetadata:[chat('a',100,'1s'),chat('b',200,'4s')],steps:[] } });
  assert.equal(data.tps,100); assert.equal(data.latestTps,75); assert.equal(data.peakTps,200);
  assert.ok(Math.abs(data.e2eTps - 500 / 9) < 1e-10);
  assert.deepEqual(data.recentTps,[200,75]);
  assert.equal(data.modelSeconds,9); assert.equal(data.ttftSeconds,2);
  assert.equal(data.ttftMedianSeconds,2); assert.equal(data.latestTtftSeconds,2);
  assert.equal(data.rateBasis,'all-output');
  assert.equal(data.counts.output,500); assert.equal(data.counts.responseOutput,300); assert.equal(data.counts.thinkingOutput,200);
});
test('streaming speed numerator fallback order and Issue #24 reasoning-model calibration', () => {
  // Real Gemini 4 Neon reasoning sample: output=3205 (thinking=1728 + resp=1477), ttft=4.78s, stream=22.54s
  const liveSample = trajectoryMetrics({ trajectory:{ generatorMetadata:[{ chatModel:{ usage:{ messageId:'neon', outputTokens:'3205', thinkingOutputTokens:'1728', responseOutputTokens:'1477' }, streamingDuration:'22.54s', timeToFirstToken:'4.78s' } }], steps:[] } });
  assert.ok(Math.abs(liveSample.tps - 3205 / 22.54) < 1e-10);
  assert.ok(Math.abs(liveSample.e2eTps - 3205 / (4.78 + 22.54)) < 1e-10);
  assert.equal(liveSample.rateBasis,'all-output');
  // Fallback 1: outputTokens omitted -> thinkingOutputTokens + responseOutputTokens
  const sumFallback = trajectoryMetrics({ trajectory:{ generatorMetadata:[{ chatModel:{ usage:{ messageId:'f1', thinkingOutputTokens:'300', responseOutputTokens:'200' }, streamingDuration:'5s', timeToFirstToken:'1s' } }], steps:[] } });
  assert.equal(sumFallback.tps,100); assert.equal(sumFallback.rateBasis,'all-output');
  assert.ok(Math.abs(sumFallback.e2eTps - 500 / 6) < 1e-10);
  // Fallback 2: only responseOutputTokens present
  const respFallback = trajectoryMetrics({ trajectory:{ generatorMetadata:[{ chatModel:{ usage:{ messageId:'f2', responseOutputTokens:'200' }, streamingDuration:'4s', timeToFirstToken:'1s' } }], steps:[] } });
  assert.equal(respFallback.tps,50); assert.equal(respFallback.e2eTps,40); assert.equal(respFallback.rateBasis,'response');
});
test('TTFT computes P50 median and latest separately to resist single-request spikes', () => {
  const odd = trajectoryMetrics({ trajectory:{ generatorMetadata:[
    chat('t1',100,'2s','100','1.5s'), chat('t2',100,'2s','100','2.5s'), chat('t3',100,'2s','100','2.0s'),
    chat('t4',100,'2s','100','3.0s'), chat('t5',100,'2s','100','120s'),
  ], steps:[] } });
  assert.equal(odd.ttftMedianSeconds,2.5); assert.equal(odd.ttftSeconds,2.5); assert.equal(odd.latestTtftSeconds,120);
  const even = trajectoryMetrics({ trajectory:{ generatorMetadata:[
    chat('e1',100,'2s','100','1s'), chat('e2',100,'2s','100','2s'),
    chat('e3',100,'2s','100','4s'), chat('e4',100,'2s','100','100s'),
  ], steps:[] } });
  assert.equal(even.ttftMedianSeconds,3); assert.equal(even.ttftSeconds,3); assert.equal(even.latestTtftSeconds,100);
  // Missing latest TTFT must not borrow previous TTFT; missing TTFT keeps e2eTps null
  const noTtft = trajectoryMetrics({ trajectory:{ generatorMetadata:[
    chat('n1',100,'2s','100','2s'), chat('n2',100,'2s','100',null),
  ], steps:[] } });
  assert.equal(noTtft.ttftMedianSeconds,2); assert.equal(noTtft.latestTtftSeconds,null);
  assert.equal(noTtft.e2eTps,50);
  const allMissingTtft = trajectoryMetrics({ trajectory:{ generatorMetadata:[chat('m1',100,'2s','100',null)], steps:[] } });
  assert.equal(allMissingTtft.ttftMedianSeconds,null); assert.equal(allMissingTtft.latestTtftSeconds,null); assert.equal(allMissingTtft.e2eTps,null);
  const zeroTtft = trajectoryMetrics({ trajectory:{ generatorMetadata:[chat('z1',100,'2s','100','0s')], steps:[] } });
  assert.equal(zeroTtft.ttftMedianSeconds,0); assert.equal(zeroTtft.latestTtftSeconds,0); assert.equal(zeroTtft.e2eTps,100);
});
test('cacheWriteTokens remains included in normalized input and cache accounting', () => {
  const data = trajectoryMetrics({ trajectory:{ generatorMetadata:[{ chatModel:{ usage:{ messageId:'cw', apiProvider:'API_PROVIDER_ANTHROPIC', inputTokens:'100', cacheReadTokens:'800', cacheWriteTokens:'100', outputTokens:'200', responseOutputTokens:'150', thinkingOutputTokens:'50' }, streamingDuration:'2s', timeToFirstToken:'1s' } }], steps:[] } });
  assert.equal(data.tokens.inputTokens,1000); assert.equal(data.tokens.cacheWriteTokens,100); assert.equal(data.cache.inputTokens,1000);
  assert.equal(data.cache.hitRate,0.8); assert.equal(data.tps,100); assert.ok(Math.abs(data.e2eTps - 200 / 3) < 1e-10);
});
test('recentTps caps at last 16 accepted samples and lastActiveAt tracks latest timestamp', () => {
  const generators = Array.from({length:20},(_,i)=>chat(`m${i}`,100 + i * 10,'2s'));
  generators[19].chatModel.chatStartMetadata = {createdAt:'2026-10-06T08:10:00Z'};
  const steps = [{type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{startedAt:'2026-10-06T08:10:02Z',completedAt:'2026-10-06T08:10:05Z'}}];
  const data = trajectoryMetrics({trajectory:{generatorMetadata:generators,steps}});
  assert.equal(data.recentTps.length,16);
  assert.equal(data.recentTps[0],120);
  assert.equal(data.recentTps[15],195);
  assert.equal(data.peakTps,195);
  assert.equal(data.lastActiveAt,'2026-10-06T08:10:05.000Z');
});
test('duplicate request metadata and missing/zero duration never inflate speed', () => {
  const a = chat('a',100,'2s');
  const data = trajectoryMetrics({ trajectory:{generatorMetadata:[a,a,chat('b',500,'0s'),chat('c',500,undefined)]} });
  assert.equal(data.requests,3); assert.equal(data.measuredRequests,1); assert.equal(data.tps,100); assert.equal(data.missingTiming,2);
  assert.equal(trajectoryMetrics({trajectory:{}}).tps,null);
});
test('overlapping tool execution is counted once, including tools without toolCall metadata', () => {
  const data = trajectoryMetrics({trajectory:{steps:[
    {type:'CORTEX_STEP_TYPE_SEARCH_WEB',metadata:{startedAt:'2026-10-06T08:00:00Z',completedAt:'2026-10-06T08:00:04Z'}},
    {type:'CORTEX_STEP_TYPE_RUN_COMMAND',metadata:{startedAt:'2026-10-06T08:00:02Z',completedAt:'2026-10-06T08:00:06Z'}},
    {type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{startedAt:'2026-10-06T08:00:00Z',completedAt:'2026-10-06T08:00:20Z'}},
  ]}});
  assert.equal(data.toolSeconds,6);
});
test('quota zero is real, omitted/invalid balances stay unknown, model groups stay distinct', () => {
  const data = quotaMetrics({response:{groups:[
    {displayName:'Gemini',buckets:[{bucketId:'gemini-5h',window:'5h',remainingFraction:0,resetTime:'2026-10-06T12:00:00Z'}]},
    {displayName:'Claude',buckets:[{bucketId:'3p-weekly',window:'weekly',remainingFraction:1.5}]},
  ]}},Date.parse('2026-10-06T08:00:00Z'));
  assert.equal(data[0].id,'gemini'); assert.equal(data[0].windows['5h'].remaining,0);
  assert.equal(data[0].windows.weekly.available,false); assert.equal(data[1].windows.weekly.remaining,null);
});
test('countdown reaches waiting state, never asserts that an expired balance has refilled', () => {
  const now = Date.parse('2026-10-06T08:00:00Z');
  assert.equal(countdown('2026-10-06T08:00:01Z',now),'00:00:01');
  assert.equal(countdown('2026-10-06T08:00:00Z',now),'等待刷新');
  assert.equal(countdown('2026-10-13T09:02:03Z',now),'7天 01:02:03');
  assert.equal(countdown(null,now),'—');
  assert.equal(seconds({seconds:'2',nanos:500000000}),2.5);
});
test('account switch clears old quota before a new account fails to load', async () => {
  let email = 'a@example.test', broken = false;
  const client = { call:async name => {
    if(name === 'GetUserStatus') return {userStatus:{email}};
    if(broken) throw new Error('quota unavailable');
    return {response:{groups:[{displayName:'A',buckets:[]}]}};
  }};
  const store = new MetricsStore(client); await store.refreshQuota(true);
  assert.equal(store.quota[0].name,'A'); email = 'b@example.test'; broken = true;
  await assert.rejects(store.refreshQuota(true)); assert.equal(store.quota,null); assert.equal(store.quotaAt,0);
});
test('RPC errors do not replace a cached quota with made-up percentages', async () => {
  const client = {discover:async()=>{throw new Error('offline');}};
  const store = new MetricsStore(client);store.quota=[{id:'saved'}];store.quotaAt=1000;
  const snapshot = await store.snapshot();assert.equal(snapshot.connection,'stale');assert.equal(snapshot.groups[0].id,'saved');assert.equal(snapshot.speed,null);
});
test('two-phase orchestrator breakdown separates planning and executor burn and tracks cache-miss surges & toolSummary', () => {
  const data = trajectoryMetrics({trajectory:{cascadeId:'11111111-1111-1111-1111-111111111111',
    steps:[
      {type:'CORTEX_STEP_TYPE_USER_INPUT'},
      {type:'CORTEX_STEP_TYPE_GENERIC',metadata:{toolCall:{name:'grep_search',argumentsJson:'{"Query":"foo"}'},toolSource:'CORTEX_COMPONENT_SOURCE_BUILTIN'}},
      {type:'CORTEX_STEP_TYPE_MCP_TOOL',metadata:{toolCall:{name:'mcp_read',argumentsJson:'x'.repeat(400)},toolSource:'CORTEX_COMPONENT_SOURCE_CUSTOMIZATION'}},
    ],
    generatorMetadata:[
      {chatModel:{model:'MODEL_PLACEHOLDER_M537',responseModel:'gemini-pro-orchestrator-neon',streamingDuration:'3s',usage:{responseId:'p1',inputTokens:'120000',cacheReadTokens:'0',outputTokens:'4000',responseOutputTokens:'1000',thinkingOutputTokens:'3000',apiProvider:'API_PROVIDER_GOOGLE_GEMINI'}}},
      {chatModel:{model:'MODEL_PLACEHOLDER_M669',responseModel:'gemini-flash-worker-agy',modelDisplayName:'Gemini 4 Hydrogen (Orchestrator)',streamingDuration:'2s',usage:{responseId:'e1',inputTokens:'15000',cacheReadTokens:'80000',outputTokens:'2500',responseOutputTokens:'2000',thinkingOutputTokens:'500',apiProvider:'API_PROVIDER_GOOGLE_GEMINI'}}},
    ]}});
  assert.equal(data.model,'Gemini 4 Hydrogen (Orchestrator)');
  assert.equal(data.modelBreakdown.length,2);
  const orch=data.modelBreakdown.find(m=>m.model==='Orchestrator (Neon)');
  const exec=data.modelBreakdown.find(m=>m.model==='Gemini 4 Hydrogen (Orchestrator)');
  assert.ok(orch && exec);
  assert.equal(orch.thinkingTokens,3000);assert.equal(orch.cacheMissSurges,1);assert.equal(orch.cacheMissSurgeTokens,120000);
  assert.equal(exec.cachedTokens,80000);assert.equal(exec.cacheMissSurges,0);
  assert.equal(data.cacheMissSurges,1);assert.equal(data.cacheMissSurgeTokens,120000);
  assert.equal(data.toolSummary.totalCalls,2);
  assert.equal(data.toolSummary.tools[0].name,'mcp_read');assert.equal(data.toolSummary.tools[0].argTokens,100);assert.equal(data.toolSummary.tools[0].source,'mcp');
});
test('trajectoryMetrics partitions steps into non-overlapping stepBreakdown buckets', () => {
  const data = trajectoryMetrics({trajectory:{cascadeId:'11111111-1111-1111-1111-111111111111',
    steps:[
      {type:'CORTEX_STEP_TYPE_USER_INPUT'},
      {type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE'},
      {type:'CORTEX_STEP_TYPE_RUN_COMMAND'},
      {type:'CORTEX_STEP_TYPE_GENERIC',metadata:{toolCall:{name:'grep_search',argumentsJson:'{}'}}},
      {type:'CORTEX_STEP_TYPE_COMPACTION'},
      {type:'CORTEX_STEP_TYPE_CHECKPOINT'},
      {type:'CORTEX_STEP_TYPE_SYSTEM_MESSAGE'},
    ],
    generatorMetadata:[]}});
  assert.equal(data.rounds, 1);
  assert.equal(data.steps, 7);
  assert.deepEqual(data.stepBreakdown, { user: 1, planner: 1, tool: 2, compaction: 2, other: 1 });
});
test('smallCount leaves 4-digit integers ungrouped while grouping 10,000+', () => {
  assert.equal(smallCount(0), '0');
  assert.equal(smallCount(999), '999');
  assert.equal(smallCount(2464), '2464');
  assert.equal(smallCount(9999), '9999');
  assert.equal(smallCount(10000), '10,000');
  assert.equal(smallCount(12345), '12,345');
  assert.equal(smallCount(null), '—');
});

test('trajectoryMetrics aggregates completed assistant turns including non-user-input wakeups', () => {
  const data = trajectoryMetrics({
    status: 'CASCADE_RUN_STATUS_IDLE',
    trajectory: {
      cascadeId: '11111111-1111-1111-1111-111111111111',
      steps: [
        { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
        { type: 'CORTEX_STEP_TYPE_RUN_COMMAND' },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'CORTEX_STEP_STATUS_DONE', plannerResponse: { response: 'First reply' } },
        { type: 'CORTEX_STEP_TYPE_SYSTEM_MESSAGE' },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'CORTEX_STEP_STATUS_DONE', plannerResponse: { response: 'Second reply' } },
      ],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { modelDisplayName: 'Gemini 4 Neon (High)', streamingDuration: '1s', usage: { messageId: 'm1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: '1000', cacheReadTokens: '9000', outputTokens: '200' } } },
        { stepIndices: [2], chatModel: { modelDisplayName: 'Gemini 4 Hydrogen (Medium)', streamingDuration: '1s', usage: { messageId: 'm2', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: '500', cacheReadTokens: '9500', outputTokens: '300' } } },
        { stepIndices: [4], chatModel: { modelDisplayName: 'Gemini 4 Hydrogen (Medium)', streamingDuration: '2s', usage: { messageId: 'm3', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: '1000', cacheReadTokens: '19000', outputTokens: '400' } } },
      ],
    },
  });
  assert.equal(data.totalCompletedTurns, 2);
  assert.equal(data.turns.length, 2);
  assert.equal(data.turns[0].model, 'Gemini 4 Hydrogen (Medium)');
  assert.equal(data.turns[0].multiModel, true);
  assert.equal(data.turns[0].inputTokens, 20000);
  assert.equal(data.turns[0].cachedTokens, 18500);
  assert.equal(data.turns[0].outputTokens, 500);
  assert.equal(data.turns[0].tps, 250);
  assert.equal(data.turns[1].model, 'Gemini 4 Hydrogen (Medium)');
  assert.equal(data.turns[1].multiModel, false);
  assert.equal(data.turns[1].inputTokens, 20000);
  assert.equal(data.turns[1].outputTokens, 400);
  assert.equal(data.turns[1].tps, 200);
});

test('trajectoryMetrics excludes short-window (<1s) bursts from turn.tps while keeping token totals', () => {
  const data = trajectoryMetrics({
    status: 'CASCADE_RUN_STATUS_IDLE',
    trajectory: {
      cascadeId: '11111111-1111-1111-1111-111111111111',
      steps: [
        { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
        { type: 'CORTEX_STEP_TYPE_RUN_COMMAND' },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'CORTEX_STEP_STATUS_DONE', plannerResponse: { response: 'Done' } },
      ],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { modelDisplayName: 'Gemini 4 Hydrogen (Medium)', streamingDuration: '0.2s', usage: { messageId: 'b1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: '1000', cacheReadTokens: '9000', outputTokens: '200' } } },
        { stepIndices: [2], chatModel: { modelDisplayName: 'Gemini 4 Hydrogen (Medium)', streamingDuration: '2s', usage: { messageId: 'b2', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: '1000', cacheReadTokens: '9000', outputTokens: '400' } } },
      ],
    },
  });
  assert.equal(data.turns.length, 1);
  assert.equal(data.turns[0].outputTokens, 600);
  assert.equal(data.turns[0].tps, 200);
});
