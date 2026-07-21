# Shree Macro Flow

基于 Tauri 2、React、TypeScript 和 Rust 开发的 Windows 桌面工具，集自动化宏流程与
《逆水寒》手游新世界内功评估于一体。

[![Latest Release](https://img.shields.io/github/v/release/nbshree/shree-macro-flow-tauri?label=release)](https://github.com/nbshree/shree-macro-flow-tauri/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d4)](https://github.com/nbshree/shree-macro-flow-tauri/releases/latest)

## 下载

前往 [Releases](https://github.com/nbshree/shree-macro-flow-tauri/releases/latest) 下载最新的
`自动点击流程台_x.x.x_x64-setup.exe` 并安装。

当前版本：`v1.5.1`

## 功能

### 宏流程

- 采集屏幕物理坐标并执行鼠标左键单击或双击
- 执行普通键、功能键以及 `Ctrl` / `Alt` / `Shift` 组合键
- 流程步骤可单独启用或禁用，禁用步骤不会执行动作或等待
- 全局采集、开始、停止和紧急停止热键
- 倒计时、有限或无限循环、步骤等待和轮次等待
- 多方案管理、JSON 导入导出和本地持久化
- 系统托盘、关闭到托盘和单实例运行
- Per-Monitor V2 DPI 感知和多显示器负坐标

### 新世界内功评估

- 录入赛年、力量/气海、攻击、破防、流派克制、会心等 11 项基础属性
- 配置 15 个内功的携带与“灵”状态
- 实时计算词条分、特性分、综合评分、贡献排行和联动说明
- 展示评分档位、当前档位和距离下一档所需分数
- 支持复制游戏内功面板截图后，在评估页按 `Ctrl+V` 调用 AI 自动识别
- AI 识别自动回填可见属性和已携带内功；“灵”状态需手动确认

### 拆塔内功评估

- 根据 4.1.1.3 进攻团拆塔内功表，比较两套内功的抗拆与空拆评分
- 配置职业、战斗时长、士气、输出/坦度权重及金、火、木、土周天
- 对比动态内功、灵韵、输出词条、坦度词条和总评分，并展示原表评级
- 提供独立的武蕴灵窍场景收益参考；该区域不并入内功总分
- 首次打开载入原表样例，支持恢复样例或清空两套后手动录入

### 界面与主题

- 宏流程、防守内功评估和拆塔评估三个工作区切换
- 默认、龙吟、潮光、血河、九灵、素问和神相主题
- 主题外观、职业立绘和界面偏好本地保存

## 内功评分规则来源

本项目内功评估功能根据以下原表格及规则整理实现：

> **7.20 日新世界防守团内功计算器**<br>
> 由月望舒（逆水寒手游）制作<br>
> 感谢杰少、满天星河、智齿提供帮助<br>
> 计算公式来源于折字愿为安<br>
> **无偿分享**

感谢以上作者和参与者提供原始计算规则与帮助。应用将表格中的基础属性换算系数、内功携带
与“灵”加分、内功联动及评分档位转换为程序内置规则。当前规则版本为
`new-world-defense-7.20`，依据 `防守内功计算器.xlsx` 的核心业务区 `B2:I31` 核对。

为兼容现有界面和截图识别协议，应用继续显示“承影锋烁”和“贯山月（卡轴）”；来源表格中的
对应名称分别为“承影锋镝”和“贯山月”，仅名称存在兼容差异，计分值按 7.20 规则执行。

原表格仅用于规则核对和回归验证，应用运行时不会读取，也不会打包或分发该 Excel 文件。AI
图片识别只负责提取截图中的属性和已携带内功，不参与制定评分公式，也不会改变计算权重。

该评分体系属于非官方配装参考，并不代表游戏官方战力结论。游戏版本、赛年数值或内功机制
调整后，现有系数可能需要同步更新，请结合实战表现判断。

拆塔规则来源：

> **4.1.1.3 进攻团拆塔内功计算器（仅做参考）**<br>
> 表格作者：满天丶星河<br>
> 公式套用：折字为安<br>
> 表格优化：休寒

拆塔评估使用独立的 `4.1.1.3 Excel 兼容`规则。为保证与来源文件的当前结果一致，原表中
已存在的跨套引用、异常周天公式和外链缓存值也作为该规则版本的一部分保留。详细口径见
[`docs/tower-demolition-calculator-rules.md`](docs/tower-demolition-calculator-rules.md)。

## 内功截图识别

1. 在“防守内功”工作区点击“AI 配置”，配置并验证神秘代码。
2. 在游戏中打开完整内功面板，确保属性词条和已携带内功图标清晰可见。
3. 复制截图，返回应用后按 `Ctrl+V`。
4. 检查自动回填结果，并手动设置“灵”状态。

建议使用完整、无遮挡的内功面板截图。图片仅通过后端识别命令处理，前端不开放通用文件系统、
Shell 或任意命令执行权限。

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

完整发布前建议执行：

```powershell
pnpm typecheck
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
pnpm tauri:build
```

## 用户数据

新版本将方案保存到 Tauri 应用数据目录下的 `macro-profiles.json`。首次启动时，如果发现旧 Electron 版本的数据：

```text
%APPDATA%\macro-flow\macro-profiles.json
```

会自动读取并迁移到新目录，旧文件不会被删除。

## Windows 权限说明

应用按普通用户权限运行。受 Windows UIPI 安全机制限制，普通权限进程不能向“以管理员身份运行”的目标窗口注入鼠标或键盘输入；需要操作此类窗口时，应以同等权限启动本应用。
