// End-to-end headless Chromium/Chrome CDP regression for PR #84 (main composer
// model selector truncation protection) + Issue #72 (persistent minimal/full
// strip collapse). Zero external dependencies.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { accessSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CdpConnection } from '../compat/runtime-ui.mjs';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const extract = s => s.slice(s.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');

function findBrowser() {
  const candidates = [
    process.env.AG_EDGE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const file of candidates) {
    try { accessSync(file); return file; } catch {}
  }
  return null;
}

const BROWSER_EXE = findBrowser();
if (!BROWSER_EXE) {
  console.log('SKIP: No Chromium/Chrome/Edge executable found');
  process.exit(0);
}

async function launchBrowser(userDataDir, url) {
  const child = spawn(BROWSER_EXE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, url,
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  child.unref();
  let cdp = null;
  try {
    const port = await new Promise((resolve, reject) => {
      let errText = '';
      const timer = setTimeout(() => reject(new Error('Browser start timeout: ' + errText)), 30000);
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => {
        errText += chunk;
        const m = errText.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
        if (m) { clearTimeout(timer); resolve(Number(m[1])); }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Browser exited ' + code)); });
    });
    let target;
    for (let i = 0; i < 150; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1'));
        if (target) break;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    if (!target) throw new Error('Page target not found');
    cdp = new CdpConnection(target.webSocketDebuggerUrl, { timeout: 30000 });
    await cdp.open();
    await cdp.command('Runtime.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    return { child, cdp };
  } catch (err) {
    try { cdp?.close(); } catch {}
    try { child.kill('SIGKILL'); } catch {}
    throw err;
  }
}

const [i18nSrc, themeSrc, widgetSrc, surfaceSrc] = await Promise.all(
  ['compat/i18n.cjs', 'compat/theme.cjs', 'compat/inline-widget.cjs', 'ide/surface.cjs'].map(p => readFile(join(REPO, p), 'utf8'))
);

const id = '11111111-1111-1111-1111-111111111111';
const reset5h = new Date(Date.now() + 3 * 3600000).toISOString();
const resetWk = new Date(Date.now() + 5 * 86400000).toISOString();
const speed = trajectoryMetrics({
  trajectory: {
    cascadeId: id,
    steps: [{ type: 'USER_INPUT' }],
    generatorMetadata: [{
      chatModel: {
        modelDisplayName: 'Gemini 4 Hydrogen (Medium)',
        chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 310000, maxContextTokens: 500000 } },
        usage: { messageId: 'm1', inputTokens: '1000000', cacheReadTokens: '800000', outputTokens: '50000', responseOutputTokens: '50000', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI' },
        streamingDuration: '1.5s',
      },
    }],
  },
});

let prefs = { language: 'en', languageGuideDismissed: true, revision: 1 };
let emptyConversation = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      connection: 'live', theme: 'light', preferences: prefs, serverTime: new Date().toISOString(),
      groups: [{ id: 'gemini', name: 'Gemini', windows: { '5h': { available: true, remaining: 0.8, resetAt: reset5h }, weekly: { available: true, remaining: 0.9, resetAt: resetWk } } }],
      speed: emptyConversation ? null : speed,
    }));
    return;
  }
  if (url.pathname === '/api/preferences') {
    if (req.method === 'POST') {
      const body = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(JSON.parse(d))); });
      prefs = { ...prefs, ...body, revision: prefs.revision + 1 };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(prefs));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#f5f7fb;color:#0f172a;font:13px sans-serif}
    .composer{width:880px;margin:0 auto;padding:12px;border-radius:14px;background:#fff;border:1px solid #ddd}
    .editor{height:36px}.actions{display:flex;align-items:center;justify-content:space-between;gap:6px}.left,.right{display:flex;align-items:center;gap:6px}
    [data-testid="model-selector-trigger"]{display:inline-flex;align-items:center;overflow:hidden;min-width:32px;max-width:100%}
    [data-testid="model-selector-trigger"] span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    button{background:transparent;border:0;color:inherit;height:28px;font:inherit;white-space:nowrap}
  </style></head><body><div class="composer"><div class="editor" contenteditable="true" role="combobox"></div><div class="actions"><div class="left"><button aria-label="Add">+</button><button data-testid="model-selector-trigger"><span>Gemini 4 Hydrogen (Medium)</span></button></div><div class="right"><button aria-label="Send">Send</button></div></div></div><script>
    history.replaceState({}, '', '/c/${id}');
    window.agPulseHost = {
      getMetrics: async () => (await fetch('/api/metrics')).json(),
      getPreferences: async () => (await fetch('/api/preferences')).json(),
      setPreferences: async input => (await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).json(),
      report: () => {},
    };
    window.__agPulseTestSurface = (${extract(surfaceSrc)})();
    window.__agPulseI18nFactory = (${extract(i18nSrc)});
    window.__agPulseThemeFactory = (${extract(themeSrc)});
    (${extract(widgetSrc)})();
  </script></body></html>`);
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const userDir = await mkdtemp(join(tmpdir(), 'ag-strip-ui-'));
let browser;
try {
  browser = await launchBrowser(userDir, `http://127.0.0.1:${port}/`);
  const evalJs = async fn => {
    const res = await browser.cdp.command('Runtime.evaluate', { expression: `(${fn})()`, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || 'Eval failed');
    return res.result?.value;
  };
  const waitUntil = async (fn, label) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await evalJs(fn)) return;
      await new Promise(r => setTimeout(r, 80));
    }
    throw new Error('Timeout: ' + label);
  };

  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'initial full density');

  // 0. Medium-width main composer (758px, matching real Antigravity with XHigh model)
  // keeps numbers + cache-hit visible via compact-text/tight-text instead of premature icons-only.
  await evalJs(() => { document.querySelector('.composer').style.width = '758px'; });
  await waitUntil(() => ['full', 'compact-text', 'snug-rounds', 'mini-rounds', 'tight-text'].includes(document.getElementById('ag-pulse-status-bar')?.dataset.density), '758px stays in text density');
  const medState = await evalJs(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const sr = n.shadowRoot;
    return {
      density: n.dataset.density,
      cacheHit: getComputedStyle(sr.getElementById('cache-hit')).display,
      tps: getComputedStyle(sr.getElementById('tps')).display,
      span: document.querySelector('[data-testid="model-selector-trigger"] span'),
    };
  });
  assert.notEqual(medState.cacheHit, 'none', 'cache-hit stays visible at 758px');
  assert.notEqual(medState.tps, 'none', 'tps stays visible at 758px');

  // 0b. Issue #97: long Orchestrator model name in 758px composer stays in text density
  // instead of dropping straight to icons-only, preserving primary metrics + dual quota.
  await evalJs(() => {
    document.querySelector('[data-testid="model-selector-trigger"] span').textContent = 'Orchestrator Gemini 4 Neon (Medium)';
  });
  await waitUntil(() => ['full', 'compact-text', 'snug-rounds', 'mini-rounds', 'tight-text', 'trim-hit'].includes(document.getElementById('ag-pulse-status-bar')?.dataset.density), 'long model name in 758px stays in text density');
  const longModelState = await evalJs(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const sr = n.shadowRoot;
    const span = document.querySelector('[data-testid="model-selector-trigger"] span');
    const qSec = sr.querySelector('.quota-secondary');
    return {
      density: n.dataset.density,
      cacheHit: getComputedStyle(sr.getElementById('cache-hit')).display,
      tps: getComputedStyle(sr.getElementById('tps')).display,
      quotaText: getComputedStyle(sr.getElementById('quota-text')).display,
      quotaSecondary: qSec ? getComputedStyle(qSec).display : 'missing',
      ctxPct: getComputedStyle(sr.getElementById('context-percent')).display,
      ctxRounds: getComputedStyle(sr.getElementById('context-rounds')).display,
      modelTruncated: span.scrollWidth > span.clientWidth + 1,
    };
  });
  assert.notEqual(longModelState.density, 'icons', 'long model name at 758px must not drop to icons-only');
  assert.notEqual(longModelState.cacheHit, 'none', 'cache-hit stays visible with long model name');
  assert.notEqual(longModelState.tps, 'none', 'tps stays visible with long model name');
  assert.notEqual(longModelState.quotaText, 'none', 'primary quota stays visible with long model name');
  assert.notEqual(longModelState.quotaSecondary, 'none', 'dual quota stays visible with long model name');
  assert.notEqual(longModelState.ctxPct, 'none', 'context percent stays visible with long model name');
  assert.equal(longModelState.modelTruncated, false, 'long model selector text must not be truncated');

  // Verify 758px composer with Orchestrator Gemini 4 Neon Extra High + 165px right controls
  // fits in tight-text/snug-text while keeping both #cache-hit and .quota-secondary visible,
  // and hiding speed (3-chip mode) preserves airy 11px spacing without shrinking fonts.
  await evalJs(() => {
    document.querySelector('[data-testid="model-selector-trigger"] span').textContent = 'Orchestrator Gemini 4 Neon Extra High';
    document.querySelector('.right').style.minWidth = '165px';
  });
  await waitUntil(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const sr = n?.shadowRoot;
    const hit = sr?.getElementById('cache-hit');
    const sec = sr?.querySelector('.quota-secondary');
    return ['full', 'compact-text', 'snug-rounds', 'mini-rounds', 'tight-text', 'snug-text'].includes(n?.dataset.density) && hit && getComputedStyle(hit).display !== 'none' && sec && getComputedStyle(sec).display !== 'none';
  }, '758px Orchestrator Extra High + 165px right keeps cache-hit and dual quota');
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-bar-row="speed"] [role="switch"]').click();
  });
  await waitUntil(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const sr = n?.shadowRoot;
    const rounds = sr?.getElementById('context-rounds');
    return ['full', 'compact-text', 'snug-rounds'].includes(n?.dataset.density) && rounds && getComputedStyle(rounds).display !== 'none';
  }, '3-chip Orchestrator mode preserves context rounds at 11px without tight-text hiding');
  const airy3Chip = await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    return {
      barGap: getComputedStyle(sr.querySelector('.bar')).gap,
      fontSize: getComputedStyle(sr.querySelector('[data-card="cache"]')).fontSize,
    };
  });
  assert.equal(airy3Chip.fontSize, '11px', '3-chip Orchestrator keeps crisp 11px font');
  assert.ok(['3px', '1.5px'].includes(airy3Chip.barGap), '3-chip Orchestrator keeps expected bar gap: ' + airy3Chip.barGap);
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-bar-row="speed"] [role="switch"]').click();
    sr.getElementById('pulse-settings-close').click();
    document.querySelector('.right').style.minWidth = '';
  });

  // Verify label / compact / rounds context sub-label modes stay responsive under
  // Orchestrator Gemini 4 Neon Extra High in compact-text (before tight-text drops rounds/label).
  await evalJs(`async () => {
    document.querySelector('[data-testid="model-selector-trigger"] span').textContent = 'Orchestrator Gemini 4 Neon Extra High';
    for (let w = 840; w >= 460; w -= 12) {
      document.querySelector('.composer').style.width = w + 'px';
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const d = document.getElementById('ag-pulse-status-bar')?.dataset.density;
      if (d === 'compact-text') break;
    }
  }`);
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'compact-text', 'long Orchestrator name reaches compact-text tier');
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-ctx-chip-mode="label"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => {
    const sr = document.getElementById('ag-pulse-status-bar')?.shadowRoot;
    return sr && getComputedStyle(sr.querySelector('[data-card="context"] .context-label')).display !== 'none';
  }, 'context label stays visible in compact-text tier');
  const labelState = await evalJs(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const sr = n.shadowRoot;
    return {
      density: n.dataset.density,
      label: getComputedStyle(sr.querySelector('[data-card="context"] .context-label')).display,
      rounds: getComputedStyle(sr.getElementById('context-rounds')).display,
    };
  });
  assert.ok(['full', 'compact-text', 'snug-rounds', 'mini-rounds'].includes(labelState.density), 'label check runs before tight-text hides label: ' + labelState.density);
  assert.notEqual(labelState.label, 'none', 'context label visible under long Orchestrator model');
  assert.equal(labelState.rounds, 'none', 'rounds hidden when label mode selected');

  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-ctx-chip-mode="compact"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => {
    const sr = document.getElementById('ag-pulse-status-bar')?.shadowRoot;
    return sr && getComputedStyle(sr.querySelector('[data-card="context"] .context-label')).display === 'none';
  }, 'compact mode hides context label');
  assert.equal(await evalJs(() => getComputedStyle(document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('context-rounds')).display), 'none', 'compact mode hides rounds');

  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-ctx-chip-mode="rounds"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => {
    const sr = document.getElementById('ag-pulse-status-bar')?.shadowRoot;
    return sr && getComputedStyle(sr.getElementById('context-rounds')).display !== 'none';
  }, 'rounds mode restores context rounds');

  await evalJs(() => {
    document.querySelector('.composer').style.width = '758px';
    document.querySelector('[data-testid="model-selector-trigger"] span').textContent = 'Gemini 4 Hydrogen (Medium)';
  });

  // 0c. Narrow widths degrade context rounds first (tight-text), then cache hit
  // (trim-hit), preserving dual-window quota until dense-text before icons-only.
  const setWidthAndSettle = async w => {
    return await evalJs(`async () => {
      document.querySelector('.composer').style.width = '${w}px';
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const n = document.getElementById('ag-pulse-status-bar');
      const sr = n.shadowRoot;
      const disp = sel => {
        const el = sr.querySelector(sel);
        return el ? getComputedStyle(el).display : 'missing';
      };
      return {
        density: n.dataset.density,
        rounds: disp('#context-rounds'),
        cacheHit: disp('#cache-hit'),
        cacheUnit: disp('.cache-unit'),
        quotaTag: disp('.quota-tag'),
        quotaSecondary: disp('.quota-secondary'),
        tps: disp('#tps'),
        cacheNum: disp('#cache-total-num'),
        quotaText: disp('#quota-text'),
        ctxPct: disp('#context-percent'),
      };
    }`);
  };
  let compactSnapshot = null;
  let tightSnapshot = null;
  let trimHitSnapshot = null;
  let denseSnapshot = null;
  for (let w = 680; w >= 320; w -= 6) {
    const snap = await setWidthAndSettle(w);
    if (!compactSnapshot && snap.density === 'compact-text') compactSnapshot = { width: w, ...snap };
    if (!tightSnapshot && snap.density === 'tight-text') tightSnapshot = { width: w, ...snap };
    if (!trimHitSnapshot && snap.density === 'trim-hit') trimHitSnapshot = { width: w, ...snap };
    if (!denseSnapshot && snap.density === 'dense-text') denseSnapshot = { width: w, ...snap };
    if (compactSnapshot && tightSnapshot && trimHitSnapshot && denseSnapshot) break;
  }
  if (compactSnapshot) assert.notEqual(compactSnapshot.quotaSecondary, 'none', 'compact-text preserves both-mode secondary quota');
  assert.ok(tightSnapshot, 'stepping down composer width must hit tight-text tier before trim-hit');
  assert.equal(tightSnapshot.rounds, 'none', 'tight-text hides #context-rounds first');
  assert.equal(tightSnapshot.cacheUnit, 'none', 'tight-text hides cache tok unit');
  assert.notEqual(tightSnapshot.cacheHit, 'none', 'tight-text still keeps inline cache hit');
  assert.notEqual(tightSnapshot.quotaTag, 'none', 'tight-text still keeps quota tag');
  assert.notEqual(tightSnapshot.quotaSecondary, 'none', 'tight-text still keeps dual-window secondary quota');
  assert.ok(trimHitSnapshot, 'stepping down further must hit trim-hit tier before dense-text');
  assert.equal(trimHitSnapshot.cacheHit, 'none', 'trim-hit hides inline cache hit');
  assert.notEqual(trimHitSnapshot.quotaSecondary, 'none', 'trim-hit still preserves dual-window secondary quota');
  assert.ok(denseSnapshot, 'stepping down further must hit dense-text tier before icons');
  assert.equal(denseSnapshot.rounds, 'none', 'dense-text hides #context-rounds');
  assert.equal(denseSnapshot.cacheHit, 'none', 'dense-text hides #cache-hit');
  assert.equal(denseSnapshot.quotaTag, 'none', 'dense-text hides quota tag');
  assert.equal(denseSnapshot.quotaSecondary, 'none', 'dense-text hides secondary quota');
  assert.notEqual(denseSnapshot.tps, 'none', 'dense-text keeps #tps visible');
  assert.notEqual(denseSnapshot.cacheNum, 'none', 'dense-text keeps #cache-total-num visible');
  assert.notEqual(denseSnapshot.quotaText, 'none', 'dense-text keeps #quota-text visible');
  assert.notEqual(denseSnapshot.ctxPct, 'none', 'dense-text keeps #context-percent visible');

  // 0d. Issue #106: quotaDisplay='compact' omits 5h prefix and resets density hysteresis cleanly.
  await evalJs(() => { document.querySelector('.composer').style.width = '880px'; });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'restore full before quotaDisplay check');
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-quota-display-choice="compact"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => !document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('quota-text')?.textContent.includes('5h'), 'compact quota omits 5h prefix');
  const compactQuotaText = await evalJs(() => document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('quota-text').textContent);
  assert.match(compactQuotaText, /^\d+%$/, 'compact quota renders percentage without 5h prefix');

  // Switch back to 'both' at a tight width where 'both' degrades to compact-text,
  // then switch to 'compact' and verify it recovers to full without dragging wider.
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-quota-display-choice="both"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.shadowRoot.querySelector('.quota-secondary') !== null, 'both quota restored');
  let recoveryWidth = null;
  for (let w = 640; w >= 360; w -= 8) {
    const snap = await setWidthAndSettle(w);
    if (['compact-text', 'snug-rounds', 'mini-rounds', 'tight-text', 'snug-text', 'trim-hit', 'dense-text'].includes(snap.density)) { recoveryWidth = w; break; }
  }
  assert.ok(recoveryWidth !== null, 'found tight width where both mode degrades');
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-quota-display-choice="compact"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'switching to compact quota breaks hysteresis and recovers to full');
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-quota-display-choice="both"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.shadowRoot.querySelector('.quota-secondary') !== null, 'restored both quota before PR #84 check');

  // 0e. Issue #113: quotaDisplay='weekly' pins the weekly window without 5h,
  // and cacheChipMode='hit' shows only hit rate without total tokens or leading dot even at trim-hit width.
  await evalJs(() => { document.querySelector('.composer').style.width = '880px'; });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'full width before Issue #113 check');
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-quota-display-choice="weekly"]').click();
    sr.querySelector('[data-cache-chip-mode="hit"]').click();
    sr.querySelector('#pulse-settings-dialog [data-language-choice="zh-CN"]').click();
  });
  await waitUntil(() => {
    const sr = document.getElementById('ag-pulse-status-bar')?.shadowRoot;
    return sr?.getElementById('pulse-settings-dialog')?.textContent?.includes('缓存显示');
  }, 'settings modal renders zh-CN labels');
  const kvLayout = await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    return Array.from(sr.querySelectorAll('#pulse-settings-dialog .settings-kv')).map(row => {
      const label = row.querySelector(':scope > span');
      return {
        text: label?.textContent || '',
        labelHeight: label ? label.getBoundingClientRect().height : 0,
        scrollWidth: row.scrollWidth,
        clientWidth: row.clientWidth,
      };
    });
  });
  assert.ok(kvLayout.length >= 6, 'settings modal lists kv rows');
  for (const row of kvLayout) {
    assert.ok(row.labelHeight <= 22, `settings label "${row.text}" wrapped (${row.labelHeight}px)`);
    assert.ok(row.scrollWidth <= row.clientWidth + 1, `settings row "${row.text}" overflows (${row.scrollWidth} > ${row.clientWidth})`);
  }
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('#pulse-settings-dialog [data-language-choice="en"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const qText = n?.shadowRoot?.getElementById('quota-text')?.textContent || '';
    return n?.getAttribute('data-cache-chip-mode') === 'hit' && qText.includes('90%') && !qText.includes('5h');
  }, 'weekly quota and hit-only cache mode applied');
  const issue113Full = await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    const hitEl = sr.getElementById('cache-hit');
    return {
      quotaText: sr.getElementById('quota-text').textContent,
      cacheTotalDisplay: getComputedStyle(sr.getElementById('cache-total')).display,
      cacheHitDisplay: getComputedStyle(hitEl).display,
      cacheHitText: hitEl.textContent,
      cacheHitBefore: getComputedStyle(hitEl, '::before').content,
    };
  });
  assert.match(issue113Full.quotaText, /90%/, 'weekly mode pins 90% weekly quota');
  assert.equal(issue113Full.quotaText.includes('80%'), false, 'weekly mode omits 5h percentage');
  assert.equal(issue113Full.cacheTotalDisplay, 'none', 'hit-only mode hides total token count');
  assert.notEqual(issue113Full.cacheHitDisplay, 'none', 'hit-only mode keeps #cache-hit visible');
  assert.match(issue113Full.cacheHitText, /44\.4%/, 'hit-only mode shows cache hit rate');
  assert.equal(issue113Full.cacheHitBefore, 'none', 'hit-only mode omits leading separator dot');

  let narrowHitCheck = null;
  for (let w = 640; w >= 360; w -= 8) {
    const snap = await setWidthAndSettle(w);
    if (snap.density === 'tight-text' || snap.density === 'snug-text' || snap.density === 'trim-hit') { narrowHitCheck = snap; break; }
  }
  assert.ok(narrowHitCheck, 'hit-only mode hits tight text tier before icons');
  assert.notEqual(narrowHitCheck.cacheHit, 'none', 'hit-only mode preserves #cache-hit under tight/trim-hit tiers');

  await evalJs(() => { document.querySelector('.composer').style.width = '880px'; });
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-quota-display-choice="both"]').click();
    sr.querySelector('[data-cache-chip-mode="both"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    return n?.getAttribute('data-cache-chip-mode') === 'both' && n?.shadowRoot?.querySelector('.quota-secondary') !== null;
  }, 'restored both quota and cache modes');

  // 1. PR #84: shrinking main composer preserves model selector width by dropping to icons-only
  await evalJs(() => { document.querySelector('.composer').style.width = '400px'; });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'icons', 'narrow main composer drops to icons');
  const modelTruncated = await evalJs(() => {
    const span = document.querySelector('[data-testid="model-selector-trigger"] span');
    return span.scrollWidth > span.clientWidth + 1;
  });
  assert.equal(modelTruncated, false, 'model selector text must not be truncated');

  // 2. Restore width -> click #strip-toggle -> Issue #72 minimal mode persists
  await evalJs(() => { document.querySelector('.composer').style.width = '880px'; });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'restores full');
  await evalJs(() => { document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('strip-toggle').click(); });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.stripMode === 'minimal', 'switches to minimal');
  assert.equal(prefs.stripMode, 'minimal');

  const minimalState = await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    const vis = sel => getComputedStyle(sr.querySelector(sel)).display !== 'none';
    return {
      density: document.getElementById('ag-pulse-status-bar').dataset.density,
      hasIconsOnly: document.getElementById('ag-pulse-status-bar').classList.contains('icons-only'),
      speed: vis('[data-card="speed"]'),
      cache: vis('[data-card="cache"]'),
      quota: vis('[data-card="quota"]'),
      context: vis('[data-card="context"]'),
      toggle: vis('#strip-toggle'),
    };
  });
  assert.equal(minimalState.density, 'minimal');
  assert.equal(minimalState.hasIconsOnly, true);
  assert.equal(minimalState.speed, true);
  assert.equal(minimalState.cache, true);
  assert.equal(minimalState.quota, true);
  assert.equal(minimalState.context, true);
  assert.equal(minimalState.toggle, true);

  // 3. Narrow width in minimal mode degrades to minimal-icon cleanly
  await evalJs(() => { document.querySelector('.composer').style.width = '310px'; });
  await waitUntil(() => ['minimal', 'minimal-icon'].includes(document.getElementById('ag-pulse-status-bar')?.dataset.density), 'minimal degrades cleanly');

  // 4. Restore width and expand back via hover card footer button
  await evalJs(() => { document.querySelector('.composer').style.width = '880px'; });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'minimal', 'minimal recovers');
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('strip-mode-full').click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'expands back to full via footer toggle');
  assert.equal(prefs.stripMode, 'full');

  // 5. Issue #90: empty/new conversation with valid account quota stays full when stripMode=full,
  // and collapses all text when switched to stripMode=minimal.
  emptyConversation = true;
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('.refresh')?.click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps')?.textContent === '—', 'empty conversation rendered');
  const emptyFullState = await evalJs(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const sr = n.shadowRoot;
    return {
      density: n.dataset.density,
      iconsOnly: n.classList.contains('icons-only'),
      quotaDisplay: getComputedStyle(sr.getElementById('quota-text')).display,
      quotaText: sr.getElementById('quota-text').textContent,
      tpsDisplay: getComputedStyle(sr.getElementById('tps')).display,
    };
  });
  assert.equal(emptyFullState.density, 'full', 'empty conversation with quota stays full in stripMode=full');
  assert.equal(emptyFullState.iconsOnly, false, 'must not force icons-only when quota is loaded');
  assert.notEqual(emptyFullState.quotaDisplay, 'none', '#quota-text must stay visible');
  assert.match(emptyFullState.quotaText, /80%/, '#quota-text shows remaining quota');
  assert.notEqual(emptyFullState.tpsDisplay, 'none', 'all chips stay expanded in full mode');

  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.getElementById('strip-mode-minimal').click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'minimal', 'empty conversation collapses in minimal mode');
  const emptyMinimalQuota = await evalJs(() => getComputedStyle(document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('quota-text')).display);
  assert.equal(emptyMinimalQuota, 'none', 'minimal mode hides quota text');

  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.getElementById('strip-mode-full').click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'empty conversation expands back to full');

  // 6. Flush-right alignment across model lengths & zero ghost-flash across Empty -> Type -> Clear -> Send (+Stop) -> Done
  emptyConversation = false;
  await evalJs(() => {
    const comp = document.querySelector('.composer');
    comp.style.width = '778px';
    const actions = document.querySelector('.actions');
    const left = document.querySelector('.left');
    actions.style.justifyContent = 'flex-start';
    left.style.flex = '1';
    left.style.minWidth = '0';
    const right = document.querySelector('.right');
    right.innerHTML = '<button aria-label="Mode">Turbo</button><button aria-label="Mic" style="width:24px">M</button><button id="action-btn" data-testid="voice-start-button" style="width:32px">V</button>';
  });
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('#pulse-settings-dialog [data-language-choice="zh-CN"]').click();
    sr.querySelector('[data-bar-row="speed"] [role="switch"]').click();
    sr.querySelector('[data-bar-row="speed"] [role="switch"]')?.blur?.();
    sr.getElementById('pulse-settings-close').click();
    sr.querySelector('.refresh')?.click();
  });
  await waitUntil(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const sr = n?.shadowRoot;
    const speedCard = sr?.querySelector('[data-card="speed"]');
    const rounds = sr?.getElementById('context-rounds');
    return n?.dataset.layout === 'ready' && speedCard?.hidden === true && rounds && getComputedStyle(rounds).display !== 'none';
  }, '3-chip Chinese setup for multi-model regression');

  const settleFrames = () => evalJs(`async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); }`);
  const sampleStrip = () => evalJs(() => {
    const w = document.getElementById('ag-pulse-status-bar');
    const sr = w.shadowRoot;
    const wRect = w.getBoundingClientRect();
    const triggerRect = document.querySelector('[data-testid="model-selector-trigger"]').getBoundingClientRect();
    const rightRect = document.querySelector('.right').getBoundingClientRect();
    const span = document.querySelector('[data-testid="model-selector-trigger"] span');
    return {
      left: wRect.left,
      right: wRect.right,
      leftGap: wRect.left - triggerRect.right,
      rightGap: rightRect.left - wRect.right,
      density: w.dataset.density,
      roundsDisp: getComputedStyle(sr.getElementById('context-rounds')).display,
      modelTruncated: span.scrollWidth > span.clientWidth + 1,
      rightPadProp: w.style.getPropertyValue('--pulse-right-pad'),
      stages: window.__jumpStages || 0,
    };
  });

  const modelCases = [
    { name: 'Gemini Flash', width: 778, short: true, lifecycle: false },
    { name: 'Gemini Flash', width: 920, short: true, lifecycle: false },
    { name: 'Gemini 4 Hydrogen Medium', width: 778, short: true, lifecycle: true },
    { name: 'Gemini 4 Hydrogen Medium', width: 920, short: true, lifecycle: false },
    { name: 'Claude Opus 4.6 (Thinking)', width: 778, short: false, lifecycle: false },
    { name: 'Orchestrator Gemini 4 Neon Extra High', width: 778, short: false, lifecycle: true },
  ];

  for (const mc of modelCases) {
    await evalJs(`() => {
      document.querySelector('.composer').style.width = '${mc.width}px';
      document.querySelector('[data-testid="model-selector-trigger"] span').textContent = ${JSON.stringify(mc.name)};
      document.querySelector('.editor').replaceChildren();
      document.getElementById('stop')?.remove();
      const btn = document.getElementById('action-btn');
      btn.dataset.testid = 'voice-start-button';
      btn.textContent = 'V';
      const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
      window.__jumpStages = 0;
      window.__jumpObs?.disconnect();
      window.__jumpObs = new MutationObserver(rs => {
        for (const r of rs) for (const n of r.addedNodes) if (n.classList?.contains('density-stage')) window.__jumpStages++;
      });
      window.__jumpObs.observe(sr, { childList: true });
    }`);
    await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.layout === 'ready', `${mc.name} @ ${mc.width}px ready`);
    await settleFrames();
    await evalJs(() => { window.__jumpStages = 0; });

    const idleSnap = await sampleStrip();
    assert.equal(idleSnap.rightPadProp, '', `${mc.name} @ ${mc.width}px has no --pulse-right-pad`);
    assert.ok(idleSnap.rightGap >= 0 && idleSnap.rightGap <= 14, `${mc.name} @ ${mc.width}px flush right rightGap=${idleSnap.rightGap}`);
    assert.notEqual(idleSnap.roundsDisp, 'none', `${mc.name} @ ${mc.width}px keeps rounds visible (density=${idleSnap.density})`);
    assert.equal(idleSnap.modelTruncated, false, `${mc.name} @ ${mc.width}px preserves model label`);
    if (mc.short) {
      assert.ok(idleSnap.leftGap > 40, `${mc.name} @ ${mc.width}px leaves spare gap on left (leftGap=${idleSnap.leftGap})`);
      assert.equal(idleSnap.density, 'full', `${mc.name} @ ${mc.width}px stays full density`);
    }

    if (mc.lifecycle) {
      // Type -> swap Voice 32px -> Send 32px in-place + DOM child inside editor
      await evalJs(() => {
        const ed = document.querySelector('.editor');
        const p = document.createElement('p'); p.textContent = 'hello typing test';
        ed.replaceChildren(p);
        const btn = document.getElementById('action-btn');
        btn.dataset.testid = 'send-button';
        btn.textContent = '^';
      });
      await settleFrames();
      const typeSnap = await sampleStrip();

      // Clear -> swap Send 32px -> Voice 32px in-place + clear editor
      await evalJs(() => {
        document.querySelector('.editor').replaceChildren();
        const btn = document.getElementById('action-btn');
        btn.dataset.testid = 'voice-start-button';
        btn.textContent = 'V';
      });
      await settleFrames();
      const clearSnap = await sampleStrip();

      // Send -> add Stop (+32px on right)
      await evalJs(() => {
        const r = document.querySelector('.right');
        const stop = document.createElement('button'); stop.id = 'stop'; stop.dataset.testid = 'stop-button'; stop.style.width = '32px'; stop.textContent = 'X';
        r.append(stop);
      });
      await settleFrames();
      const sendSnap = await sampleStrip();

      // Done -> remove Stop
      await evalJs(() => {
        document.getElementById('stop')?.remove();
      });
      await settleFrames();
      const doneSnap = await sampleStrip();

      for (const [stateName, s] of [['type', typeSnap], ['clear', clearSnap], ['done', doneSnap]]) {
        assert.ok(Math.abs(s.left - idleSnap.left) <= 1, `${mc.name} ${stateName} left=${s.left} drifted from idle=${idleSnap.left}`);
        assert.ok(Math.abs(s.right - idleSnap.right) <= 1, `${mc.name} ${stateName} right=${s.right} drifted from idle=${idleSnap.right}`);
      }
      for (const [stateName, s] of [['idle', idleSnap], ['type', typeSnap], ['clear', clearSnap], ['send', sendSnap], ['done', doneSnap]]) {
        assert.ok(s.rightGap >= 0 && s.rightGap <= 14, `${mc.name} ${stateName} rightGap=${s.rightGap} stays flush right`);
        assert.notEqual(s.roundsDisp, 'none', `${mc.name} ${stateName} keeps rounds visible (density=${s.density})`);
        assert.equal(s.modelTruncated, false, `${mc.name} ${stateName} preserves model label`);
        assert.equal(s.stages, 0, `${mc.name} ${stateName} spawned zero density-stage ghost flashes`);
      }
    }
    await evalJs(() => window.__jumpObs?.disconnect());
  }

  console.log('PASS: check-strip-collapse-ui (PR #84 + Issue #72 + Issue #90 + multi-model flush-right stability)');
} finally {
  if (browser) {
    try { browser.cdp.close(); } catch {}
    try { browser.child.kill('SIGKILL'); } catch {}
  }
  server.close();
  await rm(userDir, { recursive: true, force: true });
}
