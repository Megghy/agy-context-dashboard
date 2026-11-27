# 贡献指南 · Contributing Guide

感谢你对 **AGY Context Dashboard** 的关注与贡献！无论是提交 Bug 报告、提出新功能建议，还是直接发起 Pull Request，都非常欢迎。

Thank you for your interest in contributing to **AGY Context Dashboard**! Bug reports, feature ideas, documentation improvements, and pull requests are all warmly welcomed.

---

## 分支规范 · Branch Workflow（重要 / Important）

本仓库采用 **`dev` → `main`** 双分支开发与发布模型：

- **`main`**：稳定发布分支（默认分支），**仅用于从 `dev` 合并发版**。外部贡献者提交到 `main` 的 PR 会被门禁自动拦截并提示改提 `dev`。
- **`dev`**：日常集成分支，**所有社区 PR 请务必以 `dev` 为目标分支（base branch）**。

This repository uses a **`dev` → `main`** two-branch workflow:

- **`main`**: Stable release branch (default branch), **reserved for releases merged from `dev`**. PRs from non-owners targeting `main` are automatically blocked by CI.
- **`dev`**: Active integration branch. **All community pull requests must target `dev`.**

---

## 如何贡献 · How to Contribute

### 1. 提交 Issue · Filing Issues

- **报告 Bug**：使用 [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) 模板，附上系统平台（Windows / macOS / Linux）、Antigravity App/IDE 版本、插件版本与复现步骤。
- **功能建议**：使用 [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) 模板，描述使用场景与预期效果。
- **隐私提醒**：上传日志或截图前，请先脱敏本机路径、账号邮箱与 Token/凭据。

### 2. 提交 PR · Submitting Pull Requests

```bash
# 1. Fork 本仓库并克隆到本地，切换到 dev 分支
git checkout dev
git pull origin dev

# 2. 从 dev 创建功能或修复分支
git checkout -b feat/your-topic

# 3. 修改代码并运行本地验证
npm test
python -m unittest discover -s tests -v
```

完整开发与 UI/IDE 验证命令见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

提交 PR 时请确认：
1. **目标分支（base）选择 `dev`**（若误选了 `main`，可在 PR 页面顶部点击 **Edit** 直接改为 `dev`，无需关闭重提）。
2. 本地测试全部通过，且未改动无关文件。
3. PR 描述写清改动动机、核心变更与验证方式。

---

## 发版流程（维护者） · Release Process (Maintainers)

1. 在 `dev` 分支运行版本同步与预检：
   ```bash
   python tools/prepare-release.py <version>
   # 填写 CHANGELOG.md (## <version>) 与 GITHUB_RELEASE.md (v<version>)
   python tools/prepare-release.py <version> --check
   ```
2. 提交并合入 `dev`，随后由维护者发起 `dev -> main` PR，待 `Verify` 全绿后合并。
3. 在 `main` 上打 tag `v<version>` 并推送，`.github/workflows/release.yml` 将自动完成三平台校验、打包与 Release 发布。

---

## 贡献者致谢 · Contributor Recognition

我们重视每一种形式的贡献（代码、高质量 Bug 反馈、功能创意、文档与翻译）：

- **首次互动欢迎**：首次提交 Issue 或 PR 时，仓库会自动回复欢迎与协作指引。
- **Release 鸣谢**：每次发布版本时，GitHub Release Notes 会自动列出首次参与 PR 贡献的新晋贡献者（`New Contributors`）。
