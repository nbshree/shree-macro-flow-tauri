# Shree Macro Flow

`Shree Macro Flow` 是一个基于 Tauri 2、React、TypeScript 和 Rust 的 Windows 桌面宏工具，支持：

- 采集屏幕物理坐标并执行鼠标左键点击
- 执行普通键、功能键以及 `Ctrl` / `Alt` / `Shift` 组合键
- 全局采集、开始、停止和紧急停止热键
- 倒计时、有限或无限循环、步骤等待和轮次等待
- 多方案管理、JSON 导入导出和本地持久化
- 系统托盘、关闭到托盘和单实例运行
- Per-Monitor V2 DPI 感知和多显示器负坐标

## 技术栈

- Tauri 2
- React 19 + TypeScript + Vite
- Tailwind CSS 4
- Rust + Win32 `SendInput`

## 环境要求

- Node.js 20 或更高版本
- pnpm 10
- Rust stable（MSVC target）
- Visual Studio 2022 Build Tools
  - Desktop development with C++
  - Windows 10/11 SDK
- Microsoft Edge WebView2 Runtime

## 开发命令

```powershell
pnpm install
pnpm typecheck
pnpm build
pnpm tauri:dev
```

Rust 单独检查：

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

## Windows 打包

```powershell
pnpm tauri:build
```

NSIS 安装包输出在：

```text
src-tauri/target/release/bundle/nsis/
```

## 用户数据

新版本将方案保存到 Tauri 应用数据目录下的 `macro-profiles.json`。首次启动时，如果发现旧 Electron 版本的数据：

```text
%APPDATA%\macro-flow\macro-profiles.json
```

会自动读取并迁移到新目录，旧文件不会被删除。

## Windows 权限说明

应用按普通用户权限运行。受 Windows UIPI 安全机制限制，普通权限进程不能向“以管理员身份运行”的目标窗口注入鼠标或键盘输入；需要操作此类窗口时，应以同等权限启动本应用。
