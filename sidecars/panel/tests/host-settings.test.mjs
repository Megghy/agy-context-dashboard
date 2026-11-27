import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const createHostSettings = require('../../../compat/host-settings.cjs');
const createDashboardI18n = require('../../../compat/i18n.cjs');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function createMinimalDom() {
  const observers = new Set();
  const emitMutation = record => {
    for (const obs of observers) {
      if (!obs.target) continue;
      if (obs.options.subtree ? obs.target.contains(record.target) : obs.target === record.target) {
        obs.callback([record], obs);
      }
    }
  };

  function matchAttr(el, sel) {
    const m = sel.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/);
    if (!m) return false;
    const val = el.getAttribute(m[1]);
    return m[2] === undefined ? val !== null : val === m[2];
  }

  class El {
    constructor(tagName) {
      this.nodeType = 1;
      this.tagName = tagName.toUpperCase();
      this.parentElement = null;
      this.parentNode = null;
      this.childNodes = [];
      this.attributes = new Map();
      this.dataset = {};
      this.listeners = new Map();
      this.style = {};
      this.hidden = false;
      this.disabled = false;
      this.classList = {
        add: c => {
          const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
          set.add(c);
          this.className = [...set].join(' ');
        },
        remove: c => {
          const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
          set.delete(c);
          this.className = [...set].join(' ');
        },
      };
    }
    get isConnected() {
      for (let cur = this; cur; cur = cur.parentNode) if (cur === doc.documentElement) return true;
      return false;
    }
    get children() { return this.childNodes.filter(n => n.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? this.parentNode.childNodes[idx + 1] || null : null;
    }
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', v); }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', v); }
    contains(other) {
      for (let cur = other; cur; cur = cur.parentNode) if (cur === this) return true;
      return false;
    }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    setAttribute(name, val) {
      this.attributes.set(name, String(val));
      if (name.startsWith('data-')) {
        const camel = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        this.dataset[camel] = String(val);
      }
    }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(node) {
      if (node.parentNode) node.remove();
      node.parentNode = this;
      node.parentElement = this;
      this.childNodes.push(node);
      emitMutation({ type: 'childList', target: this, addedNodes: [node] });
      return node;
    }
    insertBefore(node, ref) {
      if (!ref) return this.appendChild(node);
      if (node.parentNode) node.remove();
      const idx = this.childNodes.indexOf(ref);
      node.parentNode = this;
      node.parentElement = this;
      this.childNodes.splice(idx < 0 ? this.childNodes.length : idx, 0, node);
      emitMutation({ type: 'childList', target: this, addedNodes: [node] });
      return node;
    }
    removeChild(node) {
      const idx = this.childNodes.indexOf(node);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        node.parentNode = null;
        node.parentElement = null;
      }
      return node;
    }
    remove() { this.parentNode?.removeChild(this); }
    replaceChildren(...nodes) {
      for (const child of [...this.childNodes]) this.removeChild(child);
      for (const n of nodes) this.appendChild(n);
    }
    addEventListener(type, fn, capture = false) {
      const key = `${type}:${Boolean(capture)}`;
      if (!this.listeners.has(key)) this.listeners.set(key, []);
      this.listeners.get(key).push(fn);
    }
    removeEventListener(type, fn, capture = false) {
      const key = `${type}:${Boolean(capture)}`;
      const list = this.listeners.get(key);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    }
    click() {
      const path = [];
      for (let cur = this; cur; cur = cur.parentElement) path.unshift(cur);
      let stopped = false;
      const event = { target: this, stopPropagation() { stopped = true; } };
      for (const el of path) {
        for (const fn of [...(el.listeners.get('click:true') || [])]) fn(event);
        if (stopped) return;
      }
      for (const el of [...path].reverse()) {
        for (const fn of [...(el.listeners.get('click:false') || [])]) fn(event);
        if (stopped) return;
      }
    }
    querySelector(sel) {
      for (const child of this.children) {
        if (matchAttr(child, sel) || (sel.startsWith('.') && (child.className || '').split(/\s+/).includes(sel.slice(1)))) return child;
        const found = child.querySelector(sel);
        if (found) return found;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      for (const child of this.children) {
        if (matchAttr(child, sel) || (sel.startsWith('.') && (child.className || '').split(/\s+/).includes(sel.slice(1)))) out.push(child);
        out.push(...child.querySelectorAll(sel));
      }
      return out;
    }
  }

  class MO {
    constructor(callback) { this.callback = callback; this.target = null; this.options = {}; }
    observe(target, options = {}) { this.target = target; this.options = options; observers.add(this); }
    disconnect() { observers.delete(this); this.target = null; }
  }

  const root = new El('html');
  const head = new El('head');
  const body = new El('body');
  root.appendChild(head);
  root.appendChild(body);

  const doc = {
    documentElement: root,
    head,
    body,
    createElement: tag => new El(tag),
    createElementNS: (_ns, tag) => new El(tag),
    getElementById: id => root.querySelector(`[id="${id}"]`),
    querySelector: sel => root.querySelector(sel),
  };

  return { doc, win: { top: null }, MO, El };
}

function makeControllers() {
  const language = createDashboardI18n('zh-CN');
  const write = async input => ({ ...input, revision: 1 });
  const preferences = language.connectPreferences({ read: async () => ({ language: 'zh-CN' }), write, cache: () => {} });
  const barPrefs = language.connectBarPreferences({ write });
  const barColorsPref = language.connectBarColors({ write });
  const themeModePref = language.connectThemeMode({ write });
  const cacheHitTone = language.connectCacheHitTone({ write });
  const cacheHitTiers = language.connectCacheHitTiers({ write });
  const inlineCacheHit = language.connectInlineCacheHit({ write });
  const cacheChipMode = language.connectCacheChipMode({ write });
  const quotaDisplay = language.connectQuotaDisplay({ write });
  const speedStyle = language.connectSpeedStyle({ write });
  const hostUiLocalization = language.connectHostUiLocalization({ write });
  const stripMode = language.connectStripMode({ write });
  const barPlacement = language.connectBarPlacement({ write });
  const turnFooter = language.connectTurnFooter({ write });
  return {
    language,
    preferences,
    barPrefs,
    barColorsPref,
    themeModePref,
    cacheHitTone,
    cacheHitTiers,
    inlineCacheHit,
    cacheChipMode,
    quotaDisplay,
    speedStyle,
    hostUiLocalization,
    stripMode,
    barPlacement,
    turnFooter,
    dispose() {
      preferences.dispose();
      barPrefs.dispose();
      barColorsPref.dispose();
      themeModePref.dispose();
      cacheHitTone.dispose();
      cacheHitTiers.dispose();
      inlineCacheHit.dispose();
      cacheChipMode.dispose();
      quotaDisplay.dispose();
      speedStyle.dispose();
      hostUiLocalization.dispose();
      stripMode.dispose();
      barPlacement.dispose();
      turnFooter.dispose();
    },
  };
}

test('host-settings injects into settings-sidebar after Browser, switches cleanly without disturbing React nodes, and disposes', async t => {
  const { doc, win, MO, El } = createMinimalDom();
  win.top = win;
  const ctrls = makeControllers();
  t.after(() => ctrls.dispose());

  const modal = new El('div');
  const sidebar = new El('div');
  sidebar.setAttribute('data-testid', 'settings-sidebar');
  const navGeneral = new El('button');
  navGeneral.setAttribute('data-testid', 'settings-nav-item-General');
  const navBrowser = new El('button');
  navBrowser.setAttribute('data-testid', 'settings-nav-item-Browser');
  const navFeedback = new El('button');
  navFeedback.setAttribute('data-testid', 'settings-nav-item-Provide Feedback');
  sidebar.appendChild(navGeneral);
  sidebar.appendChild(navBrowser);
  sidebar.appendChild(navFeedback);

  const contentPane = new El('div');
  const nativeBody = new El('div');
  nativeBody.setAttribute('data-testid', 'native-settings-body');
  contentPane.appendChild(nativeBody);

  modal.appendChild(sidebar);
  modal.appendChild(contentPane);
  doc.body.appendChild(modal);

  const hs = createHostSettings({
    ...ctrls,
    version: '1.0.3',
    document: doc,
    window: win,
    MutationObserver: MO,
  });
  t.after(() => hs.dispose());

  assert.ok(doc.getElementById('ag-pulse-host-settings-style'));
  const navBtn = sidebar.querySelector('[data-testid="settings-nav-item-antigravity-pulse"]');
  assert.ok(navBtn, 'nav item should be injected into settings-sidebar');
  assert.equal(navBtn.getAttribute('data-ag-i18n-ignore'), 'true');
  assert.equal(navBtn.parentElement.getAttribute('data-ag-i18n-ignore'), 'true');

  const sidebarOrder = sidebar.children.map(el => el.getAttribute('data-testid') || el.getAttribute('data-ag-pulse-settings-nav'));
  assert.deepEqual(sidebarOrder, [
    'settings-nav-item-General',
    'settings-nav-item-Browser',
    'true',
    'settings-nav-item-Provide Feedback',
  ]);

  // Activate our settings page
  navBtn.click();
  assert.equal(navBtn.getAttribute('data-active'), 'true');
  assert.equal(contentPane.getAttribute('data-ag-pulse-settings-active'), 'true');
  const panelHost = contentPane.querySelector('[data-ag-pulse-settings-panel="true"]');
  assert.ok(panelHost);
  assert.equal(panelHost.hidden, false);
  assert.equal(nativeBody.parentElement, contentPane, 'native React child must remain mounted');

  // Switch back to native General tab
  navGeneral.click();
  assert.equal(navBtn.getAttribute('data-active'), null);
  assert.equal(contentPane.getAttribute('data-ag-pulse-settings-active'), null);
  assert.equal(panelHost.hidden, true);
  assert.equal(nativeBody.parentElement, contentPane);

  // Re-open after modal teardown + re-mount
  modal.remove();
  const modal2 = new El('div');
  const sidebar2 = new El('div');
  sidebar2.setAttribute('data-testid', 'settings-sidebar');
  const navBrowser2 = new El('button');
  navBrowser2.setAttribute('data-testid', 'settings-nav-item-Browser');
  sidebar2.appendChild(navBrowser2);
  const content2 = new El('div');
  content2.appendChild(new El('div'));
  modal2.appendChild(sidebar2);
  modal2.appendChild(content2);
  doc.body.appendChild(modal2);

  assert.ok(sidebar2.querySelector('[data-testid="settings-nav-item-antigravity-pulse"]'));

  hs.dispose();
  assert.equal(sidebar2.querySelector('[data-testid="settings-nav-item-antigravity-pulse"]'), null);
  assert.equal(content2.querySelector('[data-ag-pulse-settings-panel="true"]'), null);
  assert.equal(doc.getElementById('ag-pulse-host-settings-style'), null);
});

test('host-settings handles nested Antigravity SplitPane + TX wrapper and places nav above Projects', async t => {
  const { doc, win, MO, El } = createMinimalDom();
  win.top = win;
  const ctrls = makeControllers();
  t.after(() => ctrls.dispose());

  // Mirror Antigravity E3b SplitPane: firstPane(sidebar) + resizer(0 children) + secondPane(scrollWrap)
  const splitRoot = new El('div');
  const firstPane = new El('div');
  const resizer = new El('div');
  const secondPane = new El('div');
  const nativeScroll = new El('div');
  nativeScroll.setAttribute('data-testid', 'native-scroll');
  secondPane.appendChild(nativeScroll);

  const sidebar = new El('div');
  sidebar.setAttribute('data-testid', 'settings-sidebar');
  const scrollArea = new El('div');
  const settingsGroup = new El('div');
  const txGeneral = new El('div');
  const navGeneral = new El('button');
  navGeneral.setAttribute('data-testid', 'settings-nav-item-General');
  txGeneral.appendChild(navGeneral);

  const txBrowser = new El('div');
  const navBrowser = new El('button');
  navBrowser.setAttribute('data-testid', 'settings-nav-item-Browser');
  txBrowser.appendChild(navBrowser);

  settingsGroup.appendChild(txGeneral);
  settingsGroup.appendChild(txBrowser);

  const projectsHeader = new El('div');
  const projectsGroup = new El('div');
  const feedbackWrap = new El('div');
  const navFeedback = new El('button');
  navFeedback.setAttribute('data-testid', 'settings-nav-item-Provide Feedback');
  feedbackWrap.appendChild(navFeedback);

  scrollArea.appendChild(settingsGroup);
  scrollArea.appendChild(projectsHeader);
  scrollArea.appendChild(projectsGroup);
  scrollArea.appendChild(feedbackWrap);
  sidebar.appendChild(scrollArea);

  firstPane.appendChild(sidebar);
  splitRoot.appendChild(firstPane);
  splitRoot.appendChild(resizer);
  splitRoot.appendChild(secondPane);
  doc.body.appendChild(splitRoot);

  const hs = createHostSettings({
    ...ctrls,
    version: '1.0.3',
    document: doc,
    window: win,
    MutationObserver: MO,
  });
  t.after(() => hs.dispose());

  const navBtn = sidebar.querySelector('[data-testid="settings-nav-item-antigravity-pulse"]');
  assert.ok(navBtn);
  assert.equal(navBtn.parentElement.parentElement, settingsGroup, 'navWrap must sit inside settingsGroup right below TX(Browser)');
  assert.deepEqual(
    settingsGroup.children.map(el => el.getAttribute('data-ag-pulse-settings-nav') || el.children[0]?.getAttribute('data-testid')),
    ['settings-nav-item-General', 'settings-nav-item-Browser', 'true']
  );

  navBtn.click();
  assert.equal(sidebar.getAttribute('data-ag-pulse-nav-active'), 'true');
  assert.equal(secondPane.getAttribute('data-ag-pulse-settings-active'), 'true');
  assert.equal(resizer.getAttribute('data-ag-pulse-settings-active'), null);
  assert.ok(secondPane.querySelector('[data-ag-pulse-settings-panel="true"]'));

  navGeneral.click();
  assert.equal(sidebar.getAttribute('data-ag-pulse-nav-active'), null);
  assert.equal(secondPane.getAttribute('data-ag-pulse-settings-active'), null);
});

test('sidecars/panel/main.mjs bundles compat/host-settings.cjs into renderer and inline sources', async () => {
  const mainSrc = await readFile(join(ROOT, 'sidecars', 'panel', 'main.mjs'), 'utf8');
  assert.ok(mainSrc.includes("'host-settings.cjs'"));
  assert.ok(mainSrc.includes('hostSettingsSource()'));
  assert.ok(mainSrc.includes('__agPulseHostSettingsFactory'));
});

test('dashboardLanguage exposes trilingual label for settings panels', () => {
  assert.equal(createDashboardI18n('en').t('dashboardLanguage'), 'Dashboard language');
  assert.equal(createDashboardI18n('zh-CN').t('dashboardLanguage'), '仪表盘语言');
  assert.equal(createDashboardI18n('zh-TW').t('dashboardLanguage'), '儀表板語言');
  assert.equal(createDashboardI18n('en').t('pulseSettingsTitle'), 'Antigravity Dashboard Settings');
  assert.equal(createDashboardI18n('zh-CN').t('pulseSettingsTitle'), 'Antigravity Dashboard 设置');
  assert.equal(createDashboardI18n('zh-TW').t('pulseSettingsTitle'), 'Antigravity Dashboard 設定');
  assert.equal(createDashboardI18n('en').t('barPlacementFooter'), 'Bottom row');
  assert.equal(createDashboardI18n('zh-CN').t('barPlacementFooter'), '底部独立一行');
  assert.equal(createDashboardI18n('en').t('turnFooter'), 'Per-turn reply footer');
  assert.equal(createDashboardI18n('zh-CN').t('turnFooter'), '回复末尾统计条');
  assert.equal(createDashboardI18n('zh-CN').t('turnFooterIn'), '输入');
  assert.equal(createDashboardI18n('zh-CN').t('turnFooterOut'), '输出');
  assert.equal(createDashboardI18n('zh-CN').t('turnFooterCache'), '缓存');
  assert.equal(createDashboardI18n('zh-CN').t('turnFooterSpeed'), '均速');
  assert.equal(createDashboardI18n('en').t('turnFooterSpeed'), 'Avg');
});

test('host-settings toggles barPlacement to footer and resets back to inline', async t => {
  const { doc, win, MO, El } = createMinimalDom();
  win.top = win;
  const ctrls = makeControllers();
  t.after(() => ctrls.dispose());

  const modal = new El('div');
  const sidebar = new El('div');
  sidebar.setAttribute('data-testid', 'settings-sidebar');
  const navBrowser = new El('button');
  navBrowser.setAttribute('data-testid', 'settings-nav-item-Browser');
  sidebar.appendChild(navBrowser);
  const contentPane = new El('div');
  contentPane.appendChild(new El('div'));
  modal.appendChild(sidebar);
  modal.appendChild(contentPane);
  doc.body.appendChild(modal);

  const hs = createHostSettings({ ...ctrls, version: '1.0.3', document: doc, window: win, MutationObserver: MO });
  t.after(() => hs.dispose());

  sidebar.querySelector('[data-testid="settings-nav-item-antigravity-pulse"]').click();
  const panelHost = contentPane.querySelector('[data-ag-pulse-settings-panel="true"]');
  const footerBtn = panelHost.querySelector('[data-bar-placement-choice="footer"]');
  assert.ok(footerBtn, 'barPlacement footer button rendered in System Settings');
  footerBtn.click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(ctrls.barPlacement.placement, 'footer');

  const turnOffBtn = panelHost.querySelector('[data-turn-footer-choice="false"]');
  assert.ok(turnOffBtn, 'turnFooter off button rendered in System Settings');
  turnOffBtn.click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(ctrls.turnFooter.enabled, false);

  const weeklyBtn = panelHost.querySelector('[data-quota-display-choice="weekly"]');
  assert.ok(weeklyBtn, 'quotaDisplay weekly button rendered in System Settings');
  weeklyBtn.click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(ctrls.quotaDisplay.value, 'weekly');

  const hitOnlyBtn = panelHost.querySelector('[data-cache-chip-mode="hit"]');
  assert.ok(hitOnlyBtn, 'cacheChipMode hit button rendered in System Settings');
  hitOnlyBtn.click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(ctrls.cacheChipMode.value, 'hit');

  const resetBtn = panelHost.querySelector('.hs-reset');
  assert.ok(resetBtn);
  resetBtn.click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(ctrls.barPlacement.placement, 'inline');
  assert.equal(ctrls.turnFooter.enabled, true);
  assert.equal(ctrls.quotaDisplay.value, 'both');
  assert.equal(ctrls.cacheChipMode.value, 'both');
});
