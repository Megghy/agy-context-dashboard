<div align="center">

<img src="docs/assets/hero-zh.png?v=1.0.1" width="100%" alt="Antigravity Dashboard：生成速度、Token 缓存、剩余额度与上下文控件，就在输入框旁。">

# AGY Context Dashboard (Antigravity Dashboard)

参考 DSH 设计的 Antigravity (`agy`) 上下文构成、Token 速率、缓存命中率、共享额度与全局洞察仪表盘；悬停胶囊展开精细统计，右侧边栏四视图一站式管理每日/每周活动、按模型用量、当前会话与全局洞察。<br>
缩略信息常驻；鼠标悬停，才展开详细统计。

[![Version 1.0.2](https://img.shields.io/badge/version-1.0.2-91adff?style=flat-square&labelColor=252936)](CHANGELOG.md)
[![Platforms](https://img.shields.io/badge/host-Windows%20%7C%20Linux%20%7C%20macOS-83d8b9?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![Antigravity 2.21.1 / 2.33.0+ / 2.34.0+](https://img.shields.io/badge/Antigravity-2.21.1%20%2F%202.33.0%2B%20%2F%202.34.0%2B-c5a0ff?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![Languages](https://img.shields.io/badge/languages-English%20%7C%20%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87%20%7C%20%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87-f2b880?style=flat-square&labelColor=252936)](#统计口径与技术文档)
[![MIT](https://img.shields.io/badge/license-MIT-d4d9e6?style=flat-square&labelColor=252936)](LICENSE)

[看看效果](#看看效果) · [IDE](#antigravity-ide) · [CLI](#antigravity-cli-状态栏) · [开始安装](#安装) · [启用与停用](#可插拔) · [开源致谢](#宿主界面汉化与开源致谢) · [常见问题](#常见问题) · [English](README.en.md)

</div>

> [!TIP]
> - **三语言界面 + 一键宿主汉化**：插件支持 `English / 简体中文 / 繁體中文`；侧栏顶部 `汉` 按钮可无侵入实时汉化 Antigravity 桌面宿主，不改 `app.asar`，关闭即还原。
> - **`2.33.0+` / `2.34.0+` 自动兼容**：自动适配 `2.34.0+` daemon 凭据与 Windows/Linux 快捷方式调试参数，默认开启 `autoRelaunchDebug`（启动前 `20s` 缺少调试端口时温和重拉恢复，可在侧栏关闭），不篡改应用包。

**近期更新（[完整变更记录 →](CHANGELOG.md)）：**
- **v1.0.2**：修复空对话加载配额后自动展开完整底栏，完善发版预检与社区贡献工作流。
- **v1.0.1 / v1.0.0**：底栏自由换色与浅/深色非模态设置、模型选择器防截断与极简折叠、轮次/5 分类步数抽屉、Orchestrator/Swarm 拆分、Insights 正方形热力图与 Remote SSH 支持。

## 看看效果

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark-zh.webp?v=1.0.3" />
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/hero-light-zh.webp?v=1.0.3" />
  <img src="docs/assets/hero-light-zh.webp?v=1.0.3" width="100%" alt="Antigrative Dashboard 交互动效演示：悬停展开四类详情卡与侧栏标签切换。" />
</picture>

<sub>以上动效由离线渲染舞台直接运行本仓库前端源码逐帧录制，示例数据均为虚构。</sub>

</div>

<img src="docs/assets/responsive-zh.png?v=1.0.1" width="100%" alt="v1.0.1 主对话窄窗口四图标布局，以及子代理输入框旁的独立统计。">

<table>
<tr><th width="50%">生成速度与 Token 缓存（显式命中率与就地开关）</th><th width="50%">独立额度预测与 8 分类上下文构成</th></tr>
<tr>
<td width="50%" valign="top"><img src="docs/assets/speed-zh.png?v=1.0.1" width="100%" alt="生成速度详情卡：会话解码、端到端速率、TTFT 与解码峰值"><br><img src="docs/assets/widget-zh.png?v=1.0.1" width="100%" alt="Token 用量与缓存详情卡：带显式缓存命中率标识与状态栏命中率就地开关"></td>
<td width="50%" valign="top"><img src="docs/assets/quota-zh.png?v=1.0.1" width="100%" alt="独立剩余额度卡：Gemini、Claude、Argon 5h 与周额度倒计时及耗尽预测"><br><img src="docs/assets/context-zh.png?v=1.0.1" width="100%" alt="上下文窗口详情卡：宿主 8 分类构成、压缩次数、趋势折线、布局切换与设置入口"></td>
</tr>
</table>

<table>
<tr><th width="50%">v1.0.1 非模态设置面板与四项自由换色</th><th width="50%">浅 / 深色主题与自定义指标配色对照</th></tr>
<tr>
<td width="50%" valign="top"><img src="docs/assets/settings-dialog-zh.png?v=1.0.1" width="100%" alt="非模态设置弹层：支持浅/深色切换、四项独立调色、排序与显隐控制"></td>
<td width="50%" valign="top"><img src="docs/assets/theme-colors-zh.png?v=1.0.1" width="100%" alt="浅色默认蓝色基调、浅色四项自定义配色与深色定制配色对照"></td>
</tr>
</table>

<img src="docs/assets/density-modes-zh.png?v=1.0.1" width="100%" alt="v1.0.1 三档自适应密度（Full / Compact-Text / Icons-Only）与 Minimal 极简折叠态对照">

<table>
<tr><th width="50%">右侧边栏 · 当前会话（四视图入口）</th><th width="50%">右侧边栏 · 全局洞察（跨会话总览）</th></tr>
<tr>
<td width="50%" valign="top"><img src="docs/assets/panel-session-zh.png?v=1.0.1" width="100%" alt="侧边栏四标签页与当前会话 Token 用量、预估费用及缓存命中率"></td>
<td width="50%" valign="top"><img src="docs/assets/panel-insights-zh.png?v=1.0.1" width="100%" alt="全局洞察视图：Credits 额度、总消耗、预估费用、近 7 天柱状图与热力图"></td>
</tr>
</table>

<table>
<tr><th width="50%">每日 / 每周活动</th><th width="50%">按模型统计用量（含缓存命中率列）</th></tr>
<tr>
<td width="50%"><img src="docs/assets/usage-overview-zh.png?v=1.0.1" width="100%" alt="Token 用量活动概览，支持每日和每周贡献图"></td>
<td width="50%"><img src="docs/assets/usage-details-zh.png?v=1.0.1" width="100%" alt="按模型统计柱状图、额度池汇总及含缓存命中率列的明细表"></td>
</tr>
</table>

<sub>使用当前控件与侧边栏源码和示意宿主布局渲染，数值为示例。主对话与子代理统计分别展示，账号额度共享；44% 上下文读取最近请求开始时的估计值，不是累计输入。实际插件的数据来自本机 Antigravity 接口，中英文及宿主汉化开关会持久化保存。</sub>

**不用在多窗口间反复切屏，输入区与侧栏全掌握。**

| 看见速度 | 知道余额与上下文 | 洞察全局且少打扰 |
| --- | --- | --- |
| 会话解码 TPS、端到端（E2E）速率、首字（P50/最新）与模型 / 工具耗时。 | Gemini、Argon 与 3p Claude 的 5h/周余额、耗尽预测、宿主 8 分类上下文构成与趋势图。 | 每日/每周活动与按模型用量（含缓存命中率）置顶，支持全局洞察、会话审计、USD 费用估算与可切宿主界面汉化。 |

### 它还处理了这些细节

- **防误触悬停与快速切换。** 首次悬停等待 250 毫秒，点击或键盘聚焦立即打开；卡片展开期间，以及鼠标离开控件后的 350 毫秒内，切换指标无需等待。提前移开鼠标、切换对话或替换输入区会取消尚未打开的弹窗。
- **菜单保持稳定。** 打开额度组菜单时，轮询不会重建控件或关闭菜单，倒计时继续更新。
- **用真实数据。** 余额读取账户接口，不根据生成字数推测，不将重置到期自动改成 100%。
- **切换对话。** 统计跟随当前会话，新对话不沿用上一段对话的速率。
- **子代理用量汇总。** Token／缓存包含当前代理及其下级子代理，详情分别显示当前代理和子代理贡献。速率、上下文对应当前代理，额度仍为账号共享额度。后台汇总支持多层委派、请求去重和重启恢复。[统计口径及边界](docs/USAGE.md#delegated-tasks-boost--teamwork--subagents)。
- **Teamwork 兼容（v0.8.1）。** 发送、停止、取消状态切换时保留控件，支持深层嵌套和无 `title`／`span` 的静态代理徽章。优先读取当前输入框所属的 DOM 会话标识，URL 不变时也能切换统计；忽略隐藏、禁用及更深层输入框，存在歧义时不随意挂载。中英文六层嵌套浏览器夹具已覆盖用量入口重新挂载和上下文至用量窗口的语言同步。Windows 真实三级委派已检查独立统计、返回主对话与生成中截图；该宿主每层改变 URL、只渲染一个输入框，URL 不变和六层 DOM 场景仍属夹具覆盖。Linux/macOS 登录后界面检查仍待完成。
- **更新后自动连接。** 适配器保存在用户插件目录，默认安装不修改 App 归档。
- **对话统计持久化。** 每个账号、每个对话分别保存 tok/s 与 cache，重新加载后可恢复。
- **适合紧凑窗口。** 完整数值放不下时先保留速度、缓存、额度环与上下文四个图标，仍可悬停或点击查看详情；语言与宿主汉化开关保留在上下文卡里。连图标都放不下或确实碰撞宿主按钮时才隐藏，拉宽后恢复。消息按钮滚到输入框后面不会再导致控件消失。
- **跟随主题配色。** 控件、悬浮卡和额度菜单跟随 Antigravity 的深浅模式及自定义背景、卡片、文字和强调色，并保持文字可读；独立预览跟随系统，切换主题无需重启或重新加载对话。
- **语言设置跨重启保留。** 中英文选择写入独立的 `AntigravityPulse/preferences.json` 用户配置，控件和侧面板共用；不依赖应用每次启动的本地端口。
- **不上传采集数据。** 后台使用本机 loopback 接口，数值留在你的电脑。

## Antigravity IDE

**v0.7.0** 新增反重力自己的独立 IDE 适配。下载发布页的
`antigrative-dashboard-ide-1.0.1.vsix`，在 IDE 扩展页选择「从 VSIX 安装」。
仅安装 IDE 的用户也可以使用，无需先装桌面 App。

完全退出 IDE 后，使用带
`--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`
参数的启动方式打开；将参数加到快捷方式目标末尾，后续继续使用该快捷方式。
窄栏显示四个可交互图标，拉宽后显示数值；悬停或点击即可查看详情。

Windows IDE **2.5.5** 与 **2.6.0** 已适配并提供自动化验证（`agy --hub` 与嵌套 Webview）。Linux/macOS IDE 有自动化覆盖，登录后的
实机 GUI 验收尚未完成。VS Code、Visual Studio、JetBrains、Zed、Xcode 中的
Antigravity 扩展目前尚未兼容。详见 [IDE 安装、更新、诊断和数据清理](ide/README.md)。
上方演示图是桌面 App 控件，不是 IDE 界面截图。

## Antigravity CLI 状态栏

**v0.6.0 新增**独立的 CLI 官方状态栏适配：上下文占用、缓存读取 Token、状态、模型/子代理详情（`--details`）、分组额度（`Gemini`、`Argon` 周额度及共享 `3p` `Claude` 标签）及重置倒计时，支持中英文和终端宽度适配。额度数字和进度条按剩余量显示：**≥70% 绿色、≥30% 且 <70% 黄色、<30% 红色**。预览：`node cli/statusline.mjs --preview --language zh-CN`；安装：`python manage.py install-cli`（或 `python manage.py install --with-cli`；Linux/macOS 用 `python3`）。需要 Node.js 20+ 和支持官方接口的 CLI。历史 CLI 1.3.2/1.3.3 支持已核实的 Sonnet 4.6、GPT-OSS 120B 与 CLI 1.3.3 Gemini 3.8 Flash (High)；CLI 1.5.x 适配扩展支持 `1.5.5` / `1.5.9` 下已验证第一方模型族的零缓存写入场景（`word/*`、`perplexity/*`、`GPT-6*`、BYOK、未知占位符及非零 `cache_creation_input_tokens` 维持不可用）。官方输入没有流式耗时，暂不显示 tok/s。详见 [CLI 使用及撤回](docs/CLI.md)。

![真实 Antigravity CLI 两轮对话及当前请求缓存率](docs/assets/cli-conversation-zh.png?v=0.8.4-cli-1)

<sub>历史实机样本（Linux Antigravity CLI 1.3.3 真实中文两轮对话）：当前请求缓存率 95.4%、缓存读取 13.1K；账号邮箱已遮挡。macOS 登录后的交互实机验收尚未完成。</sub>

## 安装

### 一句话让 Antigravity 自动安装（推荐）

不用自己敲命令，直接把下面这句话复制发给 Antigravity 即可自动识别当前宿主（桌面 App / CLI / 独立 IDE）并完成安装：

```text
帮我安装并启用这个 Antigravity 插件：https://github.com/wycocoyu/agy-context-dashboard
```

如需严格约束安装步骤与 SHA256 校验，可展开下方折叠块里的完整提示词。

以下命令安装**桌面 App 适配器**；IDE 用户请使用[上方专用 VSIX 安装流程](#antigravity-ide)。

适用于 **Windows / Linux / macOS 的 Antigravity 桌面 App（兼容 2.21.1 / 2.22.0 及 2.33.0+）+ Python 3.10+**。三系统共用同一个 release ZIP，无 pip / npm 第三方依赖，后台使用 App 自带 Node.js。各平台完整验证范围见 [COMPATIBILITY.md](COMPATIBILITY.md)。

Linux / macOS 使用 `python3 manage.py install` 或 `sh install.sh`，启停和卸载命令同样把 `python` 换成 `python3`。无需 sudo，不修改应用归档。

> 模型选择旁的内嵌位置没有公开插件挂载接口。现在由标准 sidecar 通过已有本地渲染调试端口挂载控件，默认安装不再修改 `resources/app.asar`。未来宿主 DOM、调试通道、SDK 或统计接口改变时仍可能需要适配；原生侧面板作为备用入口。

### Antigravity Desktop 2.33.0+ 调试端口要求

从 **Antigravity Desktop 2.33.0** 起，宿主默认不再开启渲染器远程调试端口，并在未传 `--remote-debugging-port` 时主动清理 `<profile>/DevToolsActivePort`。此外，常规通过 Dock / 桌面快捷方式启动，以及应用内自动更新（`quitAndInstall()`）后的自动重启，都会丢失命令行参数。由于 macOS 受 `ElectronAsarIntegrity` 与 Hardened Runtime 代码签名保护，本插件不会篡改 `app.asar`，而是提供**可选桌面调试启动器**与**侧边栏一键重开**，以显式参数 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` 启动宿主：

- 安装插件时一并生成桌面调试启动器：`python3 manage.py install --with-launcher`（Windows 用 `python`），或随时单独执行 `python3 manage.py install-launcher`。
- 生成的调试启动器路径：
  - **macOS**：`~/Applications/Antigravity (Debug).app`（可直接拖入 Dock 使用）
  - **Windows**：`%LOCALAPPDATA%\AntigravityPulse\Launch Antigravity (Debug).cmd`
  - **Linux**：`~/.local/share/applications/antigravity-pulse-debug.desktop`
- 也可以在终端直接执行 `python3 manage.py launch`（如已在运行但不带调试端口，加 `--relaunch` 会先等待旧主进程完全退出后再重开）。

### 手动安装

下载 [最新 Release](https://github.com/wycocoyu/agy-context-dashboard/releases/latest) 的 ZIP 并解压，或克隆仓库：

```powershell
git clone https://github.com/wycocoyu/agy-context-dashboard.git
cd agy-context-dashboard
python manage.py install --with-launcher
```

如使用 Antigravity 2.33.0+，请完全退出后改用生成的调试启动器（如 macOS 的 `~/Applications/Antigravity (Debug).app`）或执行 `python3 manage.py launch --relaunch` 打开；2.32 及更早版本仍可直接正常重开 Antigravity。打开对话后，模型选择右侧就会出现额度与速率条。PowerShell 用户也可以运行 `./install.ps1`（不需要生成桌面调试启动器时运行 `python manage.py install` 即可）。

安装器复制并启用插件；迁移时只恢复经过完整校验的旧补丁。后台自动发现当前渲染端口并重新连接。**保留这个源码 / 解压目录**，以便启停、升级和卸载。

<details>
<summary><strong>让 Agent 帮你安装：展开完整提示词</strong></summary>

```text
请帮我安装并启用 Antigravity Dashboard。
仓库：https://github.com/wycocoyu/agy-context-dashboard
1. 读取 README.md、COMPATIBILITY.md、docs/CLI.md 和 ide/README.md。先用只读检查
   分析系统、可执行文件、宿主版本和已有插件配置，区分桌面 App、Antigravity CLI
   （agy）和独立 Antigravity IDE；不能仅凭系统判断安装目标。
2. 下载安装包或修改配置前，向我说明检测到哪些宿主，并让我明确确认要安装
   App、CLI 还是独立 IDE 适配。如同时安装了多个，让我选一个或多个；无法识别
   则询问可执行文件路径。不要因为我是 Linux 或在终端里就默认安装桌面端。
3. 查询最新稳定发布，说明插件版本、宿主版本和路径、选定适配器。App 与 CLI
   共用 ZIP，但安装命令不同；独立 IDE 使用单独 VSIX。只下载已确认目标需要的
   文件并校验 SHA256，将源码解压到固定目录。不要未经单独确认安装、升级、
   降级或替换 Antigravity 宿主。
4. 使用 Python 3.10+（Linux/macOS 通常用 python3），按确认的目标执行：
   - App：先 python manage.py status，再 python manage.py install（若宿主为
     Antigravity 2.33.0+ 且用户希望保留原生桌面入口，追加 --with-launcher 生成
     调试启动器，之后用调试启动器或 python3 manage.py launch --relaunch 启动）。
   - CLI：检查 agy --version 和 Node.js 20+，执行 python manage.py install-cli，
     不要执行 manage.py install。已有 statusLine 按 CLI 文档备份／覆盖流程处理。
     CLI 缓存率有适用条件，按 docs/CLI.md 核对实测模型／版本及不可用情况。
     不承诺 CLI 展示 tok/s 或本地用量图表，这些不在 CLI 适配范围内。
   - 独立 IDE：通过 Install from VSIX... 安装发布版 VSIX，或使用
     ide/manage.py install --exe <已核实的IDE可执行文件> --vsix <发布版VSIX>。
     不需要桌面 App，不要执行 App 安装器。
5. 保留其他设置和已保存数据。需要重启或登录时先告知，不强制结束正在执行的
   任务。IDE 按文档保留本机回环调试启动参数；CLI 在新会话中验证。
6. 在选定的真实宿主中验证，报告插件／宿主版本、安装目标和路径、实际完成的
   检查、剩余步骤，以及该适配器的停用／卸载方法。下载 ZIP 不代表 CLI 已安装成功。
```

</details>

## 可插拔

### 打开 App 侧边栏面板

用右上角开关展开右侧辅助栏，在辅助栏顶部点击 **＋ → Extensions → Antigravity Dashboard**，即可打开插件的常驻侧边栏面板。顶部提供四个顶层视图切换，按常用优先级依次为：**每日/每周活动**、**按模型用量**（含额度池汇总与按模型缓存命中率列）、**当前会话**（速度 / 缓存 / 上下文卡片、`审计` 文件与命令弹窗、USD 估算费用与多代理拆解），以及**全局洞察**（Prompt / Flow Credits、跨会话总消耗、近 7 天柱状图、热力图与高频项目/技能/工具排行）。头部另附 `汉` 一键开关，可热切换 Antigravity 宿主界面汉化；点卡片切换详情且移开鼠标不隐藏，也可随时从输入框用量卡打开独立大图窗口。

如果 Antigravity Desktop `2.33.0+` 通过常规 Dock / 快捷方式启动，或因 `quitAndInstall()` 自动更新重启而丢失了命令行参数，内嵌条会进入 `missing-debug-port` 诊断状态。此时侧边栏面板仍可直接打开，并在顶部提示条提供：

- **一键以调试模式重开 Antigravity**：自动温和退出当前宿主、等待所有旧主进程退出后再以 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` 拉起。
- **自动重开开关（`autoRelaunchDebug`，默认开启）**：内嵌模式下默认启用（可取消勾选保存 `autoRelaunchDebug: false` 至 `preferences.json` 关闭）；当直接打开无参原版或宿主自动更新重启后在启动 `20` 秒窗内检测到缺少调试端口时，在 `60` 秒滑窗防环保护下自动触发重开恢复。

更新插件代码后请完整退出并重新打开 App，让采集进程加载新模块；重启前已经打开的面板可能仍由旧采集进程提供页面。

在项目目录运行（Linux / macOS 将 `python` 替换为 `python3`）：

| 操作 | 命令 | 行为 |
| --- | --- | --- |
| 安装 / 更新插件 | `python manage.py install` | 复制运行时适配器，保留其他配置和历史统计；追加 `--with-launcher` 一并生成调试启动器 |
| 安装调试启动器 | `python3 manage.py install-launcher` | 生成平台可选调试启动器（自动注入 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`） |
| 卸载调试启动器 | `python3 manage.py uninstall-launcher` | 仅移除校验归属标记后的本插件调试启动器 |
| 调试模式启动 / 重开 | `python3 manage.py launch` | 带调试端口参数启动桌面端；追加 `--relaunch` 会先关闭旧主进程再重开 |
| 停用 | `python manage.py disable` | 关闭插件，缩略条在下一次轮询隐藏 |
| 启用 | `python manage.py enable` | 启动插件并重新显示控件 |
| 查看状态 | `python manage.py status` | 检查安装、开关、控件连接状态，以及 `debugPortAvailable`、`launcher` 与 `debugPortHint` |
| 卸载 | `python manage.py uninstall` | 移除本插件目录及由本插件创建的调试启动器，保留历史统计与旧版备份 |

首次安装、更新插件代码或卸载之后需要完整重启 App。启停开关不需要重装或再次修改归档。`./uninstall.ps1` 等同于卸载命令。

**恢复资料会保留。** 原始归档在 `%LOCALAPPDATA%/AntigravityPulseBackups/<时间戳>/`；卸载保留备份与诊断日志。遇到 App 升级或其他修改时，卸载器拒绝覆盖未知文件，不强行恢复旧版 App。

`python manage.py install --panel-only` 关闭内嵌挂载，只安装原生 sidecar 面板。需要账号原生 UI Extensions 已开放；这个模式不能保证出现模型旁的缩略条。

### Remote SSH 远程窗口支持

在 Remote SSH 窗口中默认零配置通过渲染层 Connect-RPC 直连显示远程指标（不可达时自动降级保留共享额度），也支持可选 SSH 回环隧道转发：

<details><summary>展开查看可选 SSH 回环转发配置</summary>

1. **远程 Linux 端**：`python3 manage.py install --panel-only --remote-bridge-port 17891`
2. **本机 `~/.ssh/config`**：添加 `LocalForward 127.0.0.1:17891 127.0.0.1:17891`
3. **本机客户端**：`python3 manage.py set-remote-endpoint user@your-host 17891`

</details>

## 统计口径与技术文档

核心指标全部仅保存白名单数值与统计摘要（不落盘对话正文、凭据或密钥），完整算法与边界见专题文档：

| 主题 | 说明 | 文档 |
| --- | --- | --- |
| 速率与计时质量 | 会话/最近 TPS、E2E、TTFT 与短窗口过滤规则 | [docs/TPS.md](docs/TPS.md) |
| 上下文窗口 | 宿主 8 分类构成、压缩趋势与容量来源 | [docs/CONTEXT_LIMITS.md](docs/CONTEXT_LIMITS.md) |
| 长对话采集 | 偏移分页流式跳过正文与 192 MiB 堆预算控制 | [docs/LONG_CONVERSATIONS.md](docs/LONG_CONVERSATIONS.md) |
| 本地用量与持久化 | `history-v1` / `usage-v1` 账本路径与清理说明 | [docs/USAGE.md](docs/USAGE.md) |
| 稳定性与恢复 | 调试端口自愈、更新回滚与异常恢复矩阵 | [docs/ROBUSTNESS.md](docs/ROBUSTNESS.md) |

## 宿主界面汉化与开源致谢

侧边栏顶部 `汉` 按钮与上下文详情底部的「宿主界面汉化」开关支持无侵入实时汉化 Antigravity 桌面宿主（基于 CDP + `WeakMap` 原文缓存，关闭即无损还原）。词典（`compat/host-i18n-dict.json`）整合融合自以下 **MIT** 开源项目，在此致谢：

- [`yiheng8023/antigravity-chinese`](https://github.com/yiheng8023/antigravity-chinese) · [`antigravity-cn-community/Antigravity-Chinese-Localization`](https://github.com/antigravity-cn-community/Antigravity-Chinese-Localization) · [`ruxiayu/antigravity-zh-cn`](https://github.com/ruxiayu/antigravity-zh-cn)

## 兼容性

- **桌面端**：实机验证 Windows 11（Antigravity `2.21.1` / `2.22.0` / `2.33.0+` / `2.34.0+`）；Linux / macOS 已通过自动化检查与路径适配（[完整兼容性与边界 →](COMPATIBILITY.md)）。
- **独立 IDE**：单独 VSIX 支持 Antigravity IDE `2.5.5` / `2.6.0`（不支持 DSH `dsh plugin add`）。

## 常见问题

<details><summary><strong>安装后没出现？</strong></summary>

确认已完全退出主进程再启动 App，不只是关闭窗口。执行 `python3 manage.py status`（Windows 用 `python`），查看 `debugPortAvailable`、`inlineIntegration` 与 `debugPortHint`；若为 Antigravity 2.33.0+ 且提示缺少调试端口（`missing-debug-port`），请改用 `python3 manage.py install-launcher` 生成的调试启动器打开（如 macOS 的 `~/Applications/Antigravity (Debug).app`），执行 `python3 manage.py launch --relaunch`，或在侧边栏 **＋ → Extensions → Antigravity Dashboard** 中点击一键重开按钮。也可检查 `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/logs/sidecar.log` 和 `data/integration-state.json`。日志不要直接公开，其中宿主产生的日志可能含本机信息。

</details>

<details><summary><strong>为什么新对话没有 tok/s？</strong></summary>

还没有请求统计时刻意隐藏，防止显示旧会话速率。完成一次模型响应后出现。

</details>

<details><summary><strong>为什么 Gemini、Argon 与 Claude 的余额不同？</strong></summary>

服务端会按组返回各自独立的配额：第一方 `Gemini` 组、单独报告的 `Argon` 周额度组，以及共享 `3p` 组（界面统一显示为 `Claude`）。控件默认跟随当前模型；在额度卡中可以切换查看另一组，手动选择其他组时会显示组名避免混淆。

</details>

<details><summary><strong>升级 Antigravity 后怎么办？</strong></summary>

App 更新不会覆盖用户插件目录中的适配器。在 2.32 及更早版本中，后台会自动重新发现端口、凭据和渲染窗口并重连。在 **Antigravity 2.33.0+** 中，应用内自动更新调用 `quitAndInstall()` 重启时会丢弃 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` 参数：从 `v0.9.5` 起，Sidecar 会同步自愈 Windows / Linux 启动快捷方式，且内嵌模式已默认开启 `autoRelaunchDebug`（启动前 `20` 秒窗内单次自愈 + `60` 秒滑窗最多放行 `2` 次防循环），更新重启后会自动帮你带参重拉并重新挂载；如需关闭自动重拉，可在侧边栏面板（**＋ → Extensions → Antigravity Dashboard**）取消勾选自动恢复选项，并改用一键调试重开、`python3 manage.py launch --relaunch` 或生成的调试启动器打开。未显示时检查 `python3 manage.py status`；宿主接口变化时可先用原生侧面板。不要把旧归档覆盖新版应用。详见[鲁棒性分析](docs/ROBUSTNESS.md)。

</details>

## 开发与发行

```powershell
npm test
python -m unittest discover -s tests -v
python manage.py package
```

ZIP 与 SHA256 文件输出到 `dist/`。打包使用文件白名单，不包含账号配置、凭据、日志、SDK 缓存或 App 归档。

[开发说明 →](docs/DEVELOPMENT.md) · [贡献指南 →](CONTRIBUTING.md) · [版本记录 →](CHANGELOG.md)

## 许可

Antigravity Dashboard 源码使用 [MIT](LICENSE) 许可证。项目不分发 Antigravity 的二进制、SDK 或 App 备份。Antigravity 名称属于其各自权利人，本项目与其无官方隶属关系。

## App 手动更新

在 **上下文详情 → 右下角「检查更新」** 中手动检查稳定发行版。更新器只更新 App 插件，校验官方包与 SHA-256，保留设置和用量记录；安装完成后可重新加载插件。失败或中断时保留回滚与恢复材料。IDE 和 CLI 仍使用各自安装方式。[校验、恢复及边界说明](docs/UPDATES.md)。

---

> **Fork 与独立演进说明：** 本仓库 **`wycocoyu/agy-context-dashboard`** Fork 自原作者仓库 [`ATtacK030130/antigrative-dashboard`](https://github.com/ATtacK030130/antigrative-dashboard)，目前已在原 [MIT 协议](LICENSE) 下从 `v0.8.12` 基线起与原作者分开设计、独立演进，同时完整保留原版权署名及现有用户配置、`history-v1`、`usage-v1` 与 IDE 存储路径兼容性。

