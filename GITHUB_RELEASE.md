# AGY Context Dashboard v0.9.8

`wycocoyu/agy-context-dashboard` `v0.9.8`（MIT 协议）上线**多维上下文与全局洞察工作台**：新增四视图顶层导航（将「每日/每周活动」「按模型用量」置于最前）、宿主上下文构成与压缩趋势、会话审计与估算费用、跨会话全局洞察，以及可切换的无侵入式宿主界面汉化与显式「缓存命中率：」胶囊标识（[`#16`](https://github.com/wycocoyu/agy-context-dashboard/issues/16)、[`#29`](https://github.com/wycocoyu/agy-context-dashboard/issues/29)、[`#34`](https://github.com/wycocoyu/agy-context-dashboard/issues/34)、[`#43`](https://github.com/wycocoyu/agy-context-dashboard/issues/43)、[`#44`](https://github.com/wycocoyu/agy-context-dashboard/issues/44)）。

## 更新内容

- **四页签洞察视图与用量修复（[`#34`](https://github.com/wycocoyu/agy-context-dashboard/issues/34)、[`#44`](https://github.com/wycocoyu/agy-context-dashboard/issues/44)）**：用量总览将「每日/每周活动」「按模型用量」置顶于「当前会话」「全局洞察」之前；移除会话内重复额度条，并在按模型统计表新增「缓存命中率」列、修复空元数据与 SQLite WAL 重试导致的误报「部分记录暂不可读取」警告。
- **上下文构成、压缩趋势与会话审计（[`#29`](https://github.com/wycocoyu/agy-context-dashboard/issues/29)、[`#34`](https://github.com/wycocoyu/agy-context-dashboard/issues/34)）**：新增条形/清单双模式上下文构成（系统提示词、MCP 工具、子代理、技能、规则、消息等）、上下文压缩/检查点趋势折线、高负载工具膨胀提醒（`>= 20K` / `>= 50K`），以及涵盖文件、命令与步骤的会话审计弹窗、USD 参考费用与 Prompt/Flow Credits 展示。
- **多代理汇总、流式速率对齐与显式缓存标识（[`#16`](https://github.com/wycocoyu/agy-context-dashboard/issues/16)、[`#24`](https://github.com/wycocoyu/agy-context-dashboard/issues/24)、[`#44`](https://github.com/wycocoyu/agy-context-dashboard/issues/44)）**：支持 `2.34.0` 多代理额度池汇总与零缓存未命中计数（`cacheMissSurges`），将流式 TPS 严格对齐 `streamingDuration` 并收紧短窗异常隔离，同时为悬浮卡和侧边栏蓝色比率胶囊补充三语「缓存命中率：」标识与窄屏防溢出折行。
- **免重启宿主界面汉化与内存优化（[`#28`](https://github.com/wycocoyu/agy-context-dashboard/issues/28)、[`#30`](https://github.com/wycocoyu/agy-context-dashboard/issues/30)、[`#43`](https://github.com/wycocoyu/agy-context-dashboard/issues/43)）**：新增基于 MIT 社区词典的可选 Antigravity 宿主界面简体中文热切换（顶部快速开关「汉」并持久化），大 JSON 账本下沉至磁盘 worker 且游离 V8 字符串切片防止超过 192 MiB 堆上限；CLI `launch` 新增 `--restart` 别名与 macOS 启动器自愈。

## 安装或更新

- **Antigravity 桌面 App**：上下文详情 → **检查更新**（`v0.8.14+`），或解压 `antigrative-dashboard-0.9.8.zip` 后运行 `python3 manage.py install`（Windows 用 `python`）。
- **Antigravity CLI / 独立 IDE**：CLI 运行 `python3 manage.py install-cli`；IDE 安装 `antigrative-dashboard-ide-0.9.8.vsix`。现有配置与统计自动保留。

---

## What changed in v0.9.8

- **Four-tab dashboard & usage ledger fixes ([`#34`](https://github.com/wycocoyu/agy-context-dashboard/issues/34), [`#44`](https://github.com/wycocoyu/agy-context-dashboard/issues/44)):** Put **Daily/Weekly Activity** and **Usage by Model** first alongside **Session** and **Insights**, removed the redundant Session quota strip, added a per-model **Cache hit** column, and eliminated false partial/WAL-retry ledger warnings.
- **Context composition, compaction trend & Session Audit ([`#29`](https://github.com/wycocoyu/agy-context-dashboard/issues/29), [`#34`](https://github.com/wycocoyu/agy-context-dashboard/issues/34)):** Added dual-mode host context breakdown (`List` / `Bar`), per-request compaction/checkpoint trends, heavy tool bloat badges (`>= 20K` / `>= 50K`), a Session Audit viewer (`Files`, `Commands`, `Steps`), public-pricing USD cost / credit estimates, and cross-session Global Insights.
- **Multi-agent rollup, TPS alignment & explicit cache pill label ([`#16`](https://github.com/wycocoyu/agy-context-dashboard/issues/16), [`#24`](https://github.com/wycocoyu/agy-context-dashboard/issues/24), [`#44`](https://github.com/wycocoyu/agy-context-dashboard/issues/44)):** Added 2.34.0 multi-agent quota rollups and `cacheMissSurges`, aligned TPS numerators with `streamingDuration`, and added localized `Cache hit rate:` / `缓存命中率：` / `快取命中率：` labels inside both inline and panel hero pills with narrow-width wrapping.
- **Opt-in Host UI Chinese & heap hardening ([`#28`](https://github.com/wycocoyu/agy-context-dashboard/issues/28), [`#30`](https://github.com/wycocoyu/agy-context-dashboard/issues/30), [`#43`](https://github.com/wycocoyu/agy-context-dashboard/issues/43)):** Added restart-free host Simplified Chinese localization with header toggle and persisted preference, offloaded large JSON ledgers to disk workers + detached V8 `SlicedString`s under the 192 MiB limit, and added `--restart` + macOS launcher self-healing.

## Install or update

- **Antigravity App:** Open context details → **Check for updates** (`v0.8.14+`), or extract `antigrative-dashboard-0.9.8.zip` and run `python3 manage.py install` (`python` on Windows).
- **Antigravity CLI / Standalone IDE:** Run `python3 manage.py install-cli` for CLI `statusLine`, or install `antigrative-dashboard-ide-0.9.8.vsix` via **Install from VSIX…**. Settings, history, and SHA-256 verification remain intact.
