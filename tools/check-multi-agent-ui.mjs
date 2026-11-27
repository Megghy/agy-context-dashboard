// End-to-end browser verification for #16 multi-agent orchestration, pool rollup,
// two-phase breakdown, context/tool breakdown, bloat warnings, and zero idle DOM churn.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { panelAppSource, panelPageSource } from '../sidecars/panel/panel-source.mjs';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';
import { aggregateTaskUsage, taskRecords } from '../sidecars/panel/task-usage.mjs';

const require = createRequire(import.meta.url);
const createTheme = require('../compat/theme.cjs');
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const extract = s => s.slice(s.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');
const sources = await Promise.all(['compat/i18n.cjs', 'compat/theme.cjs', 'compat/inline-widget.cjs', 'compat/usage-ui.cjs'].map(p => readFile(join(repo, p), 'utf8')));

const coord = '11111111-1111-1111-1111-111111111111';
const worker = '22222222-2222-2222-2222-222222222222';
const mon = '33333333-3333-3333-3333-333333333333';

const coordRaw = {
  trajectory: {
    cascadeId: coord,
    steps: [
      { type: 'CORTEX_STEP_TYPE_USER_INPUT' },
      { type: 'CORTEX_STEP_TYPE_GENERIC', metadata: { toolCall: { name: 'grep_search', argumentsJson: '{"Query":"abc"}' }, toolSource: 'CORTEX_COMPONENT_SOURCE_BUILTIN' } },
    ],
    generatorMetadata: [
      { chatModel: { model: 'MODEL_PLACEHOLDER_M537', streamingDuration: '2s', timeToFirstToken: '1s', usage: { responseId: 'p1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 120000, cacheReadTokens: 0, outputTokens: 4000, responseOutputTokens: 1000, thinkingOutputTokens: 3000 }, chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 124000, maxContextTokens: 512000 } } } },
      { chatModel: { model: 'MODEL_PLACEHOLDER_M669', streamingDuration: '1s', timeToFirstToken: '0.5s', usage: { responseId: 'e1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 10000, cacheReadTokens: 80000, outputTokens: 2000, responseOutputTokens: 1500, thinkingOutputTokens: 500 }, chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 92000, maxContextTokens: 512000 } } } },
    ],
  },
};

const baseMetrics = trajectoryMetrics(coordRaw);
const taskUsage = aggregateTaskUsage(
  taskRecords(coordRaw, coord),
  [
    { rows: taskRecords({ trajectory: { steps: [], generatorMetadata: [{ chatModel: { model: 'MODEL_PLACEHOLDER_M405', usage: { responseId: 'w1', apiProvider: 'API_PROVIDER_ANTHROPIC_VERTEX', inputTokens: 50000, cacheReadTokens: 10000, outputTokens: 5000, thinkingOutputTokens: 1200 } } }] } }, worker), role: 'worker', label: 'Worker (feat)' },
    { rows: taskRecords({ trajectory: { steps: [], generatorMetadata: [{ chatModel: { model: 'MODEL_GOOGLE_GEMINI_INTERNAL_BYOM', usage: { responseId: 'm1', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', inputTokens: 1000, outputTokens: 200 } } }] } }, mon), role: 'monitor', label: 'Monitor' },
  ],
  { subagents: 2, loadedSubagents: 2, state: 'ready', rootRole: 'coordinator', rootLabel: 'Coordinator' },
);
const transcriptStats = {
  version: 1, status: 'ready', complete: true,
  userTokens: 1500, assistantTokens: 5500, responseTokens: 2000, thinkingTokens: 3500,
  toolTokens: 64000, toolCallTokens: 800, systemTokens: 2000, totalTokens: 73000,
  matchedSteps: 12, compactionMarkers: 1, imageSteps: 0, heavyToolCalls: 2,
  toolBreakdown: [
    { name: 'view_file', calls: 3, argTokens: 120, resultTokens: 58000, maxResultTokens: 55000, source: 'builtin' },
    { name: 'multi_replace_file_content_very_long_tool_name_ellipsis_check', calls: 66, argTokens: 8200, resultTokens: 11700000, maxResultTokens: 24000, source: 'builtin' },
    { name: 'grep_search', calls: 4, argTokens: 680, resultTokens: 6000, maxResultTokens: 4000, source: 'builtin' },
  ],
  bloatWarnings: [
    { kind: 'tool-result', tool: 'view_file', stepIndex: 4, tokens: 55000, severity: 'critical' },
  ],
};
const usageFixture = {
  accountKey: 'fixture', today: '2026-11-21', timeZone: 'Asia/Shanghai',
  models: ['Orchestrator (Neon)', 'Claude Sonnet 5.5 (High)', 'Gemini (Internal BYOM)'],
  days: [{
    date: '2026-11-21',
    models: {
      'Orchestrator (Neon)': { uncached: 120000, cacheRead: 0, cacheWrite: 0, output: 4000, total: 124000, requests: 1 },
      'Claude Sonnet 5.5 (High)': { uncached: 50000, cacheRead: 10000, cacheWrite: 0, output: 5000, total: 65000, requests: 1 },
      'Gemini (Internal BYOM)': { uncached: 1000, cacheRead: 0, cacheWrite: 0, output: 200, total: 1200, requests: 1 },
    },
  }],
  todayTokens: 190200, weekTokens: 190200, monthTokens: 190200, totalTokens: 190200, requests: 3,
  firstDate: '2026-11-21', syncing: false, unknownRequests: 0, partialRequests: 0, unreadableFiles: 0,
};

let prefs = { language: 'en', languageGuideDismissed: true, revision: 1 };
let workerMode = false;
let customSpeedOverride = null;
const snapshot = () => ({
  connection: 'live', serverTime: new Date().toISOString(), quotaUpdatedAt: new Date().toISOString(), preferences: prefs,
  groups: [{ id: 'gemini', name: 'Gemini', windows: { '5h': { available: true, remaining: 0.7 }, weekly: { available: true, remaining: 0.8 } } }],
  speed: customSpeedOverride
    ? customSpeedOverride
    : workerMode
      ? { ...baseMetrics, cacheMissSurges: 1, cacheMissSurgeTokens: 9000, taskUsage: null, sessionMeta: { agentRole: 'worker', isSubagent: true, isSidecar: false }, transcriptStats }
      : { ...baseMetrics, taskUsage, transcriptStats },
  usage: usageFixture,
});

const panelHtml = panelPageSource(), panelCode = panelAppSource();
const inlineHtml = (narrow = false) => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#17181a;color:#ddd;font:13px sans-serif;padding:${narrow ? 8 : 50}px}.rounded-composer{max-width:900px;margin:260px auto 0;background:#27282a;padding:${narrow ? 6 : 12}px;border-radius:18px}.editor{height:45px}.actions{display:flex;align-items:center;gap:5px}.left{display:flex;flex:1;min-width:0;gap:6px}.right{display:flex;gap:5px}button{background:transparent;border:0;color:inherit;height:28px}</style></head><body><div class="rounded-composer"><div class="editor" contenteditable="true" role="combobox" aria-label="Message input"></div><div class="actions"><div class="left"><button aria-label="Add context">＋</button><button data-testid="model-selector-trigger">${narrow ? 'M' : 'Orchestrator (Neon)'}</button></div><div class="right"><button aria-label="Record voice memo">♩</button><button aria-label="Send message">➜</button></div></div></div><script>
history.replaceState({}, '', '/c/${coord}');
window.agPulseHost = { getMetrics: async () => (window.__snap()), getPreferences: async () => (window.__prefs()), setPreferences: async x => Object.assign(window.__prefs(), x) };
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
  if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(panelCode); return; }
  if (url.pathname === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(await readFile(join(repo, 'sidecars/panel/styles.css'))); return; }
  if (url.pathname === '/theme.css') { res.setHeader('Content-Type', 'text/css'); res.end(createTheme().css(':root')); return; }
  if (url.pathname === '/preload.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(''); return; }
  if (url.pathname === '/inline') {
    prefs = { language: url.searchParams.get('lang') || 'en', languageGuideDismissed: true, revision: 1 };
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.end(inlineHtml(url.searchParams.get('narrow') === '1').replace('window.__snap()', JSON.stringify(snapshot())).replaceAll('window.__prefs()', JSON.stringify(prefs)));
    return;
  }
  res.setHeader('Content-Type', 'text/html'); res.end(panelHtml);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch(process.platform === 'win32' && !process.env.CI ? { channel: 'msedge', headless: true } : { headless: true });
const errors = [];

try {
  // 1. Panel checks
  const page = await browser.newPage({ viewport: { width: 420, height: 640 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/');
  await page.locator('#cache-tab').click();
  await page.locator('#orchestration-breakdown').waitFor({ state: 'visible' });
  await page.locator('#orchestration-breakdown summary').click();
  const orchText = await page.locator('#orch-body').textContent();
  assert.ok(orchText.includes('Gemini') && orchText.includes('Claude / 3p') && orchText.includes('Local / BYOM'), orchText);
  assert.ok(orchText.includes('Coordinator') && orchText.includes('Worker') && orchText.includes('Monitor'), orchText);
  assert.ok(orchText.includes('Orchestrator (Neon)') && orchText.includes('Claude Sonnet 5.5 (High)'), orchText);
  assert.ok(orchText.includes('cache-miss surge'), orchText);

  await page.locator('#context-tab').click();
  await page.locator('#context-bloat-pill').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#context-bloat-pill').getAttribute('data-critical'), 'true');
  assert.equal(await page.locator('#context-card').evaluate(e => e.scrollHeight <= e.clientHeight + 1), true, 'Collapsed context-breakdown fits inside 580px frame');
  await page.locator('#context-breakdown summary').click();
  const ctxText = await page.locator('#ctx-breakdown-body').textContent();
  assert.ok(ctxText.includes('Thinking') && ctxText.includes('Tool args') && ctxText.includes('view_file') && ctxText.includes('55K'), ctxText);

  // Language switch updates new sections cleanly
  await page.locator('#language-toggle').click();
  await page.locator('[data-language-menu] [data-language="zh-CN"]').click();
  await page.locator('#context-breakdown summary').filter({ hasText: '上下文与工具构成' }).waitFor();
  assert.ok((await page.locator('#ctx-breakdown-body').textContent()).includes('工具入参'));

  // Idle polling causes 0 DOM mutations on new sections
  const idleChanges = await page.evaluate(async () => {
    const changes = [];
    const obs = new MutationObserver(rs => changes.push(...rs.map(r => r.target.id || r.type)));
    obs.observe(document.getElementById('orchestration-breakdown'), { subtree: true, childList: true, characterData: true, attributes: true });
    obs.observe(document.getElementById('context-breakdown'), { subtree: true, childList: true, characterData: true, attributes: true });
    await new Promise(r => setTimeout(r, 2600));
    obs.disconnect();
    return changes;
  });
  assert.deepEqual(idleChanges, []);

  // 2. Inline widget + usage modal pool strip checks
  const inline = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  inline.on('pageerror', e => { errors.push(e.message); console.error('INLINE PAGEERROR:', e.message); });
  await inline.goto(base + '/inline');
  const strip = inline.locator('#ag-pulse-status-bar');
  await strip.waitFor();
  await strip.locator('[data-card=cache]').click();
  await strip.locator('#orchestration-breakdown').waitFor({ state: 'visible' });
  await strip.locator('#orchestration-breakdown summary').click();
  assert.ok((await strip.locator('#orch-body').textContent()).includes('Coordinator'));
  await strip.locator('#open-usage').click();
  await strip.locator('#usage-dashboard #details-tab').click();
  await strip.locator('#usage-dashboard #pool-strip .pool-pill').first().waitFor({ state: 'visible' });
  const poolText = await strip.locator('#usage-dashboard #pool-strip').textContent();
  assert.ok(poolText.includes('Gemini') && poolText.includes('Claude / 3p') && poolText.includes('Local / BYOM'), poolText);

  // 3. Narrow ~270px card non-clipping assertions (#34 defect 3) in both inline and panel
  const assertNoClipping = async (container, bodyLocator) => {
    const metrics = await bodyLocator.evaluate((body, boxEl) => {
      const boxRect = boxEl.getBoundingClientRect();
      const breakdownRows = [...body.querySelectorAll('.breakdown-row')].map(r => {
        const name = r.querySelector('.breakdown-row-name');
        const val = r.querySelector('.breakdown-row-val');
        const valRect = val?.getBoundingClientRect();
        return {
          nameText: name?.textContent || '',
          valText: val?.textContent || '',
          ellipsized: Boolean(name && name.scrollWidth > name.clientWidth),
          valRight: valRect ? valRect.right : 0,
        };
      });
      const rosterRows = [...body.querySelectorAll('.roster-item')].map(r => {
        const name = r.querySelector('.roster-name');
        const tok = r.querySelector('.roster-tok');
        const req = r.querySelector('.roster-req');
        const tokRect = tok?.getBoundingClientRect();
        const reqRect = req?.getBoundingClientRect();
        return {
          nameText: name?.textContent || '',
          valText: tok?.textContent || '',
          ellipsized: Boolean(name && name.scrollWidth > name.clientWidth),
          valRight: Math.max(tokRect ? tokRect.right : 0, reqRect ? reqRect.right : 0),
        };
      });
      const rows = [...breakdownRows, ...rosterRows];
      return {
        boxWidth: Math.round(boxRect.width),
        boxRight: boxRect.right,
        scrollWidth: body.scrollWidth,
        clientWidth: body.clientWidth,
        rows,
      };
    }, await container.elementHandle());
    assert.ok(metrics.rows.length > 0, 'Expected visible breakdown rows');
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `Horizontal overflow in breakdown body: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.rows.some(r => r.ellipsized), `Expected long row name to ellipsize cleanly: ${JSON.stringify(metrics.rows)}`);
    for (const r of metrics.rows) {
      assert.ok(r.valRight <= metrics.boxRight + 1, `Value clipped past right edge (${r.valRight} > ${metrics.boxRight}): ${JSON.stringify(r)}`);
    }
    return metrics;
  };

  const narrowInline = await browser.newPage({ viewport: { width: 294, height: 640 } });
  narrowInline.on('pageerror', e => errors.push(e.message));
  await narrowInline.goto(base + '/inline?narrow=1');
  const narrowStrip = narrowInline.locator('#ag-pulse-status-bar');
  await narrowStrip.waitFor();
  await narrowStrip.locator('[data-card=cache]').click();
  await narrowStrip.locator('#orchestration-breakdown').waitFor({ state: 'visible' });
  await narrowStrip.locator('#orchestration-breakdown summary').click();
  const narrowCacheMetrics = await assertNoClipping(narrowStrip.locator('#cache-card'), narrowStrip.locator('#orch-body'));
  assert.equal(narrowCacheMetrics.boxWidth, 270, `Expected 270px live narrow inline card, got ${narrowCacheMetrics.boxWidth}`);
  await narrowStrip.locator('[data-card=context]').click();
  await narrowStrip.locator('#context-breakdown').waitFor({ state: 'visible' });
  await narrowStrip.locator('#context-breakdown summary').click();
  await assertNoClipping(narrowStrip.locator('#context-card'), narrowStrip.locator('#ctx-breakdown-body'));

  const narrowPanel = await browser.newPage({ viewport: { width: 294, height: 640 } });
  narrowPanel.on('pageerror', e => errors.push(e.message));
  prefs = { language: 'en', languageGuideDismissed: true, revision: 1 };
  await narrowPanel.goto(base + '/');
  await narrowPanel.locator('#cache-tab').click();
  await narrowPanel.locator('#orchestration-breakdown').waitFor({ state: 'visible' });
  await narrowPanel.locator('#orchestration-breakdown summary').click();
  await assertNoClipping(narrowPanel.locator('#cache-card'), narrowPanel.locator('#orch-body'));
  await narrowPanel.locator('#context-tab').click();
  await narrowPanel.locator('#context-breakdown').waitFor({ state: 'visible' });
  await narrowPanel.locator('#context-breakdown summary').click();
  await assertNoClipping(narrowPanel.locator('#context-card'), narrowPanel.locator('#ctx-breakdown-body'));

  // 4. Worker/subagent fallback renders distinct role label (#34 defect 1) in en & zh-CN
  workerMode = true;
  const checkWorkerRow = async (rootLoc, cardLoc, summarySel, bodySel, expectedName, expectedVal) => {
    await cardLoc.click();
    await rootLoc.locator(summarySel).click();
    const pairs = await rootLoc.locator(`${bodySel} .breakdown-row`).evaluateAll(rows =>
      rows.map(r => [r.querySelector('.breakdown-row-name')?.textContent?.trim(), r.querySelector('.breakdown-row-val')?.textContent?.trim()])
    );
    assert.ok(
      pairs.some(([k, v]) => k === expectedName && v === expectedVal && k !== v),
      `Expected distinct (${expectedName} | ${expectedVal}) in ${JSON.stringify(pairs)}`
    );
  };

  prefs = { language: 'en', languageGuideDismissed: true, revision: 1 };
  const workerPanel = await browser.newPage({ viewport: { width: 420, height: 640 } });
  workerPanel.on('pageerror', e => errors.push(e.message));
  await workerPanel.goto(base + '/');
  assert.equal(await workerPanel.locator('#strip-route-pill').textContent(), 'Dual · 1×');
  await checkWorkerRow(workerPanel, workerPanel.locator('#cache-tab'), '#orchestration-breakdown summary', '#orch-body', 'Agent role', 'Worker');
  await workerPanel.locator('#language-toggle').click();
  await workerPanel.locator('[data-language-menu] [data-language="zh-CN"]').click();
  await workerPanel.locator('#orchestration-breakdown summary').filter({ hasText: '多代理与模型拆分' }).waitFor();
  assert.equal(await workerPanel.locator('#strip-route-pill').textContent(), '双模型 · 切1次');
  const zhPairs = await workerPanel.locator('#orch-body .breakdown-row').evaluateAll(rows =>
    rows.map(r => [r.querySelector('.breakdown-row-name')?.textContent?.trim(), r.querySelector('.breakdown-row-val')?.textContent?.trim()])
  );
  assert.ok(zhPairs.some(([k, v]) => k === '代理角色' && v === '执行子代理' && k !== v), JSON.stringify(zhPairs));

  const workerInline = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  workerInline.on('pageerror', e => errors.push(e.message));
  await workerInline.goto(base + '/inline?lang=zh-CN');
  const workerStrip = workerInline.locator('#ag-pulse-status-bar');
  await workerStrip.waitFor();
  await checkWorkerRow(workerStrip, workerStrip.locator('[data-card=cache]'), '#orchestration-breakdown summary', '#orch-body', '代理角色', '执行子代理');

  // 5. Dual-pill .context-hero-row wraps cleanly without horizontal overflow across en/zh-CN/zh-TW (#82)
  workerMode = false;
  const assertHeroWrap = async (cardLoc, label) => {
    const m = await cardLoc.evaluate(card => {
      const cardRect = card.getBoundingClientRect();
      const summary = card.querySelector('#context-summary');
      const roundsPill = card.querySelector('#context-rounds-pill');
      const bloat = card.querySelector('#context-bloat-pill');
      const compactPill = card.querySelector('#context-compaction-pill');
      const tokens = card.querySelector('#context-tokens');
      const range = document.createRange();
      range.selectNodeContents(summary);
      const summaryLines = [...range.getClientRects()].length;
      const items = [summary, roundsPill, bloat, compactPill, tokens].map(el => ({
        id: el?.id,
        visible: Boolean(el && !el.hidden && el.getBoundingClientRect().width > 0),
        left: el?.getBoundingClientRect().left ?? 0,
        right: el?.getBoundingClientRect().right ?? 0,
      }));
      return {
        scrollWidth: card.scrollWidth,
        clientWidth: card.clientWidth,
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        summaryLines,
        summaryText: summary?.textContent?.trim(),
        items,
      };
    });
    assert.ok(m.scrollWidth <= m.clientWidth, `${label}: #context-card overflow (${m.scrollWidth} > ${m.clientWidth}): ${JSON.stringify(m)}`);
    assert.equal(m.summaryLines, 1, `${label}: #context-summary wrapped to ${m.summaryLines} lines (${m.summaryText})`);
    for (const item of m.items) {
      assert.ok(item.visible, `${label}: missing hero element ${item.id}`);
      assert.ok(item.left >= m.cardLeft - 1 && item.right <= m.cardRight + 1, `${label}: hero item clipped (${item.id}: ${item.left}..${item.right} vs ${m.cardLeft}..${m.cardRight})`);
    }
  };

  for (const lang of ['en', 'zh-CN', 'zh-TW']) {
    for (const vp of [{ width: 900, height: 800, tag: '312px-inline' }, { width: 294, height: 640, tag: '270px-inline' }]) {
      const p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(`${base}/inline?lang=${lang}${vp.width < 400 ? '&narrow=1' : ''}`);
      const s = p.locator('#ag-pulse-status-bar');
      await s.waitFor();
      await s.locator('[data-card=context]').click();
      await s.locator('#context-rounds-pill').waitFor({ state: 'visible' });
      await s.locator('#context-bloat-pill').waitFor({ state: 'visible' });
      await s.locator('#context-compaction-pill').waitFor({ state: 'visible' });
      const expectedRounds = lang === 'en' ? '1 turns' : lang === 'zh-TW' ? '1 輪' : '1 轮';
      const expectedPill = lang === 'en' ? '1 turns · 2 steps' : lang === 'zh-TW' ? '1 輪 · 2 步' : '1 轮 · 2 步';
      const expectedChipRounds = lang === 'en' ? '· 1T' : lang === 'zh-TW' ? '· 1輪' : '· 1轮';
      assert.equal(await s.locator('#context-rounds-pill').textContent(), expectedPill);
      assert.equal(await s.locator('#context-rounds-pill .rounds-pill-chevron').isVisible(), true);
      assert.equal(await s.locator('[data-card=context]').getAttribute('data-has-rounds'), 'true');
      assert.equal(await s.locator('#context-rounds').textContent(), expectedChipRounds);
      assert.ok((await s.locator('[data-card=context]').getAttribute('title') || '').includes(expectedRounds));
      await assertHeroWrap(s.locator('#context-card'), `inline-${vp.tag}-${lang}`);
      await s.locator('#context-rounds-pill').click();
      await s.locator('#context-steps-drawer').waitFor({ state: 'visible' });
      assert.equal(await s.locator('#context-rounds-pill').getAttribute('aria-expanded'), 'true');
      assert.equal(await s.locator('#context-steps-drawer .steps-chip').count(), 2);
      assert.equal(await s.locator('#context-card').evaluate(c => c.scrollWidth <= c.clientWidth), true, `inline-${vp.tag}-${lang}: drawer overflow`);
      await s.locator('#context-rounds-pill').click();
      await s.locator('#context-steps-drawer').waitFor({ state: 'hidden' });
      await p.close();
    }

    prefs = { language: lang, languageGuideDismissed: true, revision: 1 };
    const panelP = await browser.newPage({ viewport: { width: 320, height: 640 } });
    panelP.on('pageerror', e => errors.push(e.message));
    await panelP.goto(base + '/');
    await panelP.locator('#context-tab').click();
    await panelP.locator('#context-rounds-pill').waitFor({ state: 'visible' });
    await panelP.locator('#context-bloat-pill').waitFor({ state: 'visible' });
    await panelP.locator('#context-compaction-pill').waitFor({ state: 'visible' });
    assert.equal(await panelP.locator('#context-rounds-pill').textContent(), lang === 'en' ? '1 turns · 2 steps' : lang === 'zh-TW' ? '1 輪 · 2 步' : '1 轮 · 2 步');
    assert.equal(await panelP.locator('#context-rounds-pill .rounds-pill-chevron').isVisible(), true);
    await assertHeroWrap(panelP.locator('#context-card'), `panel-320px-${lang}`);
    await panelP.locator('#context-rounds-pill').click();
    await panelP.locator('#context-steps-drawer').waitFor({ state: 'visible' });
    assert.equal(await panelP.locator('#context-rounds-pill').getAttribute('aria-expanded'), 'true');
    assert.equal(await panelP.locator('#context-steps-drawer .steps-chip').count(), 2);
    assert.equal(await panelP.locator('#context-card').evaluate(c => c.scrollWidth <= c.clientWidth + 1), true, `panel-320px-${lang}: drawer overflow`);
    await panelP.locator('#context-rounds-pill').click();
    await panelP.locator('#context-steps-drawer').waitFor({ state: 'hidden' });
    await panelP.close();
  }

  Object.assign(baseMetrics, {
    rounds: 18,
    steps: 2464,
    stepBreakdown: { total: 2464, tool: 1900, planner: 400, user: 18, compaction: 2, other: 144 },
  });
  const fourDigitInline = await browser.newPage({ viewport: { width: 900, height: 800 } });
  fourDigitInline.on('pageerror', e => errors.push(e.message));
  await fourDigitInline.goto(`${base}/inline?lang=zh-CN`);
  const fStrip = fourDigitInline.locator('#ag-pulse-status-bar');
  await fStrip.waitFor();
  await fStrip.locator('[data-card=context]').click();
  await fStrip.locator('#context-rounds-pill').waitFor({ state: 'visible' });
  assert.equal(await fStrip.locator('#context-rounds-pill').textContent(), '18 轮 · 2464 步');
  await fStrip.locator('#context-rounds-pill').click();
  await fStrip.locator('#context-steps-drawer').waitFor({ state: 'visible' });
  assert.ok((await fStrip.locator('#context-steps-drawer .steps-drawer-head').textContent()).includes('2464'));
  assert.equal(await fStrip.locator('#context-steps-drawer .steps-chip strong').first().textContent(), '1900');
  await fourDigitInline.close();

  prefs = { language: 'zh-CN', languageGuideDismissed: true, revision: 1 };
  const fourDigitPanel = await browser.newPage({ viewport: { width: 320, height: 640 } });
  fourDigitPanel.on('pageerror', e => errors.push(e.message));
  await fourDigitPanel.goto(base + '/');
  await fourDigitPanel.locator('#context-tab').click();
  await fourDigitPanel.locator('#context-rounds-pill').waitFor({ state: 'visible' });
  assert.equal(await fourDigitPanel.locator('#context-rounds-pill').textContent(), '18 轮 · 2464 步');
  await fourDigitPanel.locator('#context-rounds-pill').click();
  await fourDigitPanel.locator('#context-steps-drawer').waitFor({ state: 'visible' });
  assert.ok((await fourDigitPanel.locator('#context-steps-drawer .steps-drawer-head').textContent()).includes('2464'));
  assert.equal(await fourDigitPanel.locator('#context-steps-drawer .steps-chip strong').first().textContent(), '1900');
  await fourDigitPanel.close();

  // 6. Issue #57 Swarm mode on inline widget (label, title, 6->8 roster expand, tags, 270px narrow, idle polling)
  const swarmAgents = [
    { label: 'Coordinator', role: 'coordinator', pool: 'gemini', model: 'Orchestrator (Neon)', tokens: 124000, thinkingTokens: 3000, requests: 2, workspaceMode: 'inherit', killed: false },
    { label: 'ui-inline-very-long-agent-name-check', role: 'worker', pool: '3p', model: 'Claude Sonnet 5.5 (High)', tokens: 68000, thinkingTokens: 1200, requests: 4, workspaceMode: 'share', killed: false },
    { label: 'ui-panel', role: 'worker', pool: '3p', model: 'Claude Sonnet 5.5 (High)', tokens: 52000, thinkingTokens: 900, requests: 3, workspaceMode: 'share', killed: false },
    { label: 'backend-orch', role: 'worker', pool: 'gemini', model: 'Gemini 4 Hydrogen (Orchestrator)', tokens: 41000, thinkingTokens: 400, requests: 2, workspaceMode: 'branch', killed: false },
    { label: 'verifier-1', role: 'worker', pool: 'gemini', model: 'Gemini 3.8 Flash (High)', tokens: 19000, thinkingTokens: 200, requests: 2, workspaceMode: 'inherit', killed: true },
    { label: 'scout-docs', role: 'worker', pool: 'local', model: 'Gemini (Internal BYOM)', tokens: 12000, thinkingTokens: 0, requests: 1, workspaceMode: 'inherit', killed: true },
    { label: 'tester-e2e', role: 'worker', pool: '3p', model: 'Claude Sonnet 5.5 (High)', tokens: 9500, thinkingTokens: 100, requests: 1, workspaceMode: 'share', killed: false },
    { label: 'monitor-watch', role: 'monitor', pool: 'local', model: 'Gemini (Internal BYOM)', tokens: 3200, thinkingTokens: 0, requests: 1, workspaceMode: 'inherit', killed: false },
  ];
  const swarmTaskUsage = {
    ...taskUsage,
    isSwarm: true,
    swarmTitle: 'Issue 57 Team',
    totalAgents: 8,
    subagents: 7,
    loadedSubagents: 7,
    agents: swarmAgents,
  };
  customSpeedOverride = { ...baseMetrics, taskUsage: swarmTaskUsage, transcriptStats };

  for (const lang of ['en', 'zh-CN']) {
    const p = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${base}/inline?lang=${lang}`);
    const s = p.locator('#ag-pulse-status-bar');
    await s.waitFor();
    await s.locator('[data-card=cache]').click();
    await s.locator('#orchestration-breakdown').waitFor({ state: 'visible' });
    assert.equal(
      await s.locator('#task-subagents-label').textContent(),
      lang === 'en' ? 'Swarm (7 members)' : 'Swarm（7 成员）',
    );
    assert.equal(await s.locator('#orch-summary-label').textContent(), 'Swarm · Issue 57 Team');
    await s.locator('#orchestration-breakdown summary').click();

    const filterBar = s.locator('#orch-roster-filter');
    await filterBar.waitFor({ state: 'visible' });
    const activeBtn = filterBar.locator('[data-roster-filter="active"]');
    const endedBtn = filterBar.locator('[data-roster-filter="ended"]');
    const allBtn = filterBar.locator('[data-roster-filter="all"]');
    assert.equal(await activeBtn.textContent(), lang === 'en' ? 'Active 6' : '活跃 6');
    assert.equal(await endedBtn.textContent(), lang === 'en' ? 'Ended 2' : '已结束 2');
    assert.equal(await allBtn.textContent(), lang === 'en' ? 'All 8' : '全部 8');
    assert.equal(await activeBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(await s.locator('#orch-body .roster-item').count(), 6);
    const activeText = await s.locator('#orch-body .roster-list').textContent();
    assert.ok(activeText.includes('monitor-watch'), 'Active filter must keep monitor-watch visible');
    assert.ok(activeText.includes('share') && activeText.includes('branch'), activeText);
    assert.ok(!activeText.includes('verifier-1') && !activeText.includes('scout-docs'), 'Active filter must hide ended members');

    await endedBtn.click();
    assert.equal(await endedBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(await s.locator('#orch-body .roster-item.is-ended').count(), 2);
    const endedText = await s.locator('#orch-body .roster-list').textContent();
    assert.ok(endedText.includes('verifier-1') && endedText.includes('scout-docs'), endedText);

    await allBtn.click();
    assert.equal(await allBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(await s.locator('#orch-body .roster-item').count(), 8);
    const allText = await s.locator('#orch-body .roster-list').textContent();
    assert.ok(allText.includes('tester-e2e') && allText.includes('monitor-watch') && allText.includes('verifier-1'), allText);

    if (lang === 'en') {
      const swarmIdleChanges = await p.evaluate(async () => {
        const root = document.getElementById('ag-pulse-status-bar').shadowRoot;
        const changes = [];
        const obs = new MutationObserver(rs => changes.push(...rs.map(r => r.target.id || r.type)));
        obs.observe(root.getElementById('orchestration-breakdown'), { subtree: true, childList: true, characterData: true, attributes: true });
        await new Promise(r => setTimeout(r, 2600));
        obs.disconnect();
        return changes;
      });
      assert.deepEqual(swarmIdleChanges, [], 'Swarm filtered roster must not mutate on idle polling');
    }

    await activeBtn.click();
    assert.equal(await s.locator('#orch-body .roster-item').count(), 6);
    await p.close();
  }

  const narrowSwarm = await browser.newPage({ viewport: { width: 294, height: 640 } });
  narrowSwarm.on('pageerror', e => errors.push(e.message));
  await narrowSwarm.goto(`${base}/inline?lang=en&narrow=1`);
  const narrowSwarmStrip = narrowSwarm.locator('#ag-pulse-status-bar');
  await narrowSwarmStrip.waitFor();
  await narrowSwarmStrip.locator('[data-card=cache]').click();
  await narrowSwarmStrip.locator('#orchestration-breakdown summary').click();
  await assertNoClipping(narrowSwarmStrip.locator('#cache-card'), narrowSwarmStrip.locator('#orch-body'));
  await narrowSwarmStrip.locator('#orch-roster-filter [data-roster-filter="all"]').click();
  const narrowSwarmMetrics = await assertNoClipping(narrowSwarmStrip.locator('#cache-card'), narrowSwarmStrip.locator('#orch-body'));
  assert.equal(narrowSwarmMetrics.boxWidth, 270);
  await narrowSwarm.close();

  // 7. Issue #57 separated Orchestrator card (#orchestrator-breakdown) vs Swarm card (#orchestration-breakdown)
  const switchedOrch = {
    detected: true,
    source: 'trajectory',
    configuredPlanner: 'Orchestrator (Neon)',
    configuredExecutor: 'Gemini 4 Hydrogen (Orchestrator)',
    switched: true,
    phaseSwitchCount: 1,
    coldStartSwitches: 1,
    planner: { model: 'Orchestrator (Neon)', pool: 'gemini', requests: 1, inputTokens: 120000, cachedTokens: 0, uncachedTokens: 120000, outputTokens: 4000, totalTokens: 124000, hitRate: 0 },
    executor: { model: 'Gemini 4 Hydrogen (Orchestrator)', pool: 'gemini', requests: 1, inputTokens: 90000, cachedTokens: 80000, uncachedTokens: 10000, outputTokens: 2000, totalTokens: 92000, hitRate: 80000 / 90000 },
  };
  customSpeedOverride = { ...baseMetrics, taskUsage: swarmTaskUsage, orchestrator: switchedOrch, transcriptStats };

  for (const lang of ['en', 'zh-CN']) {
    const p = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${base}/inline?lang=${lang}`);
    const s = p.locator('#ag-pulse-status-bar');
    await s.waitFor();
    await s.locator('[data-card=cache]').click();
    await s.locator('#orchestrator-breakdown').waitFor({ state: 'visible' });
    await s.locator('#orchestration-breakdown').waitFor({ state: 'visible' });
    await s.locator('#orchestrator-breakdown summary').click();
    await s.locator('#orchestration-breakdown summary').click();
    const phaseSummary = await s.locator('#orchestrator-breakdown summary').textContent();
    const phaseText = await s.locator('#orch-phase-body').textContent();
    const teamText = await s.locator('#orch-body').textContent();
    if (lang === 'en') {
      assert.ok(phaseSummary.includes('Orchestrator · Single-session split'), phaseSummary);
      assert.ok(phaseText.includes('Same session · Planner switches to Executor'), phaseText);
      assert.ok(phaseText.includes('Planner · Orchestrator (Neon)'), phaseText);
      assert.ok(phaseText.includes('Executor · Gemini 4 Hydrogen (Orchestrator)'), phaseText);
      assert.ok(phaseText.includes('Switch cold-starts') && phaseText.includes('1×'), phaseText);
      assert.ok(phaseText.includes('1 req'), phaseText);
      assert.ok(!phaseText.includes('⚠') && !teamText.includes('⚠'), 'Cold-cache rows must stay neutral without warning glyph');
      assert.ok(teamText.includes('Multi-session team · Independent worker chats'), teamText);
      assert.ok(!teamText.includes('Planner ·') && !teamText.includes('Orchestrator split'), teamText);
    } else {
      assert.ok(phaseSummary.includes('Orchestrator · 单会话双模型'), phaseSummary);
      assert.ok(phaseText.includes('同一会话内 · 规划与执行切模型'), phaseText);
      assert.ok(phaseText.includes('主调度 · Orchestrator (Neon)'), phaseText);
      assert.ok(phaseText.includes('干活执行 · Gemini 4 Hydrogen (Orchestrator)'), phaseText);
      assert.ok(phaseText.includes('切模型冷缓存') && phaseText.includes('1 次'), phaseText);
      assert.ok(phaseText.includes('1 次请求'), phaseText);
      assert.ok(!phaseText.includes('⚠') && !teamText.includes('⚠'), 'Cold-cache rows must stay neutral without warning glyph');
      assert.ok(teamText.includes('多会话并行团队 · 主协调与各成员独立对话'), teamText);
      assert.ok(!teamText.includes('主调度 ·'), teamText);
    }
    if (lang === 'en') {
      const phaseIdleChanges = await p.evaluate(async () => {
        const root = document.getElementById('ag-pulse-status-bar').shadowRoot;
        const changes = [];
        const obs = new MutationObserver(rs => changes.push(...rs.map(r => r.target.id || r.type)));
        obs.observe(root.getElementById('orchestrator-breakdown'), { subtree: true, childList: true, characterData: true, attributes: true });
        await new Promise(r => setTimeout(r, 2600));
        obs.disconnect();
        return changes;
      });
      assert.deepEqual(phaseIdleChanges, [], 'Orchestrator card must not mutate on idle polling');
    }
    await p.close();
  }

  const narrowOrchSwitched = await browser.newPage({ viewport: { width: 294, height: 640 } });
  narrowOrchSwitched.on('pageerror', e => errors.push(e.message));
  await narrowOrchSwitched.goto(`${base}/inline?lang=en&narrow=1`);
  const narrowOrchStrip = narrowOrchSwitched.locator('#ag-pulse-status-bar');
  await narrowOrchStrip.waitFor();
  await narrowOrchStrip.locator('[data-card=cache]').click();
  await narrowOrchStrip.locator('#orchestrator-breakdown summary').click();
  await assertNoClipping(narrowOrchStrip.locator('#cache-card'), narrowOrchStrip.locator('#orch-phase-body'));
  await narrowOrchSwitched.close();

  const unswitchedOrch = {
    detected: true,
    source: 'config',
    configuredPlanner: 'Orchestrator (Neon)',
    configuredExecutor: 'Gemini 4 Hydrogen (Orchestrator)',
    switched: false,
    phaseSwitchCount: 0,
    coldStartSwitches: 0,
    planner: { model: 'Orchestrator (Neon)', pool: 'gemini', requests: 1, inputTokens: 40000, cachedTokens: 0, uncachedTokens: 40000, outputTokens: 1200, totalTokens: 41200, hitRate: 0 },
    executor: null,
  };
  customSpeedOverride = { ...baseMetrics, modelBreakdown: [], cacheMissSurges: 0, cacheMissSurgeTokens: 0, taskUsage: null, orchestrator: unswitchedOrch, transcriptStats };

  for (const lang of ['en', 'zh-CN']) {
    const p = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${base}/inline?lang=${lang}`);
    const s = p.locator('#ag-pulse-status-bar');
    await s.waitFor();
    await s.locator('[data-card=cache]').click();
    await s.locator('#orchestrator-breakdown').waitFor({ state: 'visible' });
    assert.equal(await s.locator('#orchestration-breakdown').isVisible(), false, 'Single-model read-only Orchestrator must keep Swarm/multi-agent card hidden');
    await s.locator('#orchestrator-breakdown summary').click();
    const text = await s.locator('#orch-phase-body').textContent();
    if (lang === 'en') {
      assert.ok(text.includes('Read-only turn · no switch yet'), text);
      assert.ok(text.includes('Configured: Orchestrator (Neon) → Gemini 4 Hydrogen (Orchestrator)'), text);
    } else {
      assert.ok(text.includes('仅规划/只读 · 尚未切执行模型'), text);
      assert.ok(text.includes('已配组合：Orchestrator (Neon) → Gemini 4 Hydrogen (Orchestrator)'), text);
    }
    await p.close();
  }

  // Also check Side Panel separated cards (Orchestrator + Swarm)
  customSpeedOverride = { ...baseMetrics, taskUsage: swarmTaskUsage, orchestrator: switchedOrch, transcriptStats };
  prefs = { language: 'zh-CN', languageGuideDismissed: true, revision: 1 };
  const panelSep = await browser.newPage({ viewport: { width: 420, height: 700 } });
  panelSep.on('pageerror', e => errors.push(e.message));
  await panelSep.goto(`${base}/`);
  await panelSep.locator('#strip-route-pill').waitFor({ state: 'visible' });
  assert.match((await panelSep.locator('#strip-route-pill').textContent()) || '', /^双模型/);
  await panelSep.locator('#strip-route-pill').click();
  await panelSep.locator('#cache-card').waitFor({ state: 'visible' });
  await panelSep.locator('#orchestrator-breakdown').waitFor({ state: 'visible' });
  await panelSep.locator('#orchestration-breakdown').waitFor({ state: 'visible' });
  assert.equal(await panelSep.locator('#orchestrator-breakdown').evaluate(e => e.open), true);
  assert.equal(await panelSep.locator('#orchestration-breakdown').evaluate(e => e.open), true);
  const pOrchText = await panelSep.locator('#orch-phase-body').textContent();
  const pSwarmText = await panelSep.locator('#orch-body').textContent();
  assert.ok(pOrchText.includes('同一会话内 · 规划与执行切模型') && pOrchText.includes('主调度 · Orchestrator (Neon)'), pOrchText);
  assert.ok(pSwarmText.includes('多会话并行团队 · 主协调与各成员独立对话') && !pSwarmText.includes('主调度 ·'), pSwarmText);
  await panelSep.close();

  customSpeedOverride = { ...baseMetrics, modelBreakdown: [], cacheMissSurges: 0, cacheMissSurgeTokens: 0, taskUsage: null, orchestrator: unswitchedOrch, transcriptStats };
  prefs = { language: 'en', languageGuideDismissed: true, revision: 1 };
  const narrowOrchReadOnly = await browser.newPage({ viewport: { width: 294, height: 640 } });
  narrowOrchReadOnly.on('pageerror', e => errors.push(e.message));
  await narrowOrchReadOnly.goto(`${base}/inline?lang=en&narrow=1`);
  const narrowRoStrip = narrowOrchReadOnly.locator('#ag-pulse-status-bar');
  await narrowRoStrip.waitFor();
  await narrowRoStrip.locator('[data-card=cache]').click();
  await narrowRoStrip.locator('#orchestrator-breakdown summary').click();
  await assertNoClipping(narrowRoStrip.locator('#cache-card'), narrowRoStrip.locator('#orch-phase-body'));
  await narrowOrchReadOnly.close();
  customSpeedOverride = null;

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ multiAgentUi: true, panel: true, inline: true, usagePoolStrip: true, narrowNoClip: true, workerRoleLabel: true, heroWrapNoOverflow: true, inlineSwarm: true, inlineOrchestrator: true, pageErrors: [] }));
} finally {
  await browser.close();
  server.closeAllConnections?.();
  await new Promise(r => server.close(r));
}
