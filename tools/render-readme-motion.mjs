// Offline motion stage: drives real inline-widget.cjs + sidecars/panel/ in headless Chrome via CDP
// and encodes a 1440x810 24fps animated WebP (+ optional MP4 preview).
import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';
import { compositionMetrics, tokenBaseMetrics, hostContextMetrics, attachHostContextUsage, attachTokenBase } from '../sidecars/panel/composition.mjs';
import { panelAppSource, panelPageSource } from '../sidecars/panel/panel-source.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const createTheme = createRequire(import.meta.url)('../compat/theme.cjs');
const version = JSON.parse(await readFile(join(repo, 'plugin.json'), 'utf8')).version;

const args = process.argv.slice(2);
const argVal = (prefix, fallback) => args.find(x => x.startsWith(prefix))?.slice(prefix.length) || fallback;
const output = resolve(repo, argVal('--output=', '.data/motion-preview'));
const lang = argVal('--lang=', 'zh');
const theme = argVal('--theme=', 'dark');
const dark = theme !== 'light';
const zh = lang === 'zh';

const FPS = 24;
const WIDTH = 1440;
const HEIGHT = 810;

const sources = await Promise.all(
  ['i18n.cjs', 'theme.cjs', 'inline-widget.cjs', 'usage-ui.cjs'].map(f => readFile(join(repo, 'compat', f), 'utf8'))
);
const extract = s => {
  assert.ok(s.includes('module.exports = '));
  return s.slice(s.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');
};
const install = `window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});window.__agPulseUsageFactory=(${extract(sources[3])});(${extract(sources[2])})();`;

const panelStyles = await readFile(join(repo, 'sidecars/panel/styles.css'), 'utf8');
const panelThemeCss = createTheme().css(':root');
const panelAppJs = panelAppSource();

const ids = { main: '11111111-1111-1111-1111-111111111111' };
const now = Date.now();
const today = '2026-10-11';
const models = ['Gemini 4 Hydrogen', 'Claude Sonnet', 'GPT 6.1 Sol'];
const days = Array.from({ length: 120 }, (_, i) => {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 119 + i);
  return {
    date: d.toISOString().slice(0, 10),
    models: Object.fromEntries(models.map((m, j) => {
      const n = ((i * 17 + j * 3) % 11) * 1200;
      return [m, { uncached: n, cacheRead: n * 2, cacheWrite: 0, output: n, total: n * 4, requests: n ? 1 : 0 }];
    })),
  };
});
const total = ds => ds.reduce((n, d) => n + Object.values(d.models).reduce((sum, r) => sum + r.total, 0), 0);
const usage = {
  accountKey: 'illustrative', today, timeZone: 'Asia/Shanghai', models, days,
  todayTokens: total(days.slice(-1)), weekTokens: total(days.slice(-7)),
  monthTokens: total(days.filter(d => d.date.startsWith('2026-10'))),
  totalTokens: total(days),
  requests: days.reduce((n, d) => n + Object.values(d.models).reduce((s, r) => s + r.requests, 0), 0),
  firstDate: days[0].date, syncing: false, unknownRequests: 0, partialRequests: 0, unreadableFiles: 0,
};
const reset = ms => new Date(now + ms).toISOString();

const illustrativeHostUsage = hostContextMetrics({
  contextWindowUsage: {
    estimatedTokensUsed: 112000, maxContextTokens: 256000,
    tokenGroups: [
      { name: 'System Prompt', type: 'TOKEN_TYPE_SYSTEM_PROMPT', numTokens: 5200 },
      { name: 'Mcp Tools', type: 'TOKEN_TYPE_MCP_TOOLS', numTokens: 1800 },
      { name: 'Subagents', type: 'TOKEN_TYPE_SUBAGENTS', numTokens: 2400 },
      { name: 'Skills', type: 'TOKEN_TYPE_SKILLS', numTokens: 6400 },
      { name: 'Plugins', type: 'TOKEN_TYPE_PLUGINS', numTokens: 1200 },
      { name: 'Rules', type: 'TOKEN_TYPE_RULES', numTokens: 5800 },
      { name: 'Tools', type: 'TOKEN_TYPE_TOOLS', numTokens: 14200 },
      { name: 'Chat Messages', type: 'TOKEN_TYPE_CHAT_MESSAGES', numTokens: 75000 },
    ],
  },
});
const illustrativeTokenBase = tokenBaseMetrics({
  customizationTokenBase: {
    totalTokens: 14000,
    groups: [
      { name: 'Rules', type: 'TOKEN_TYPE_RULES', numTokens: 5800, children: [{ name: 'AGENTS.md', numTokens: 2600 }, { name: 'team-resident.md', numTokens: 3200 }] },
      { name: 'Skills', type: 'TOKEN_TYPE_SKILLS', numTokens: 6400, children: [{ name: 'tabbit', numTokens: 2200 }, { name: 'team-review-governance', numTokens: 4200 }] },
      { name: 'Mcp Tools', type: 'TOKEN_TYPE_MCP_TOOLS', numTokens: 1800, children: [{ name: 'codegraph', numTokens: 1100 }, { name: 'openviking', numTokens: 700 }] },
    ],
  },
  customizationBudget: 20000, remainingBudget: 6000, rulesBudget: 20000, remainingRulesBudget: 14200,
});

function buildSample() {
  const steps = [];
  for (let i = 0; i < 5; i++) {
    steps.push({ type: 'USER_INPUT' });
    steps.push({ type: 'READ_FILE', metadata: { startedAt: new Date(now - 60000 + i * 10000).toISOString(), completedAt: new Date(now - 60000 + i * 10000 + 1600).toISOString() } });
    steps.push({ type: 'ASSISTANT_RESPONSE' });
    if (i === 2) steps.push({ type: 'CORTEX_STEP_TYPE_COMPACTION', metadata: {} });
  }
  const reqInputs = [{ u: 12225, c: 46000 }, { u: 16225, c: 82000 }, { u: 26225, c: 128000 }, { u: 18225, c: 100000 }, { u: 21350, c: 132000 }];
  const generators = Array.from({ length: 5 }, (_, i) => ({
    stepIndices: [i * 3 + 2 + (i > 2 ? 1 : 0)],
    chatModel: {
      modelDisplayName: 'Gemini 4 Hydrogen',
      streamingDuration: '10s',
      timeToFirstToken: '0.6s',
      chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 92000 + i * 5000, maxContextTokens: 256000 } },
      usage: {
        inputTokens: reqInputs[i].u, cacheReadTokens: reqInputs[i].c,
        responseOutputTokens: 1046, thinkingOutputTokens: i === 4 ? 405 : 406,
        outputTokens: i === 4 ? 1451 : 1452, apiProvider: 'API_PROVIDER_GOOGLE_GEMINI',
      },
    },
  }));
  const speed = trajectoryMetrics({ trajectory: { cascadeId: ids.main, steps, generatorMetadata: generators } });
  speed.transcriptStats = {
    version: 1, status: 'ready', complete: true, userTokens: 2800, assistantTokens: 5400,
    toolTokens: 32000, systemTokens: 1800, totalTokens: 42000, matchedSteps: steps.length, compactionMarkers: 1, imageSteps: 0,
  };
  let comp = compositionMetrics({ context: speed.context, steps, generators, transcript: speed.transcriptStats });
  comp = attachTokenBase(comp, illustrativeTokenBase);
  comp = attachHostContextUsage(comp, illustrativeHostUsage);
  speed.contextComposition = comp;
  speed.estimatedCost = { totalUsd: 0.42, hasPriced: true, complete: true, estimated: true };
  return {
    connection: 'live', usage, serverTime: new Date(now).toISOString(), quotaUpdatedAt: new Date(now).toISOString(), speed,
    groups: [
      { id: 'gemini', name: 'Gemini', windows: { '5h': { available: true, remaining: 0.834, resetAt: reset(9978000) }, weekly: { available: true, remaining: 0.617, resetAt: reset(393246000) } } },
      { id: 'claude', name: 'Claude', windows: { '5h': { available: true, remaining: 0.742, resetAt: reset(7812000) }, weekly: { available: true, remaining: 0.469, resetAt: reset(327846000) } } },
      { id: 'argon', name: 'Gemini (Argon)', windows: { weekly: { available: true, remaining: 0.685, resetAt: reset(327846000) } } },
    ],
  };
}

const insightsSample = {
  version: 1, today, timeZone: 'Asia/Shanghai',
  accountCredits: { planName: 'Pro', tierName: 'Google AI Ultra', availablePromptCredits: 500, monthlyPromptCredits: 50000, availableFlowCredits: 100, monthlyFlowCredits: 150000 },
  kpis: { totalSessions: 28, activeSessions: 4, archivedSessions: 24, totalTokens: 8649600, uncachedTokens: 1820000, cacheReadTokens: 6420000, cacheWriteTokens: 0, outputTokens: 409600, totalRounds: 186, totalModelCalls: 328, totalToolCalls: 612, totalActiveMs: 4920000, avgCacheHitRate: 6420000 / (6420000 + 1820000), estimatedCostUsd: 12.45, pricedSessions: 28, totalSessionsForPricing: 28 },
  last7Days: Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 6 + i);
    return { date: d.toISOString().slice(0, 10), sessions: 2 + (i % 3), totalTokens: (i + 2) * 115000, estimatedCostUsd: (i + 2) * 0.18 };
  }),
  heatmap: days.slice(-112).map((d, i) => ({ date: d.date, sessions: 1 + (i % 4), tokens: Object.values(d.models).reduce((s, r) => s + r.total, 0) })),
  composition: { uncached: 1820000, cacheRead: 6420000, cacheWrite: 0, output: 409600 },
  distributions: {
    projects: [{ name: 'antigrative-dashboard', sessions: 14, tokens: 5120000 }, { name: 'agy-project-sidebar', sessions: 8, tokens: 2410000 }, { name: 'agent-workflows', sessions: 6, tokens: 1119600 }],
    skills: [{ name: 'team-review-governance', count: 18, sessions: 9 }, { name: 'tabbit', count: 12, sessions: 6 }, { name: 'team-diagnosing-bugs', count: 9, sessions: 5 }],
    tools: [{ name: 'read_file', count: 264 }, { name: 'run_command', count: 188 }, { name: 'edit_file', count: 114 }, { name: 'rg', count: 46 }],
    commands: [{ name: 'npm test', count: 54 }, { name: 'git status', count: 48 }, { name: 'node tools/', count: 32 }],
    models: [],
  },
  totalMatchingSessions: 28,
  sessions: [
    { id: ids.main, title: 'v1.0.3 Context Insights & Cache Pills', project: 'antigrative-dashboard', model: 'Gemini 4 Hydrogen (Medium)', status: 'IDLE', archived: false, rounds: 12, steps: 48, totalTokens: 589509, currentContextTokens: 112000, cacheHitRate: 0.838, estimatedCostUsd: 0.42 },
  ],
  cacheInfo: { totalScanned: 28, parsedNow: 0, cacheHits: 28, scanMs: 14, shardCount: 16 },
};

const hostIcon = name => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${{ add: '<path d="M12 5v14M5 12h14"/>', mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v2a6 6 0 0 0 12 0v-2M12 19v3"/>', send: '<path d="M12 19V5m-6 6 6-6 6 6"/>' }[name]}</svg>`;

function stageHtml() {
  const bg = dark ? '#0d1117' : '#f1f5f9';
  const surface = dark ? '#161b22' : '#ffffff';
  const surface2 = dark ? '#1c222b' : '#f8fafc';
  const border = dark ? '#2d3543' : '#d8e0ec';
  const text = dark ? '#e6edf3' : '#1e293b';
  const muted = dark ? '#8b949e' : '#64748b';
  const accent = dark ? '#60a5fa' : '#2563eb';
  const prefs = {
    language: zh ? 'zh-CN' : 'en', languageGuideDismissed: true, quotaDisplayMode: 'dual',
    quotaDisplay: 'both', stripMode: 'full', themeMode: dark ? 'dark' : 'light',
    barColors: {}, inlineCacheHit: true, cacheHitTone: 'accent', revision: 1,
  };
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}"><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0;width:1440px;height:810px;overflow:hidden;background:${bg};color:${text};font:13px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.bg-glow{position:fixed;inset:0;pointer-events:none;background:${dark
  ? 'radial-gradient(900px 420px at 28% 12%,rgba(56,139,253,.14),transparent 65%),radial-gradient(700px 380px at 82% 85%,rgba(139,92,246,.10),transparent 65%)'
  : 'radial-gradient(900px 420px at 28% 12%,rgba(37,99,235,.08),transparent 65%),radial-gradient(700px 380px at 82% 85%,rgba(124,58,237,.06),transparent 65%)'}}
.stage{position:relative;z-index:1;display:flex;flex-direction:column;height:810px;padding:24px 36px 18px}
.header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px}
.brand{font-size:11px;font-weight:700;letter-spacing:1.6px;color:${accent};margin-bottom:6px;display:flex;align-items:center;gap:8px}
.pill-live{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;background:${dark ? 'rgba(56,139,253,.15)' : 'rgba(37,99,235,.10)'};font-size:10px;letter-spacing:.4px}
.dot{width:6px;height:6px;border-radius:50%;background:#22c55e}
h1{margin:0;font-size:26px;font-weight:650;letter-spacing:-.5px;line-height:1.2}
.sub{margin:4px 0 0;color:${muted};font-size:13px}
.step-badge{padding:6px 14px;border-radius:999px;border:1px solid ${border};background:${surface};font-size:12px;font-weight:500;color:${text};display:flex;align-items:center;gap:8px;box-shadow:0 4px 16px rgba(0,0,0,${dark ? '.28' : '.06'})}
.step-badge span{color:${accent};font-weight:700}
.workspace{flex:1;min-height:0;display:grid;grid-template-columns:1fr 410px;gap:20px}
.pane{background:${surface};border:1px solid ${border};border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,${dark ? '.35' : '.08'})}
.titlebar{height:36px;padding:0 14px;background:${surface2};border-bottom:1px solid ${border};display:flex;align-items:center;justify-content:space-between;font-size:12px;color:${muted}}
.traffic{display:flex;gap:7px}.traffic i{width:10px;height:10px;border-radius:50%;display:block;opacity:.85}
.chat-body{flex:1;min-height:0;padding:20px 26px 18px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:visible}
.messages{display:flex;flex-direction:column;gap:12px}
.msg{max-width:86%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.55}
.msg.user{align-self:flex-end;background:${dark ? '#1f2a3c' : '#eff6ff'};border:1px solid ${dark ? '#2e415e' : '#bfdbfe'}}
.msg.ai{align-self:flex-start;background:${surface2};border:1px solid ${border};color:${muted}}
.msg.ai strong{color:${text};font-weight:600}
.tool-chip{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:3px 9px;border-radius:6px;background:${dark ? '#13171e' : '#eef2f7'};border:1px solid ${border};font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${accent}}
.composer-wrap{display:flex;justify-content:center;padding-top:8px}
.composer{width:840px;max-width:100%;padding:12px;border:1px solid ${dark ? '#363f4d' : '#cbd5e1'};border-radius:16px;background:${dark ? '#20252d' : '#ffffff'};box-shadow:0 8px 24px rgba(0,0,0,${dark ? '.28' : '.07'});transition:none}
.editor{height:40px;padding:2px 4px;outline:none;color:${muted};font-size:13px}
.actions,.left,.right{display:flex;align-items:center;gap:5px;height:30px}
.left{flex:1;min-width:0}.right{flex:none;gap:8px}
.model-branch{display:flex;flex:1 1 200px;min-width:20px;max-width:200px;overflow:hidden}
.model-branch button{width:100%;overflow:hidden;text-align:left}
.model-branch span{padding-left:5px}
.protected{width:28px;flex:none;display:grid;place-items:center}
button{font:inherit;border:0;background:transparent;color:${dark ? '#c9d1d9' : '#334155'};height:28px;padding:0 4px;white-space:nowrap}
.send{border-radius:50%;background:${dark ? '#303947' : '#e2e8f0'};color:${dark ? '#f0f6fc' : '#1e293b'}}
.panel-frame{width:100%;height:100%;border:0;display:block;flex:1}
.footer{margin-top:10px;display:flex;justify-content:space-between;font-size:11px;color:${muted}}
#demo-cursor{position:fixed;left:0;top:0;width:24px;height:24px;pointer-events:none;z-index:99999;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 6px rgba(0,0,0,.45))}
#demo-ripple{position:fixed;left:0;top:0;width:30px;height:30px;border-radius:50%;border:2px solid ${accent};pointer-events:none;z-index:99998;opacity:0;transform:translate(-100px,-100px) scale(.4)}
</style>
<body data-theme="${dark ? 'dark' : 'light'}">
<div class="bg-glow"></div>
<div class="stage">
  <header class="header">
    <div>
      <div class="brand">ANTIGRATIVE DASHBOARD · v${version} <span class="pill-live"><i class="dot"></i>${zh ? '源码离线舞台录制' : 'LIVE SOURCE STAGE'}</span></div>
      <h1>${zh ? '主对话与子代理，统计都在输入框旁。' : 'Your agent. Your metrics. In view.'}</h1>
      <p class="sub">${zh ? '生成速度 · 显式缓存命中率 · 5h / 周双窗口额度 · 8 分类上下文构成 · 侧边栏全局洞察' : 'Speed · Explicit cache hit · 5h/weekly quota · 8-group context composition · Insights panel'}</p>
    </div>
    <div class="step-badge"><span id="caption-num">01</span><div id="caption-text">${zh ? '状态栏常驻 · 实时遥测就绪' : 'Always-on status strip ready'}</div></div>
  </header>
  <main class="workspace">
    <section class="pane">
      <div class="titlebar">
        <div class="traffic"><i style="background:#ff5f56"></i><i style="background:#ffbd2e"></i><i style="background:#27c93f"></i></div>
        <div>${zh ? '主对话 · antigrative-dashboard' : 'Main Session · antigrative-dashboard'}</div>
        <div>Gemini 4 Hydrogen</div>
      </div>
      <div class="chat-body">
        <div class="messages">
          <div class="msg user">${zh ? '帮我核对当前上下文 8 分类构成，并看看过去 7 天的缓存命中率趋势。' : 'Inspect the 8-group context composition and 7-day cache hit trend.'}</div>
          <div class="msg ai">
            <strong>${zh ? '已完成遥测聚合：' : 'Telemetry aggregated:'}</strong> ${zh ? '当前上下文占用 154.8K / 256K（60%），显式缓存命中率 83.8%。' : 'Context 154.8K / 256K (60%), explicit cache hit rate 83.8%.'}<br>
            <span class="tool-chip">read_file · sidecars/panel/composition.mjs</span>
          </div>
        </div>
        <div class="composer-wrap">
          <section class="composer" data-testid="agent-input-box">
            <div><div role="textbox" contenteditable="true" class="editor">${zh ? '输入消息，@ 提及，/ 选择操作' : 'Ask anything, @ to mention, / for actions'}</div></div>
            <div class="actions">
              <div class="left">
                <button class="protected" aria-label="Add context">${hostIcon('add')}</button>
                <div class="model-branch"><button data-testid="model-selector-trigger">Gemini 4 Hydrogen <span>⌃</span></button></div>
              </div>
              <div class="right">
                <button class="protected" aria-label="Record voice memo">${hostIcon('mic')}</button>
                <button class="protected send" data-testid="send-button" disabled>${hostIcon('send')}</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
    <aside class="pane">
      <div class="titlebar">
        <div>${zh ? '侧边栏 · 洞察面板' : 'Sidecar · Insights Panel'}</div>
        <div style="color:${accent};font-weight:600">v${version}</div>
      </div>
      <iframe id="panel-iframe" class="panel-frame" src="/panel?lang=${zh ? 'zh-CN' : 'en'}"></iframe>
    </aside>
  </main>
  <footer class="footer">
    <span>${zh ? '以上画面由离线渲染舞台直接运行本仓库前端源码逐帧录制，示例数据均为虚构。' : 'Rendered frame-by-frame from current widget & sidecar source with illustrative data.'}</span>
    <span>1440×810 · 24fps · 8.0s</span>
  </footer>
</div>
<svg id="demo-cursor" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.3L16 21l-2.5 1-3.4-6.7L5.5 19z" fill="#ffffff" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round"/></svg>
<div id="demo-ripple"></div>
<script>
history.replaceState({}, '', '/c/${ids.main}');
window.__prefs = ${JSON.stringify(prefs)};
window.agPulseHost = {
  getMetrics: async () => (${JSON.stringify(buildSample())}),
  getPreferences: async () => window.__prefs,
  setPreferences: async x => { window.__prefs = { ...window.__prefs, ...x, revision: window.__prefs.revision + 1 }; return window.__prefs; },
  report: () => {},
};
</script>
<script src="/widget.js"></script>
</body></html>`;
}

function panelHtml() {
  const bg = dark ? '#161b22' : '#ffffff';
  const fg = dark ? '#e6edf3' : '#1e293b';
  const primary = dark ? '#60a5fa' : '#2563eb';
  return panelPageSource()
    .replace('<head>', `<head><meta charset="utf-8"><style>:root{--background:${bg};--foreground:${fg};--primary:${primary}}body.standalone{background:${bg}!important;padding:0;min-height:auto}</style>`)
    .replace('/preload.js', '/panel-preload.js');
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let content;
  let type = 'text/html; charset=utf-8';
  if (url.pathname === '/stage') content = stageHtml();
  else if (url.pathname === '/widget.js') { content = install; type = 'text/javascript'; }
  else if (url.pathname === '/panel') content = panelHtml();
  else if (url.pathname === '/panel-preload.js') {
    const langCode = zh ? 'zh-CN' : 'en';
    content = `window.sidecar={conversationId:${JSON.stringify(ids.main)},fetch:(p,init)=>fetch(p+(p.includes('?')?'&':'?')+'lang=${langCode}',init)};`;
    type = 'text/javascript';
  }
  else if (url.pathname === '/styles.css') { content = panelStyles; type = 'text/css'; }
  else if (url.pathname === '/theme.css') { content = panelThemeCss; type = 'text/css'; }
  else if (url.pathname === '/app.js') { content = panelAppJs; type = 'text/javascript'; }
  else if (url.pathname === '/api/preferences') {
    content = JSON.stringify({ language: zh ? 'zh-CN' : 'en', languageGuideDismissed: true, quotaDisplay: 'both', hostUiLocalization: true, revision: 1 });
    type = 'application/json';
  }
  else if (url.pathname === '/api/metrics') {
    content = JSON.stringify({ ...buildSample(), preferences: { language: zh ? 'zh-CN' : 'en', languageGuideDismissed: true, quotaDisplay: 'both', hostUiLocalization: true, revision: 1 } });
    type = 'application/json';
  }
  else if (url.pathname === '/api/insights') {
    content = JSON.stringify(insightsSample);
    type = 'application/json';
  }
  else { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': type });
  res.end(content);
});

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

async function launchChrome() {
  const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const userDataDir = join(tmpdir(), `ag-motion-chrome-${process.pid}-${Date.now()}`);
  await mkdir(userDataDir, { recursive: true });
  const proc = spawn(chromeBin, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu-sandbox',
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsBrowserUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome DevTools timeout: ' + buf)), 15000);
    proc.stderr.on('data', chunk => {
      buf += chunk.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.once('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}: ${buf}`)); });
  });

  const port = new URL(wsBrowserUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.ready();
  return { proc, client, userDataDir };
}

const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * ease(Math.max(0, Math.min(1, t)));

await server.listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const framesDir = join(output, 'frames');
await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });

const { proc, client, userDataDir } = await launchChrome();
try {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await client.send('Page.navigate', { url: `${base}/stage` });

  // Wait until both widget and sidecar panel are hydrated
  for (let i = 0; i < 60; i++) {
    const ok = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const w = document.getElementById('ag-pulse-status-bar');
        const tps = w?.shadowRoot?.getElementById('tps')?.textContent;
        const iframe = document.getElementById('panel-iframe');
        const strip = iframe?.contentDocument?.getElementById('strip-tps')?.textContent;
        return Boolean(tps && tps !== '—' && w.dataset.layout === 'ready' && strip && strip !== '—');
      })()`,
      returnByValue: true,
    });
    if (ok.result.value) break;
    await new Promise(r => setTimeout(r, 150));
  }

  // Gather exact coordinates of interactive controls for smooth cursor choreography
  const coords = (await client.send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.getElementById('ag-pulse-status-bar').shadowRoot;
      const center = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
      const iframe = document.getElementById('panel-iframe');
      const ir = iframe.getBoundingClientRect();
      const tab = iframe.contentDocument.getElementById('view-insights-tab').getBoundingClientRect();
      return {
        speed: center(root.querySelector('[data-card="speed"]')),
        cache: center(root.querySelector('[data-card="cache"]')),
        quota: center(root.querySelector('[data-card="quota"]')),
        context: center(root.querySelector('[data-card="context"]')),
        insightsTab: { x: Math.round(ir.left + tab.left + tab.width / 2), y: Math.round(ir.top + tab.top + tab.height / 2) },
        neutral: { x: 460, y: 420 },
      };
    })()`,
    returnByValue: true,
  })).result.value;

  const setCaption = async (num, text) => {
    await client.send('Runtime.evaluate', {
      expression: `document.getElementById('caption-num').textContent=${JSON.stringify(num)};document.getElementById('caption-text').textContent=${JSON.stringify(text)};`,
    });
  };
  const setCursor = async (x, y, ripple = 0) => {
    await client.send('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('demo-cursor').style.transform='translate(${x}px,${y}px)';
        const rp=document.getElementById('demo-ripple');
        rp.style.opacity=${ripple > 0 ? (1 - ripple).toFixed(2) : 0};
        rp.style.transform='translate(${x - 15}px,${y - 15}px) scale('+(0.4+${ripple}*1.1)+')';
      })()`,
    });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  };
  const setComposerWidth = async w => {
    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('.composer').style.width='${Math.round(w)}px';`,
    });
  };
  const clickAt = async (x, y) => {
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  // 8.0 seconds @ 24fps = 192 frames
  const TOTAL_FRAMES = 192;
  let lastX = 760;
  let lastY = 740;
  let insightsClicked = false;

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const t = f / FPS;
    let cx = lastX;
    let cy = lastY;
    let ripple = 0;

    if (t < 1.0) {
      await setCaption('01', zh ? '状态栏常驻 · 实时速度 / 缓存 / 额度 / 上下文' : 'Live strip · Speed / Cache / Quota / Context');
      cx = lerp(760, coords.speed.x, t / 0.8);
      cy = lerp(740, coords.speed.y, t / 0.8);
    } else if (t < 2.2) {
      await setCaption('02', zh ? '悬停穿透 · 生成速度与 TTFT 详情' : 'Hover · Generation speed & TTFT');
      cx = coords.speed.x;
      cy = coords.speed.y;
    } else if (t < 3.5) {
      await setCaption('02', zh ? '悬停穿透 · 显式缓存命中率拆分' : 'Hover · Explicit cache hit breakdown');
      const p = Math.min(1, (t - 2.2) / 0.35);
      cx = lerp(coords.speed.x, coords.cache.x, p);
      cy = lerp(coords.speed.y, coords.cache.y, p);
    } else if (t < 4.8) {
      await setCaption('03', zh ? '悬停穿透 · 5h / 周额度与耗尽预测' : 'Hover · 5h / Weekly quota & depletion');
      const p = Math.min(1, (t - 3.5) / 0.35);
      cx = lerp(coords.cache.x, coords.quota.x, p);
      cy = lerp(coords.cache.y, coords.quota.y, p);
    } else if (t < 6.1) {
      await setCaption('03', zh ? '悬停穿透 · 宿主 8 分类上下文构成' : 'Hover · 8-group context composition');
      const p = Math.min(1, (t - 4.8) / 0.35);
      cx = lerp(coords.quota.x, coords.context.x, p);
      cy = lerp(coords.quota.y, coords.context.y, p);
    } else if (t < 7.1) {
      await setCaption('04', zh ? '自适应布局 · 窄窗口自动退化为四图标' : 'Adaptive layout · Smooth collapse to 4 icons');
      const p = (t - 6.1) / 1.0;
      cx = lerp(coords.context.x, coords.insightsTab.x, Math.min(1, p));
      cy = lerp(coords.context.y, coords.insightsTab.y, Math.min(1, p));
      const w = p < 0.5 ? lerp(840, 420, p * 2) : lerp(420, 840, (p - 0.5) * 2);
      await setComposerWidth(w);
    } else {
      await setCaption('05', zh ? '侧边栏联动 · 全局洞察与 7 天热力图' : 'Sidecar panel · Global insights & heatmap');
      cx = coords.insightsTab.x;
      cy = coords.insightsTab.y;
      if (!insightsClicked) {
        await clickAt(cx, cy);
        insightsClicked = true;
      }
      if (t < 7.45) ripple = (t - 7.1) / 0.35;
    }

    lastX = cx;
    lastY = cy;
    await setCursor(Math.round(cx), Math.round(cy), ripple);
    await new Promise(r => setTimeout(r, 30));
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(framesDir, `frame_${String(f).padStart(4, '0')}.png`), Buffer.from(shot.data, 'base64'));
  }

  const webpPath = join(output, `hero-${theme}-${lang}.webp`);
  const mp4Path = join(output, `hero-${theme}-${lang}.mp4`);

  execFileSync('img2webp', [
    '-loop', '0',
    '-d', String(Math.round(1000 / FPS)),
    '-lossy', '-q', '82', '-m', '4',
    ...Array.from({ length: TOTAL_FRAMES }, (_, i) => join(framesDir, `frame_${String(i).padStart(4, '0')}.png`)),
    '-o', webpPath,
  ], { stdio: 'inherit' });

  execFileSync('ffmpeg', [
    '-y', '-framerate', String(FPS),
    '-i', join(framesDir, 'frame_%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart',
    mp4Path,
  ], { stdio: 'inherit' });

  console.log(JSON.stringify({ ok: true, webpPath, mp4Path, frames: TOTAL_FRAMES, fps: FPS }));
} finally {
  client.close();
  proc.kill('SIGTERM');
  server.close();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  await rm(framesDir, { recursive: true, force: true }).catch(() => {});
}
