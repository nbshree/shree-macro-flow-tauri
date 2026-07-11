# Repository Guidelines

## 项目结构

本仓库是基于 Tauri 2、React、TypeScript 和 Rust 的 Windows 桌面应用。

- `src/`：React 渲染层、样式、类型和 Tauri API 适配层。
- `src-tauri/src/`：Rust 后端、宏状态机、存储、热键、托盘和 Win32 输入实现。
- `src-tauri/capabilities/`：Tauri 前端权限配置。
- `src-tauri/icons/`：应用和安装包图标。
- `src-tauri/tauri.conf.json`：窗口与 Windows 安装包配置。
- `src-tauri/app.manifest`：Windows DPI 感知及执行权限清单。

不要提交 `node_modules/`、`dist/`、`src-tauri/target/` 或其他生成目录。

## 开发与验证命令

- `pnpm install`：安装前端和 Tauri CLI 依赖。
- `pnpm dev`：仅启动 Vite 前端。
- `pnpm tauri:dev`：启动完整桌面应用。
- `pnpm typecheck`：检查 TypeScript。
- `pnpm build`：构建前端生产资源。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：检查 Rust 格式。
- `cargo check --manifest-path src-tauri/Cargo.toml`：检查 Rust 编译。
- `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`：运行 Rust 静态检查。
- `pnpm tauri:build`：生成 Windows NSIS 安装包。

## 编码规范

TypeScript 和 React 使用 2 空格、单引号、无分号、每行不超过 100 字符。组件使用 PascalCase，函数、变量和 hooks 使用 camelCase。Rust 必须通过 `cargo fmt`，模块和函数使用 snake_case，类型使用 PascalCase。

保持职责边界清晰：界面只通过 `src/lib/macro-api.ts` 调用后端；系统级能力、磁盘写入、热键和输入注入必须留在 Rust 端。新增或修改命令时，同步更新 TypeScript 类型与 Rust 参数/返回类型。

## 功能验证

当前没有自动化 UI 测试。提交前至少验证 TypeScript 构建、Rust `fmt/check/clippy` 和 Tauri 安装包构建。涉及宏执行时还应手工覆盖：

- 100%、125%、150% 缩放以及混合 DPI 多显示器
- 左侧或上方副屏产生的负坐标
- 托盘隐藏后全局热键、开始、停止和紧急停止
- 鼠标点击、普通按键、功能键与组合键
- 方案持久化、旧数据迁移、导入和导出

## 安全提示

不要向前端开放通用文件系统、Shell 或任意命令执行权限。Win32 输入只接受经过清洗的坐标和支持的虚拟键。应用默认使用普通用户权限，不应通过默认管理员权限绕过 Windows UIPI。
