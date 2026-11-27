<div align="center">

<img src="docs/assets/hero.png?v=1.0.1" width="100%" alt="Antigravity Dashboard: speed, cache, quota and context controls beside the input.">

# Agy Context Dashboard (Antigravity Dashboard)

DSH-style Antigravity (`agy`) context composition, token throughput, cache hit rate, quota pace, and global insights dashboard beside the model selector and inside the Side Panel.<br>
Keep the summary visible. Hover or switch tabs for full details.

[![Version 1.0.2](https://img.shields.io/badge/version-1.0.2-91adff?style=flat-square&labelColor=252936)](CHANGELOG.md)
[![Platforms](https://img.shields.io/badge/host-Windows%20%7C%20Linux%20%7C%20macOS-83d8b9?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![Antigravity 2.21.1 / 2.33.0+ / 2.34.0+](https://img.shields.io/badge/Antigravity-2.21.1%20%2F%202.33.0%2B%20%2F%202.34.0%2B-c5a0ff?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![Languages](https://img.shields.io/badge/languages-English%20%7C%20%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87%20%7C%20%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87-f2b880?style=flat-square&labelColor=252936)](#architecture--metrics-docs)
[![MIT](https://img.shields.io/badge/license-MIT-d4d9e6?style=flat-square&labelColor=252936)](LICENSE)

[Preview](#preview) · [IDE](#antigravity-ide) · [CLI](#antigravity-cli-status-line) · [Install](#install) · [Enable or remove](#plug-and-unplug) · [Acknowledgements](#host-ui-chinese-and-acknowledgements) · [FAQ](#faq) · [中文](README.md)

</div>

> [!TIP]
> - **3-Language UI + 1-Click Host UI Chinese**: Supports `English / 简体中文 / 繁體中文`. Click `汉` in the Side Panel header to translate the Antigravity Desktop UI live without patching `app.asar` (turning it off restores exact English).
> - **`2.33.0+` / `2.34.0+` Auto-Compatibility**: Automatically handles `2.34.0+` daemon credentials and Windows/Linux shortcut debug flags, with default-on `autoRelaunchDebug` (20s startup window recovery) while keeping `app.asar` untouched.

**Recent highlights ([Full changelog →](CHANGELOG.md)):**
- **v1.0.2**: Expand the full inline strip in empty conversations once quota loads; add release prep and contributor workflows.
- **v1.0.1 / v1.0.0**: Per-item bar colors and light/dark Settings popover, model selector truncation guard with minimal collapse, Context rounds & 5-bucket step drawer, Orchestrator/Swarm split, square Insights heatmaps, and Remote SSH support.

## Preview

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark-en.webp?v=1.0.3" />
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/hero-light-en.webp?v=1.0.3" />
  <img src="docs/assets/hero-light-en.webp?v=1.0.3" width="100%" alt="Antigrative Dashboard interactive motion demo: hover cards and Side Panel tab switching." />
</picture>

<sub>Rendered frame-by-frame from current widget & sidecar source with illustrative data.</sub>

</div>

<img src="docs/assets/responsive.png?v=1.0.1" width="100%" alt="v1.0.1 four-icon compact layout in a narrow main chat and separate statistics beside a subagent input.">

<table>
<tr><th width="50%">Speed and cache pill (explicit hit rate & quick toggle)</th><th width="50%">Split quota pace & 8-category context breakdown</th></tr>
<tr>
<td width="50%" valign="top"><img src="docs/assets/speed.png?v=1.0.1" width="100%" alt="Generation speed card: session decode, E2E speed, TTFT (P50 / Latest), peak decode"><br><img src="docs/assets/widget.png?v=1.0.1" width="100%" alt="Token usage and cache card with explicit Cache hit rate pill and inline bar toggle"></td>
<td width="50%" valign="top"><img src="docs/assets/quota.png?v=1.0.1" width="100%" alt="Dedicated quota card: five-hour and weekly balances, countdowns and exhaustion forecast"><br><img src="docs/assets/context.png?v=1.0.1" width="100%" alt="Context window card: host 8-category composition, compaction trend, strip mode, and Settings entry"></td>
</tr>
</table>

<table>
<tr><th width="50%">v1.0.1 Non-modal Settings & Per-Item Color Picker</th><th width="50%">Light / Dark Theme & Custom Color Modes</th></tr>
<tr>
<td width="50%" valign="top"><img src="docs/assets/settings-dialog.png?v=1.0.1" width="100%" alt="Non-modal Settings popover with light/dark mode, per-item colors, ordering, and visibility toggles"></td>
<td width="50%" valign="top"><img src="docs/assets/theme-colors.png?v=1.0.1" width="100%" alt="Comparison of light default blue, light custom 4-item colors, and dark custom colors"></td>
</tr>
</table>

<img src="docs/assets/density-modes.png?v=1.0.1" width="100%" alt="v1.0.1 three adaptive density tiers (Full, Compact-Text, Icons-Only) and persistent Minimal collapse">

<table>
<tr><th width="50%">Side Panel · Session view (4-tab navigation)</th><th width="50%">Side Panel · Global Insights view</th></tr>
<tr>
<td width="50%" valign="top"><img src="docs/assets/panel-session.png?v=1.0.1" width="100%" alt="Side Panel four top-level tabs and Session token usage with USD cost estimate"></td>
<td width="50%" valign="top"><img src="docs/assets/panel-insights.png?v=1.0.1" width="100%" alt="Global Insights tab: Prompt/Flow credits, total sessions, estimated cost, 7-day trend and activity heatmap"></td>
</tr>
</table>

<table>
<tr><th width="50%">Daily and weekly activity</th><th width="50%">Usage by model (with Cache hit column)</th></tr>
<tr>
<td width="50%"><img src="docs/assets/usage-overview.png?v=1.0.1" width="100%" alt="Token usage activity with daily and weekly contribution grids"></td>
<td width="50%"><img src="docs/assets/usage-details.png?v=1.0.1" width="100%" alt="Model usage stacked chart, quota pool pills and model table with Cache hit column"></td>
</tr>
</table>

<sub>Desktop widget and Side Panel screenshots rendered directly from current source with illustrative host layouts and data; these are not IDE screenshots. Main and subagent samples use separate statistics; quotas are account-wide. The 44% context sample uses the latest request-start estimate, not cumulative input. Language and Host UI Chinese preferences persist across restarts.</sub>

**Keep working. Everything is in view across input strip and Side Panel.**

| See the speed | Know your quota & context | Global insights & zero noise |
| --- | --- | --- |
| Session decode TPS, E2E speed, TTFT (P50 / Latest), and model/tool times. | Split Gemini, Argon, and 3p Claude quota pace forecasts alongside 8-category host context composition and trend lines. | Daily/Weekly and By model (with per-model Cache hit) first in Side Panel, plus Global Insights, Session Audit, USD cost estimates, and opt-in Host UI Chinese. |

### Small details that matter

- **Token usage, DSH-style.** Compact total tokens and an explicit **Cache hit rate:** hero pill (`缓存命中率：` / `快取命中率：`); hover for uncached input, cache reads, output, optional cache writes, and zero-cache miss surge counts (`cacheMissSurges`).
- **Split quota pace & 8-category context breakdown.** Hover the quota ring for five-hour/weekly balances, reset timers, exhaustion pace forecasts, and sibling groups; hover Context for latest-request occupancy, host 8-category composition (`List`/`Bar`), compaction/checkpoint trends, and Host UI Chinese / language controls.
- **English, Simplified Chinese & Traditional Chinese.** English by default, with one-click switching across `English / 简体中文 / 繁體中文` (saved across restarts) plus opt-in live Host UI Simplified Chinese (`汉`).
- **Language survives restarts.** The inline widget and side panel share an atomic user preference file (`AntigravityPulse/preferences.json`), independent of the host's changing local port.
- **Hover delay and instant transition.** First hover waits 250ms to prevent accidental popups; clicks and keyboard focus open immediately. Moving between metrics stays instant while a card is open or for 350ms after leaving the controls. Leaving early or replacing the conversation/composer cancels a pending popup.
- **Stable menus.** Quota-group menus stay open across polling cycles while countdowns continue ticking.
- **Actual account data.** Remaining quota comes from the account API, not an estimate based on text length. Expired windows do not automatically become 100%.
- **Conversation-aware.** Switch chats without carrying the previous chat's throughput into a new one.
- **Subagent-aware.** Token/cache totals include the selected agent and its reachable descendants, with separate current-agent/subagent contributions. Speed and context describe the selected agent, while quotas remain account-wide. Background collection, request deduplication and saved totals keep nested tasks responsive. [Accounting and limits](docs/USAGE.md#delegated-tasks-boost--teamwork--subagents).
- **Teamwork compatibility (v0.8.1).** Keep the strip through send/stop/cancel transitions and support deeply nested static agent badges. Conversation IDs come from the current input's DOM owner when available, including switches without a URL change. Hidden/inert or deeper editors are ignored; ambiguous visible inputs/badges are not guessed. Six-level English/Chinese browser fixtures pass, including usage remount and context-to-usage language synchronization. Windows real three-level delegation was checked with independent metrics, return navigation and a generating-state screenshot; this host changed its URL at each level and rendered one composer. Same-URL/six-level DOM cases remain fixture coverage; signed-in Linux/macOS GUI checks are still pending.
- **Survives updates.** Plugin-owned runtime attachment reconnects after app updates, without modifying the application archive.
- **Persistent conversations.** TPS and cache statistics are saved separately for each conversation and account; reloads can recover saved statistics.
- **Compact-window support.** Full statistics reduce to four clickable icons (speed, cache, quota and context) when space is limited. Hover or click for details; language switching stays available in the context card. The strip hides only if the icons cannot fit safely and restores when space returns. Message controls hidden behind the composer do not cause scroll flicker.
- **Discoverable language settings.** English is the default. A compact bilingual first-use tip beside context opens the English / 简体中文 / 繁體中文 choices at the bottom of its detail card. The panel and usage window offer the same three choices through their language menu. Preferences survive restarts. Choosing a language or closing the tip saves completion, so it does not return on restart. Closing the tip does not change the language; failed saves offer a retry. Subagent composers do not repeat the tip. Language changes do not change the UTC+8 usage accounting boundaries.
- **Theme adaptation.** Controls, cards and quota menus follow Antigravity's light/dark mode and custom background, card, text and accent colors, with readable text and OS fallback in standalone previews. Live changes require no restart or conversation reload.
- **Local collection.** The collector talks to loopback endpoints. It does not upload your metrics to a third-party service.

## Antigravity IDE

**v0.7.0** adds a separate VSIX for Google's own standalone IDE. Download
`antigrative-dashboard-ide-1.0.1.vsix` from the release and choose **Install from VSIX…**
in the IDE's Extensions view. No desktop App installation is required.

Fully quit the IDE, then start it with
`--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`.
Add these flags to your IDE shortcut for subsequent launches. Narrow panes show
four icons; wider panes show values. Hover/click opens the same metric details.

Windows IDE **2.5.5** and **2.6.0** (`agy --hub` + nested Webview) are supported with automated verification. Linux/macOS IDE
have automated coverage; signed-in GUI acceptance is still outstanding.
VS Code, Visual Studio, JetBrains, Zed and Xcode integrations are not implemented.
See [IDE installation, update, diagnostics and data cleanup](ide/README.md).

## Antigravity CLI status line

Available in **v0.6.0**: an independent adapter for the official Antigravity CLI `statusLine` interface displays context occupancy, cache read tokens, state, normalized model/subagent details (`--details`), and grouped quotas (`Gemini`, `Argon` weekly, and shared `3p` `Claude`), with English/Chinese and terminal-width adaptation. Remaining quota numbers and bars are **green ≥70%, yellow ≥30% and <70%, red <30%**. Preview: `node cli/statusline.mjs --preview`; install: `python manage.py install-cli` (or `python manage.py install --with-cli`; Linux/macOS: `python3`). Requires Node.js 20+ and a CLI supporting the interface. Historical CLI 1.3.2/1.3.3 support covers tested Sonnet 4.6, GPT-OSS 120B, and CLI 1.3.3 Gemini 3.8 Flash (High); CLI 1.5.x support adds current-request cache percentage for verified first-party model families (including `1.5.5` and `1.5.9`) when `cache_creation_input_tokens` is zero (`word/*`, `perplexity/*`, `GPT-6*`, BYOK, unknown placeholders, and nonzero cache-write cases remain unavailable). CLI tok/s needs streaming-duration data absent from the documented payload. See [CLI usage and rollback](docs/CLI.md).

![Real Antigravity CLI conversation with current-request cache percentage](docs/assets/cli-conversation.png?v=0.8.4-cli-1)

<sub>Historical Linux Antigravity CLI 1.3.3 session after two English replies: current-request cache share 95.7%, 13.1K cached-read tokens; account email masked. macOS signed-in interactive acceptance remains outstanding.</sub>

## Install

### 1-Line Agent Install (Recommended)

No manual commands needed. Paste this single line into Antigravity to auto-detect your host (Desktop App / CLI / Standalone IDE) and install:

```text
Install and enable this Antigravity plugin for me: https://github.com/wycocoyu/agy-context-dashboard
```

For strict step-by-step verification and SHA256 checks, expand the full agent prompt below.

The commands below install the **desktop App adapter**. IDE users should use the [separate VSIX instructions above](#antigravity-ide).

Supported: **Windows, Linux and macOS; Antigravity desktop App (2.21.1 / 2.22.0 and 2.33.0+); Python 3.10+**. The same release ZIP works on all three systems. No third-party pip or npm packages are needed to install or run the plugin. The sidecar uses the app's bundled Node.js runtime. See [COMPATIBILITY.md](COMPATIBILITY.md) for the per-platform verification scope.

> The inline model-row position has no public plugin mounting API. A standard Antigravity sidecar now attaches the widget through the existing local renderer debugging endpoint. Default installation does not modify `resources/app.asar`. This is unofficial; future changes to the host DOM, debugging channel, SDK or metrics API may require an adapter update. The native side panel remains a fallback.

### Antigravity Desktop 2.33.0+ debugging-port requirement

Starting in **Antigravity Desktop 2.33.0**, the host no longer enables the renderer remote debugging port by default and actively deletes `<profile>/DevToolsActivePort` at startup when `--remote-debugging-port` is absent. In addition, normal Dock or shortcut launches—and automatic restart updates via `autoUpdater.quitAndInstall()`—drop CLI flags. Because macOS enforces `ElectronAsarIntegrity` and Hardened Runtime code signing on `app.asar`, the plugin leaves the application archive untouched and instead provides an **opt-in desktop debug launcher** and a **Side Panel relaunch action** passing `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`:

- Generate the debug launcher during installation with `python3 manage.py install --with-launcher` (use `python` on Windows), or create it anytime with `python3 manage.py install-launcher`.
- Generated debug launcher paths:
  - **macOS**: `~/Applications/Antigravity (Debug).app` (can be pinned to the Dock)
  - **Windows**: `%LOCALAPPDATA%\AntigravityPulse\Launch Antigravity (Debug).cmd`
  - **Linux**: `~/.local/share/applications/antigravity-pulse-debug.desktop`
- You can also launch or relaunch from a terminal via `python3 manage.py launch` (add `--relaunch` to wait for any existing main process to exit before relaunching with debug flags).

Download the ZIP from the [latest release](https://github.com/wycocoyu/agy-context-dashboard/releases/latest), extract it to a permanent folder, or clone the repository:

```powershell
git clone https://github.com/wycocoyu/agy-context-dashboard.git
cd agy-context-dashboard
python manage.py install --with-launcher
```

On Linux / macOS, use `python3 manage.py install --with-launcher` or `sh install.sh` (and `python3` for the lifecycle commands below). Never run the installer with sudo.

On Antigravity 2.33.0+, fully quit and launch via the generated debug launcher (such as `~/Applications/Antigravity (Debug).app` on macOS) or `python3 manage.py launch --relaunch`; on 2.32 and earlier, a regular quit and reopen is enough. Open a conversation: the strip appears beside the model selector. PowerShell users can also run `./install.ps1` (or omit `--with-launcher` when running `python manage.py install`).

The installer copies and enables the plugin and restores any exactly verified legacy patch during migration. The runtime discovers the current renderer port and reconnects automatically. **Keep the extracted source folder** for enable, disable, update, and uninstall commands.

<details>
<summary><strong>Ask an agent to install it</strong></summary>

```text
Install and enable Antigravity Dashboard on this computer.
Repository: https://github.com/wycocoyu/agy-context-dashboard
1. Read README.md, COMPATIBILITY.md, docs/CLI.md and ide/README.md. Inspect the OS,
   available executables, host versions and existing dashboard configuration with
   read-only checks. Distinguish desktop App, Antigravity CLI (agy) and standalone
   Antigravity IDE. The OS alone does not identify the target.
2. Before downloading an installation package or changing settings, summarize the
   detected hosts and ask me to confirm the target: App, CLI or standalone IDE.
   If several are present, let me choose one or more; if none is identified, ask
   for its executable path. Do not guess App when I say Linux or terminal.
3. Fetch the latest stable release metadata and report its plugin version, the
   host version/path and the selected adapter. The App and CLI share a ZIP, but
   their installation commands differ. The standalone IDE uses a separate VSIX.
   Download only assets for the confirmed target and verify SHA256. Keep the
   extracted source in a permanent directory. Do not install the host itself or
   upgrade, downgrade or replace it without separate confirmation.
4. Use Python 3.10+ (python3 on Linux/macOS) and the selected instructions:
   - App: check python manage.py status, then python manage.py install (on
     Antigravity 2.33.0+, pass --with-launcher if a desktop debug launcher is
     wanted and start via that launcher or python3 manage.py launch --relaunch).
   - CLI: check agy --version and Node.js 20+, then python manage.py install-cli.
     Do not run manage.py install. Preserve any existing statusLine using the
     documented backup/override flow. CLI cache percentage is conditional; check
     docs/CLI.md for tested models/versions and unavailable values. Do not claim
     CLI tok/s or local usage charts: they are not available through this adapter.
   - Standalone IDE: install the release VSIX through Install from VSIX... or
     ide/manage.py install --exe <verified-IDE-executable> --vsix <release-VSIX>.
     It does not require the desktop App; do not run the App installer.
5. Preserve unrelated settings and saved data. If a restart or login is needed,
   tell me first and do not forcibly interrupt running tasks. For IDE launches,
   follow its documented loopback debugging flags. For CLI, start a new session.
6. Verify the selected adapter in its real host, and report plugin/host versions,
   target, path, checks actually performed, remaining steps and how to disable or
   uninstall that adapter. Never treat installing a ZIP as proof of CLI success.
```

</details>

## Plug and unplug

### Open the App side panel

Open the right auxiliary pane using its top-right toggle, then choose **+ → Extensions → Antigravity Dashboard** in that pane's toolbar. The Side Panel exposes four top-level tabs ordered for quick access: **Daily/Weekly**, **By model** (with quota pool rollups and per-model **Cache hit** column), **Session** (Speed/Cache/Context cards, `Audit` files/commands/steps viewer, USD cost estimate, multi-agent rollup & `cacheMissSurges`), and **Insights** (Prompt/Flow credits, cross-session totals, 7-day trend, heatmap, and project/skill/tool distributions). A quick `汉` header button toggles lossless host UI Chinese translation live without restarting; clicking metric cards selects details without hiding on pointer departure, and the standalone modal can still be launched from the inline cache card.

If Antigravity Desktop `2.33.0+` was launched from a regular Dock/shortcut icon—or lost CLI flags after an automatic `quitAndInstall()` update restart—the inline strip enters the `missing-debug-port` diagnostic state. The Side Panel stays open and displays:

- **1-click Relaunch with Debug Port**: gracefully quits the host, waits until all old main PIDs exit, and relaunches Antigravity with `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`.
- **Auto-relaunch toggle (`autoRelaunchDebug`, enabled by default)**: active for inline installs unless unchecked (`autoRelaunchDebug: false` saved in `preferences.json`); when a direct launch or `quitAndInstall()` update restart is missing the debug port during the first `20s` of sidecar boot, it automatically triggers a debug relaunch (up to `2` distinct-PID attempts per `60s` sliding window).

Fully quit and reopen the App after updating plugin code so its collector loads the new modules. A panel that was already open may still be served by the previous collector until restart.

Run these commands from the project directory (use `python3` on Linux / macOS):

| Action | Command | What happens |
| --- | --- | --- |
| Install or update | `python manage.py install` | Copy runtime adapter; preserve other settings and saved statistics; add `--with-launcher` to also create the debug launcher |
| Install debug launcher | `python3 manage.py install-launcher` | Create the platform opt-in debug launcher (`--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`) |
| Remove debug launcher | `python3 manage.py uninstall-launcher` | Verify ownership marker and remove only the plugin-created debug launcher |
| Launch or relaunch in debug mode | `python3 manage.py launch` | Start desktop App with debug flags; add `--relaunch` to quit the old main process first |
| Disable | `python manage.py disable` | Disable the plugin and hide the strip on its next poll |
| Enable | `python manage.py enable` | Start the plugin and show the strip again |
| Inspect | `python manage.py status` | Check installation, enabled state, runtime health, `debugPortAvailable`, `launcher`, and `debugPortHint` |
| Uninstall | `python manage.py uninstall` | Remove this plugin and any owned debug launcher; retain saved statistics and verified legacy backups |

First installation, plugin code updates, and uninstall require a full app restart. Enable and disable do not require reinstalling or rewriting the archive. `./uninstall.ps1` runs the uninstall command.

**Recovery files stay available.** Original archives live in `%LOCALAPPDATA%/AntigravityPulseBackups/<timestamp>/`. Uninstall retains backups and diagnostic logs. If the archive has unknown modifications, the uninstaller refuses to overwrite it.

`python manage.py install --panel-only` disables inline attachment and installs only the sidecar panel. It requires native UI Extensions to be available on the account and does not provide the inline strip.

### Remote SSH Window Support

Remote SSH windows read sanitized telemetry directly via the renderer's built-in Connect-RPC client with zero remote setup (gracefully falling back to shared quota when unavailable). Optional loopback forwarding is also available:

<details><summary>Expand optional SSH loopback forwarding setup</summary>

1. **Remote Linux host**: `python3 manage.py install --panel-only --remote-bridge-port 17891`
2. **Local `~/.ssh/config`**: Add `LocalForward 127.0.0.1:17891 127.0.0.1:17891`
3. **Local desktop**: `python3 manage.py set-remote-endpoint user@your-host 17891`

</details>

## Architecture & Metrics Docs

Only whitelisted numeric statistics and model/status summaries are stored (never prompts, replies, emails, or credentials):

| Topic | Summary | Doc |
| --- | --- | --- |
| Throughput & timing quality | Session/latest TPS, E2E, TTFT, and short-window filtering | [docs/TPS.md](docs/TPS.md) |
| Context window | 8-category host composition, compaction trends, and capacity sources | [docs/CONTEXT_LIMITS.md](docs/CONTEXT_LIMITS.md) |
| Long conversations | Offset pagination, payload skipping, and 192 MiB heap budget | [docs/LONG_CONVERSATIONS.md](docs/LONG_CONVERSATIONS.md) |
| Local usage & persistence | `history-v1` / `usage-v1` ledger paths and cleanup | [docs/USAGE.md](docs/USAGE.md) |
| Reliability & recovery | Debug-port self-healing, update rollback, and edge cases | [docs/ROBUSTNESS.md](docs/ROBUSTNESS.md) |

## Host UI Chinese and Acknowledgements

The Side Panel `汉` toggle and Context Card **Host UI Chinese** switch enable live Simplified Chinese translation for the Antigravity Desktop UI without patching `app.asar` (restoring exact English when turned off). The dictionary ([`compat/host-i18n-dict.json`](compat/host-i18n-dict.json)) adapts and merges audited entries from three **MIT-licensed** projects:

- [`yiheng8023/antigravity-chinese`](https://github.com/yiheng8023/antigravity-chinese) · [`antigravity-cn-community/Antigravity-Chinese-Localization`](https://github.com/antigravity-cn-community/Antigravity-Chinese-Localization) · [`ruxiayu/antigravity-zh-cn`](https://github.com/ruxiayu/antigravity-zh-cn)

## Compatibility

- **Desktop App**: Verified on Windows 11 (`2.21.1`, `2.22.0`, `2.33.0+`, `2.34.0+`); Linux and macOS have automated checks and native path adapters ([Full compatibility →](COMPATIBILITY.md)).
- **Standalone IDE**: Dedicated VSIX supports Antigravity IDE `2.5.5` / `2.6.0` (cannot be installed via `dsh plugin add`).

## FAQ

<details><summary><strong>The strip did not appear after installation.</strong></summary>

Fully quit the main app process and reopen it. Run `python3 manage.py status` (use `python` on Windows) and inspect `debugPortAvailable`, `inlineIntegration`, and `debugPortHint`. On Antigravity 2.33.0+, if it reports `missing-debug-port`, reopen via the launcher created by `python3 manage.py install-launcher` (e.g., `~/Applications/Antigravity (Debug).app` on macOS), run `python3 manage.py launch --relaunch`, or click the 1-click relaunch button inside **+ → Extensions → Antigravity Dashboard**. Also inspect `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/logs/sidecar.log` and `data/integration-state.json`. Review raw host logs for local information before publishing them.

</details>

<details><summary><strong>Why is TPS missing in a new conversation?</strong></summary>

There are no request metrics yet. TPS is hidden instead of showing the previous chat's speed. It appears after a model response finishes.

</details>

<details><summary><strong>Why do Gemini, Argon, and Claude have different quotas?</strong></summary>

The service returns independent quota groups: `Gemini`, dedicated `Argon` weekly buckets when reported, and the shared `3p` group (shown uniformly as `Claude`). The default follows the selected model. Inspect another group from a quota card; an explicit label prevents confusion after manually selecting a different group.

</details>

<details><summary><strong>What happens after an Antigravity update?</strong></summary>

App updates cannot overwrite the runtime adapter in the user plugin directory. On 2.32 and earlier, it rediscovers ports, credentials and the renderer automatically. On **Antigravity 2.33.0+**, in-app updates restart via `autoUpdater.quitAndInstall()`, which drops `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`: starting in `v0.9.5`, the sidecar self-heals Windows/Linux shortcuts and `autoRelaunchDebug` is enabled by default for inline installs (`20s` startup window, single-shot per sidecar, `2` distinct-PID tries per `60s` sliding guard) so the app automatically relaunches once with debug flags and reattaches. If you turn `autoRelaunchDebug` off in the Side Panel (**+ → Extensions → Antigravity Dashboard**), you can still recover via the 1-click relaunch button, `python3 manage.py launch --relaunch`, or the generated debug launcher. If the inline strip is missing, inspect `python3 manage.py status`; use the native panel while a changed host interface is adapted. Never copy an old app archive over a newer installation. See [robustness analysis](docs/ROBUSTNESS.md).

</details>

## Development and releases

```powershell
npm test
python -m unittest discover -s tests -v
python manage.py package
```

ZIP and SHA256 files are generated in `dist/`. Packaging uses an allowlist and excludes credentials, account settings, logs, SDK caches, and application archives.
Generating README images is an optional developer task: `node tools/build-readme-assets.mjs` requires Playwright (or an absolute `PLAYWRIGHT_MODULE` path). It renders the actual widget code with illustrative metrics and produces English/Chinese assets. This is not an installation dependency.

[Development guide →](docs/DEVELOPMENT.md) · [Contributing →](CONTRIBUTING.md) · [Changelog →](CHANGELOG.md)

## License

Source is available under [MIT](LICENSE). Antigravity binaries, SDK resources, and application backups are not distributed. Product names belong to their respective owners; this project is not affiliated with or endorsed by Antigravity.

## Manual App updates

Open **context details → bottom-right Check for updates**. The App-only updater checks stable official Releases after a click, verifies the archive and checksum, preserves settings/usage, and offers plugin reload after installation. Installation failures retain rollback/recovery material. IDE/CLI packages are installed separately. See [verification, recovery and limitations](docs/UPDATES.md).

---

> **Fork & Independent Design Notice:** This repository (**`wycocoyu/agy-context-dashboard`**) is a fork of the original author's repository [`ATtacK030130/antigrative-dashboard`](https://github.com/ATtacK030130/antigrative-dashboard). Starting from the `v0.8.12` baseline under the original [MIT License](LICENSE), it has diverged in design and is now developed independently from the upstream repository, while preserving original copyright attribution as well as compatibility with existing user settings, `history-v1`, `usage-v1`, and IDE storage paths.

