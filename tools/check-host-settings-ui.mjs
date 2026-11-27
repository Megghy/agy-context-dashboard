// Browser E2E verification for Issue #102: Antigrative Dashboard settings integrated
// into Antigravity System Settings sidebar ([data-testid="settings-sidebar"]),
// syncing live with the inline status bar without disturbing native tabs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const extract = s => s.slice(s.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');
const sources = await Promise.all([
  'compat/i18n.cjs',
  'compat/theme.cjs',
  'compat/inline-widget.cjs',
  'compat/usage-ui.cjs',
  'compat/host-i18n.cjs',
  'compat/host-settings.cjs',
].map(p => readFile(join(repo, p), 'utf8')));
const dict = JSON.parse(await readFile(join(repo, 'compat', 'host-i18n-dict.json'), 'utf8'));

const cid = '11111111-1111-1111-1111-111111111111';
let prefs = { language: 'zh-CN', languageGuideDismissed: true, revision: 1 };
const snapshot = () => ({
  connection: 'live',
  serverTime: new Date().toISOString(),
  quotaUpdatedAt: new Date().toISOString(),
  preferences: prefs,
  groups: [{ id: 'gemini', name: 'Gemini', windows: { '5h': { available: true, remaining: 0.74 }, weekly: { available: true, remaining: 0.89 } } }],
  speed: {
    conversationId: cid,
    rounds: 18,
    steps: 76,
    tps: 120.5,
    e2eTps: 80.2,
    latestTps: 125.4,
    peakTps: 150.0,
    measuredRequests: 12,
    requests: 12,
    model: 'Gemini 4 Hydrogen (High)',
    counts: { output: 2400, responseOutput: 1800, thinkingOutput: 600 },
    cache: { hitRate: 0.85, totalTokens: 1200000, readTokens: 1020000, missTokens: 180000, outputTokens: 2400, measuredRequests: 12 },
    context: { usedTokens: 343000, maxTokens: 512000, usedFraction: 343000 / 512000, remainingFraction: 169000 / 512000, model: 'Gemini 4 Hydrogen (High)' },
  },
});

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#ffffff;color:#202631;font:13px sans-serif;padding:24px}
.settings-modal{display:flex;width:820px;height:460px;border:1px solid #d0d7de;border-radius:12px;overflow:hidden;margin:0 auto 24px;background:#fff}
[data-testid="settings-sidebar"]{width:210px;padding:12px;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;gap:4px}
[data-testid="settings-sidebar"] button{text-align:left;padding:7px 10px;border:0;border-radius:8px;background:transparent;cursor:pointer}
.settings-content{flex:1;min-width:0;overflow:auto;padding:20px}
.rounded-composer{max-width:820px;margin:0 auto;background:#f6f7f9;padding:12px;border-radius:18px}
.editor{height:36px}.actions{display:flex;align-items:center;gap:6px}.left{display:flex;flex:1;min-width:0;gap:6px}.right{display:flex;gap:5px}button{background:transparent;border:0;color:inherit;height:28px}
</style></head><body>
<div class="settings-modal" role="dialog" aria-label="System Settings">
  <div class="split-first-pane">
    <div data-testid="settings-sidebar">
      <div class="sidebar-scroll">
        <div class="settings-group">
          <div class="mx-2"><button type="button" data-testid="settings-nav-item-General">General</button></div>
          <div class="mx-2"><button type="button" data-testid="settings-nav-item-Models">Models</button></div>
          <div class="mx-2"><button type="button" data-testid="settings-nav-item-Browser">Browser</button></div>
        </div>
        <div class="projects-header">Projects</div>
        <div class="mx-2"><button type="button" data-testid="settings-nav-item-Provide Feedback">Give Feedback</button></div>
      </div>
    </div>
  </div>
  <div class="split-resizer"></div>
  <div class="settings-content">
    <div id="native-general-pane"><h2>General Settings</h2><p>Native host controls stay mounted.</p></div>
  </div>
</div>
<div class="rounded-composer"><div class="editor" contenteditable="true" role="combobox" aria-label="Message input"></div><div class="actions"><div class="left"><button aria-label="Add context">＋</button><button data-testid="model-selector-trigger">Gemini 4 Hydrogen (High)</button></div><div class="right"><button aria-label="Record voice memo">♩</button><button aria-label="Send message">➜</button></div></div></div>
<script>
history.replaceState({}, '', '/c/${cid}');
window.agPulseHost = {
  getMetrics: async () => await (await fetch('/api/metrics')).json(),
  getPreferences: async () => await (await fetch('/api/preferences')).json(),
  setPreferences: async input => await (await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).json(),
  getHostI18nOverrides: async () => ({ overrides: {} }),
};
window.__agPulseVersion = '1.0.3';
window.__agPulseHostI18nDict = ${JSON.stringify(dict)};
window.__agPulseHostI18nFactory = (${extract(sources[4])});
window.__agPulseHostSettingsFactory = (${extract(sources[5])});
window.__agPulseI18nFactory = (${extract(sources[0])});
window.__agPulseThemeFactory = (${extract(sources[1])});
window.__agPulseUsageFactory = (${extract(sources[3])});
(${extract(sources[2])})();
</script></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/metrics') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(snapshot())); return; }
  if (url.pathname === '/api/preferences') {
    if (req.method === 'POST') { let b = ''; for await (const c of req) b += c; prefs = { ...prefs, ...JSON.parse(b), revision: prefs.revision + 1 }; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(prefs)); return;
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8');
  res.end(html);
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch(process.platform === 'win32' && !process.env.CI ? { channel: 'msedge', headless: true } : { headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 840 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/');

  const bar = page.locator('#ag-pulse-status-bar');
  await bar.waitFor();
  await bar.locator('[data-card=context]').waitFor({ state: 'visible' });

  const navBtn = page.locator('[data-testid="settings-nav-item-antigravity-pulse"]');
  await navBtn.waitFor({ state: 'visible' });
  assert.equal(await navBtn.locator('.ag-pulse-settings-nav-label').textContent(), 'AGY 仪表盘');
  assert.equal(await page.evaluate(() => {
    const group = document.querySelector('.settings-group');
    const children = [...group.children];
    const browserIdx = children.findIndex(el => el.querySelector('[data-testid="settings-nav-item-Browser"]'));
    const pulseIdx = children.findIndex(el => el.querySelector('[data-testid="settings-nav-item-antigravity-pulse"]'));
    return pulseIdx === browserIdx + 1;
  }), true);
  assert.equal(await page.locator('#native-general-pane').isVisible(), true);

  // Open Antigrative Dashboard in System Settings
  await navBtn.click();
  const panel = page.locator('[data-ag-pulse-settings-panel="true"]');
  await panel.waitFor({ state: 'visible' });
  assert.equal(await navBtn.getAttribute('data-active'), 'true');
  assert.equal(await page.locator('#native-general-pane').isVisible(), false);
  assert.equal(await page.locator('#native-general-pane').count(), 1);

  // Toggle themeMode -> dark, syncs to both settings panel and inline bar
  await panel.locator('[data-theme-mode-choice="dark"]').click();
  await page.waitForFunction(() => document.getElementById('ag-pulse-status-bar')?.getAttribute('data-pulse-theme') === 'dark');
  assert.equal(prefs.themeMode, 'dark');

  // Set speed bar color -> #7c3aed, syncs to inline bar CSS variable
  await panel.locator('[data-bar-color-slot="speed"][data-bar-color-preset="#7c3aed"]').click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('ag-pulse-status-bar')).getPropertyValue('--pulse-bar-speed') !== '');
  assert.equal(prefs.barColors?.speed, '#7c3aed');

  // Toggle host UI localization -> true
  await panel.locator('[data-host-i18n-choice="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-nav-item-General"]')?.textContent !== 'General');
  assert.equal(prefs.hostUiLocalization, true);
  assert.equal(await navBtn.locator('.ag-pulse-settings-nav-label').textContent(), 'AGY 仪表盘');

  // Hide speed chip from System Settings -> inline bar hides speed chip
  await panel.locator('[data-bar-switch="speed"]').click();
  await page.waitForFunction(() => document.getElementById('ag-pulse-status-bar')?.shadowRoot?.querySelector('[data-card="speed"]')?.hidden === true);
  assert.deepEqual(prefs.barHidden, ['speed']);

  assert.equal(await panel.locator('.hs-title').textContent(), 'Antigravity Dashboard 设置');
  assert.equal(await panel.locator('.hs-row-title', { hasText: '仪表盘语言' }).count(), 1);
  await panel.locator('[data-language-choice="en"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ag-pulse-settings-panel="true"]')?.getAttribute('lang') === 'en');
  assert.equal(prefs.language, 'en');
  assert.equal(await navBtn.locator('.ag-pulse-settings-nav-label').textContent(), 'AGY Dashboard');
  assert.equal(await panel.locator('.hs-title').textContent(), 'Antigravity Dashboard Settings');
  assert.equal(await panel.locator('.hs-row-title', { hasText: 'Dashboard language' }).count(), 1);

  // Switch back to General tab -> native pane restores cleanly, our panel hides
  await page.locator('[data-testid="settings-nav-item-General"]').click();
  assert.equal(await page.locator('#native-general-pane').isVisible(), true);
  assert.equal(await panel.isVisible(), false);
  assert.equal(await navBtn.getAttribute('data-active'), null);

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ hostSettingsUi: true, themeSync: true, colorSync: true, hostI18nSync: true, chipToggle: true, tabSwitchClean: true, pageErrors: [] }));
} finally {
  await browser.close();
  server.closeAllConnections?.();
  await new Promise(r => server.close(r));
}
