import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { PreferencesStore } from '../../../compat/preferences.mjs';
import { RuntimeUi } from '../../../compat/runtime-ui.mjs';

const require = createRequire(import.meta.url);
const createContextLimit = require('../../../compat/context-limit.cjs');
const createI18n = require('../../../compat/i18n.cjs');

const CATALOG = [
  { id: 'MODEL_PLACEHOLDER_M532', label: 'Gemini 4 Neon (High)' },
  { id: 'MODEL_PLACEHOLDER_M402', label: 'Claude Opus 5.5 (High)' },
  { id: 'MODEL_PLACEHOLDER_M417', label: 'Gemini 4 Argon (High)' },
];

async function prefFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'pulse-ctx-limit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'preferences.json');
  return { dir, file, store: new PreferencesStore({ file }) };
}

test('PreferencesStore persists global contextLimitTokens and per-model contextLimitOverrides cleanly', async t => {
  const { file, store } = await prefFixture(t);
  const initial = await store.get();
  assert.equal('contextLimitTokens' in initial, false);
  assert.equal('contextLimitOverrides' in initial, false);

  await store.set({ contextLimitTokens: 320000 });
  let saved = await new PreferencesStore({ file }).get();
  assert.equal(saved.contextLimitTokens, 320000);
  assert.equal('contextLimitOverrides' in saved, false);

  await store.set({
    contextLimitOverrides: {
      'Gemini 4 Neon (High)': 256000,
      'Gemini 4 Argon (High)': 0,
    },
  });
  saved = await new PreferencesStore({ file }).get();
  assert.equal(saved.contextLimitTokens, 320000);
  assert.deepEqual(saved.contextLimitOverrides, {
    'Gemini 4 Neon (High)': 256000,
    'Gemini 4 Argon (High)': 0,
  });

  // Clearing global preserves overrides; clearing overrides omits field again.
  await store.set({ contextLimitTokens: null });
  saved = await store.get();
  assert.equal('contextLimitTokens' in saved, false);
  assert.deepEqual(saved.contextLimitOverrides, {
    'Gemini 4 Neon (High)': 256000,
    'Gemini 4 Argon (High)': 0,
  });

  await store.set({ contextLimitOverrides: {} });
  saved = await store.get();
  assert.equal('contextLimitOverrides' in saved, false);
  const disk = JSON.parse(await readFile(file, 'utf8'));
  assert.equal('contextLimitTokens' in disk, false);
  assert.equal('contextLimitOverrides' in disk, false);

  // Rejects invalid bounds, non-integers, and forbidden keys.
  for (const bad of [
    { contextLimitTokens: 1000 },
    { contextLimitTokens: 5000000 },
    { contextLimitTokens: '320000' },
    { contextLimitOverrides: [] },
    { contextLimitOverrides: { '': 320000 } },
    { contextLimitOverrides: { constructor: 320000 } },
    { contextLimitOverrides: { 'Gemini 4 Neon (High)': 100 } },
  ]) {
    await assert.rejects(store.set(bad));
  }
});

test('context-limit engine parses shorthand inputs and resolves global vs per-model overrides', () => {
  const engine = createContextLimit();
  assert.equal(engine.parseTokenInput('320'), 320000);
  assert.equal(engine.parseTokenInput('320k'), 320000);
  assert.equal(engine.parseTokenInput('320K'), 320000);
  assert.equal(engine.parseTokenInput('320000'), 320000);
  assert.equal(engine.parseTokenInput('1M'), 1000000);
  assert.equal(engine.parseTokenInput('128.5k'), 128500);
  assert.equal(engine.parseTokenInput('10'), null);
  assert.equal(engine.parseTokenInput('3M'), null);
  assert.equal(engine.parseTokenInput('abc'), null);

  assert.equal(engine.formatLimitShort(320000), '320K');
  assert.equal(engine.formatLimitShort(1000000), '1M');
  assert.equal(engine.formatLimitShort(524288), '524.3K');

  const policy = {
    globalLimit: 320000,
    overrides: {
      'Claude Opus 5.5 (High)': 200000,
      'Gemini 4 Argon (High)': 0,
    },
  };

  // Unoverridden model inherits global 320K via catalog ID -> label lookup.
  const neon = engine.resolveEffectiveLimit(policy, 'MODEL_PLACEHOLDER_M532', CATALOG);
  assert.equal(neon.tokens, 320000);
  assert.equal(neon.source, 'global');
  assert.equal(neon.resolvedModel, 'Gemini 4 Neon (High)');

  // Per-model fixed override takes precedence over global.
  const opus = engine.resolveEffectiveLimit(policy, 'MODEL_PLACEHOLDER_M402', CATALOG);
  assert.equal(opus.tokens, 200000);
  assert.equal(opus.source, 'override');

  // Numeric placeholder enum maps cleanly too (1000 + 417 = M417 -> Argon -> host default 0).
  const argon = engine.resolveEffectiveLimit(policy, 1417, CATALOG);
  assert.equal(argon.tokens, null);
  assert.equal(argon.source, 'override-default');
});

test('WebSocket and fetch transformers inject maxTokenLimit and clear conflicting contextWindow', () => {
  const engine = createContextLimit();
  const policy = {
    globalLimit: 320000,
    overrides: { 'Gemini 4 Argon (High)': 0, 'Claude Opus 5.5 (High)': 256000 },
  };

  // 1. Object payload inside /connect-websocket frame
  const wsFrame = JSON.stringify({
    streamId: 's-1',
    type: 'start',
    procedure: '/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage',
    stream: false,
    headers: { 'Content-Type': ['application/json'] },
    payload: {
      cascadeId: 'c-1',
      items: [{ text: 'hi' }],
      cascadeConfig: {
        plannerConfig: { requestedModel: { model: 'MODEL_PLACEHOLDER_M532' } },
        checkpointConfig: { contextWindow: '512K' },
      },
    },
  });
  const wsTx = engine.transformWebSocketFrame(wsFrame, policy, CATALOG);
  assert.equal(wsTx.handled, true);
  assert.equal(wsTx.modified, true);
  const parsedWs = JSON.parse(wsTx.output);
  assert.equal(parsedWs.payload.cascadeConfig.checkpointConfig.maxTokenLimit, 320000);
  assert.equal('contextWindow' in parsedWs.payload.cascadeConfig.checkpointConfig, false);
  assert.deepEqual(parsedWs.payload.items, [{ text: 'hi' }]);

  // 2. Model overridden to host default (0) passes through unmodified
  const argonFrame = JSON.stringify({
    streamId: 's-2',
    type: 'start',
    procedure: '/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage',
    payload: {
      cascadeConfig: { plannerConfig: { planModel: 'MODEL_PLACEHOLDER_M417' } },
    },
  });
  const argonTx = engine.transformWebSocketFrame(argonFrame, policy, CATALOG);
  assert.equal(argonTx.handled, true);
  assert.equal(argonTx.modified, false);
  assert.equal(argonTx.output, argonFrame);

  // 3. Stringified JSON payload + HTTP fetch fallback (Uint8Array)
  const fetchBody = new TextEncoder().encode(JSON.stringify({
    cascadeId: 'c-2',
    cascadeConfig: { plannerConfig: { requestedModel: { model: 'MODEL_PLACEHOLDER_M402' } } },
  }));
  const fetchTx = engine.transformFetchBody(
    'https://127.0.0.1:48922/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage',
    fetchBody,
    'application/json',
    policy,
    CATALOG,
  );
  assert.equal(fetchTx.handled, true);
  assert.equal(fetchTx.modified, true);
  const decodedFetch = JSON.parse(new TextDecoder().decode(fetchTx.output));
  assert.equal(decodedFetch.cascadeConfig.checkpointConfig.maxTokenLimit, 256000);

  // 4. Real Antigravity 2.34 gRPC-Web 5-byte envelope (application/grpc-web+json)
  const grpcInner = new TextEncoder().encode(JSON.stringify({
    cascadeId: 'c-3',
    cascadeConfig: { plannerConfig: { planModel: 'MODEL_PLACEHOLDER_M532' } },
  }));
  const grpcEnvelope = new Uint8Array(5 + grpcInner.length);
  grpcEnvelope[0] = 0;
  new DataView(grpcEnvelope.buffer).setUint32(1, grpcInner.length, false);
  grpcEnvelope.set(grpcInner, 5);
  const grpcTx = engine.transformFetchBody(
    'https://127.0.0.1:48922/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage',
    grpcEnvelope,
    'application/grpc-web+json',
    policy,
    CATALOG,
  );
  assert.equal(grpcTx.handled, true);
  assert.equal(grpcTx.modified, true);
  assert.ok(grpcTx.output instanceof Uint8Array);
  assert.equal(grpcTx.output[0], 0);
  const outLen = new DataView(grpcTx.output.buffer, grpcTx.output.byteOffset, grpcTx.output.byteLength).getUint32(1, false);
  assert.equal(outLen, grpcTx.output.length - 5);
  const decodedGrpc = JSON.parse(new TextDecoder().decode(grpcTx.output.subarray(5)));
  assert.equal(decodedGrpc.cascadeConfig.checkpointConfig.maxTokenLimit, 320000);
});

test('canonicalizeModelName normalizes live Composer trigger text to catalog labels', () => {
  const engine = createContextLimit();
  assert.equal(engine.canonicalizeModelName('Select model, current: Gemini 4 Neon High', CATALOG), 'Gemini 4 Neon (High)');
  assert.equal(engine.canonicalizeModelName('Gemini 4 Neon High', CATALOG), 'Gemini 4 Neon (High)');
  assert.equal(engine.canonicalizeModelName('MODEL_PLACEHOLDER_M532', CATALOG), 'Gemini 4 Neon (High)');
  // Fuzzy match still catches overrides saved without parentheses.
  const eff = engine.resolveEffectiveLimit(
    { globalLimit: 320000, overrides: { 'Gemini 4 Neon High': 256000 } },
    'MODEL_PLACEHOLDER_M532',
    CATALOG,
  );
  assert.equal(eff.tokens, 256000);
  assert.equal(eff.source, 'override');
});

test('installInterceptor intercepts WebSocket and fetch and restores cleanly on dispose', async () => {
  const engine = createContextLimit();
  const sentWs = [];
  const sentFetch = [];
  class FakeWebSocket {
    constructor(url) { this.url = url; }
    send(data) { sentWs.push(data); }
  }
  const origWsSend = FakeWebSocket.prototype.send;
  const origFetch = async (url, init) => { sentFetch.push({ url, body: init?.body }); return { ok: true }; };
  const fakeWin = { WebSocket: FakeWebSocket, fetch: origFetch };

  const policy = { globalLimit: 320000, overrides: {} };
  const handle = engine.installInterceptor({ win: fakeWin, getPolicy: () => policy, getCatalog: () => CATALOG });

  const ws = new FakeWebSocket('wss://127.0.0.1:48922/connect-websocket');
  ws.send(JSON.stringify({
    streamId: '1',
    type: 'start',
    procedure: '/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage',
    payload: { cascadeConfig: { plannerConfig: { planModel: 'MODEL_PLACEHOLDER_M532' } } },
  }));
  assert.equal(sentWs.length, 1);
  assert.equal(JSON.parse(sentWs[0]).payload.cascadeConfig.checkpointConfig.maxTokenLimit, 320000);
  assert.equal(fakeWin.__agPulseContextLimitStatus().lastApplied.tokens, 320000);

  await fakeWin.fetch('/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cascadeConfig: { plannerConfig: { planModel: 'MODEL_PLACEHOLDER_M532' } } }),
  });
  assert.equal(sentFetch.length, 1);
  assert.equal(JSON.parse(sentFetch[0].body).cascadeConfig.checkpointConfig.maxTokenLimit, 320000);

  handle.dispose();
  assert.equal(FakeWebSocket.prototype.send, origWsSend);
  assert.equal(fakeWin.fetch, origFetch);
  assert.equal(fakeWin.__agPulseContextLimitStatus, undefined);
});

test('i18n connectContextLimit controller handles optimistic writes, stale polls, overrides and errors', async () => {
  const lang = createI18n('zh-CN');
  let revision = 1, fail = false;
  let stored = { contextLimitTokens: undefined, contextLimitOverrides: undefined };
  const controller = lang.connectContextLimit({
    write: async patch => {
      if (fail) throw new Error('disk error');
      if (Object.hasOwn(patch, 'contextLimitTokens')) stored.contextLimitTokens = patch.contextLimitTokens ?? undefined;
      if (Object.hasOwn(patch, 'contextLimitOverrides')) stored.contextLimitOverrides = patch.contextLimitOverrides ?? undefined;
      return { language: 'zh-CN', ...stored, revision: ++revision };
    },
  });

  await controller.setGlobal(320000);
  assert.equal(controller.value.globalLimit, 320000);
  assert.equal(controller.error, false);

  await controller.setOverride('Gemini 4 Neon (High)', 256000);
  assert.deepEqual(controller.value.overrides, { 'Gemini 4 Neon (High)': 256000 });

  // Stale poll cannot overwrite newer state.
  controller.sync({ contextLimitTokens: 512000, revision: 1 });
  assert.equal(controller.value.globalLimit, 320000);

  // Cross-window concurrent override persisted on backend is merged without false error.
  stored.contextLimitOverrides = { 'Gemini 4 Neon (High)': 256000, 'Gemini 4 Argon (High)': 0 };
  await controller.setGlobal(400000);
  assert.equal(controller.error, false);
  assert.equal(controller.value.globalLimit, 400000);
  assert.deepEqual(controller.value.overrides, { 'Gemini 4 Neon (High)': 256000, 'Gemini 4 Argon (High)': 0 });

  // Failed save sets error flag without losing chosen state.
  fail = true;
  await controller.clearOverride('Gemini 4 Neon (High)');
  assert.equal(controller.error, true);
  assert.deepEqual(controller.value.overrides, { 'Gemini 4 Argon (High)': 0 });

  fail = false;
  await controller.resetAll();
  assert.equal(controller.error, false);
  assert.equal(controller.value.globalLimit, null);
  assert.deepEqual(controller.value.overrides, {});
  controller.dispose();
});

test('RuntimeUi preference bridge allows contextLimitTokens and contextLimitOverrides', async t => {
  const { store } = await prefFixture(t);
  const evals = [];
  const connection = {
    closed: false,
    revoked: false,
    generation: 1,
    contexts: new Set([7]),
    inflight: 0,
    async command(method, params) { evals.push({ method, params }); return {}; },
  };
  const ui = new RuntimeUi({ snapshot: async () => ({}), source: '', preferences: store });
  await ui.event(connection, {
    method: 'Runtime.bindingCalled',
    params: {
      name: ui.binding,
      executionContextId: 7,
      payload: JSON.stringify({
        id: 1,
        type: 'preferences',
        input: { contextLimitTokens: 320000, contextLimitOverrides: { 'Gemini 4 Neon (High)': 256000 } },
      }),
    },
  });
  const saved = await store.get();
  assert.equal(saved.contextLimitTokens, 320000);
  assert.deepEqual(saved.contextLimitOverrides, { 'Gemini 4 Neon (High)': 256000 });
  assert.equal(evals.length, 1);
});
