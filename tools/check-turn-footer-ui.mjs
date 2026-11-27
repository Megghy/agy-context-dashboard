// End-to-end headless Chrome CDP regression for Issue #79 (per-turn reply footer + fail-closed alignment).
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
  for (const file of [
    process.env.AG_EDGE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean)) {
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
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
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
let runStatus = 'CASCADE_RUN_STATUS_IDLE';
const speed = () => ({
  ...trajectoryMetrics({
    status: runStatus,
    trajectory: {
      cascadeId: id,
      steps: [
        { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'CORTEX_STEP_STATUS_DONE', plannerResponse: { response: 'Reply 1' } },
        { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
        { type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', status: 'CORTEX_STEP_STATUS_DONE', plannerResponse: { response: 'Reply 2' } },
      ],
      generatorMetadata: [
        { stepIndices: [1], chatModel: { modelDisplayName: 'Gemini 4 Hydrogen (Medium)', streamingDuration: '2s', chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 100000, maxContextTokens: 500000 } }, usage: { messageId: 'm1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: '5000', cacheReadTokens: '45000', outputTokens: '400' } } },
        { stepIndices: [3], chatModel: { modelDisplayName: 'Gemini 4 Neon (Extra High)', streamingDuration: '1s', chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 200000, maxContextTokens: 500000 } }, usage: { messageId: 'm2', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: '1000', cacheReadTokens: '99000', outputTokens: '250' } } },
      ],
    },
  }),
  status: runStatus,
});

let prefs = { language: 'zh-CN', languageGuideDismissed: true, quotaDisplay: 'both', revision: 1 };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      connection: 'live',
      theme: 'light',
      preferences: prefs,
      groups: [{ id: 'gemini', name: 'Gemini', windows: { '5h': { available: true, remaining: 0.9, resetAt: new Date(Date.now() + 3600000).toISOString() } } }],
      speed: speed(),
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
  res.end(`<!doctype html><html><head><style>
    .composer{width:760px;padding:12px 14px 8px;border:1px solid #dfe3eb;border-radius:16px}
    .editor{height:38px}
    .actions{display:flex;align-items:center;justify-content:space-between;min-height:30px}
    .left,.right{display:flex;align-items:center;gap:6px}
  </style></head><body>
    <div id="log">
      <div class="reply">
        <div class="flex flex-col px-2" data-testid="cascade-system-message-toolbar"><div class="actions-row"><button>Copy</button></div></div>
      </div>
      <div class="reply" data-turn-content="latest">
        <div class="flex flex-col px-2" data-testid="cascade-system-message-toolbar"><div class="actions-row"><button>Copy</button></div></div>
      </div>
    </div>
    <div class="composer" data-testid="agent-input-box">
      <div class="editor" contenteditable="true" role="combobox">Ask</div>
      <div class="actions">
        <div class="left"><button aria-label="Add">+</button><button data-testid="model-selector-trigger"><span>Gemini 4 Hydrogen (Medium)</span></button></div>
        <div class="right"><button aria-label="Send">Send</button></div>
      </div>
    </div>
    <script>
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
    </script>
  </body></html>`);
});

const BROWSER_EXE = findBrowser();
if (!BROWSER_EXE) { console.log('SKIP: No browser found'); process.exit(0); }

await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const userDir = await mkdtemp(join(tmpdir(), 'ag-turn-footer-'));
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

  // 1. Exact count match renders both turn footers above Copy buttons
  await waitUntil(() => document.querySelectorAll('[data-ag-pulse-turn-footer]').length === 2, 'renders 2 turn footers');
  const initialTexts = await evalJs(() => Array.from(document.querySelectorAll('[data-ag-pulse-turn-footer]')).map(el => el.textContent));
  assert.match(initialTexts[0], /Gemini 4 Hydrogen \(Medium\).*输入 .*输出 .*缓存 90(\.0)?%.*均速 200 tok\/s/);
  assert.match(initialTexts[1], /Gemini 4 Neon \(XHigh\).*输入 .*输出 .*缓存 99(\.0)?%.*均速 250 tok\/s/);
  const footerPadBottom = await evalJs(() => parseFloat(getComputedStyle(document.querySelector('[data-ag-pulse-turn-footer]')).paddingBottom));
  assert.ok(footerPadBottom >= 8, 'turn footer preserves >= 8px bottom breathing room');

  // 2. Mismatch Fail-Closed: inject an extra unbacked toolbar -> older turn footer removed, only latest kept
  await evalJs(() => {
    const extra = document.createElement('div');
    extra.innerHTML = '<div class="flex flex-col px-2" data-testid="cascade-system-message-toolbar"><div class="actions-row"><button>Copy</button></div></div>';
    document.getElementById('log').prepend(extra);
  });
  await waitUntil(() => document.querySelectorAll('[data-ag-pulse-turn-footer]').length === 1, 'fail-closed keeps only latest turn footer on mismatch');
  const onlyLatest = await evalJs(() => Boolean(document.querySelector('[data-ag-pulse-turn-footer]')?.closest('[data-turn-content="latest"]')));
  assert.equal(onlyLatest, true);

  // 3. Running status clears even latest on mismatch
  runStatus = 'CASCADE_RUN_STATUS_RUNNING';
  await evalJs(() => document.getElementById('ag-pulse-status-bar')?.shadowRoot?.querySelector('.refresh')?.click());
  await waitUntil(() => document.querySelectorAll('[data-ag-pulse-turn-footer]').length === 0, 'clears latest footer while running on mismatch');
  runStatus = 'CASCADE_RUN_STATUS_IDLE';

  // Restore exact 2 toolbars
  await evalJs(() => document.getElementById('log').firstElementChild.remove());
  await waitUntil(() => document.querySelectorAll('[data-ag-pulse-turn-footer]').length === 2, 'restores 2 turn footers');

  // 4. Settings toggle off -> removes all footers; toggle on -> restores
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('pulse-settings-toggle').click();
    sr.querySelector('[data-turn-footer-choice="false"]').click();
  });
  await waitUntil(() => document.querySelectorAll('[data-ag-pulse-turn-footer]').length === 0, 'toggle off removes turn footers');
  assert.equal(prefs.turnFooter, false);
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-turn-footer-choice="true"]').click();
    sr.getElementById('pulse-settings-close').click();
  });
  await waitUntil(() => document.querySelectorAll('[data-ag-pulse-turn-footer]').length === 2, 'toggle on restores turn footers');
  assert.equal(prefs.turnFooter, true);

  // 5. Hover-only gear opens Settings dialog, scrolls to and highlights [data-setting-key="turnFooter"]
  const settingsBtnState = await evalJs(() => {
    const btn = document.querySelector('[data-ag-pulse-turn-footer] [data-ag-pulse-turn-footer-settings]');
    return btn ? { opacity: getComputedStyle(btn).opacity, title: btn.getAttribute('title') } : null;
  });
  assert.ok(settingsBtnState, 'hover settings button exists inside turn footer');
  assert.equal(settingsBtnState.opacity, '0', 'settings button stays hidden at rest');
  await evalJs(() => {
    document.querySelector('[data-ag-pulse-turn-footer] [data-ag-pulse-turn-footer-settings]').click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.shadowRoot?.getElementById('pulse-settings-dialog')?.hidden === false, 'turn footer gear opens Settings dialog');
  const highlightState = await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    const row = sr.querySelector('[data-setting-key="turnFooter"]');
    return row ? {
      highlighted: row.dataset.highlighted,
      hasClass: row.classList.contains('is-highlight'),
      miniMenus: document.querySelectorAll('[data-ag-pulse-turn-footer-menu]').length,
    } : null;
  });
  assert.deepEqual(highlightState, { highlighted: 'true', hasClass: true, miniMenus: 0 });
  await evalJs(() => document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('pulse-settings-close').click());
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.shadowRoot?.getElementById('pulse-settings-dialog')?.hidden === true, 'closes Settings dialog');

  console.log('PASS: check-turn-footer-ui (Issue #79 per-turn footer + fail-closed)');
} finally {
  if (browser) {
    try { browser.cdp.close(); } catch {}
    try { browser.child.kill('SIGKILL'); } catch {}
  }
  await rm(userDir, { recursive: true, force: true }).catch(() => {});
  server.close();
}
