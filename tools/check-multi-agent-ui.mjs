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
const snapshot = () => ({
  connection: 'live', serverTime: new Date().toISOString(), quotaUpdatedAt: new Date().toISOString(), preferences: prefs,
  groups: [{ id: 'gemini', name: 'Gemini', windows: { '5h': { available: true, remaining: 0.7 }, weekly: { available: true, remaining: 0.8 } } }],
  speed: workerMode
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
      const rows = [...body.querySelectorAll('.breakdown-row')].map(r => {
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
  await checkWorkerRow(workerPanel, workerPanel.locator('#cache-tab'), '#orchestration-breakdown summary', '#orch-body', 'Agent role', 'Worker');
  await workerPanel.locator('#language-toggle').click();
  await workerPanel.locator('[data-language-menu] [data-language="zh-CN"]').click();
  await workerPanel.locator('#orchestration-breakdown summary').filter({ hasText: '多代理与模型拆分' }).waitFor();
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
      const bloat = card.querySelector('#context-bloat-pill');
      const compactPill = card.querySelector('#context-compaction-pill');
      const tokens = card.querySelector('#context-tokens');
      const range = document.createRange();
      range.selectNodeContents(summary);
      const summaryLines = [...range.getClientRects()].length;
      const items = [summary, bloat, compactPill, tokens].map(el => ({
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
      await s.locator('#context-bloat-pill').waitFor({ state: 'visible' });
      await s.locator('#context-compaction-pill').waitFor({ state: 'visible' });
      await assertHeroWrap(s.locator('#context-card'), `inline-${vp.tag}-${lang}`);
      await p.close();
    }

    prefs = { language: lang, languageGuideDismissed: true, revision: 1 };
    const panelP = await browser.newPage({ viewport: { width: 320, height: 640 } });
    panelP.on('pageerror', e => errors.push(e.message));
    await panelP.goto(base + '/');
    await panelP.locator('#context-tab').click();
    await panelP.locator('#context-bloat-pill').waitFor({ state: 'visible' });
    await panelP.locator('#context-compaction-pill').waitFor({ state: 'visible' });
    await assertHeroWrap(panelP.locator('#context-card'), `panel-320px-${lang}`);
    await panelP.close();
  }

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ multiAgentUi: true, panel: true, inline: true, usagePoolStrip: true, narrowNoClip: true, workerRoleLabel: true, heroWrapNoOverflow: true, pageErrors: [] }));
} finally {
  await browser.close();
  server.closeAllConnections?.();
  await new Promise(r => server.close(r));
}
