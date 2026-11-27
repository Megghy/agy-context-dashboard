# Antigrative Dashboard v1.0.7

## v1.0.7 更新内容

- **消除用量汇总 SSD 写放大并自动回收残留临时库（[#124](https://github.com/wycocoyu/agy-context-dashboard/issues/124), [#125](https://github.com/wycocoyu/agy-context-dashboard/pull/125)）**：
  - 在 `sidecars/panel/usage-disk-worker.mjs` 中为一次性临时汇总库 `summarize()` 引入 `ephemeral` 模式（`PRAGMA journal_mode=MEMORY; PRAGMA synchronous=OFF;`），并用每 `128` 个文件 / `8,192` 行轮转的外层 `BEGIN ... COMMIT` 分批事务包裹单文件 `SAVEPOINT source`（`merge()` 保持 `DELETE + FULL` 掉电保护不变），彻底消除数百至数千份台账文件触发的 ~50 倍以上 SSD 写放大与多秒 CPU / 磁盘尖峰。
  - 在 `sidecars/panel/usage.mjs` 中新增 10 分钟安全窗口的陈旧 `.summary-*.tmp*` 残留自动清扫逻辑，不干扰并发运行中的汇总任务。
- **按模型用量图表：日期范围预设、同模型思考档位合并与配色升级（[#115](https://github.com/wycocoyu/agy-context-dashboard/pull/115), [#116](https://github.com/wycocoyu/agy-context-dashboard/pull/116)）**：
  - 新增日期范围快捷预设（`7d` / `30d` / `90d` / `本月` / `上月`）与自定义区间选择弹窗，加入像素感知 X 轴标签抽稀防重叠算法。
  - 默认将同一基础模型的不同思考强度档位（含 `(Tiered)` 后缀）合并聚合展示，支持一键切换展开对比，并升级深浅主题高辨识度图表调色板。
- **上下文压缩指标口径说明与触发峰值标注（[#80](https://github.com/wycocoyu/agy-context-dashboard/issues/80), [#118](https://github.com/wycocoyu/agy-context-dashboard/pull/118)）**：
  - 在三语悬浮提示中明确说明压缩计数口径（统计自轨迹压缩/检查点步骤，由累计上下文 Token 驱动而非固定轮次），并在趋势图压缩标记中标注压缩前窗口占比（`▲{pct}%`）及阈值触发峰值（`>= 85%`）。
- **深色模式低对比度 `--primary` 按钮表面色过滤与主色兼容（[#119](https://github.com/wycocoyu/agy-context-dashboard/issues/119), [#120](https://github.com/wycocoyu/agy-context-dashboard/issues/120), [#122](https://github.com/wycocoyu/agy-context-dashboard/pull/122), [#126](https://github.com/wycocoyu/agy-context-dashboard/pull/126)）**：
  - 在 `compat/theme.cjs` 中忽略宿主将 `--primary` 设为低对比度按钮表面底色（如 Antigravity IDE 深色 `#404754` on `#1a1c22`）的情况并自动回退内置/自定义强调色，同时针对 `background` / `card` 校验对比度（`>= 2.2`）完整保留合法彩色品牌强调色。
- **内嵌状态栏锚点防跳动与右对齐优化**：
  - 在 `compat/inline-widget.cjs` 新增 `snug-rounds` 紧凑档位，保持不同模型名称长度下的右侧对齐，防止输入、清空与发送消息时状态栏跳动。

## 安装与升级

- **桌面端扩展包**：下载 `antigrative-dashboard-1.0.7.zip`，运行 `python3 manage.py install` 或 `python3 manage.py upgrade`（详情见 [README.md](README.md)）。
- **IDE 扩展包**：下载 `antigrative-dashboard-ide-1.0.7.vsix`，在 IDE 扩展视图选择「从 VSIX 安装」。

---

## What changed in v1.0.7

- **Eliminate usage summary SSD write amplification & sweep stale scratch files ([#124](https://github.com/wycocoyu/agy-context-dashboard/issues/124), [#125](https://github.com/wycocoyu/agy-context-dashboard/pull/125))**:
  - Added an `ephemeral` SQLite mode (`PRAGMA journal_mode=MEMORY; PRAGMA synchronous=OFF;`) and bounded outer batch transactions (`128` files / `8,192` rows) around per-file `SAVEPOINT source` in `sidecars/panel/usage-disk-worker.mjs` (leaving `merge()` untouched on `DELETE + FULL`), eliminating ~50x+ SSD write amplification and multi-second CPU/I/O spikes across large `usage-v1` directories.
  - Added safe once-per-directory cleanup of stale (10+ min) `.summary-*.tmp*` scratch files in `sidecars/panel/usage.mjs`.
- **Usage by Model date-range presets, thinking-tier merging & chart palette ([#115](https://github.com/wycocoyu/agy-context-dashboard/pull/115), [#116](https://github.com/wycocoyu/agy-context-dashboard/pull/116))**:
  - Added date-range presets (`7d` / `30d` / `90d` / `This month` / `Last month`), a custom date-range popover, and pixel-aware X-axis label thinning to prevent overlap.
  - Merged model thinking tiers (including `(Tiered)` suffixes) by default across chart, legend, and table with an unmerged toggle, alongside curated light/dark chart palettes.
- **Compaction metric basis & trigger peak annotations ([#80](https://github.com/wycocoyu/agy-context-dashboard/issues/80), [#118](https://github.com/wycocoyu/agy-context-dashboard/pull/118))**:
  - Explained the compaction/checkpoint trajectory counting basis in trilingual tooltips and annotated trend markers with pre-compaction context window share (`▲{pct}%`) and threshold-triggered peaks (`>= 85%`).
- **Low-contrast host `--primary` button surface filtering ([#119](https://github.com/wycocoyu/agy-context-dashboard/issues/119), [#120](https://github.com/wycocoyu/agy-context-dashboard/issues/120), [#122](https://github.com/wycocoyu/agy-context-dashboard/pull/122), [#126](https://github.com/wycocoyu/agy-context-dashboard/pull/126))**:
  - Ignored low-contrast host `--primary` button surfaces (e.g. Antigravity IDE dark `#404754` on `#1a1c22`) in `compat/theme.cjs` while scoping contrast checks (`>= 2.2`) to `background` and `card` surfaces so chromatic brand accents remain intact.
- **Inline status bar anchor stability & right alignment**:
  - Added the `snug-rounds` spacing tier in `compat/inline-widget.cjs` to keep the inline strip right-aligned across varying model lengths and prevent bar jumps during typing, clearing, and sending.

## Install or update

- **Desktop App bundle**: Download `antigrative-dashboard-1.0.7.zip` and run `python3 manage.py install` or `python3 manage.py upgrade` (see [README.en.md](README.en.md)).
- **IDE extension**: Download `antigrative-dashboard-ide-1.0.7.vsix` and choose **Install from VSIX…** in the IDE Extensions view.
