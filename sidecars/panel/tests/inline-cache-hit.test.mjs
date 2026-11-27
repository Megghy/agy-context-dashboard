import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PreferencesStore } from '../../../compat/preferences.mjs';

const require = createRequire(import.meta.url);
const createDashboardI18n = require('../../../compat/i18n.cjs');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('PreferencesStore persists inlineCacheHit boolean preference', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-pulse-cache-hit-'));
  try {
    const file = join(dir, 'preferences.json');
    const store = new PreferencesStore({ file });
    const initial = await store.get();
    assert.equal(initial.inlineCacheHit, undefined);

    await store.set({ inlineCacheHit: false });
    const savedOff = await new PreferencesStore({ file }).get();
    assert.equal(savedOff.inlineCacheHit, false);

    await store.set({ language: 'zh-CN' });
    const afterLang = await new PreferencesStore({ file }).get();
    assert.equal(afterLang.inlineCacheHit, false);
    assert.equal(afterLang.language, 'zh-CN');

    await store.set({ inlineCacheHit: true });
    const savedOn = await new PreferencesStore({ file }).get();
    assert.equal(savedOn.inlineCacheHit, true);

    await assert.rejects(() => store.set({ inlineCacheHit: 'invalid' }), /Invalid inline cache hit preference/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('i18n connectInlineCacheHit defaults to true and translates across locales', async () => {
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    const i18n = createDashboardI18n(locale);
    for (const key of ['inlineCacheHit', 'inlineCacheHitOn', 'inlineCacheHitOff', 'inlineCacheHitSaveFailed']) {
      assert.equal(i18n.t(key).length > 0, true, `missing ${key} for ${locale}`);
    }
  }
  const i18n = createDashboardI18n('zh-CN');
  let stored = null;
  let changes = 0;
  const ctrl = i18n.connectInlineCacheHit({
    initial: null,
    cache: v => { stored = v; },
    write: async input => ({ inlineCacheHit: input.inlineCacheHit, revision: 1 }),
    changed: () => { changes++; },
  });
  assert.equal(ctrl.enabled, true);
  await ctrl.choose(false);
  assert.equal(ctrl.enabled, false);
  assert.equal(stored, false);
  assert.equal(changes >= 1, true);
  ctrl.dispose();
});

test('PreferencesStore persists cacheChipMode and bridges forward it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-pulse-cache-chip-mode-'));
  try {
    const file = join(dir, 'preferences.json');
    const store = new PreferencesStore({ file });
    assert.equal((await store.get()).cacheChipMode, undefined);

    await store.set({ cacheChipMode: 'hit', inlineCacheHit: true });
    const hitSaved = await new PreferencesStore({ file }).get();
    assert.equal(hitSaved.cacheChipMode, 'hit');
    assert.equal(hitSaved.inlineCacheHit, true);

    await store.set({ cacheChipMode: 'tokens', inlineCacheHit: false });
    const tokensSaved = await new PreferencesStore({ file }).get();
    assert.equal(tokensSaved.cacheChipMode, 'tokens');
    assert.equal(tokensSaved.inlineCacheHit, false);

    await store.set({ inlineCacheHit: true });
    assert.equal((await store.get()).cacheChipMode, 'both');

    await assert.rejects(() => store.set({ cacheChipMode: 'invalid' }), /Invalid cache chip mode preference/);
    for (const rel of ['compat/ipc-host.cjs', 'compat/runtime-ui.mjs', 'compat/preferences.mjs']) {
      const src = await readFile(join(ROOT, rel), 'utf8');
      assert.ok(src.includes("'cacheChipMode'"), `${rel} must whitelist cacheChipMode`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('i18n connectCacheChipMode migrates legacy inlineCacheHit and supports hit-only', async () => {
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    const i18n = createDashboardI18n(locale);
    for (const key of ['cacheChipMode', 'cacheChipModeTokens', 'cacheChipModeBoth', 'cacheChipModeHit', 'cacheChipModeSaveFailed']) {
      assert.notEqual(i18n.t(key), key, `missing ${key} for ${locale}`);
      assert.ok(i18n.t(key).length > 0);
    }
  }
  const i18n = createDashboardI18n('zh-CN');
  const writes = [];
  const ctrl = i18n.connectCacheChipMode({
    initial: null,
    cache: () => {},
    write: async input => {
      writes.push(input);
      return { ...input, revision: writes.length };
    },
    changed: () => {},
  });
  assert.equal(ctrl.value, 'both');
  ctrl.sync({ inlineCacheHit: false, revision: 0 });
  assert.equal(ctrl.value, 'tokens');
  await ctrl.choose('hit');
  assert.equal(ctrl.value, 'hit');
  assert.deepEqual(writes.at(-1), { cacheChipMode: 'hit', inlineCacheHit: true });
  ctrl.dispose();
});
