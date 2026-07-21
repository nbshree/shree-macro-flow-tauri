# Windows 发版运行手册

本文用于维护者或 Codex 执行 Windows 正式发版。开始发版前必须完整阅读本文。

## 当前发布架构

- 主代码仓库与发行版：<https://gitee.com/nbshree/shree-macro-flow-tauri>
- Windows 构建引擎：GitHub Actions
- GitHub 镜像仓库：<https://github.com/nbshree/shree-macro-flow-tauri>
- 自动发布工作流：`.github/workflows/gitee-release.yml`
- 本地/流水线发布脚本：`scripts/publish-gitee.ps1`
- 标签格式：`v主版本.次版本.修订号`，例如 `v1.8.0`
- Gitee 安装包名称：`macro-flow_1.8.0_x64-setup.exe`

Gitee Go 官方云构建环境是 Linux，不能可靠生成本项目的 Windows NSIS 安装包。因此使用
GitHub Actions 的 `windows-latest` 构建，再通过 Gitee API 把安装包发布回 Gitee。

## 凭据与安全

GitHub 仓库必须存在名为 `GITEE_TOKEN` 的 Actions Secret。该 Secret 保存具有目标仓库发布
权限的 Gitee 私人令牌。

检查 Secret 是否存在（不会显示内容）：

```powershell
gh secret list --repo nbshree/shree-macro-flow-tauri
```

设置或轮换 Secret：

```powershell
gh secret set GITEE_TOKEN --repo nbshree/shree-macro-flow-tauri
```

不要把令牌写入仓库、提交信息、终端命令参数、发行说明或聊天记录。令牌泄露后应立即在
Gitee 撤销，生成新令牌并更新 GitHub Secret。

## 发版前检查

1. 确认工作区状态，保留并理解所有用户修改：

   ```powershell
   git status --short
   ```

2. 确认当前分支是 `main`，并与 Gitee、GitHub 的 `main` 对齐。
3. 确定新版本号，且该标签从未发布。不要移动或重建已经公开的版本标签。
4. 同步修改以下版本号：

   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`

5. 运行依赖或 Rust 命令后，把相应锁文件变化一并纳入发版提交：

   - `pnpm-lock.yaml`
   - `src-tauri/Cargo.lock`

6. 至少执行以下验证：

   ```powershell
   pnpm install --frozen-lockfile
   pnpm typecheck
   pnpm test
   pnpm build
   cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
   cargo check --manifest-path src-tauri/Cargo.toml
   cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
   ```

涉及宏输入、DPI、托盘或持久化的改动，还应执行 `AGENTS.md` 中列出的 Windows 手工验证。

## 自动发版步骤

下面以 `v1.8.0` 为例。标签中的版本必须和 `package.json` 完全一致，发布脚本会强制校验。

```powershell
git add package.json pnpm-lock.yaml `
  src-tauri/tauri.conf.json `
  src-tauri/Cargo.toml `
  src-tauri/Cargo.lock

git commit -m "chore: release v1.8.0"
git tag -a v1.8.0 -m "Release v1.8.0"
git push origin main --follow-tags
```

当前开发机的 `origin` 配置了两个 push URL，因此最后一条命令会同时推送到 Gitee 和
GitHub。检查方式：

```powershell
git config --get-all remote.origin.pushurl
```

预期输出：

```text
git@gitee.com:nbshree/shree-macro-flow-tauri.git
git@github.com:nbshree/shree-macro-flow-tauri.git
```

如果换了电脑或重新克隆仓库，需要重新配置：

```powershell
git config --unset-all remote.origin.pushurl
git config --add remote.origin.pushurl git@gitee.com:nbshree/shree-macro-flow-tauri.git
git config --add remote.origin.pushurl git@github.com:nbshree/shree-macro-flow-tauri.git
```

标签到达 GitHub 后，工作流会自动：

1. 在 Windows 节点检出完整标签历史。
2. 安装 pnpm、Node.js 和 Rust。
3. 执行 TypeScript 检查、测试、Rust 格式检查和 Clippy。
4. 执行 `pnpm tauri:build` 生成 NSIS 安装包。
5. 调用 `scripts/publish-gitee.ps1` 创建 Gitee 发行版并上传安装包。

## 观察与验收

查看最近的流水线：

```powershell
gh run list `
  --workflow gitee-release.yml `
  --repo nbshree/shree-macro-flow-tauri `
  --limit 5
```

等待某次流水线结束：

```powershell
gh run watch <run-id> `
  --repo nbshree/shree-macro-flow-tauri `
  --exit-status
```

失败时查看日志：

```powershell
gh run view <run-id> `
  --repo nbshree/shree-macro-flow-tauri `
  --log-failed
```

流水线成功后还必须检查 Gitee 发行版：

- 标签、标题和版本号一致。
- 附件名为 `macro-flow_<版本>_x64-setup.exe`，没有 MIME 编码乱码。
- 附件可以下载，文件大小合理。
- 本地和发行说明中的 SHA-256 一致。
- 发行说明中的中文提交信息显示正常。

## 手动发布与修复

自动流水线不可用时，可以在完成本地构建后手动发布：

```powershell
pnpm tauri:build
pwsh -File .\scripts\publish-gitee.ps1 -Version 1.8.0 -SkipBuild
```

脚本会隐藏输入 Gitee 令牌。不要用命令行参数传递令牌。

修复已经存在的发行说明，或为已有发行版补传正常名称的附件：

```powershell
pwsh -File .\scripts\publish-gitee.ps1 `
  -Version 1.8.0 `
  -SkipBuild `
  -RepairExisting
```

早期脚本上传中文文件名时，Gitee 可能把附件显示为 `=?utf-8?B?...?=`。当前脚本会使用
ASCII 文件名避免该问题。乱码旧附件需要在 Gitee 发行版编辑页面手动删除。

## 常见故障

### 推送标签后没有触发 GitHub Actions

先确认标签确实同时存在：

```powershell
git ls-remote git@gitee.com:nbshree/shree-macro-flow-tauri.git refs/tags/v1.8.0
git ls-remote git@github.com:nbshree/shree-macro-flow-tauri.git refs/tags/v1.8.0
```

如果 GitHub 缺少标签，检查本机 `remote.origin.pushurl`。不要删除已经推送到 Gitee 的标签；
修正 push URL 后只向 GitHub 补推相同标签即可。

### 工作流提示 `GITEE_TOKEN` 未配置或认证失败

用 `gh secret list` 检查 Secret 名称。认证失败时撤销旧 Gitee 令牌，生成新令牌并重新执行
`gh secret set GITEE_TOKEN`。

### Gitee 提示发行版已经存在

不要创建同名标签或重复正式发布。若自动任务在上传附件前中断，使用
`-RepairExisting -SkipBuild` 修复已有发行版。

### 中文提交说明乱码

发布脚本已强制 `git log` 使用 UTF-8。不要删除脚本中的 `$OutputEncoding`、
`[Console]::OutputEncoding` 或 Git `--encoding=UTF-8` 设置。

## 发版完成条件

只有同时满足以下条件，发版任务才算完成：

- 新版本提交已推送到 Gitee 和 GitHub。
- 注解标签已推送到两个仓库，且指向同一个提交。
- GitHub Actions 工作流成功。
- Gitee 发行版存在且附件可下载。
- 发行说明、文件名、版本号和 SHA-256 均正确。
- 工作区没有意外的未提交修改。
