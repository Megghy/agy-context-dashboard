import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  BAR_CARDS,
  CONTEXT_CHIP_MODES,
  PreferencesStore,
  validateBarOrder,
  validateBarHidden,
  validateContextChipMode,
} from '../../../compat/preferences.mjs';

const require = createRequire(import.meta.url);
const createDashboardI18n = require('../../../compat/i18n.cjs');

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'pulse-bar-prefs-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'preferences.json');
  return { file, store: new PreferencesStore({ file }) };
}

test('PreferencesStore omits bar preferences by default and persists valid barOrder, barHidden, and contextChipMode', async t => {
  const { file, store } = await fixture(t);
  const initial = await store.get();
  assert.equal(Object.hasOwn(initial, 'barOrder'), false);
  assert.equal(Object.hasOwn(initial, 'barHidden'), false);
  assert.equal(Object.hasOwn(initial, 'contextChipMode'), false);

  await store.set({
    barOrder: ['context', 'quota', 'speed', 'cache'],
    barHidden: ['cache'],
    contextChipMode: 'label',
  });
  const reloaded = await new PreferencesStore({ file }).get();
  assert.deepEqual(reloaded.barOrder, ['context', 'quota', 'speed', 'cache']);
  assert.deepEqual(reloaded.barHidden, ['cache']);
  assert.equal(reloaded.contextChipMode, 'label');

  // Unrelated updates preserve bar preferences
  await store.set({ language: 'zh-CN' });
  const afterLang = await new PreferencesStore({ file }).get();
  assert.equal(afterLang.language, 'zh-CN');
  assert.deepEqual(afterLang.barOrder, ['context', 'quota', 'speed', 'cache']);
  assert.deepEqual(afterLang.barHidden, ['cache']);
  assert.equal(afterLang.contextChipMode, 'label');

  // Reject invalid barOrder (wrong length, duplicate, unknown key)
  for (const badOrder of [
    ['speed', 'cache'],
    ['speed', 'speed', 'quota', 'context'],
    ['speed', 'cache', 'quota', 'unknown'],
    'speed,cache,quota,context',
  ]) {
    assert.throws(() => validateBarOrder(badOrder));
    await assert.rejects(store.set({ barOrder: badOrder }));
  }

  // Reject invalid barHidden (including hiding all 4 chips)
  for (const badHidden of [
    ['speed', 'cache', 'quota', 'context'],
    ['speed', 'speed'],
    ['unknown'],
    'cache',
  ]) {
    assert.throws(() => validateBarHidden(badHidden));
    await assert.rejects(store.set({ barHidden: badHidden }));
  }

  // Reject invalid contextChipMode
  for (const badMode of ['steps', '', null, 123]) {
    assert.throws(() => validateContextChipMode(badMode));
    await assert.rejects(store.set({ contextChipMode: badMode }));
  }

  // Corrupt stored values degrade gracefully without breaking store.get()
  await writeFile(file, JSON.stringify({
    schema: 1,
    language: 'en',
    barOrder: ['speed'],
    barHidden: ['speed', 'cache', 'quota', 'context'],
    contextChipMode: 'bogus',
    revision: 9,
  }));
  const recovered = await store.get();
  assert.equal(recovered.language, 'en');
  assert.equal(Object.hasOwn(recovered, 'barOrder'), false);
  assert.equal(Object.hasOwn(recovered, 'barHidden'), false);
  assert.equal(Object.hasOwn(recovered, 'contextChipMode'), false);
  assert.deepEqual(BAR_CARDS, ['speed', 'cache', 'quota', 'context']);
  assert.deepEqual(CONTEXT_CHIP_MODES, ['rounds', 'label', 'compact']);
});

test('runtime bridges allow barOrder, barHidden, and contextChipMode', async () => {
  for (const rel of ['../../../compat/ipc-host.cjs', '../../../compat/runtime-ui.mjs']) {
    const src = await readFile(new URL(rel, import.meta.url), 'utf8');
    for (const key of ['barOrder', 'barHidden', 'contextChipMode']) {
      assert.ok(src.includes(`'${key}'`), `${rel} should whitelist ${key}`);
    }
  }
});

test('i18n exposes trilingual bar customization copy and connectBarPreferences handles sync, guard, and reset', async () => {
  const keys = [
    'barCustomize', 'barCustomizeTitle', 'barReset', 'barContextChipMode',
    'barContextModeRounds', 'barContextModeLabel', 'barContextModeCompact',
    'barOrderLabel', 'barKeepOneHint', 'barSaveFailed', 'barMoveUp', 'barMoveDown',
    'barChipSpeed', 'barChipCache', 'barChipQuota', 'barChipContext', 'barFooterMigrated',
  ];
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    const i18n = createDashboardI18n(locale);
    for (const k of keys) {
      assert.notEqual(i18n.t(k), k, `${locale} missing translation for ${k}`);
      assert.ok(i18n.t(k).length > 0);
    }
  }

  let rev = 10;
  let shouldFail = false;
  let cached = null;
  let changes = 0;
  const ctrl = createDashboardI18n('zh-CN').connectBarPreferences({
    initial: null,
    cache: v => { cached = v; },
    write: async input => {
      await new Promise(r => setTimeout(r, 2));
      if (shouldFail) throw new Error('write failed');
      return { language: 'zh-CN', ...input, revision: ++rev };
    },
    changed: () => { changes++; },
  });

  assert.deepEqual(ctrl.order, ['speed', 'cache', 'quota', 'context']);
  assert.deepEqual(ctrl.hidden, []);
  assert.equal(ctrl.contextChipMode, 'rounds');

  // Guard: refusing to hide all 4 chips
  await ctrl.update({ barHidden: ['speed', 'cache', 'quota', 'context'] });
  assert.deepEqual(ctrl.hidden, []);

  // Valid update
  await ctrl.update({ barOrder: ['context', 'speed', 'cache', 'quota'], barHidden: ['quota'], contextChipMode: 'label' });
  assert.equal(ctrl.error, false);
  assert.deepEqual(cached, { order: ['context', 'speed', 'cache', 'quota'], hidden: ['quota'], contextChipMode: 'label' });
  assert.ok(changes >= 1);

  // Stale revision cannot overwrite newer local state
  ctrl.sync({ barOrder: ['speed', 'cache', 'quota', 'context'], barHidden: [], contextChipMode: 'compact', revision: 1 });
  assert.equal(ctrl.contextChipMode, 'label');

  // Write failure retains optimistic state with error flag
  shouldFail = true;
  await ctrl.update({ contextChipMode: 'compact' });
  assert.equal(ctrl.contextChipMode, 'compact');
  assert.equal(ctrl.error, true);

  // Reset succeeds once writes recover
  shouldFail = false;
  await ctrl.reset();
  assert.equal(ctrl.error, false);
  assert.deepEqual(ctrl.order, ['speed', 'cache', 'quota', 'context']);
  assert.deepEqual(ctrl.hidden, []);
  assert.equal(ctrl.contextChipMode, 'rounds');
  ctrl.dispose();
});
