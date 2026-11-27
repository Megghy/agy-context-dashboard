// End-to-end headless Chrome CDP regression & live interactive preview for
// Issue #112 (optional dedicated footer row barPlacement='footer'|'inline').
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

const PREVIEW = process.argv.includes('--preview');
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

async function launchBrowser(exe, userDataDir, url) {
  const child = spawn(exe, [
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
    steps: Array.from({ length: 18 }, () => ({ type: 'USER_INPUT' })),
    generatorMetadata: [{
      chatModel: {
        modelDisplayName: 'Orchestrator Gemini 4 Neon Extra High',
        chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 370000, maxContextTokens: 500000 } },
        usage: { messageId: 'm1', inputTokens: '19600000', cacheReadTokens: '18424000', outputTokens: '50000', responseOutputTokens: '50000', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI' },
        streamingDuration: '1.2s',
      },
    }],
  },
});

let prefs = {
  language: 'zh-CN',
  languageGuideDismissed: true,
  quotaDisplay: 'both',
  inlineCacheHit: true,
  barPlacement: PREVIEW ? 'footer' : 'inline',
  revision: 1,
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      connection: 'live',
      theme: url.searchParams.get('theme') === 'dark' ? 'dark' : 'light',
      preferences: prefs,
      serverTime: new Date().toISOString(),
      groups: [{
        id: 'gemini',
        name: 'Gemini',
        windows: {
          '5h': { available: true, remaining: 0.72, resetAt: reset5h },
          weekly: { available: true, remaining: 0.57, resetAt: resetWk },
        },
      }],
      speed,
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
  res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Issue #112 · 底栏底部独立一行效果预览</title><style>
    :root{--bg:#f5f7fb;--card:#ffffff;--border:#dfe3eb;--fg:#111827;--muted:#6b7280;--pill:#f3f4f6;--primary:#2563eb}
    body.dark{--bg:#14161a;--card:#1e2128;--border:#2f3440;--fg:#e5e7eb;--muted:#9ca3af;--pill:#272b34;--primary:#58a6ff}
    *{box-sizing:border-box}
    body{margin:0;padding:28px 20px;background:var(--bg);color:var(--fg);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
    .preview-tools{max-width:758px;margin:0 auto 24px;padding:12px 14px;border-radius:12px;background:var(--card);border:1px solid var(--border);display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;font-size:12px}
    .preview-tools label{display:inline-flex;align-items:center;gap:6px}
    .preview-tools select,.preview-tools button{font:inherit;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--pill);color:var(--fg);cursor:pointer}
    .preview-tools button.active{background:var(--primary);border-color:var(--primary);color:#fff;font-weight:600}
    .preview-note{width:100%;color:var(--muted);font-size:12px}
    .composer{width:758px;max-width:100%;margin:140px auto 0;padding:12px 14px 8px;border-radius:16px;background:var(--card);border:1px solid var(--border);box-shadow:0 4px 16px rgba(15,23,42,.06)}
    .editor{height:38px;color:var(--muted);font-size:14px;line-height:22px;outline:none}
    .actions{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:30px}
    .left,.right{display:flex;align-items:center;gap:6px;min-width:0}
    .right{flex:none;margin-left:auto}
    [data-testid="model-selector-trigger"]{display:inline-flex;align-items:center;gap:4px;overflow:hidden;min-width:32px;max-width:100%;font-weight:500}
    [data-testid="model-selector-trigger"] span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .host-btn{background:transparent;border:0;color:inherit;height:28px;font:inherit;white-space:nowrap;padding:0 6px;border-radius:6px}
    .host-pill{display:inline-flex;align-items:center;gap:4px;padding:0 8px;height:28px;border-radius:8px;color:var(--muted)}
    .host-send{width:28px;height:28px;border-radius:999px;border:0;background:var(--primary);color:#fff;font-weight:600}
  </style></head><body>
    ${PREVIEW ? `<div class="preview-tools">
      <button type="button" id="pv-inline" data-pv-place="inline">同行嵌入</button>
      <button type="button" id="pv-footer" data-pv-place="footer" class="active">底部独立一行</button>
      <label>宽度 <input id="pv-width" type="range" min="360" max="900" step="2" value="758"><span id="pv-width-val">758px</span></label>
      <label>模型 <select id="pv-model">
        <option value="Orchestrator Gemini 4 Neon Extra High" selected>Orchestrator Gemini 4 Neon Extra High</option>
        <option value="Gemini 4 Hydrogen (Medium)">Gemini 4 Hydrogen (Medium)</option>
        <option value="Claude Opus 4.6 (Thinking)">Claude Opus 4.6 (Thinking)</option>
      </select></label>
      <button type="button" id="pv-theme">切换明/暗主题</button>
      <div class="preview-note">此页加载自 worktree 真实组件代码（compat/inline-widget.cjs）：可点击底栏卡片打开设置弹窗直接切换「底栏位置」，也可调节上方宽度与模型名测试。</div>
    </div>` : ''}
    <div class="composer" data-testid="agent-input-box">
      <div class="editor" contenteditable="true" role="combobox">向智能体提问，键入 @ 引用上下文，键入 / 调出快捷操作</div>
      <div class="actions">
        <div class="left">
          <button class="host-btn" aria-label="Add">+</button>
          <button class="host-btn" data-testid="model-selector-trigger"><span>Orchestrator Gemini 4 Neon Extra High</span><span>⌄</span></button>
        </div>
        <div class="right">
          <span class="host-pill">Turbo ⌄</span>
          <button class="host-btn" aria-label="Voice">🎙</button>
          <button class="host-send" aria-label="Send">→</button>
        </div>
      </div>
    </div>
    <script>
      history.replaceState({}, '', '/c/${id}');
      let currentTheme = 'light';
      window.agPulseHost = {
        getMetrics: async () => (await fetch('/api/metrics?theme=' + currentTheme)).json(),
        getPreferences: async () => (await fetch('/api/preferences')).json(),
        setPreferences: async input => {
          const saved = await (await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).json();
          window.__agPulseOnPreferences?.(saved);
          syncPreviewUi(saved);
          return saved;
        },
        report: () => {},
      };
      function syncPreviewUi(p) {
        const place = p?.barPlacement || 'inline';
        document.getElementById('pv-inline')?.classList.toggle('active', place === 'inline');
        document.getElementById('pv-footer')?.classList.toggle('active', place === 'footer');
      }
      window.__agPulseTestSurface = (${extract(surfaceSrc)})();
      window.__agPulseI18nFactory = (${extract(i18nSrc)});
      window.__agPulseThemeFactory = (${extract(themeSrc)});
      (${extract(widgetSrc)})();
      if (${PREVIEW}) {
        document.getElementById('pv-inline').onclick = () => void window.agPulseHost.setPreferences({ barPlacement: 'inline' });
        document.getElementById('pv-footer').onclick = () => void window.agPulseHost.setPreferences({ barPlacement: 'footer' });
        document.getElementById('pv-width').oninput = e => {
          document.querySelector('.composer').style.width = e.target.value + 'px';
          document.getElementById('pv-width-val').textContent = e.target.value + 'px';
        };
        document.getElementById('pv-model').onchange = e => {
          document.querySelector('[data-testid="model-selector-trigger"] span').textContent = e.target.value;
        };
        document.getElementById('pv-theme').onclick = () => {
          currentTheme = currentTheme === 'light' ? 'dark' : 'light';
          document.body.classList.toggle('dark', currentTheme === 'dark');
          document.getElementById('ag-pulse-status-bar')?.shadowRoot?.querySelector('.refresh')?.click();
        };
      }
    </script>
  </body></html>`);
});

if (PREVIEW) {
  await new Promise(r => server.listen(17912, '127.0.0.1', r));
  console.log('Preview ready at http://127.0.0.1:17912/');
  await new Promise(() => {});
}

const BROWSER_EXE = findBrowser();
if (!BROWSER_EXE) {
  console.log('SKIP: No Chromium/Chrome/Edge executable found');
  server.close();
  process.exit(0);
}

await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const userDir = await mkdtemp(join(tmpdir(), 'ag-placement-ui-'));
let browser;
try {
  browser = await launchBrowser(BROWSER_EXE, userDir, `http://127.0.0.1:${port}/`);
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

  await waitUntil(() => {
    const tps = document.getElementById('ag-pulse-status-bar')?.shadowRoot?.getElementById('tps')?.textContent;
    return Boolean(tps && tps !== '—');
  }, 'initial render');

  // 1. In default inline mode at 758px with Orchestrator Gemini 4 Neon Extra High, compression kicks in
  const inlineState = await evalJs(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    return {
      placement: n.dataset.placement,
      density: n.dataset.density,
      parentIsRow: n.parentElement === document.querySelector('.actions'),
    };
  });
  assert.equal(inlineState.placement, 'inline');
  assert.equal(inlineState.parentIsRow, true);
  assert.notEqual(inlineState.density, 'full', 'inline mode with extra-long model must compress at 758px');

  // 2. Switch to footer placement via Settings popover
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-bar-placement-choice="footer"]').click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.placement === 'footer' && document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'footer mode expands to full density');

  // Settings popover must remain open after moving the widget node in DOM
  const settingsStillOpen = await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    return sr.getElementById('pulse-settings-dialog')?.hidden === false;
  });
  assert.equal(settingsStillOpen, true, 'settings dialog stays open after placement switch');
  await evalJs(() => document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('pulse-settings-close').click());

  const footerState = await evalJs(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const sr = n.shadowRoot;
    const row = document.querySelector('.actions');
    const box = document.querySelector('.composer');
    const nodeRect = n.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const span = document.querySelector('[data-testid="model-selector-trigger"] span');
    const vis = sel => {
      const el = sr.querySelector(sel);
      return Boolean(el && getComputedStyle(el).display !== 'none');
    };
    return {
      placement: n.dataset.placement,
      density: n.dataset.density,
      parentIsBox: n.parentElement === box,
      belowToolbar: nodeRect.top >= rowRect.bottom - 1,
      modelTruncated: span.scrollWidth > span.clientWidth + 1,
      speedUnit: vis('[data-card="speed"] > span:not(.rounds)'),
      cacheUnit: vis('.cache-unit'),
      cacheHit: vis('#cache-hit'),
      quotaSecondary: vis('.quota-secondary'),
      contextRounds: vis('#context-rounds'),
    };
  });
  assert.equal(footerState.placement, 'footer');
  assert.equal(footerState.density, 'full');
  assert.equal(footerState.parentIsBox, true);
  assert.equal(footerState.belowToolbar, true);
  assert.equal(footerState.modelTruncated, false);
  assert.equal(footerState.speedUnit, true);
  assert.equal(footerState.cacheUnit, true);
  assert.equal(footerState.cacheHit, true);
  assert.equal(footerState.quotaSecondary, true);
  assert.equal(footerState.contextRounds, true);
  assert.equal(prefs.barPlacement, 'footer');

  // 3. Hover/click card opens cleanly above the footer bar
  await evalJs(() => document.getElementById('ag-pulse-status-bar').shadowRoot.querySelector('[data-card="context"]').click());
  await waitUntil(() => document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('context-card')?.hidden === false, 'context card opens above footer');
  const cardAboveBar = await evalJs(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const card = n.shadowRoot.getElementById('context-card').getBoundingClientRect();
    const bar = n.getBoundingClientRect();
    return card.bottom <= bar.top + 1;
  });
  assert.equal(cardAboveBar, true, 'detail card positions above footer bar');
  await browser.cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  // 4. Narrow 300px composer in footer mode degrades cleanly without horizontal overflow
  await evalJs(`async () => {
    document.querySelector('.composer').style.width = '300px';
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  }`);
  await waitUntil(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const bar = n?.shadowRoot?.querySelector('.bar');
    return bar && bar.scrollWidth <= bar.clientWidth + 2 && n.dataset.layout === 'ready';
  }, 'narrow footer degrades without overflow');

  // 5. Switch back to inline at 758px
  await evalJs(`async () => {
    document.querySelector('.composer').style.width = '758px';
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-bar-placement-choice="inline"]').click();
    sr.getElementById('pulse-settings-close').click();
  }`);
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.placement === 'inline' && document.getElementById('ag-pulse-status-bar')?.parentElement === document.querySelector('.actions'), 'restores inline placement');
  assert.equal(prefs.barPlacement, 'inline');

  // 6. Incompatible horizontal parent safely falls back to inline even when preference is footer
  await evalJs(`async () => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-bar-placement-choice="footer"]').click();
    sr.getElementById('pulse-settings-close').click();
  }`);
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.placement === 'footer', 'footer enabled before fallback check');
  await evalJs(`async () => {
    const box = document.querySelector('.composer');
    document.querySelector('.editor').style.width = '100%';
    document.querySelector('.actions').style.width = '100%';
    box.style.display = 'flex';
    box.style.flexDirection = 'row';
    box.style.flexWrap = 'wrap';
    window.dispatchEvent(new Event('resize'));
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  }`);
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.placement === 'inline' && document.getElementById('ag-pulse-status-bar')?.parentElement === document.querySelector('.actions'), 'horizontal flex parent falls back to inline');

  console.log('PASS: check-bar-placement-ui (Issue #112 footer placement + fallback)');
} finally {
  if (browser) {
    try { browser.cdp.close(); } catch {}
    try { browser.child.kill('SIGKILL'); } catch {}
  }
  await rm(userDir, { recursive: true, force: true }).catch(() => {});
  server.close();
}
