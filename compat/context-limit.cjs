// Shared, serializable context-limit policy resolver and RPC JSON interceptor.
// Applies user-configured global and per-model checkpoint maxTokenLimit caps
// without modifying host binaries or app archives.
module.exports = function createContextLimitEngine() {
  const MIN_LIMIT = 16384;
  const MAX_LIMIT = 2097152;
  const MAX_OVERRIDES = 64;
  const PRESETS = [128000, 256000, 320000, 512000];
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  function normalizeModelKey(raw) {
    if (typeof raw !== 'string') return '';
    const cleaned = raw.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    return cleaned && !FORBIDDEN_KEYS.has(cleaned) ? cleaned : '';
  }

  function isValidLimit(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= MIN_LIMIT && value <= MAX_LIMIT;
  }

  function parseTokenInput(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isValidLimit(raw) ? raw : null;
    const text = String(raw).trim().replace(/,/g, '').replace(/\s+/g, '');
    if (!text) return null;
    const match = text.match(/^(\d+(?:\.\d+)?)(k|m)?$/i);
    if (!match) return null;
    const num = Number(match[1]);
    if (!Number.isFinite(num) || num <= 0) return null;
    const unit = (match[2] || '').toLowerCase();
    let tokens;
    if (unit === 'm') tokens = Math.round(num * 1000000);
    else if (unit === 'k') tokens = Math.round(num * 1000);
    else tokens = num < 10000 ? Math.round(num * 1000) : Math.round(num);
    return isValidLimit(tokens) ? tokens : null;
  }

  function formatLimitShort(tokens) {
    if (!isValidLimit(tokens)) return '—';
    if (tokens >= 1000000 && tokens % 100000 === 0) {
      const m = tokens / 1000000;
      return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
    }
    const k = tokens / 1000;
    return `${Number.isInteger(k) ? k : Number(k.toFixed(1))}K`;
  }

  function normalizePolicy(raw) {
    const globalLimit = isValidLimit(raw?.globalLimit) ? raw.globalLimit
      : isValidLimit(raw?.contextLimitTokens) ? raw.contextLimitTokens : null;
    const src = raw?.overrides && typeof raw.overrides === 'object' && !Array.isArray(raw.overrides)
      ? raw.overrides
      : (raw?.contextLimitOverrides && typeof raw.contextLimitOverrides === 'object' && !Array.isArray(raw.contextLimitOverrides)
        ? raw.contextLimitOverrides : null);
    const overrides = Object.create(null);
    let count = 0;
    if (src) {
      for (const [rawKey, val] of Object.entries(src)) {
        if (count >= MAX_OVERRIDES) break;
        const key = normalizeModelKey(rawKey);
        if (!key) continue;
        if (val === 0 || isValidLimit(val)) {
          overrides[key] = val;
          count++;
        }
      }
    }
    return { globalLimit, overrides: { ...overrides } };
  }

  function normalizeCatalog(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [], seen = new Set();
    for (const item of raw) {
      const id = normalizeModelKey(item?.id || '');
      const label = normalizeModelKey(item?.label || '');
      if (!id || !label || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, label });
      if (out.length >= 128) break;
    }
    return out;
  }

  function enumNumberToId(num) {
    const n = Number(num);
    if (!Number.isSafeInteger(n) || n < 1000 || n >= 2000) return '';
    return `MODEL_PLACEHOLDER_M${n - 1000}`;
  }

  function resolveCatalogLabel(rawModel, catalog) {
    const list = Array.isArray(catalog) ? catalog : [];
    const rawStr = typeof rawModel === 'number' ? enumNumberToId(rawModel) : normalizeModelKey(String(rawModel || ''));
    if (!rawStr) return '';
    const lower = rawStr.toLowerCase();
    const withoutPrefix = lower.replace(/^model_/, '');
    for (const entry of list) {
      const entryId = String(entry?.id || '').toLowerCase();
      const entryLabel = String(entry?.label || '').toLowerCase();
      if (entryId === lower || entryId.replace(/^model_/, '') === withoutPrefix || entryLabel === lower) {
        return entry.label;
      }
    }
    return '';
  }

  function extractRequestModels(payload) {
    if (!payload || typeof payload !== 'object') return [];
    const cfg = payload.cascadeConfig || payload.cascade_config;
    const planner = cfg?.plannerConfig || cfg?.planner_config;
    if (!planner || typeof planner !== 'object') return [];
    const reqModel = planner.requestedModel || planner.requested_model;
    const candidates = [
      reqModel?.model,
      reqModel?.alias,
      planner.planModel,
      planner.plan_model,
      planner.modelName,
      planner.model_name,
    ];
    const out = [];
    for (const item of candidates) {
      if (typeof item === 'number' && Number.isSafeInteger(item) && item > 0) {
        const mapped = enumNumberToId(item);
        if (mapped && !out.includes(mapped)) out.push(mapped);
      } else if (typeof item === 'string') {
        const key = normalizeModelKey(item);
        if (key && !out.includes(key)) out.push(key);
      }
    }
    return out;
  }

  function resolveEffectiveLimit(policyInput, modelRefs, catalog = []) {
    const policy = normalizePolicy(policyInput);
    const refs = Array.isArray(modelRefs) ? modelRefs : (modelRefs ? [modelRefs] : []);
    const lookupKeys = [];
    const addKey = key => {
      const clean = normalizeModelKey(key);
      if (clean && !lookupKeys.includes(clean)) lookupKeys.push(clean);
    };
    for (const ref of refs) {
      const label = resolveCatalogLabel(ref, catalog);
      if (label) addKey(label);
      if (typeof ref === 'number') addKey(enumNumberToId(ref));
      else if (typeof ref === 'string') addKey(ref);
    }
    const lowerIndex = new Map();
    for (const [k, v] of Object.entries(policy.overrides)) lowerIndex.set(k.toLowerCase(), [k, v]);
    for (const candidate of lookupKeys) {
      const hit = Object.hasOwn(policy.overrides, candidate)
        ? [candidate, policy.overrides[candidate]]
        : lowerIndex.get(candidate.toLowerCase());
      if (hit) {
        const [matchedKey, value] = hit;
        if (value === 0) return { tokens: null, source: 'override-default', matchedKey, resolvedModel: lookupKeys[0] || matchedKey };
        if (isValidLimit(value)) return { tokens: value, source: 'override', matchedKey, resolvedModel: lookupKeys[0] || matchedKey };
      }
    }
    if (isValidLimit(policy.globalLimit)) {
      return { tokens: policy.globalLimit, source: 'global', matchedKey: null, resolvedModel: lookupKeys[0] || null };
    }
    return { tokens: null, source: 'default', matchedKey: null, resolvedModel: lookupKeys[0] || null };
  }

  function applyLimitToPayload(payload, effective) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !isValidLimit(effective?.tokens)) {
      return { modified: false, payload };
    }
    const useSnake = Object.hasOwn(payload, 'cascade_config') && !Object.hasOwn(payload, 'cascadeConfig');
    const cfgKey = useSnake ? 'cascade_config' : 'cascadeConfig';
    const cpKey = useSnake ? 'checkpoint_config' : 'checkpointConfig';
    const limitKey = useSnake ? 'max_token_limit' : 'maxTokenLimit';
    const windowKey = useSnake ? 'context_window' : 'contextWindow';
    const prevCfg = payload[cfgKey] && typeof payload[cfgKey] === 'object' ? payload[cfgKey] : {};
    const prevCp = prevCfg[cpKey] && typeof prevCfg[cpKey] === 'object' ? prevCfg[cpKey] : {};
    const nextCp = { ...prevCp, [limitKey]: effective.tokens };
    // Clear discrete contextWindow label so explicit maxTokenLimit governs cleanly.
    if (Object.hasOwn(nextCp, windowKey)) delete nextCp[windowKey];
    const nextPayload = { ...payload, [cfgKey]: { ...prevCfg, [cpKey]: nextCp } };
    return { modified: true, payload: nextPayload };
  }

  function transformSendPayload(payload, policyInput, catalog = []) {
    const models = extractRequestModels(payload);
    const effective = resolveEffectiveLimit(policyInput, models, catalog);
    const applied = applyLimitToPayload(payload, effective);
    return { modified: applied.modified, payload: applied.payload, effective, models };
  }

  function transformWebSocketFrame(rawData, policyInput, catalog = []) {
    if (typeof rawData !== 'string' || !rawData.includes('SendUserCascadeMessage')) {
      return { handled: false, modified: false, output: rawData };
    }
    let frame;
    try { frame = JSON.parse(rawData); } catch { return { handled: false, modified: false, output: rawData }; }
    if (!frame || typeof frame !== 'object' || frame.type !== 'start' || !String(frame.procedure || '').includes('SendUserCascadeMessage')) {
      return { handled: false, modified: false, output: rawData };
    }
    const payloadIsString = typeof frame.payload === 'string';
    let payloadObj = frame.payload;
    if (payloadIsString) {
      try { payloadObj = JSON.parse(frame.payload); } catch { return { handled: true, modified: false, output: rawData }; }
    }
    if (!payloadObj || typeof payloadObj !== 'object') {
      return { handled: true, modified: false, output: rawData };
    }
    const result = transformSendPayload(payloadObj, policyInput, catalog);
    if (!result.modified) return { handled: true, modified: false, output: rawData, effective: result.effective };
    const nextFrame = { ...frame, payload: payloadIsString ? JSON.stringify(result.payload) : result.payload };
    return { handled: true, modified: true, output: JSON.stringify(nextFrame), effective: result.effective };
  }

  function transformFetchBody(url, body, contentType, policyInput, catalog = []) {
    if (!String(url || '').includes('SendUserCascadeMessage')) {
      return { handled: false, modified: false, output: body };
    }
    if (contentType && !/json/i.test(String(contentType))) {
      return { handled: false, modified: false, output: body };
    }
    let text = null, binaryType = null;
    if (typeof body === 'string') text = body;
    else if (body instanceof Uint8Array || ArrayBuffer.isView(body)) {
      binaryType = 'uint8';
      try { text = new TextDecoder().decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)); } catch { return { handled: false, modified: false, output: body }; }
    } else if (body instanceof ArrayBuffer) {
      binaryType = 'arraybuffer';
      try { text = new TextDecoder().decode(new Uint8Array(body)); } catch { return { handled: false, modified: false, output: body }; }
    } else {
      return { handled: false, modified: false, output: body };
    }
    if (!text || text[0] !== '{') return { handled: false, modified: false, output: body };
    let payloadObj;
    try { payloadObj = JSON.parse(text); } catch { return { handled: false, modified: false, output: body }; }
    const result = transformSendPayload(payloadObj, policyInput, catalog);
    if (!result.modified) return { handled: true, modified: false, output: body, effective: result.effective };
    const serialized = JSON.stringify(result.payload);
    if (binaryType === 'uint8') return { handled: true, modified: true, output: new TextEncoder().encode(serialized), effective: result.effective };
    if (binaryType === 'arraybuffer') return { handled: true, modified: true, output: new TextEncoder().encode(serialized).buffer, effective: result.effective };
    return { handled: true, modified: true, output: serialized, effective: result.effective };
  }

  function installInterceptor({ win = globalThis, getPolicy, getCatalog } = {}) {
    let active = true;
    let lastApplied = null;
    const record = (transport, effective) => {
      if (!effective) return;
      lastApplied = { transport, tokens: effective.tokens, source: effective.source, model: effective.resolvedModel || effective.matchedKey || null, at: new Date().toISOString() };
    };

    const wsProto = win?.WebSocket?.prototype;
    const origWsSend = typeof wsProto?.send === 'function' ? wsProto.send : null;
    let wrappedWsSend = null;
    if (origWsSend) {
      wrappedWsSend = function agPulseContextLimitWsSend(data) {
        let nextData = data;
        if (active && typeof data === 'string' && String(this?.url || '').includes('/connect-websocket') && data.includes('SendUserCascadeMessage')) {
          try {
            const tx = transformWebSocketFrame(data, getPolicy?.(), getCatalog?.());
            if (tx.handled) record('websocket', tx.effective);
            if (tx.modified) nextData = tx.output;
          } catch { /* Never block or break outgoing user messages. */ }
        }
        return origWsSend.call(this, nextData);
      };
      wsProto.send = wrappedWsSend;
    }

    const origFetch = typeof win?.fetch === 'function' ? win.fetch : null;
    let wrappedFetch = null;
    if (origFetch) {
      wrappedFetch = function agPulseContextLimitFetch(resource, init) {
        let nextInit = init;
        if (active && init && init.body) {
          try {
            const url = typeof resource === 'string' ? resource : (resource?.url || '');
            if (url.includes('SendUserCascadeMessage')) {
              const hdrs = init.headers;
              const ct = typeof hdrs?.get === 'function'
                ? (hdrs.get('content-type') || hdrs.get('Content-Type') || '')
                : (hdrs && typeof hdrs === 'object' ? (hdrs['content-type'] || hdrs['Content-Type'] || '') : '');
              const tx = transformFetchBody(url, init.body, ct, getPolicy?.(), getCatalog?.());
              if (tx.handled) record('fetch', tx.effective);
              if (tx.modified) nextInit = { ...init, body: tx.output };
            }
          } catch { /* Never block or break outgoing user messages. */ }
        }
        return origFetch.call(this, resource, nextInit);
      };
      win.fetch = wrappedFetch;
    }

    const status = () => ({
      active,
      policy: normalizePolicy(getPolicy?.()),
      catalogCount: Array.isArray(getCatalog?.()) ? getCatalog().length : 0,
      lastApplied,
    });
    if (win) win.__agPulseContextLimitStatus = status;

    return {
      status,
      dispose() {
        if (!active) return;
        active = false;
        if (wsProto && wrappedWsSend && wsProto.send === wrappedWsSend) wsProto.send = origWsSend;
        if (win && wrappedFetch && win.fetch === wrappedFetch) win.fetch = origFetch;
        if (win && win.__agPulseContextLimitStatus === status) delete win.__agPulseContextLimitStatus;
      },
    };
  }

  function mountControl({ container, language, controller, getModels = () => [], getActiveModel = () => '', onLayout = () => {} }) {
    const doc = container.ownerDocument;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    let expanded = false, scope = 'global', selectedModel = '', validationError = '', disposed = false;

    const el = (tag, className, text) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    const wrap = el('div', 'ctx-cap');
    const head = el('div', 'ctx-cap-head');
    const labelEl = el('span', 'ctx-cap-label');
    const toggleBtn = el('button', 'ctx-cap-toggle');
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-expanded', 'false');
    const toggleText = el('span', 'ctx-cap-toggle-text');
    const chevron = doc.createElementNS(SVG_NS, 'svg');
    chevron.setAttribute('viewBox', '0 0 16 16');
    chevron.setAttribute('aria-hidden', 'true');
    chevron.setAttribute('class', 'ctx-cap-chevron');
    const chevronPath = doc.createElementNS(SVG_NS, 'path');
    chevronPath.setAttribute('d', 'm4 6 4 4 4-4');
    chevron.append(chevronPath);
    toggleBtn.append(toggleText, chevron);
    head.append(labelEl, toggleBtn);

    const body = el('div', 'ctx-cap-body');
    body.hidden = true;

    const scopeRow = el('div', 'ctx-cap-scope');
    scopeRow.setAttribute('role', 'group');
    const globalBtn = el('button', 'ctx-cap-seg');
    globalBtn.type = 'button';
    globalBtn.dataset.ctxScope = 'global';
    const modelBtn = el('button', 'ctx-cap-seg');
    modelBtn.type = 'button';
    modelBtn.dataset.ctxScope = 'model';
    scopeRow.append(globalBtn, modelBtn);

    const modelRow = el('div', 'ctx-cap-model-row');
    modelRow.hidden = true;
    const modelSelect = el('select', 'ctx-cap-select');
    modelRow.append(modelSelect);

    const presetsRow = el('div', 'ctx-cap-presets');

    const customRow = el('div', 'ctx-cap-custom');
    const customInput = el('input', 'ctx-cap-input');
    customInput.type = 'text';
    customInput.inputMode = 'decimal';
    customInput.autocomplete = 'off';
    customInput.spellcheck = false;
    const applyBtn = el('button', 'ctx-cap-apply');
    applyBtn.type = 'button';
    customRow.append(customInput, applyBtn);

    const errEl = el('p', 'ctx-cap-error');
    errEl.hidden = true;

    const overridesWrap = el('div', 'ctx-cap-overrides');
    overridesWrap.hidden = true;

    body.append(scopeRow, modelRow, presetsRow, customRow, errEl, overridesWrap);
    wrap.append(head, body);
    container.append(wrap);

    const availableModels = () => {
      const policy = normalizePolicy(controller.value);
      const active = normalizeModelKey(getActiveModel?.() || '');
      const catalog = normalizeCatalog(getModels?.() || []);
      const list = [], seen = new Set();
      const push = name => {
        const key = normalizeModelKey(name);
        if (!key || seen.has(key.toLowerCase())) return;
        seen.add(key.toLowerCase());
        list.push(key);
      };
      if (active) push(active);
      for (const item of catalog) push(item.label);
      for (const key of Object.keys(policy.overrides)) push(key);
      return { list, active, catalog };
    };

    const currentTargetModel = () => {
      const { list, active } = availableModels();
      if (selectedModel && list.includes(selectedModel)) return selectedModel;
      if (active && list.includes(active)) return active;
      return list[0] || '';
    };

    const applyCustom = () => {
      const parsed = parseTokenInput(customInput.value);
      if (parsed === null) {
        validationError = 'contextCapInvalid';
        update();
        return;
      }
      validationError = '';
      if (scope === 'model') {
        const target = currentTargetModel();
        if (!target) { validationError = 'contextCapNoModel'; update(); return; }
        selectedModel = target;
        void controller.setOverride(target, parsed);
      } else {
        void controller.setGlobal(parsed);
      }
      customInput.value = '';
      update();
    };

    const onToggle = () => {
      expanded = !expanded;
      validationError = '';
      if (expanded && !selectedModel) selectedModel = currentTargetModel();
      update();
      onLayout();
    };
    const onScopeGlobal = () => { scope = 'global'; validationError = ''; update(); onLayout(); };
    const onScopeModel = () => { scope = 'model'; validationError = ''; selectedModel = currentTargetModel(); update(); onLayout(); };
    const onModelChange = () => { selectedModel = modelSelect.value; validationError = ''; update(); };
    const onInputKey = event => {
      if (event.key === 'Enter') { event.preventDefault(); applyCustom(); }
      else if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); expanded = false; update(); onLayout(); toggleBtn.focus({ preventScroll: true }); }
    };
    const onInputChange = () => { if (validationError) { validationError = ''; update(); } };

    toggleBtn.addEventListener('click', onToggle);
    globalBtn.addEventListener('click', onScopeGlobal);
    modelBtn.addEventListener('click', onScopeModel);
    modelSelect.addEventListener('change', onModelChange);
    applyBtn.addEventListener('click', applyCustom);
    customInput.addEventListener('keydown', onInputKey);
    customInput.addEventListener('input', onInputChange);

    let lastModelsSig = '', lastPresetsSig = '', lastOverridesSig = '';

    function update() {
      if (disposed) return;
      const t = language.t;
      const policy = normalizePolicy(controller.value);
      const { list, active, catalog } = availableModels();
      const targetModel = currentTargetModel();
      if (targetModel && !selectedModel) selectedModel = targetModel;

      const effective = resolveEffectiveLimit(policy, active ? [active] : [], catalog);
      let badgeText;
      if (effective.source === 'override') badgeText = t('contextCapOverrideBadge', { limit: formatLimitShort(effective.tokens) });
      else if (effective.source === 'override-default') badgeText = t('contextCapOverrideDefaultBadge');
      else if (effective.source === 'global') badgeText = t('contextCapGlobalBadge', { limit: formatLimitShort(effective.tokens) });
      else badgeText = t('contextCapDefault');

      if (labelEl.textContent !== t('contextCap')) labelEl.textContent = t('contextCap');
      if (toggleText.textContent !== badgeText) toggleText.textContent = badgeText;
      toggleBtn.dataset.active = String(effective.source !== 'default');
      toggleBtn.dataset.saveFailed = String(controller.error);
      toggleBtn.setAttribute('aria-expanded', String(expanded));
      body.hidden = !expanded;

      if (!expanded) return;

      globalBtn.textContent = t('contextCapScopeGlobal');
      globalBtn.setAttribute('aria-pressed', String(scope === 'global'));
      modelBtn.textContent = t('contextCapScopeModel');
      modelBtn.setAttribute('aria-pressed', String(scope === 'model'));
      modelRow.hidden = scope !== 'model';

      const modelsSig = JSON.stringify([list, language.language]);
      if (modelsSig !== lastModelsSig) {
        lastModelsSig = modelsSig;
        if (list.length) {
          modelSelect.replaceChildren(...list.map(name => new Option(name, name)));
          modelSelect.disabled = false;
        } else {
          const emptyOpt = new Option(t('contextCapNoModel'), '');
          emptyOpt.disabled = true;
          modelSelect.replaceChildren(emptyOpt);
          modelSelect.disabled = true;
        }
      }
      if (targetModel && modelSelect.value !== targetModel) modelSelect.value = targetModel;

      const activeOverrideVal = scope === 'model' && targetModel && Object.hasOwn(policy.overrides, targetModel)
        ? policy.overrides[targetModel] : undefined;
      const presetItems = scope === 'global'
        ? [{ key: 'default', label: t('contextCapDefault'), value: null, pressed: policy.globalLimit === null },
           ...PRESETS.map(v => ({ key: String(v), label: formatLimitShort(v), value: v, pressed: policy.globalLimit === v }))]
        : [{ key: 'inherit', label: t('contextCapFollowGlobal'), value: null, pressed: activeOverrideVal === undefined },
           { key: 'host-default', label: t('contextCapHostDefault'), value: 0, pressed: activeOverrideVal === 0 },
           ...[256000, 320000, 512000].map(v => ({ key: String(v), label: formatLimitShort(v), value: v, pressed: activeOverrideVal === v }))];

      const presetsSig = JSON.stringify([scope, targetModel, presetItems.map(p => [p.key, p.label, p.pressed]), language.language]);
      if (presetsSig !== lastPresetsSig) {
        lastPresetsSig = presetsSig;
        presetsRow.replaceChildren(...presetItems.map(item => {
          const btn = el('button', 'ctx-cap-preset', item.label);
          btn.type = 'button';
          btn.dataset.ctxPreset = item.key;
          btn.setAttribute('aria-pressed', String(item.pressed));
          if (scope === 'model' && !targetModel) btn.disabled = true;
          btn.addEventListener('click', () => {
            validationError = '';
            if (scope === 'global') void controller.setGlobal(item.value);
            else if (targetModel) {
              selectedModel = targetModel;
              void controller.setOverride(targetModel, item.value);
            }
            update();
          });
          return btn;
        }));
      }

      if (customInput.placeholder !== t('contextCapPlaceholder')) customInput.placeholder = t('contextCapPlaceholder');
      if (applyBtn.textContent !== t('contextCapApply')) applyBtn.textContent = t('contextCapApply');
      applyBtn.disabled = scope === 'model' && !targetModel;

      const errKey = validationError || (controller.error ? 'contextCapSaveFailed' : '');
      errEl.hidden = !errKey;
      if (errKey && errEl.textContent !== t(errKey)) errEl.textContent = t(errKey);

      const overrideEntries = Object.entries(policy.overrides);
      overridesWrap.hidden = !overrideEntries.length;
      const overridesSig = JSON.stringify([overrideEntries, language.language]);
      if (overridesSig !== lastOverridesSig) {
        lastOverridesSig = overridesSig;
        overridesWrap.replaceChildren(...overrideEntries.map(([modelKey, val]) => {
          const chip = el('div', 'ctx-cap-chip');
          const selectChipBtn = el('button', 'ctx-cap-chip-main', `${modelKey} · ${val === 0 ? t('contextCapHostDefault') : formatLimitShort(val)}`);
          selectChipBtn.type = 'button';
          selectChipBtn.title = modelKey;
          selectChipBtn.addEventListener('click', () => {
            scope = 'model';
            selectedModel = modelKey;
            validationError = '';
            update();
            onLayout();
          });
          const removeBtn = el('button', 'ctx-cap-chip-rm', '×');
          removeBtn.type = 'button';
          removeBtn.setAttribute('aria-label', t('contextCapRemoveOverride', { model: modelKey }));
          removeBtn.title = t('contextCapRemoveOverride', { model: modelKey });
          removeBtn.addEventListener('click', () => {
            validationError = '';
            void controller.clearOverride(modelKey);
            update();
            onLayout();
          });
          chip.append(selectChipBtn, removeBtn);
          return chip;
        }));
      }
    }

    update();
    return {
      element: wrap,
      update,
      isExpanded() { return expanded; },
      collapse() { if (expanded) { expanded = false; validationError = ''; update(); } },
      dispose() {
        disposed = true;
        toggleBtn.removeEventListener('click', onToggle);
        globalBtn.removeEventListener('click', onScopeGlobal);
        modelBtn.removeEventListener('click', onScopeModel);
        modelSelect.removeEventListener('change', onModelChange);
        applyBtn.removeEventListener('click', applyCustom);
        customInput.removeEventListener('keydown', onInputKey);
        customInput.removeEventListener('input', onInputChange);
        wrap.remove();
      },
    };
  }

  return {
    MIN_LIMIT,
    MAX_LIMIT,
    MAX_OVERRIDES,
    PRESETS,
    normalizeModelKey,
    isValidLimit,
    parseTokenInput,
    formatLimitShort,
    normalizePolicy,
    normalizeCatalog,
    resolveCatalogLabel,
    extractRequestModels,
    resolveEffectiveLimit,
    applyLimitToPayload,
    transformSendPayload,
    transformWebSocketFrame,
    transformFetchBody,
    installInterceptor,
    mountControl,
  };
};
