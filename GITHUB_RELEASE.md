# AGY Context Dashboard v0.9.9

`wycocoyu/agy-context-dashboard` `v0.9.9`（MIT 协议）为维护性修复版本，重点解决 **macOS 桌面端应用内「检查更新」无法发现 Homebrew Python 3.10+** 以及 **Windows 重定向桌面快捷方式发现与自动重拉退避**问题（[`#52`](https://github.com/wycocoyu/agy-context-dashboard/issues/52)、[`#46`](https://github.com/wycocoyu/agy-context-dashboard/issues/46)）。

## 更新内容

- **macOS 应用内更新器 Python 3.10+ 自动回退探测（[`#52`](https://github.com/wycocoyu/agy-context-dashboard/issues/52)、[`#55`](https://github.com/wycocoyu/agy-context-dashboard/pull/55)）**：在 macOS GUI 默认精简 `PATH` 仅命中 `/usr/bin/python3`（3.9.6）时，自动回退探测 `/opt/homebrew/bin/`、`/usr/local/bin/` 下的 `python3` 与 `python3.14`–`python3.10` 以及 `/Library/Frameworks/Python.framework/Versions/Current/bin/python3`，解决已安装 Homebrew Python 3.10+ 仍报错「需要 Python 3.10 或更新版本」的问题。
- **Windows 重定向桌面快捷方式发现与重拉退避（[`#46`](https://github.com/wycocoyu/agy-context-dashboard/issues/46)、[`#50`](https://github.com/wycocoyu/agy-context-dashboard/pull/50)）**：通过注册表与 OneDrive 路径发现重定向后的 Windows 桌面目录并同步 `.lnk` 调试参数，同时记录 relaunch worker 执行结果并在失败后启用 10 分钟退避保护。

## 安装或更新

- **Antigravity 桌面 App**：上下文详情 → **检查更新**（`v0.8.14+`），或解压 `antigrative-dashboard-0.9.9.zip` 后运行 `python3 manage.py install`（Windows 用 `python`）。
- **Antigravity CLI / 独立 IDE**：CLI 运行 `python3 manage.py install-cli`；IDE 安装 `antigrative-dashboard-ide-0.9.9.vsix`。现有配置与统计自动保留。

---

## What changed in v0.9.9

- **macOS in-app updater Python 3.10+ fallback discovery ([`#52`](https://github.com/wycocoyu/agy-context-dashboard/issues/52), [`#55`](https://github.com/wycocoyu/agy-context-dashboard/pull/55)):** When macOS GUI launches inherit a minimal `PATH` that only resolves `/usr/bin/python3` (`3.9.6`), `runUpdateWorker` now falls back to `/opt/homebrew/bin/` and `/usr/local/bin/` (`python3` and `python3.14`–`python3.10`), plus `/Library/Frameworks/Python.framework/Versions/Current/bin/python3`.
- **Windows redirected Desktop shortcut discovery & relaunch backoff ([`#46`](https://github.com/wycocoyu/agy-context-dashboard/issues/46), [`#50`](https://github.com/wycocoyu/agy-context-dashboard/pull/50)):** Discover OneDrive / Registry-redirected Windows Desktop folders when syncing Antigravity `.lnk` debug flags, log relaunch worker outcomes, and enforce a 10-minute auto-relaunch backoff after failures.

## Install or update

- **Antigravity App:** Open context details → **Check for updates** (`v0.8.14+`), or extract `antigrative-dashboard-0.9.9.zip` and run `python3 manage.py install` (`python` on Windows).
- **Antigravity CLI / Standalone IDE:** Run `python3 manage.py install-cli` for CLI `statusLine`, or install `antigrative-dashboard-ide-0.9.9.vsix` via **Install from VSIX…**. Settings, history, and SHA-256 verification remain intact.
