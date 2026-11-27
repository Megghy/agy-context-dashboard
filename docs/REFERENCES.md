# 竞品与参考项目

同赛道（Antigravity 上下文 / 额度 / 用量监控与界面增强）可参考的项目跟踪。发现新项目直接往本章补一节，commit 即版本。README 开头那句「参考 DSH 设计」指的就是下方 DSH 生态一节。

## 一览

| 项目 | 形态 | 与本项目关系 |
| --- | --- | --- |
| [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) | DSH（DeepSeek Harness）插件（npm / Cordis） | **设计灵感来源**（不同宿主，无竞争） |
| [ATtacK030130/antigrative-dashboard](https://github.com/ATtacK030130/antigrative-dashboard) | Python 管理器 + Node sidecar + 内联 widget | **同构竞品 / 活跃上游**，定期互同步 |
| [elviscjn-cjn/antigravity-context-viewer](https://github.com/elviscjn-cjn/antigravity-context-viewer) | `app.asar` 注入补丁 + CLI | 异构竞品（功能重叠度最高） |
| [AGI-is-going-to-arrive/Antigravity-Context-Window-Monitor](https://github.com/AGI-is-going-to-arrive/Antigravity-Context-Window-Monitor) | App 原生 Sidecar 插件 + IDE VSIX（MIT） | **同赛道参考项目**（上下文卡片复制按钮、双水位线与 Orchestrator 拆解） |
| [n2ns/antigravity-panel](https://github.com/n2ns/antigravity-panel) | VS Code / Open VSX 扩展 | IDE 侧竞品（不覆盖桌面 App 内嵌） |
| [nkjDSLcvanv/antigravity-codex-theme](https://github.com/nkjDSLcvanv/antigravity-codex-theme) | CDP 运行时注入（主题 / 汉化 / 轻统计） | 参考项目（同款注入路线的工程实践） |
| [Anarcadia/chuanban-antigravity-theme-patch](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) | CDP 运行时注入（美化 / 字体 / 汉化） | 参考项目（上表 codex-theme 的参考来源） |
| [yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese) | Antigravity 全生态中文本地化套件（MIT） | **宿主汉化直接来源**（合并 2.34.0 主词库与正则） |
| [antigravity-cn-community/Antigravity-Chinese-Localization](https://github.com/antigravity-cn-community/Antigravity-Chinese-Localization) | Antigravity 一键深度汉化包（MIT） | **宿主汉化补充来源**（合并设置、账号与远程短语） |
| [ruxiayu/antigravity-zh-cn](https://github.com/ruxiayu/antigravity-zh-cn) | Antigravity 简体中文动态 DOM 引擎（MIT） | **宿主汉化机制与限定词来源**（`scoped` 词表 + 分裂节点匹配） |
| [farion1231/cc-switch](https://github.com/farion1231/cc-switch) | 跨工具 AI CLI / 桌面配置与请求日志助手（Tauri） | **统计口径对照标杆**（对齐 `agy` 缓存命中率定义与列表呈现） |
| [RMvdesi/obsidian-prism](https://github.com/RMvdesi/obsidian-prism) | Zero-ASAR CDP 多模块融合套件（GPL-3.0-only） | **同路线参考项目**（CDP Channel 4、多插件自动礼让与上游整合） |
| [0DNANCY/agy-claude-style](https://github.com/0DNANCY/agy-claude-style) | Antigravity 主题与交互增强（MIT） | **界面与动效参考**（配色、弹簧动画、WebGL2 波纹、像素宠物与打包器） |
| [LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider](https://github.com/LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider) | 模型菜单推理等级滑块（MIT） | **交互组件参考**（推理等级滑块与智能共存让位） |
| [Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style) | DSH 极简主题样式 | **DSH 视觉参考**（Studio 极简排版、输入框边框与暖白浅色配色） |
| [Microqian2th/dsh-codex-effort-slider](https://github.com/Microqian2th/dsh-codex-effort-slider) | DSH 推理等级滑块 | **DSH 交互参考**（轨道刻度分档、迟滞吸附与阻尼运动曲线） |
| [mobius/dsh-performance-slider](https://github.com/mobius/dsh-performance-slider) | DSH 性能档位滑块 | **DSH 交互参考**（性能档位滑块交互与实时反馈设计） |
| [claudenoshujin/claude-web](https://github.com/claudenoshujin/claude-web) | Web 端桌面宠物交互（by lulu） | **交互参考**（桌面宠物堆叠交互设计） |

## 分项笔记

### DSH 生态：bowenliang123/dsh-context

DSH = **DeepSeek Harness**（DeepSeek 的 agent harness，npm 包 `@deepseek-ai/dsh`）。`dsh-context` 是其「上下文洞察」插件（5.4k stars，Apache-2.0，DSH 团队成员公开推荐），即 README「参考 DSH 设计」的对象。五个入口覆盖上下文全生命周期：

- **上下文洞察页**：跨会话总览——Token / 成本 / 缓存命中率 KPI、7 天用量图、活动热力图、技能 / 工具 / 命令统计（我们在 `v0.9.8` 已落地 Antigravity 侧的「全局洞察」页、7 日柱图、热力图与费用/Credits 估算）；
- **Context 标签页**：单会话完整仪表板——六色堆叠的上下文组成、逐请求趋势（Delta 模式）、上下文浏览器（含 DNA 模式）、事件日志、文件活动（我们在 `v0.9.8` 已对应落地宿主 8 分类上下文构成、压缩趋势曲线与 Session Audit 文件/命令/步数审计）；
- **Fleet 标签页**：父 / 子 Agent 实时卡片与协作泳道时间线（多 Agent 协作透视，我们尚无对应泳道视图）；
- **`/context` 命令**：聊天中直接弹出当前组成与浏览器；
- 数据读 DSH 官方 Token 投影（`contextPressure` / `contextBreakdown`），成本按 models.dev 价格表估算，缓存只存轻量摘要。

宿主不同（DSH vs Antigravity），无竞争关系；把它当作上下文信息架构与多 Agent 透视设计的对照组。

### ATtacK030130/antigrative-dashboard

紧凑型 Token 吞吐与配额监控 widget，形态与我们几乎一致（`manage.py install` + Node sidecar + 回环调试端口内联挂载，不动 `app.asar`，本地采集）。三端适配（桌面 ZIP / IDE VSIX / CLI statusLine）。`v0.9.6` 起我们持续同步其上下文 UI 与探测加固改动（如 `v0.9.9`–`v0.9.10` 的压缩徽标、租约保活、报错脱敏）。最新 `v0.9.11` 修复 `2.34.0+` 额度 / TPS 采集并把 Neon 模型映射进 Gemini 配额组——**同步上游时优先看它的 release notes**。

### elviscjn-cjn/antigravity-context-viewer

ASAR 注入式看板：主进程钩子 + 预加载桥接 + 渲染层面板，自研 ASAR 打包引擎，零依赖。功能面最宽：按模型配置上下文长度（含社区「上下文解锁」，注意服务端不一定接受）、顶栏额度圆环（剩余 + 5h/周 + 重置时间）、生成速度、52 周活跃热力图、API 费用估算、汉化、免 TUN 代理。与我们「不篡改 `app.asar`」的红线相反，升级即失效；主要在 Windows 验证。**可对比它的额度圆环与重置时间展示、历史热力图交互**。

### AGI-is-going-to-arrive/Antigravity-Context-Window-Monitor

MIT 协议，同时支持 Antigravity App（Zero-CDP 原生 Sidecar `AUX_PANE` / `SIDEBAR` 与可选 CDP 输入框环）与 Antigravity IDE（VSIX）。功能聚焦上下文构成与多代理归因：在上下文构成卡片内直接提供 **Copy `/context` Report** 与 **Copy Handoff Prompt** 一键复制按钮、Top 5 最大占用项折叠列表、双水位线（`Compaction` + `200k`）、Orchestrator `Planner → Executor` 角色归因与 `5h` + `Weekly` 消耗速率预测。**可借鉴上下文卡片内一键复制报告/交接提示词的按钮设计与 Top 5 占用项呈现**；同时保持本仓轻量化定位，不照搬重型设置面板。

### n2ns/antigravity-panel

TypeScript VS Code 扩展（仅 IDE 侧，读本地 Language Server）：配额监控（状态栏随剩余变黄变红）、用量趋势 + 剩余额度可用时长预测（runway，14 天历史）、上下文占用 80% 压缩预警、Brain / Code Tracker 缓存浏览与清理、Auto-Accept、本地 LLM 生成 AI commit。871 stars，同赛道里社区声量最大。**可借鉴 runway 预测的呈现与缓存清理能力**；不与桌面 App 内嵌正面冲突。

### nkjDSLcvanv/antigravity-codex-theme

CDP 实时注入的 Codex 风格主题 + 1,900 条汉化 + 轻量会话统计，与本项目同款「不动 `app.asar`、回环调试端口注入」路线。工程化程度高：27 模块守护进程、`--only` 按需组合、`user/` 层改配置约 2.5s 热重载、27 项单测 + CI、`2.30.x–2.34.0+` 含调试端口冷启动接力。**注入工程（冷启动接力、热重载、模块拆分）值得对照**。

### Anarcadia/chuanban-antigravity-theme-patch

上表 codex-theme 的参考来源：CDP 注入美化补丁，`core/` 只读内核 + `user/` 可定制层分离，零 npm 依赖。多套昼夜配色预设、Google Sans Flex + 更纱黑体四层中西文排版、约 1,940 条隔离式汉化、`node:sqlite` 实时 Token 胶囊（tok/s、TTFT、缓存命中率）、零侵入启动接力与 Windows 保活自愈。**分层架构与排版 / 汉化词条工程可参考**；在 [`#43`](https://github.com/wycocoyu/agy-context-dashboard/issues/43)（`25c1cfc`）调研时因仓库无显式开源许可证且本仓明确不做皮肤与字体覆盖，未直接合入其代码。

### 宿主界面汉化来源（已合入 MIT 词库）

在 [`#43`](https://github.com/wycocoyu/agy-context-dashboard/issues/43)（`25c1cfc`）改造无侵入宿主汉化（`compat/host-i18n.cjs` + `compat/host-i18n-dict.json`，从 72 条 / 3 条正则扩充至 **4,693** 条精确词条与 **406** 条动态正则）时，直接整合并留痕了以下 3 个 **MIT** 开源汉化仓，**显式排除** `app.asar` 补丁、皮肤与侧栏布局改写：

- **[yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese)**（MIT）：合并经 Antigravity `2.34.0` 校对的主词条与 400+ 动态正则、以及设置侧栏用户项目名与自定义卡片的防误译保护边界。
- **[antigravity-cn-community/Antigravity-Chinese-Localization](https://github.com/antigravity-cn-community/Antigravity-Chinese-Localization)**（MIT）：补充合并 Desktop / 远程连接与 `2.34.0` 设置/账号/模型提示长句。
- **[ruxiayu/antigravity-zh-cn](https://github.com/ruxiayu/antigravity-zh-cn)**（MIT）：吸收其上下文限定词与分裂文本节点匹配思路，在本仓沉淀为 `scoped.modelMenu` / `scoped.badge`（把 `Low`/`Medium`/`High`/`Extra High`/`New`/`Notice`/`Unavailable` 限定在模型菜单与角标中生效，避免污染正文）及多 `TextNode` 跨节点匹配与顺序无关句末标点处理。
- 同批审阅对照的备选参考（未直接合入）：[renkeshui/antigravity-chinese-locale](https://github.com/renkeshui/antigravity-chinese-locale)（MIT，参考 WebContents 生命周期守卫与 React 受控组件桥接思路）、[joker124zx/antigravity-full-zh-theme-skill](https://github.com/joker124zx/antigravity-full-zh-theme-skill)（MIT，聚焦右键菜单与暖色主题，因不做皮肤边界未引入）。

### farion1231/cc-switch

跨工具 AI CLI / 桌面端统一配置与用量统计助手（Tauri，支持 Claude Code / Codex / OpenCode / Antigravity）。在 [`#44`](https://github.com/wycocoyu/agy-context-dashboard/issues/44)（`9690577`、`958e842`）对照 `CC Switch` 的 `UsageSummary` 接口与本地 SQLite 账本后，核实并对齐了两项核心设计：

- **同一 Antigravity 缓存命中率口径**：对齐 `input_token_semantics = 2`（`input_tokens` 仅统计新增未缓存输入、与 `cache_read_input_tokens` 互斥，`cache_creation_tokens = 0`），双方公式均为 `cache_read / (input + cache_creation + cache_read)`，实机同会话与同日聚合误差 `< 0.02%`。
- **明细展示与告警清洗**：参考其请求日志并列「新增输入 / 输出 / 缓存命中」的直观阅读结构，为「按模型用量」表新增 **缓存命中率** 列（`9690577`），并在浮卡与侧栏蓝色胶囊添加显式 **`缓存命中率：` / `Cache hit rate:`** 前缀标识（`958e842`），同时消除 `sidecars/panel/usage.mjs` 对完整非 allowlist 模型记录误标 `partial: true` 的假警告。

### RMvdesi/obsidian-prism 及其上游生态

`obsidian-prism` 采用 Zero-ASAR 纯 CDP Channel 4 按需通道，整合了本仓上游 `ATtacK030130/antigrative-dashboard`（`v0.9.1`，置于 `vendor/pulse-dashboard/`）、`yiheng8023/antigravity-chinese`（`v3.3.19`，置于 `vendor/host-i18n/` 并新增四层未知插件通用自动礼让、防死循环熔断与 `WeakMap` 无损还原）以及下列 UI 与交互组件（完整第三方声明见其 [THIRD_PARTY_NOTICES.md](https://github.com/RMvdesi/obsidian-prism/blob/main/THIRD_PARTY_NOTICES.md)）：

- **[0DNANCY/agy-claude-style](https://github.com/0DNANCY/agy-claude-style)**（MIT）：基础配色框架、弹簧动画底座、WebGL2 地平线/字符波纹矩阵、像素宠物底座与打包器雏形。
- **[LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider](https://github.com/LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider)**（MIT）：模型菜单推理等级滑块与智能共存让位。
- **[claudenoshujin/claude-web](https://github.com/claudenoshujin/claude-web)**（by lulu）：桌面宠物堆叠交互设计参考（`obsidian-prism` 中物理逻辑为净室独立实现）。

**参考点与协议边界**：其「CDP Channel 4 按需通道」与「四层未知插件通用自动礼让」机制可与本仓多插件共存架构互相对照；`obsidian-prism` 主仓采用 **GPL-3.0-only**，本仓为 MIT 协议，不直接合入其 GPL 代码，仅参考思路或回溯对应 MIT 上游原仓。

### DSH 生态：样式与滑块交互补充

除 `bowenliang123/dsh-context` 外，DSH 生态中以下组件可作为前端质感与滑块交互的独立参考：

- **[Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style)**：Studio 极简排版、输入框边框结构与暖白浅色配色参考。
- **[Microqian2th/dsh-codex-effort-slider](https://github.com/Microqian2th/dsh-codex-effort-slider)**：轨道刻度分档、迟滞吸附与阻尼运动曲线参考。
- **[mobius/dsh-performance-slider](https://github.com/mobius/dsh-performance-slider)**：性能档位滑块交互与实时反馈设计参考。

## 维护说明

- 新发现的项目补进「一览」表并在下方加小节；项目改名 / 归档 / 路线变化时更新对应行。
- 关注点记录「能抄什么 / 要防什么」，不写主观评分。
- 涉及同步上游代码（`ATtacK030130`）走 `CHANGELOG.md` + commit 留痕；合并 MIT 汉化词库同步更新 `compat/host-i18n-dict.json`（`sources`）与 README 致谢章节。
