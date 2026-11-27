// Injects an Antigrative Dashboard entry into Antigravity's native System Settings
// sidebar and renders the full preferences panel inside Shadow DOM.
module.exports = function createHostSettings({
  language,
  theme,
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
  version = '',
  allowNested = false,
  document: doc = document,
  window: win = window,
  MutationObserver: MO = MutationObserver,
} = {}) {
  if (win && win !== win.top && !allowNested) {
    return { sync() {}, dispose() {} };
  }

  const STYLE_ID = 'ag-pulse-host-settings-style';
  const NAV_TEST_ID = 'settings-nav-item-antigravity-pulse';
  const PRESET_SWATCHES = ['#315fc4', '#0284c7', '#7c3aed', '#16a34a', '#d97706', '#d97757'];
  const CHIP_NAMES = { speed: 'barChipSpeed', cache: 'barChipCache', quota: 'barChipQuota', context: 'barChipContext' };
  const t = (key, vars) => (typeof language?.t === 'function' ? language.t(key, vars) : key);

  let disposed = false;
  let active = false;
  let mountedSidebar = null;
  let mountedContentPane = null;
  let navWrap = null;
  let navBtn = null;
  let navLabelEl = null;
  let panelHost = null;
  let panelShadow = null;
  let panelStyleEl = null;
  let panelRootEl = null;
  let panelThemeController = null;
  let sidebarClickHandler = null;
  let observer = null;
  let lastSig = '';
  let draggingChipId = null;

  const navLabelText = () => (language?.language === 'zh-CN' ? 'AGY 仪表盘' : language?.language === 'zh-TW' ? 'AGY 儀表板' : 'AGY Dashboard');

  function ensureGlobalStyle() {
    if (!doc?.head || doc.getElementById?.(STYLE_ID)) return;
    const styleEl = doc.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = [
      '.ag-pulse-settings-nav-wrap{margin:6px 8px 2px;padding-top:6px;border-top:1px solid rgba(128,128,128,.2);}',
      '.ag-pulse-settings-nav-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:1.35;text-align:left;cursor:pointer;transition:background-color .12s ease;}',
      '.ag-pulse-settings-nav-item:hover{background:rgba(128,128,128,.12);}',
      '.ag-pulse-settings-nav-item[data-active="true"]{background:rgba(128,128,128,.18);font-weight:500;}',
      '.ag-pulse-settings-nav-item:focus-visible{outline:2px solid currentColor;outline-offset:-2px;}',
      '.ag-pulse-settings-nav-icon{width:15px;height:15px;flex:none;opacity:.85;}',
      '.ag-pulse-settings-nav-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.ag-pulse-settings-nav-ver{margin-left:auto;font-size:11px;opacity:.6;font-variant-numeric:tabular-nums;flex:none;}',
      '[data-testid="settings-sidebar"][data-ag-pulse-nav-active="true"] [data-testid^="settings-nav-item-"]:not([data-testid="settings-nav-item-antigravity-pulse"]){background:transparent !important;}',
      '[data-ag-pulse-settings-active="true"] > :not([data-ag-pulse-settings-panel="true"]){display:none !important;}',
      '[data-ag-pulse-settings-panel="true"]{display:block;width:100%;height:100%;overflow-y:auto;}',
      '[data-ag-pulse-settings-panel="true"][hidden]{display:none !important;}',
    ].join('');
    doc.head.appendChild(styleEl);
  }

  function directChildIn(container, descendant) {
    let cur = descendant;
    while (cur && cur.parentElement && cur.parentElement !== container) {
      cur = cur.parentElement;
    }
    return cur && cur.parentElement === container ? cur : null;
  }

  function findContentPane(sidebar) {
    let cur = sidebar;
    for (let depth = 0; depth < 5 && cur; depth++) {
      const parent = cur.parentElement;
      if (!parent || parent === doc?.documentElement) break;
      const siblings = Array.from(parent.children || parent.childNodes || []).filter(
        el => el && el.nodeType === 1 && el !== cur && String(el.tagName || '').toUpperCase() !== 'STYLE'
      );
      if (siblings.length > 0) {
        return siblings.find(el => (el.children || []).length > 0) || siblings[0];
      }
      if (parent === doc?.body) break;
      cur = parent;
    }
    return null;
  }

  function findNavClickKind(target, sidebar) {
    for (let cur = target; cur && cur !== sidebar; cur = cur.parentElement) {
      if (cur === navBtn || cur === navWrap) return 'own';
      if (cur.nodeType !== 1) continue;
      const testId = cur.getAttribute?.('data-testid') || '';
      const tag = String(cur.tagName || '').toUpperCase();
      const role = cur.getAttribute?.('role') || '';
      if (testId.startsWith('settings-nav-item-') || tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'tab') {
        return 'native';
      }
    }
    return null;
  }

  function buildPulseIcon() {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ag-pulse-settings-nav-icon');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M1.5 8.5h2.7l1.8-4.5 2.5 8 1.9-4.8 1.3 1.3h2.8');
    svg.appendChild(path);
    return svg;
  }

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function panelCss() {
    return [
      theme?.shadowCss?.() || '',
      ':host{display:block;color-scheme:var(--pulse-scheme,dark);font-family:var(--pulse-font,-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif);color:var(--pulse-foreground,#e1e3e7);font-size:13px;line-height:1.45;}',
      '*{box-sizing:border-box;}button,input{font:inherit;}button{cursor:pointer;}',
      '.hs-root{max-width:680px;padding:22px 26px 28px;display:flex;flex-direction:column;gap:16px;}',
      '.hs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--pulse-separator,rgba(255,255,255,.1));}',
      '.hs-title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
      '.hs-title{margin:0;font-size:17px;font-weight:600;color:var(--pulse-foreground,#e1e3e7);}',
      '.hs-ver{font-size:11px;padding:1px 7px;border-radius:999px;background:var(--pulse-control,#383b3f);color:var(--pulse-muted,#adb2ba);font-variant-numeric:tabular-nums;}',
      '.hs-sub{margin:4px 0 0;font-size:12px;color:var(--pulse-muted,#adb2ba);}',
      '.hs-reset{padding:5px 11px;border-radius:7px;border:1px solid var(--pulse-border,#41454d);background:var(--pulse-card,#2a2c2f);color:var(--pulse-foreground,#e1e3e7);font-size:12px;white-space:nowrap;}',
      '.hs-reset:hover{background:var(--pulse-hover,#292b2e);}',
      '.hs-section{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:11px;border:1px solid var(--pulse-border,#41454d);background:var(--pulse-card,#2a2c2f);}',
      '.hs-sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;font-weight:600;color:var(--pulse-label,#b8bdc5);}',
      '.hs-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px;}',
      '.hs-row-label{display:flex;flex-direction:column;gap:2px;min-width:0;}',
      '.hs-row-title{font-size:13px;color:var(--pulse-foreground,#e1e3e7);}',
      '.hs-row-hint{font-size:11px;color:var(--pulse-muted,#adb2ba);}',
      '.hs-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:8px;background:var(--pulse-control,#383b3f);border:1px solid var(--pulse-separator,rgba(255,255,255,.08));flex:none;}',
      '.hs-seg-btn{border:0;border-radius:6px;padding:4px 9px;background:transparent;color:var(--pulse-control-text,#c2c7d1);font-size:12px;line-height:1.25;}',
      '.hs-seg-btn:hover{color:var(--pulse-foreground,#e1e3e7);}',
      '.hs-seg-btn[aria-pressed="true"]{background:var(--pulse-selected,#444950);color:var(--pulse-foreground,#e1e3e7);font-weight:600;}',
      '.hs-seg-btn[data-save-failed="true"]{outline:1px solid var(--pulse-danger,#e99b9b);}',
      '.hs-colors{display:flex;flex-direction:column;gap:8px;padding-top:4px;}',
      '.hs-color-row{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
      '.hs-color-label{font-size:12px;color:var(--pulse-foreground,#e1e3e7);}',
      '.hs-color-ctrls{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
      '.hs-color-def{border:1px solid var(--pulse-border,#41454d);border-radius:6px;padding:2px 8px;background:transparent;color:var(--pulse-control-text,#c2c7d1);font-size:11px;}',
      '.hs-color-def[aria-pressed="true"]{background:var(--pulse-selected,#444950);color:var(--pulse-foreground,#e1e3e7);font-weight:600;}',
      '.hs-swatch{width:16px;height:16px;border-radius:999px;border:1px solid rgba(128,128,128,.35);padding:0;background:transparent;}',
      '.hs-swatch[aria-pressed="true"]{outline:2px solid var(--pulse-accent,#85a8ff);outline-offset:1px;}',
      '.hs-picker{width:24px;height:20px;padding:0;border:1px solid var(--pulse-border,#41454d);border-radius:5px;background:transparent;cursor:pointer;}',
      '.hs-chips{display:flex;flex-direction:column;gap:6px;}',
      '.hs-chip-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:var(--pulse-background,#1c1d1f);border:1px solid var(--pulse-separator,rgba(255,255,255,.08));}',
      '.hs-chip-row.is-hidden{opacity:.62;}',
      '.hs-chip-row.is-drag-over{border-color:var(--pulse-accent,#85a8ff);}',
      '.hs-drag{opacity:.55;cursor:grab;user-select:none;font-size:12px;}',
      '.hs-chip-name{flex:1;font-size:12px;}',
      '.hs-moves{display:inline-flex;gap:4px;}',
      '.hs-move-btn{width:22px;height:22px;border-radius:5px;border:1px solid var(--pulse-border,#41454d);background:var(--pulse-control,#383b3f);color:var(--pulse-foreground,#e1e3e7);font-size:11px;line-height:1;padding:0;}',
      '.hs-move-btn:disabled{opacity:.38;cursor:default;}',
      '.hs-switch{position:relative;width:34px;height:19px;border-radius:999px;border:1px solid var(--pulse-border,#41454d);background:var(--pulse-control,#383b3f);padding:0;transition:background-color .15s ease;}',
      '.hs-switch::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:999px;background:#fff;transition:transform .15s ease;}',
      '.hs-switch[aria-checked="true"]{background:var(--pulse-accent,#85a8ff);border-color:var(--pulse-accent,#85a8ff);}',
      '.hs-switch[aria-checked="true"]::after{transform:translateX(15px);}',
      '.hs-switch:disabled{opacity:.5;cursor:not-allowed;}',
      '.hs-footnote{margin:0;min-height:16px;font-size:12px;color:var(--pulse-danger,#e99b9b);}',
    ].join('');
  }

  function errorMessage() {
    if (preferences?.error) return t('languageSaveFailed');
    if (hostUiLocalization?.error) return t('hostUiLocalizationSaveFailed');
    if (themeModePref?.error) return t('themeModeSaveFailed');
    if (barColorsPref?.error) return t('barColorsSaveFailed');
    if (cacheHitTone?.error) return t('cacheHitToneSaveFailed');
    if (cacheHitTiers?.error) return t('cacheHitTiersSaveFailed');
    if (cacheChipMode?.error) return t('cacheChipModeSaveFailed');
    if (inlineCacheHit?.error) return t('inlineCacheHitSaveFailed');
    if (barPrefs?.error) return t('barSaveFailed');
    if (stripMode?.error) return t('stripModeSaveFailed');
    if (barPlacement?.error) return t('barPlacementSaveFailed');
    if (turnFooter?.error) return t('turnFooterSaveFailed');
    if (quotaDisplay?.error) return t('quotaDisplaySaveFailed');
    if (speedStyle?.error) return t('styleSaveFailed');
    return '';
  }

  function moveChip(id, delta) {
    const next = [...(barPrefs?.order || [])];
    const idx = next.indexOf(id);
    const to = idx + delta;
    if (idx < 0 || to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    void barPrefs?.update?.({ barOrder: next });
  }

  function reorderChips(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const next = [...(barPrefs?.order || [])];
    const a = next.indexOf(fromId);
    const b = next.indexOf(toId);
    if (a < 0 || b < 0) return;
    next.splice(a, 1);
    next.splice(b, 0, fromId);
    void barPrefs?.update?.({ barOrder: next });
  }

  function toggleChipVisible(id) {
    const order = barPrefs?.order || [];
    const set = new Set(barPrefs?.hidden || []);
    if (set.has(id)) {
      set.delete(id);
    } else {
      if (order.length - set.size <= 1) return;
      set.add(id);
    }
    void barPrefs?.update?.({ barHidden: order.filter(k => set.has(k)) });
  }

  function resetAll() {
    void barPrefs?.reset?.();
    void themeModePref?.choose?.('auto');
    void barColorsPref?.reset?.();
    void cacheHitTone?.choose?.('accent');
    void cacheHitTiers?.choose?.(false);
    if (cacheChipMode?.choose) void cacheChipMode.choose('both');
    else void inlineCacheHit?.choose?.(true);
    void quotaDisplay?.choose?.('both');
    void speedStyle?.choose?.('minimal');
    void barPlacement?.choose?.('inline');
    void turnFooter?.choose?.(true);
  }

  function ensurePanelHost() {
    if (!mountedContentPane || !mountedContentPane.isConnected) return false;
    if (panelHost && panelHost.parentElement === mountedContentPane) return true;
    if (panelThemeController) {
      panelThemeController.dispose?.();
      panelThemeController = null;
    }
    panelHost = doc.createElement('div');
    panelHost.setAttribute('data-ag-pulse-settings-panel', 'true');
    panelHost.setAttribute('data-pulse-widget', 'true');
    panelHost.setAttribute('data-ag-i18n-ignore', 'true');
    panelHost.hidden = !active;
    mountedContentPane.appendChild(panelHost);

    if (typeof panelHost.attachShadow === 'function') {
      panelShadow = panelHost.attachShadow({ mode: 'open' });
      panelStyleEl = doc.createElement('style');
      panelStyleEl.textContent = panelCss();
      panelRootEl = doc.createElement('div');
      panelRootEl.className = 'hs-root';
      panelShadow.appendChild(panelStyleEl);
      panelShadow.appendChild(panelRootEl);
    } else {
      panelShadow = null;
      panelRootEl = doc.createElement('div');
      panelRootEl.className = 'hs-root';
      panelHost.appendChild(panelRootEl);
    }

    if (typeof theme?.attach === 'function') {
      try {
        panelThemeController = theme.attach(panelHost, {
          embedded: true,
          onChange: () => {
            if (!disposed && active) renderPanel();
          },
        });
        panelThemeController?.setThemeMode?.(themeModePref?.value || 'auto');
        panelThemeController?.setBarColors?.(barColorsPref?.colors || {});
      } catch {
        panelThemeController = null;
      }
    }
    lastSig = '';
    return true;
  }

  function segGroup(ariaLabel, items) {
    const g = el('div', 'hs-seg');
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', ariaLabel);
    for (const item of items) {
      const b = el('button', 'hs-seg-btn', item.label);
      b.type = 'button';
      if (item.attrs) {
        for (const [k, v] of Object.entries(item.attrs)) b.setAttribute(k, String(v));
      }
      b.setAttribute('aria-pressed', String(Boolean(item.active)));
      if (item.failed) b.setAttribute('data-save-failed', 'true');
      if (item.title) b.title = item.title;
      b.addEventListener('click', item.onClick);
      g.appendChild(b);
    }
    return g;
  }

  function addRow(parent, title, ctrl, hint = '') {
    const row = el('div', 'hs-row');
    const lbl = el('div', 'hs-row-label');
    lbl.appendChild(el('span', 'hs-row-title', title));
    if (hint) lbl.appendChild(el('span', 'hs-row-hint', hint));
    row.appendChild(lbl);
    row.appendChild(ctrl);
    parent.appendChild(row);
  }

  function renderPanel(force = false) {
    if (disposed || !panelRootEl) return;
    const order = barPrefs?.order || ['speed', 'cache', 'quota', 'context'];
    const hiddenArr = barPrefs?.hidden || [];
    const hiddenSet = new Set(hiddenArr);
    const ctxMode = barPrefs?.contextChipMode || 'rounds';
    const colors = barColorsPref?.colors || {};
    const activeScheme = panelHost?.dataset?.pulseTheme || 'dark';
    const err = errorMessage();
    const sig = JSON.stringify([
      language?.language,
      version,
      order,
      hiddenArr,
      ctxMode,
      themeModePref?.value,
      activeScheme,
      colors,
      cacheHitTiers?.enabled,
      inlineCacheHit?.enabled,
      cacheChipMode?.value,
      quotaDisplay?.value,
      speedStyle?.style,
      hostUiLocalization?.enabled,
      stripMode?.mode,
      barPlacement?.placement,
      turnFooter?.enabled,
      err,
    ]);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    panelHost?.setAttribute?.('lang', language?.language || 'en');

    // Header
    const head = el('header', 'hs-head');
    const headInfo = el('div', '');
    const titleRow = el('div', 'hs-title-row');
    titleRow.appendChild(el('h2', 'hs-title', t('pulseSettingsTitle')));
    if (version) titleRow.appendChild(el('span', 'hs-ver', `v${version}`));
    headInfo.appendChild(titleRow);
    headInfo.appendChild(el('p', 'hs-sub', t('pulseSettingsSubtitle')));
    const resetBtn = el('button', 'hs-reset', t('barReset'));
    resetBtn.type = 'button';
    resetBtn.id = 'host-settings-reset';
    resetBtn.addEventListener('click', resetAll);
    head.appendChild(headInfo);
    head.appendChild(resetBtn);

    // Section 1: Core Modules & Language
    const secCore = el('section', 'hs-section');
    secCore.appendChild(el('div', 'hs-sec-head', t('settingsSectionGeneral')));
    addRow(
      secCore,
      t('hostUiLocalization'),
      segGroup(t('hostUiLocalization'), [
        {
          label: t('hostUiLocalizationOff'),
          attrs: { 'data-host-i18n-choice': 'false' },
          active: !hostUiLocalization?.enabled,
          failed: Boolean(hostUiLocalization?.error && !hostUiLocalization?.enabled),
          onClick: () => void hostUiLocalization?.choose?.(false),
        },
        {
          label: t('hostUiLocalizationOn'),
          attrs: { 'data-host-i18n-choice': 'true' },
          active: Boolean(hostUiLocalization?.enabled),
          failed: Boolean(hostUiLocalization?.error && hostUiLocalization?.enabled),
          onClick: () => void hostUiLocalization?.choose?.(true),
        },
      ]),
      t('hostUiLocalizationHint')
    );
    const curCacheChipMode = cacheChipMode?.value || (inlineCacheHit?.enabled === false ? 'tokens' : 'both');
    const chooseCacheMode = mode => (cacheChipMode?.choose ? cacheChipMode.choose(mode) : inlineCacheHit?.choose?.(mode !== 'tokens'));
    addRow(
      secCore,
      t('cacheChipMode'),
      segGroup(t('cacheChipMode'), [
        {
          label: t('cacheChipModeTokens'),
          attrs: { 'data-cache-chip-mode': 'tokens', 'data-inline-cache-hit-choice': 'false' },
          active: curCacheChipMode === 'tokens',
          failed: Boolean((cacheChipMode?.error || inlineCacheHit?.error) && curCacheChipMode === 'tokens'),
          onClick: () => void chooseCacheMode('tokens'),
        },
        {
          label: t('cacheChipModeBoth'),
          attrs: { 'data-cache-chip-mode': 'both', 'data-inline-cache-hit-choice': 'true' },
          active: curCacheChipMode === 'both',
          failed: Boolean((cacheChipMode?.error || inlineCacheHit?.error) && curCacheChipMode === 'both'),
          onClick: () => void chooseCacheMode('both'),
        },
        {
          label: t('cacheChipModeHit'),
          attrs: { 'data-cache-chip-mode': 'hit' },
          active: curCacheChipMode === 'hit',
          failed: Boolean(cacheChipMode?.error && curCacheChipMode === 'hit'),
          onClick: () => void chooseCacheMode('hit'),
        },
      ])
    );
    addRow(
      secCore,
      t('dashboardLanguage'),
      segGroup(t('dashboardLanguage'), [
        {
          label: 'EN',
          attrs: { 'data-language-choice': 'en' },
          active: language?.language === 'en',
          failed: Boolean(preferences?.error),
          onClick: () => void preferences?.choose?.('en'),
        },
        {
          label: '简',
          attrs: { 'data-language-choice': 'zh-CN' },
          active: language?.language === 'zh-CN',
          failed: Boolean(preferences?.error),
          onClick: () => void preferences?.choose?.('zh-CN'),
        },
        {
          label: '繁',
          attrs: { 'data-language-choice': 'zh-TW' },
          active: language?.language === 'zh-TW',
          failed: Boolean(preferences?.error),
          onClick: () => void preferences?.choose?.('zh-TW'),
        },
      ])
    );

    // Section 2: Appearance & Bar Colors
    const secTheme = el('section', 'hs-section');
    const themeHead = el('div', 'hs-sec-head');
    themeHead.appendChild(el('span', '', t('settingsSectionTheme')));
    themeHead.appendChild(
      segGroup(t('settingsMode'), [
        {
          label: t('modeAuto'),
          attrs: { 'data-theme-mode-choice': 'auto' },
          active: (themeModePref?.value || 'auto') === 'auto',
          failed: Boolean(themeModePref?.error && themeModePref?.value === 'auto'),
          onClick: () => void themeModePref?.choose?.('auto'),
        },
        {
          label: t('modeLight'),
          attrs: { 'data-theme-mode-choice': 'light' },
          active: themeModePref?.value === 'light',
          failed: Boolean(themeModePref?.error && themeModePref?.value === 'light'),
          onClick: () => void themeModePref?.choose?.('light'),
        },
        {
          label: t('modeDark'),
          attrs: { 'data-theme-mode-choice': 'dark' },
          active: themeModePref?.value === 'dark',
          failed: Boolean(themeModePref?.error && themeModePref?.value === 'dark'),
          onClick: () => void themeModePref?.choose?.('dark'),
        },
      ])
    );
    secTheme.appendChild(themeHead);

    const buildColorList = slots => {
      const list = el('div', 'hs-colors');
      for (const [slot, labelKey, fallbackHex] of slots) {
        const current = colors[slot] || null;
        const row = el('div', 'hs-color-row');
        row.dataset.barColorRow = slot;
        const ctrls = el('div', 'hs-color-ctrls');
        const defBtn = el('button', 'hs-color-def', t('barColorDefault'));
        defBtn.type = 'button';
        defBtn.dataset.barColorDefault = slot;
        defBtn.setAttribute('aria-pressed', String(!current));
        defBtn.addEventListener('click', () => void barColorsPref?.setColor?.(slot, null));
        ctrls.appendChild(defBtn);
        for (const hex of PRESET_SWATCHES) {
          const dot = el('button', 'hs-swatch');
          dot.type = 'button';
          dot.dataset.barColorSlot = slot;
          dot.dataset.barColorPreset = hex;
          dot.style.background = hex;
          dot.setAttribute('aria-label', `${t(labelKey)} ${hex}`);
          dot.setAttribute('aria-pressed', String(current === hex));
          dot.addEventListener('click', () => void barColorsPref?.setColor?.(slot, hex));
          ctrls.appendChild(dot);
        }
        const picker = el('input', 'hs-picker');
        picker.type = 'color';
        picker.dataset.barColorPicker = slot;
        picker.value = current || fallbackHex;
        picker.setAttribute('aria-label', `${t('barColorPick')} ${t(labelKey)}`);
        picker.title = t('barColorPick');
        picker.addEventListener('input', () => {
          panelThemeController?.setBarColors?.({ ...(barColorsPref?.colors || {}), [slot]: picker.value });
        });
        picker.addEventListener('change', () => void barColorsPref?.setColor?.(slot, picker.value));
        ctrls.appendChild(picker);
        row.appendChild(el('span', 'hs-color-label', t(labelKey)));
        row.appendChild(ctrls);
        list.appendChild(row);
      }
      return list;
    };

    const colorSlots = [
      ['speed', 'barColorSpeed', '#315fc4'],
      ['token', 'barColorToken', '#7c3aed'],
      ['quota', 'barColorQuota', '#0284c7'],
      ['context', 'barColorContext', '#315fc4'],
      ...(cacheHitTiers?.enabled ? [] : [['cacheHit', 'barColorCacheHit', '#315fc4']]),
    ];
    secTheme.appendChild(buildColorList(colorSlots));
    addRow(
      secTheme,
      t('cacheHitTiersLabel'),
      segGroup(t('cacheHitTiersLabel'), [
        {
          label: t('cacheHitTiersFixed'),
          attrs: { 'data-cache-hit-tiers-choice': 'false' },
          active: !cacheHitTiers?.enabled,
          failed: Boolean(cacheHitTiers?.error && !cacheHitTiers?.enabled),
          onClick: () => void cacheHitTiers?.choose?.(false),
        },
        {
          label: t('cacheHitTiersAuto'),
          attrs: { 'data-cache-hit-tiers-choice': 'true' },
          active: Boolean(cacheHitTiers?.enabled),
          failed: Boolean(cacheHitTiers?.error && cacheHitTiers?.enabled),
          onClick: () => void cacheHitTiers?.choose?.(true),
        },
      ]),
      cacheHitTiers?.enabled ? t('cacheHitTiersHint') : ''
    );
    if (cacheHitTiers?.enabled) {
      secTheme.appendChild(
        buildColorList([
          ['cacheHitHigh', 'barColorCacheHitHigh', '#16a34a'],
          ['cacheHitMid', 'barColorCacheHitMid', '#315fc4'],
          ['cacheHitLow', 'barColorCacheHitLow', '#d97706'],
          ['cacheHitCold', 'barColorCacheHitCold', '#64748b'],
        ])
      );
    }

    // Section 3: Status Bar Modules & Display
    const secBar = el('section', 'hs-section');
    secBar.appendChild(el('div', 'hs-sec-head', t('settingsSectionBar')));
    addRow(
      secBar,
      t('stripMode'),
      segGroup(t('stripMode'), [
        {
          label: t('stripFull'),
          attrs: { 'data-strip-mode-choice': 'full' },
          active: (stripMode?.mode || 'full') === 'full',
          failed: Boolean(stripMode?.error && stripMode?.mode === 'full'),
          onClick: () => void stripMode?.choose?.('full'),
        },
        {
          label: t('stripMinimal'),
          attrs: { 'data-strip-mode-choice': 'minimal' },
          active: stripMode?.mode === 'minimal',
          failed: Boolean(stripMode?.error && stripMode?.mode === 'minimal'),
          onClick: () => void stripMode?.choose?.('minimal'),
        },
      ])
    );
    addRow(
      secBar,
      t('barPlacement'),
      segGroup(t('barPlacement'), [
        {
          label: t('barPlacementInline'),
          attrs: { 'data-bar-placement-choice': 'inline' },
          active: (barPlacement?.placement || 'inline') === 'inline',
          failed: Boolean(barPlacement?.error && barPlacement?.placement === 'inline'),
          onClick: () => void barPlacement?.choose?.('inline'),
        },
        {
          label: t('barPlacementFooter'),
          attrs: { 'data-bar-placement-choice': 'footer' },
          active: barPlacement?.placement === 'footer',
          failed: Boolean(barPlacement?.error && barPlacement?.placement === 'footer'),
          onClick: () => void barPlacement?.choose?.('footer'),
        },
      ])
    );
    addRow(
      secBar,
      t('turnFooter'),
      segGroup(t('turnFooter'), [
        {
          label: t('turnFooterOff'),
          attrs: { 'data-turn-footer-choice': 'false' },
          active: turnFooter?.enabled === false,
          failed: Boolean(turnFooter?.error && turnFooter?.enabled === false),
          onClick: () => void turnFooter?.choose?.(false),
        },
        {
          label: t('turnFooterOn'),
          attrs: { 'data-turn-footer-choice': 'true' },
          active: turnFooter?.enabled !== false,
          failed: Boolean(turnFooter?.error && turnFooter?.enabled !== false),
          onClick: () => void turnFooter?.choose?.(true),
        },
      ])
    );

    const chipsWrap = el('div', 'hs-chips');
    const visibleCount = order.filter(id => !hiddenSet.has(id)).length;
    order.forEach((id, idx) => {
      const isVis = !hiddenSet.has(id);
      const lastOne = isVis && visibleCount <= 1;
      const row = el('div', isVis ? 'hs-chip-row' : 'hs-chip-row is-hidden');
      row.dataset.barRow = id;
      row.draggable = true;
      const handle = el('span', 'hs-drag', '⋮⋮');
      handle.setAttribute('aria-hidden', 'true');
      const nameEl = el('span', 'hs-chip-name', t(CHIP_NAMES[id] || id));
      const moves = el('span', 'hs-moves');
      const up = el('button', 'hs-move-btn', '↑');
      up.type = 'button';
      up.dataset.barMove = '-1';
      up.dataset.barId = id;
      up.disabled = idx === 0;
      up.setAttribute('aria-label', t('barMoveUp'));
      up.addEventListener('click', () => moveChip(id, -1));
      const down = el('button', 'hs-move-btn', '↓');
      down.type = 'button';
      down.dataset.barMove = '1';
      down.dataset.barId = id;
      down.disabled = idx === order.length - 1;
      down.setAttribute('aria-label', t('barMoveDown'));
      down.addEventListener('click', () => moveChip(id, 1));
      moves.appendChild(up);
      moves.appendChild(down);
      const sw = el('button', 'hs-switch');
      sw.type = 'button';
      sw.dataset.barSwitch = id;
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(isVis));
      sw.setAttribute('aria-label', t(CHIP_NAMES[id] || id));
      if (lastOne) {
        sw.disabled = true;
        sw.title = t('barKeepOneHint');
      }
      sw.addEventListener('click', () => toggleChipVisible(id));
      row.appendChild(handle);
      row.appendChild(nameEl);
      row.appendChild(moves);
      row.appendChild(sw);
      row.addEventListener('dragstart', e => {
        draggingChipId = id;
        row.classList?.add?.('is-dragging');
        try { e.dataTransfer?.setData('text/plain', id); } catch {}
      });
      row.addEventListener('dragend', () => {
        draggingChipId = null;
        for (const r of panelRootEl?.querySelectorAll?.('.hs-chip-row') || []) {
          r.classList?.remove?.('is-dragging', 'is-drag-over');
        }
      });
      row.addEventListener('dragover', e => {
        if (!draggingChipId || draggingChipId === id) return;
        e.preventDefault();
        row.classList?.add?.('is-drag-over');
      });
      row.addEventListener('dragleave', () => row.classList?.remove?.('is-drag-over'));
      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList?.remove?.('is-drag-over');
        if (draggingChipId) reorderChips(draggingChipId, id);
      });
      chipsWrap.appendChild(row);
    });
    secBar.appendChild(chipsWrap);

    addRow(
      secBar,
      t('barContextChipMode'),
      segGroup(t('barContextChipMode'), [
        {
          label: t('barContextModeRounds'),
          attrs: { 'data-ctx-chip-mode': 'rounds' },
          active: ctxMode === 'rounds',
          onClick: () => void barPrefs?.update?.({ contextChipMode: 'rounds' }),
        },
        {
          label: t('barContextModeLabel'),
          attrs: { 'data-ctx-chip-mode': 'label' },
          active: ctxMode === 'label',
          onClick: () => void barPrefs?.update?.({ contextChipMode: 'label' }),
        },
        {
          label: t('barContextModeCompact'),
          attrs: { 'data-ctx-chip-mode': 'compact' },
          active: ctxMode === 'compact',
          onClick: () => void barPrefs?.update?.({ contextChipMode: 'compact' }),
        },
      ])
    );
    addRow(
      secBar,
      t('quotaDisplay'),
      segGroup(t('quotaDisplay'), [
        {
          label: t('quotaDisplayBoth'),
          attrs: { 'data-quota-display-choice': 'both' },
          active: (quotaDisplay?.value || 'both') === 'both',
          failed: Boolean(quotaDisplay?.error && quotaDisplay?.value === 'both'),
          onClick: () => void quotaDisplay?.choose?.('both'),
        },
        {
          label: t('quotaDisplayAuto'),
          attrs: { 'data-quota-display-choice': 'auto' },
          active: quotaDisplay?.value === 'auto',
          failed: Boolean(quotaDisplay?.error && quotaDisplay?.value === 'auto'),
          onClick: () => void quotaDisplay?.choose?.('auto'),
        },
        {
          label: t('quotaDisplayCompact'),
          attrs: { 'data-quota-display-choice': 'compact' },
          active: quotaDisplay?.value === 'compact',
          failed: Boolean(quotaDisplay?.error && quotaDisplay?.value === 'compact'),
          onClick: () => void quotaDisplay?.choose?.('compact'),
        },
        {
          label: t('quotaDisplayWeekly'),
          attrs: { 'data-quota-display-choice': 'weekly' },
          active: quotaDisplay?.value === 'weekly',
          failed: Boolean(quotaDisplay?.error && quotaDisplay?.value === 'weekly'),
          onClick: () => void quotaDisplay?.choose?.('weekly'),
        },
      ])
    );
    addRow(
      secBar,
      t('speedStyle'),
      segGroup(t('speedStyle'), [
        {
          label: t('styleMinimal'),
          attrs: { 'data-speed-style-choice': 'minimal' },
          active: (speedStyle?.style || 'minimal') === 'minimal',
          failed: Boolean(speedStyle?.error && speedStyle?.style === 'minimal'),
          onClick: () => void speedStyle?.choose?.('minimal'),
        },
        {
          label: t('styleCat'),
          attrs: { 'data-speed-style-choice': 'cat' },
          active: speedStyle?.style === 'cat',
          failed: Boolean(speedStyle?.error && speedStyle?.style === 'cat'),
          onClick: () => void speedStyle?.choose?.('cat'),
        },
      ])
    );

    const footnote = el('p', 'hs-footnote', err);
    footnote.id = 'host-settings-save-note';
    if (typeof panelRootEl.replaceChildren === 'function') {
      panelRootEl.replaceChildren(head, secCore, secTheme, secBar, footnote);
    } else {
      while (panelRootEl.firstChild) panelRootEl.removeChild(panelRootEl.firstChild);
      for (const child of [head, secCore, secTheme, secBar, footnote]) panelRootEl.appendChild(child);
    }
  }

  function deactivate() {
    active = false;
    if (mountedSidebar) {
      if (mountedSidebar.dataset) delete mountedSidebar.dataset.agPulseNavActive;
      mountedSidebar.removeAttribute('data-ag-pulse-nav-active');
    }
    if (navBtn) {
      if (navBtn.dataset) delete navBtn.dataset.active;
      navBtn.removeAttribute('data-active');
      navBtn.removeAttribute('aria-current');
    }
    if (mountedContentPane) {
      if (mountedContentPane.dataset) delete mountedContentPane.dataset.agPulseSettingsActive;
      mountedContentPane.removeAttribute('data-ag-pulse-settings-active');
    }
    if (panelHost) panelHost.hidden = true;
  }

  function activate() {
    if (disposed || !mountedSidebar || !mountedSidebar.isConnected) return;
    mountedContentPane = findContentPane(mountedSidebar);
    if (!mountedContentPane || !ensurePanelHost()) return;
    active = true;
    if (mountedSidebar.dataset) mountedSidebar.dataset.agPulseNavActive = 'true';
    mountedSidebar.setAttribute('data-ag-pulse-nav-active', 'true');
    if (navBtn) {
      if (navBtn.dataset) navBtn.dataset.active = 'true';
      navBtn.setAttribute('data-active', 'true');
      navBtn.setAttribute('aria-current', 'page');
    }
    if (mountedContentPane.dataset) mountedContentPane.dataset.agPulseSettingsActive = 'true';
    mountedContentPane.setAttribute('data-ag-pulse-settings-active', 'true');
    if (panelHost) panelHost.hidden = false;
    renderPanel(true);
  }

  function teardownSidebar() {
    if (mountedSidebar && sidebarClickHandler) {
      mountedSidebar.removeEventListener('click', sidebarClickHandler, true);
    }
    sidebarClickHandler = null;
    deactivate();
    if (panelThemeController) {
      panelThemeController.dispose?.();
      panelThemeController = null;
    }
    navWrap?.remove?.();
    panelHost?.remove?.();
    navWrap = null;
    navBtn = null;
    navLabelEl = null;
    panelHost = null;
    panelShadow = null;
    panelStyleEl = null;
    panelRootEl = null;
    mountedSidebar = null;
    mountedContentPane = null;
    lastSig = '';
  }

  function scan() {
    if (disposed || !doc) return;
    ensureGlobalStyle();
    if (mountedSidebar && !mountedSidebar.isConnected) {
      teardownSidebar();
    }
    const sidebar = doc.querySelector?.('[data-testid="settings-sidebar"]') || null;
    if (!sidebar) {
      if (mountedSidebar) teardownSidebar();
      return;
    }
    if (mountedSidebar === sidebar && sidebar.querySelector?.(`[data-testid="${NAV_TEST_ID}"]`)) {
      if (active) {
        const pane = findContentPane(sidebar);
        if (pane && pane !== mountedContentPane) {
          mountedContentPane = pane;
          ensurePanelHost();
          pane.setAttribute('data-ag-pulse-settings-active', 'true');
          renderPanel(true);
        }
      }
      return;
    }
    if (mountedSidebar && mountedSidebar !== sidebar) {
      teardownSidebar();
    }
    if (sidebar.querySelector?.(`[data-testid="${NAV_TEST_ID}"]`)) return;

    mountedSidebar = sidebar;
    mountedContentPane = findContentPane(sidebar);

    navWrap = doc.createElement('div');
    navWrap.className = 'ag-pulse-settings-nav-wrap';
    navWrap.setAttribute('data-ag-pulse-settings-nav', 'true');
    navWrap.setAttribute('data-ag-i18n-ignore', 'true');

    navBtn = doc.createElement('button');
    navBtn.type = 'button';
    navBtn.className = 'ag-pulse-settings-nav-item';
    navBtn.setAttribute('data-testid', NAV_TEST_ID);
    navBtn.setAttribute('data-ag-i18n-ignore', 'true');
    navBtn.appendChild(buildPulseIcon());
    navLabelEl = el('span', 'ag-pulse-settings-nav-label', navLabelText());
    navBtn.appendChild(navLabelEl);
    if (version) {
      navBtn.appendChild(el('span', 'ag-pulse-settings-nav-ver', `v${version}`));
    }
    navBtn.addEventListener('click', event => {
      event?.stopPropagation?.();
      activate();
    });
    navWrap.appendChild(navBtn);

    const browserEl = sidebar.querySelector?.('[data-testid="settings-nav-item-Browser"]') || null;
    if (browserEl?.parentElement) {
      const parent = browserEl.parentElement;
      const grand = parent.parentElement;
      if (parent !== sidebar && grand && sidebar.contains(grand)) {
        grand.insertBefore(navWrap, parent.nextSibling || null);
      } else {
        parent.insertBefore(navWrap, browserEl.nextSibling || null);
      }
    } else {
      const feedbackEl = sidebar.querySelector?.('[data-testid="settings-nav-item-Provide Feedback"]') || null;
      const feedbackChild = feedbackEl ? directChildIn(sidebar, feedbackEl) : null;
      if (feedbackChild) sidebar.insertBefore(navWrap, feedbackChild);
      else sidebar.appendChild(navWrap);
    }

    sidebarClickHandler = event => {
      if (!active) return;
      const kind = findNavClickKind(event?.target, sidebar);
      if (kind === 'native') deactivate();
    };
    sidebar.addEventListener('click', sidebarClickHandler, true);
  }

  const rootTarget = doc?.documentElement || doc?.body;
  if (typeof MO === 'function' && rootTarget) {
    observer = new MO(() => scan());
    observer.observe(rootTarget, { childList: true, subtree: true });
  }
  scan();

  return {
    sync() {
      if (disposed) return;
      const nextNavLabel = navLabelText();
      if (navLabelEl && navLabelEl.textContent !== nextNavLabel) navLabelEl.textContent = nextNavLabel;
      panelThemeController?.setThemeMode?.(themeModePref?.value || 'auto');
      panelThemeController?.setBarColors?.(barColorsPref?.colors || {});
      if (active) renderPanel();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect?.();
      observer = null;
      teardownSidebar();
      doc?.getElementById?.(STYLE_ID)?.remove?.();
    },
  };
};
