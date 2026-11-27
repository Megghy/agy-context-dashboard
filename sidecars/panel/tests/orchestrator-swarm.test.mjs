import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readHostOrchestrator } from '../../../compat/host-orchestrator.mjs';
import { readSwarmMembers } from '../swarm.mjs';
import { aggregateTaskUsage, safeTaskUsage, taskRecords } from '../task-usage.mjs';
import { trajectoryMetrics } from '../metrics.mjs';
import { SessionHistory, safeMetrics } from '../history.mjs';
import { MetricsStore } from '../store.mjs';
import { TranscriptReader } from '../transcript.mjs';

const coord = '11111111-1111-1111-1111-111111111111';
const account = createHash('sha256').update('orch-swarm@example.test').digest('hex');

test('readHostOrchestrator whitelists only orchestrator keys, normalizes models, and rejects unsafe values', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-orch-cfg-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'config.json');

  await writeFile(file, '\uFEFF' + JSON.stringify({
    userSettings: {
      orchestratorModel: 'MODEL_PLACEHOLDER_M532',
      orchestratorExecutorModel: 'gemini-4-hydrogen-high',
      themeMode: 'THEME_MODE_DARK',
      apiKey: 'SECRET_API_KEY',
    },
    plugins: { secretToken: 'MUST_NOT_LEAK' },
  }));
  const loaded = await readHostOrchestrator({ file });
  assert.deepEqual(loaded, {
    orchestratorModel: 'Gemini 4 Neon (High)',
    orchestratorExecutorModel: 'Gemini 4 Hydrogen (High)',
  });
  assert.equal(JSON.stringify(loaded).includes('SECRET'), false);

  await writeFile(file, JSON.stringify({
    userSettings: {
      orchestratorModel: 'word/claude-sonnet-5-5-high@default',
      orchestratorExecutorModel: 'ollama/qwen3-coder:32b',
    },
  }));
  assert.deepEqual(await readHostOrchestrator({ file }), {
    orchestratorModel: 'Claude Sonnet 5.5 (High)',
    orchestratorExecutorModel: 'ollama/qwen3-coder:32b',
  });

  for (const bad of [
    'https://evil.test/model',
    '/Users/mac/secret',
    'C:\\Windows\\System32',
    '<script>alert(1)</script>',
    'var(--secret)',
    coord,
    'bad\nline',
    '   ',
    42,
    null,
  ]) {
    const res = await readHostOrchestrator({
      read: async () => JSON.stringify({ userSettings: { orchestratorModel: bad, orchestratorExecutorModel: bad } }),
    });
    assert.deepEqual(res, { orchestratorModel: null, orchestratorExecutorModel: null });
  }

  assert.deepEqual(
    await readHostOrchestrator({ read: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); } }),
    { orchestratorModel: null, orchestratorExecutorModel: null },
  );
  assert.deepEqual(
    await readHostOrchestrator({ read: async () => ' '.repeat(1048577) }),
    { orchestratorModel: null, orchestratorExecutorModel: null },
  );
  assert.deepEqual(
    await readHostOrchestrator({ read: async () => '{broken json' }),
    { orchestratorModel: null, orchestratorExecutorModel: null },
  );
});

test('readSwarmMembers preserves sanitized title and store surfaces >16 swarm members + ephemeral swarmTitle', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-swarm-20-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const brainRoot = join(dir, 'brain');
  const history = new SessionHistory(join(dir, 'history'));
  await mkdir(join(brainRoot, coord, '.system_generated', 'swarm'), { recursive: true });

  const members = {
    coordinator: {
      conversation_id: coord,
      role: 'coordinator',
      model: 'MODEL_PLACEHOLDER_M537',
      workspace_mode: 'inherit',
      workspace: '/Users/mac/SECRET_ROOT',
    },
  };
  const trajectories = new Map();
  trajectories.set(coord, {
    trajectory: {
      cascadeId: coord,
      steps: [{ type: 'USER_INPUT' }],
      generatorMetadata: [{
        chatModel: {
          model: 'MODEL_PLACEHOLDER_M537',
          streamingDuration: '2s',
          usage: { responseId: 'coord-1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 100, outputTokens: 50 },
        },
      }],
    },
  });

  const workerIds = [];
  for (let i = 1; i <= 19; i++) {
    const wid = `${String(i).padStart(8, '0')}-2222-2222-2222-222222222222`;
    workerIds.push(wid);
    members[`worker-${i}`] = {
      conversation_id: wid,
      role: 'worker',
      model: 'MODEL_PLACEHOLDER_M669',
      workspace_mode: i % 3 === 0 ? 'branch' : i % 2 === 0 ? 'share' : 'inherit',
      killed: i === 2,
      workspace: `/Users/mac/SECRET_WORKER_${i}`,
    };
    trajectories.set(wid, {
      trajectory: {
        cascadeId: wid,
        steps: [{ type: 'USER_INPUT' }],
        generatorMetadata: [{
          chatModel: {
            model: 'MODEL_PLACEHOLDER_M669',
            streamingDuration: '1s',
            usage: { responseId: `w-${i}-1`, apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 50, outputTokens: 10 },
          },
        }],
      },
    });
  }

  await writeFile(
    join(brainRoot, coord, '.system_generated', 'swarm', 'members.json'),
    JSON.stringify({ title: 'Issue 57 Swarm Team / SECRET', members }),
  );
  const parsed = await readSwarmMembers(brainRoot, coord);
  assert.ok(parsed);
  assert.equal(parsed.title, null, 'Title containing slash is rejected by cleanAgentLabel');

  await writeFile(
    join(brainRoot, coord, '.system_generated', 'swarm', 'members.json'),
    JSON.stringify({ title: 'Issue 57 Swarm Team', members }),
  );
  const swarm = await readSwarmMembers(brainRoot, coord);
  assert.equal(swarm.title, 'Issue 57 Swarm Team');
  assert.equal(swarm.ids.length, 20);
  assert.equal(swarm.byId.get(workerIds[1]).workspaceMode, 'share');
  assert.equal(swarm.byId.get(workerIds[1]).killed, true);
  assert.equal(swarm.byId.get(workerIds[2]).workspaceMode, 'branch');

  const client = {
    discover: async () => ({ pid: 1 }),
    call: async method => method === 'GetUserStatus' ? { userStatus: { email: 'orch-swarm@example.test' } } : {},
    trajectory: async id => trajectories.get(id),
    reader: { summaries: {} },
  };
  const store = new MetricsStore(client, { history, transcripts: new TranscriptReader({ root: brainRoot }) });
  t.after(() => store.dispose());

  await store.snapshot({ conversationId: coord });
  await store.delegated.idle();

  // Persisted history and in-memory entry.data MUST NOT contain swarmTitle (Option 1a privacy boundary).
  const entryTask = store.sessions.get(coord).data.taskUsage;
  assert.equal(Object.hasOwn(entryTask, 'swarmTitle'), false);
  assert.equal(entryTask.isSwarm, true);
  assert.equal(entryTask.totalAgents, 20);
  assert.equal(entryTask.agents.length, 20);
  const w2Entry = entryTask.agents.find(a => a.label === 'Worker (worker-2)');
  assert.equal(w2Entry.workspaceMode, 'share');
  assert.equal(w2Entry.killed, true);
  const loadedHistory = await history.load(account, coord);
  assert.equal(Object.hasOwn(loadedHistory.metrics.taskUsage, 'swarmTitle'), false);
  assert.equal(loadedHistory.metrics.taskUsage.agents.length, 20);

  // snapshot() attaches swarmTitle ephemerally in memory only.
  const snap = await store.snapshot({ conversationId: coord });
  assert.equal(snap.speed.taskUsage.swarmTitle, 'Issue 57 Swarm Team');
  assert.equal(snap.speed.taskUsage.isSwarm, true);
  assert.equal(snap.speed.taskUsage.agents.length, 20);
  assert.equal(Object.hasOwn(store.sessions.get(coord).data.taskUsage, 'swarmTitle'), false);
});

test('task-usage supports 64 agents and keeps safeTaskUsage backwards-compatible for legacy records', () => {
  const rootRows = taskRecords({
    trajectory: { steps: [], generatorMetadata: [{ chatModel: { usage: { responseId: 'r0', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 100, outputTokens: 20 } } }] },
  }, coord);
  const childSets = Array.from({ length: 20 }, (_, idx) => ({
    rows: taskRecords({
      trajectory: { steps: [], generatorMetadata: [{ chatModel: { usage: { responseId: `c${idx}`, apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 10, outputTokens: 5 } } }] },
    }, `${String(idx + 1).padStart(8, '0')}-3333-3333-3333-333333333333`),
    role: 'worker',
    label: `Worker (w${idx + 1})`,
    workspaceMode: idx % 2 === 0 ? 'share' : 'inherit',
    killed: idx === 5,
  }));
  const agg = aggregateTaskUsage(rootRows, childSets, { subagents: 20, loadedSubagents: 20, state: 'ready', isSwarm: true });
  assert.equal(agg.totalAgents, 21);
  assert.equal(agg.agents.length, 21);
  assert.deepEqual(safeTaskUsage(agg), agg);
  assert.equal(safeTaskUsage({ ...agg, swarmTitle: 'SHOULD_NOT_PERSIST' }).swarmTitle, undefined);
  assert.equal(safeTaskUsage({ ...agg, agents: [{ ...agg.agents[0], workspaceMode: 'evil' }] }), null);
  assert.equal(safeTaskUsage({ ...agg, agents: [{ ...agg.agents[0], killed: 'yes' }] }), null);

  // Legacy object without totalAgents/isSwarm/workspaceMode/killed loads with identical keys.
  const legacy = structuredClone(agg);
  delete legacy.totalAgents;
  delete legacy.isSwarm;
  for (const a of legacy.agents) {
    delete a.workspaceMode;
    delete a.killed;
  }
  const safeLegacy = safeTaskUsage(legacy);
  assert.deepEqual(safeLegacy, legacy);
  assert.equal(Object.hasOwn(safeLegacy, 'totalAgents'), false);
  assert.equal(Object.hasOwn(safeLegacy, 'isSwarm'), false);
});

test('trajectoryMetrics detects built-in Orchestrator split, cold starts, plan reviews, read-only turns, and custom pairs', () => {
  // (a) Built-in M537 + exit_plan_mode + M669 cold start + [plan review] + second switch
  const builtInSwitched = trajectoryMetrics({
    trajectory: {
      cascadeId: coord,
      steps: [
        { type: 'CORTEX_STEP_TYPE_USER_INPUT', userInput: { text: 'plan this feature' } },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { toolCalls: [{ name: 'exit_plan_mode' }] } },
        // Same switch tool execution step should not double-count phaseSwitchCount
        { type: 'CORTEX_STEP_TYPE_GENERIC', metadata: { toolCall: { name: 'exit_plan_mode' } } },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { response: 'exec 1' } },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { response: 'exec 2' } },
        { type: 'CORTEX_STEP_TYPE_SYSTEM_MESSAGE', systemMessage: { message: '[plan review] please revise' } },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { toolCalls: [{ name: 'exit_plan_mode' }] } },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { response: 'exec 3' } },
      ],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { model: 'MODEL_PLACEHOLDER_M537', streamingDuration: '3s', usage: { responseId: 'p1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 10000, cacheReadTokens: 0, outputTokens: 1000 } } },
        { stepIndices: [3], chatModel: { model: 'MODEL_PLACEHOLDER_M669', streamingDuration: '2s', usage: { responseId: 'e1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 80000, cacheReadTokens: 0, outputTokens: 500 } } },
        { stepIndices: [4], chatModel: { model: 'MODEL_PLACEHOLDER_M669', streamingDuration: '1s', usage: { responseId: 'e2', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 2000, cacheReadTokens: 80000, outputTokens: 300 } } },
        { stepIndices: [6], chatModel: { model: 'MODEL_PLACEHOLDER_M537', streamingDuration: '2s', usage: { responseId: 'p2', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 5000, cacheReadTokens: 50000, outputTokens: 600 } } },
        { stepIndices: [7], chatModel: { model: 'MODEL_PLACEHOLDER_M669', streamingDuration: '2s', usage: { responseId: 'e3', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 90000, cacheReadTokens: 0, outputTokens: 400 } } },
      ],
    },
  });
  assert.equal(builtInSwitched.orchestrator.detected, true);
  assert.equal(builtInSwitched.orchestrator.source, 'trajectory');
  assert.equal(builtInSwitched.orchestrator.switched, true);
  assert.equal(builtInSwitched.orchestrator.phaseSwitchCount, 3);
  assert.equal(builtInSwitched.orchestrator.coldStartSwitches, 2);
  assert.equal(builtInSwitched.orchestrator.planner.model, 'Orchestrator (Neon)');
  assert.equal(builtInSwitched.orchestrator.planner.requests, 2);
  assert.equal(builtInSwitched.orchestrator.planner.totalTokens, 66600);
  assert.equal(builtInSwitched.orchestrator.executor.model, 'Gemini 4 Hydrogen (Orchestrator)');
  assert.equal(builtInSwitched.orchestrator.executor.requests, 3);
  assert.equal(builtInSwitched.orchestrator.executor.totalTokens, 253200);
  assert.equal(JSON.stringify(builtInSwitched).includes('please revise'), false);

  // (b) Built-in M537 read-only turn without switch
  const readOnlyBuiltIn = trajectoryMetrics({
    trajectory: {
      cascadeId: coord,
      steps: [{ type: 'CORTEX_STEP_TYPE_USER_INPUT' }, { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE' }],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { model: 'MODEL_PLACEHOLDER_M537', streamingDuration: '2s', usage: { responseId: 'ro1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 5000, cacheReadTokens: 15000, outputTokens: 400 } } },
      ],
    },
  });
  assert.equal(readOnlyBuiltIn.orchestrator.detected, true);
  assert.equal(readOnlyBuiltIn.orchestrator.source, 'model-id');
  assert.equal(readOnlyBuiltIn.orchestrator.switched, false);
  assert.equal(readOnlyBuiltIn.orchestrator.phaseSwitchCount, 0);
  assert.equal(readOnlyBuiltIn.orchestrator.coldStartSwitches, 0);
  assert.equal(readOnlyBuiltIn.orchestrator.planner.model, 'Orchestrator (Neon)');
  assert.equal(readOnlyBuiltIn.orchestrator.executor, null);

  // (c) Custom user-configured pair: Gemini 4 Neon (High) -> exit_plan_mode -> Gemini 4 Hydrogen (High)
  const customSettings = {
    orchestratorModel: 'Gemini 4 Neon (High)',
    orchestratorExecutorModel: 'Gemini 4 Hydrogen (High)',
  };
  const customSwitched = trajectoryMetrics({
    trajectory: {
      cascadeId: coord,
      steps: [
        { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { toolCalls: [{ name: 'exit_plan_mode' }] } },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { response: 'done' } },
      ],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { model: 'MODEL_PLACEHOLDER_M532', streamingDuration: '2s', usage: { responseId: 'cp1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 2000, cacheReadTokens: 8000, outputTokens: 500 } } },
        { stepIndices: [2], chatModel: { model: 'MODEL_PLACEHOLDER_M525', streamingDuration: '1s', usage: { responseId: 'ce1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 12000, cacheReadTokens: 0, outputTokens: 300 } } },
      ],
    },
  }, null, { orchestratorSettings: customSettings });
  assert.equal(customSwitched.orchestrator.detected, true);
  assert.equal(customSwitched.orchestrator.source, 'trajectory');
  assert.equal(customSwitched.orchestrator.configuredPlanner, 'Gemini 4 Neon (High)');
  assert.equal(customSwitched.orchestrator.configuredExecutor, 'Gemini 4 Hydrogen (High)');
  assert.equal(customSwitched.orchestrator.planner.model, 'Gemini 4 Neon (High)');
  assert.equal(customSwitched.orchestrator.executor.model, 'Gemini 4 Hydrogen (High)');
  assert.equal(customSwitched.orchestrator.coldStartSwitches, 1);

  // Read-only turn on custom orchestratorModel before switch
  const customReadOnly = trajectoryMetrics({
    trajectory: {
      cascadeId: coord,
      steps: [{ type: 'USER_INPUT' }, { type: 'PLANNER_RESPONSE' }],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { model: 'MODEL_PLACEHOLDER_M532', streamingDuration: '1s', usage: { responseId: 'cro1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 1000, outputTokens: 100 } } },
      ],
    },
  }, null, { orchestratorSettings: customSettings });
  assert.equal(customReadOnly.orchestrator.detected, true);
  assert.equal(customReadOnly.orchestrator.source, 'settings');
  assert.equal(customReadOnly.orchestrator.switched, false);
  assert.equal(customReadOnly.orchestrator.planner.model, 'Gemini 4 Neon (High)');
  assert.equal(customReadOnly.orchestrator.executor, null);

  // (d) Ordinary non-orchestrator session stays orchestrator: null even with customSettings present
  const ordinary = trajectoryMetrics({
    trajectory: {
      cascadeId: coord,
      steps: [{ type: 'USER_INPUT' }, { type: 'PLANNER_RESPONSE' }],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { model: 'MODEL_PLACEHOLDER_M35', streamingDuration: '1s', usage: { responseId: 'ord1', apiProvider: 'API_PROVIDER_ANTHROPIC', inputTokens: 1000, outputTokens: 100 } } },
      ],
    },
  }, null, { orchestratorSettings: customSettings });
  assert.equal(ordinary.orchestrator, null);

  // (e) Mixed session: earlier ordinary turns (Turns 1-2) must NOT bleed into later Turn 3 Orchestrator planner count
  const mixed = trajectoryMetrics({
    trajectory: {
      cascadeId: coord,
      steps: [
        { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { response: 'ordinary 1' } },
        { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { response: 'ordinary 2' } },
        { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { toolCalls: [{ name: 'exit_plan_mode' }] } },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', plannerResponse: { response: 'orch exec' } },
      ],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { model: 'MODEL_PLACEHOLDER_M528', streamingDuration: '1s', usage: { responseId: 'mx1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 10000, outputTokens: 200 } } },
        { stepIndices: [3], chatModel: { model: 'MODEL_PLACEHOLDER_M532', streamingDuration: '1s', usage: { responseId: 'mx2', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 10000, outputTokens: 200 } } },
        { stepIndices: [5], chatModel: { model: 'MODEL_PLACEHOLDER_M532', streamingDuration: '2s', usage: { responseId: 'mx3', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 5000, cacheReadTokens: 1000, outputTokens: 400 } } },
        { stepIndices: [6], chatModel: { model: 'MODEL_PLACEHOLDER_M525', streamingDuration: '1s', usage: { responseId: 'mx4', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 9000, cacheReadTokens: 0, outputTokens: 300 } } },
      ],
    },
  }, null, { orchestratorSettings: customSettings });
  assert.equal(mixed.orchestrator.detected, true);
  assert.equal(mixed.orchestrator.planner.requests, 1);
  assert.equal(mixed.orchestrator.planner.model, 'Gemini 4 Neon (High)');
  assert.equal(mixed.orchestrator.planner.totalTokens, 6400);
  assert.equal(mixed.orchestrator.executor.requests, 1);
  assert.equal(mixed.orchestrator.executor.model, 'Gemini 4 Hydrogen (High)');
  assert.equal(mixed.orchestrator.executor.totalTokens, 9300);
});

test('safeMetrics and SessionHistory roundtrip orchestrator and reject tampered records', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-orch-hist-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const history = new SessionHistory(dir);

  const metrics = trajectoryMetrics({
    trajectory: {
      cascadeId: coord,
      steps: [
        { type: 'USER_INPUT' },
        { type: 'PLANNER_RESPONSE', plannerResponse: { toolCalls: [{ name: 'exit_plan_mode' }] } },
        { type: 'PLANNER_RESPONSE' },
      ],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { model: 'MODEL_PLACEHOLDER_M537', streamingDuration: '2s', usage: { responseId: 'hp1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 4000, cacheReadTokens: 1000, outputTokens: 500 } } },
        { stepIndices: [2], chatModel: { model: 'MODEL_PLACEHOLDER_M669', streamingDuration: '1s', usage: { responseId: 'he1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 5000, cacheReadTokens: 0, outputTokens: 200 } } },
      ],
    },
  });
  await history.save(account, coord, metrics);
  const loaded = (await history.load(account, coord)).metrics;
  assert.deepEqual(loaded.orchestrator, metrics.orchestrator);

  const tampered = safeMetrics({
    ...metrics,
    orchestrator: {
      ...metrics.orchestrator,
      planner: { ...metrics.orchestrator.planner, totalTokens: 9999999 },
    },
  }, coord);
  assert.equal(tampered.orchestrator, undefined);

  // Older record without orchestrator still loads cleanly without adding orchestrator key
  const legacy = safeMetrics({ ...metrics }, coord);
  delete legacy.orchestrator;
  const legacyLoaded = safeMetrics(legacy, coord);
  assert.equal(Object.hasOwn(legacyLoaded, 'orchestrator'), false);
});

test('MetricsStore.snapshot propagates orchestratorSettings and invalidates cache when settings change', async t => {
  const raw = {
    trajectory: {
      cascadeId: coord,
      steps: [{ type: 'USER_INPUT' }, { type: 'PLANNER_RESPONSE' }],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { model: 'MODEL_PLACEHOLDER_M532', streamingDuration: '1s', usage: { responseId: 'st1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 1000, outputTokens: 100 } } },
      ],
    },
  };
  const client = {
    discover: async () => ({ pid: 1 }),
    call: async method => method === 'GetUserStatus' ? { userStatus: { email: 'orch-swarm@example.test' } } : {},
    trajectory: async () => raw,
    reader: { summaries: {} },
  };
  const store = new MetricsStore(client, { history: { load: async () => null, save: async () => null }, transcripts: null });
  t.after(() => store.dispose());

  const first = await store.snapshot({ conversationId: coord, orchestratorSettings: { orchestratorModel: null, orchestratorExecutorModel: null } });
  assert.equal(first.speed.orchestrator, null);

  const second = await store.snapshot({
    conversationId: coord,
    orchestratorSettings: { orchestratorModel: 'Gemini 4 Neon (High)', orchestratorExecutorModel: 'Gemini 4 Hydrogen (High)' },
  });
  assert.equal(second.speed.orchestrator.detected, true);
  assert.equal(second.speed.orchestrator.source, 'settings');
  assert.equal(second.speed.orchestrator.planner.model, 'Gemini 4 Neon (High)');
});
