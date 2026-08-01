# Time Grid 项目上下文

这个文件是项目的长期同步记录。以后每次修改 Time Grid 时，先读本文件了解当前状态；修改完成后，再把实际变化同步到这里，避免每次都重新介绍项目背景。

## 项目定位

Time Grid 是一个 Obsidian 插件，用于在右侧面板展示极简时间管理与可视化信息。核心主题是“向死而生”，通过日历、小时、分钟、活动热力图和今日计时分布帮助用户感知时间使用情况。

## 当前功能快照

- 插件入口：`src/main.ts`
- 主视图：`src/views/TimeGridView.ts`
- UI 组件：
  - `src/components/TimeHeatmap.ts`：近 3 个月、近 6 个月、近 1 年活动热力图
  - `src/components/MonthHeatmap.ts`：本月日期网格
  - `src/components/DayGrid.ts`：24 小时网格
  - `src/components/HourGrid.ts`：当前小时 60 分钟网格
  - `src/components/DailyPieChart.ts`：今日 `simple-time-tracker` 计时分布圆环图，含默认空状态、进行中状态和状态说明
- 数据工具：
  - `src/utils/dailyNotes.ts`：打开或创建日记
  - `src/utils/dailyNotesParser.ts`：读取日记日期与 `simple-time-tracker` 数据
  - `src/utils/writingStats.ts`：统计启用后全库 Markdown 新增字数
  - `src/utils/icons.ts`：图标工具
- 样式入口：`src/styles/main.css`
- 构建配置：`esbuild.config.mjs`
- 插件清单：`manifest.json`

## 当前实现约束

- 插件默认注册并打开 Obsidian 右侧面板。
- 主视图每秒更新一次时间相关组件。
- 活动热力图依赖日记和 `simple-time-tracker` 代码块计算计时时长。
- 今日计时分布会区分无日记、无计时块、格式错误、空记录和有效记录；没有计时时仍显示默认空圆环。
- `simple-time-tracker` 时长按当前日期边界裁剪，避免跨日计时污染单日统计。
- 新增字数统计从插件启用后建立基线，不回填历史新增字数。
- 目前没有独立测试框架；修改后至少运行 `npm run build` 做 TypeScript 与打包验证。
- 根目录 `main.js` 和 `styles.css` 是构建/发布产物，受 `.gitignore` 忽略；修改源码后需要重新构建，并用 `install.sh` 同步到实际 Obsidian vault 的 `.obsidian/plugins/time-grid/`。
- 安装到 Obsidian 后，需要关闭/开启 Time Grid 插件、执行 Reload app without saving，或重启 Obsidian 才能加载新的 JS/CSS。

## 当前进度

截至 2026-06-26，项目处于可构建、可安装到 Obsidian vault 使用的阶段。当前重点进度记录如下：

- 基础插件骨架已完成：插件清单、TypeScript 入口、esbuild 构建、安装脚本和右侧面板注册流程已具备。
- 核心时间可视化已完成：已包含近 3 个月、近 6 个月、近 1 年活动热力图、本月日期网格、24 小时网格和 60 分钟网格。
- 日记数据接入已完成：可以读取 Obsidian 日记，并解析 `simple-time-tracker` 代码块作为计时数据来源。
- 今日计时分布已完成新版本：圆环图、中心总时长、空状态、格式异常状态、进行中状态、任务配色、Top 5 + 其他合并和图例悬停联动已实现。
- 计时统计边界已修正：`simple-time-tracker` 时长会按当前日期边界裁剪，避免跨日记录影响单日统计。
- 写作增量统计已具备：插件启用后为全库 Markdown 建立字数基线，并按日期记录新增字数。
- 最新构建/安装状态：上一轮功能改动已通过 TypeScript 检查和生产打包，并同步到两个 Obsidian vault 的 `time-grid` 插件目录。
- 当前没有单独测试框架；现阶段以 `npm run build`、生产打包和 Obsidian 内手动检查作为主要验证方式。

## 修改等级

用下面的等级描述每次改动的范围，便于快速判断风险。

- L0 文档或注释：不改变运行时行为。
- L1 局部修补：只改一个小函数、样式细节或文案，行为影响有限。
- L2 功能增强：新增或调整一个可见功能、组件状态或用户交互。
- L3 跨模块改动：影响入口、数据流、持久化、多个组件或构建配置。
- L4 破坏性改动：改变数据格式、插件清单、安装方式或需要用户迁移。

## 每次修改后的同步规则

修改完成后，在本文件的“变更记录”中追加一条记录，包含：

- 日期
- 修改等级
- 变更摘要
- 涉及文件
- 验证方式
- 后续注意事项

如果改动改变了项目结构、核心约束、构建方式或功能快照，也要同步更新上面的对应章节。

## 常用命令

```bash
npm install
npm run build
npm run dev

# 如果当前 shell 没有 npm，可使用 Codex bundled Node 做等价验证/构建
/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc -noEmit -skipLibCheck
/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node esbuild.config.mjs production

# 同步到实际 Obsidian vault
bash install.sh "/Users/aaron/Library/CloudStorage/GoogleDrive-aaron0493846645@gmail.com/My Drive/Obsidin/Aaron_Ob"
bash install.sh "/Users/aaron/Documents/Obsidian Vault"
```

## 变更记录

### 2026-06-25

- 修改等级：L0 文档或注释
- 变更摘要：新增本项目上下文文件，用于后续修改前读取、修改后同步，减少重复介绍项目背景。
- 涉及文件：`PROJECT_CONTEXT.md`
- 验证方式：未运行构建；本次只新增文档，不影响运行时代码。
- 后续注意事项：之后每次修改项目后，都应更新本文件的变更记录；如项目结构或功能变化，也同步更新“当前功能快照”和“当前实现约束”。

### 2026-06-26

- 修改等级：L3 跨模块改动
- 变更摘要：按新 UI 模板重做「今日计时分布」为圆环图；新增中心总时长、默认空圆环、未记录图例、进行中秒级显示、任务名稳定配色、Top 5 + 其他合并、图例进度条与悬停联动。解析层新增 `simple-time-tracker` 缺失/格式错误/有效解析状态，并为聚合结果标记 `isRunning`；计时统计按日边界裁剪，时间热力图也复用该裁剪逻辑。
- 涉及文件：`src/components/DailyPieChart.ts`、`src/utils/dailyNotesParser.ts`、`src/components/TimeHeatmap.ts`、`src/styles/main.css`、`styles.css`、`main.js`
- 验证方式：运行 TypeScript 检查、生产打包与空白检查；将构建产物同步到 `Aaron_Ob` 和 `Documents/Obsidian Vault` 两个 Obsidian vault 的 `time-grid` 插件目录，并确认安装目录中存在 `tg-pie-ring` / `tg-pie-center` 新 UI 标记。
- 后续注意事项：Obsidian 看不到变化时，优先确认实际 vault 插件目录是否已经复制最新 `main.js` 和 `styles.css`，然后重载或重启 Obsidian。根目录构建产物被 `.gitignore` 忽略，不会进入 Git 提交。

### 2026-06-26（进度同步）

- 修改等级：L0 文档或注释
- 变更摘要：新增“当前进度”章节，只记录已经完成和已经验证的项目状态，不加入未来规划或路线图。
- 涉及文件：`PROJECT_CONTEXT.md`
- 验证方式：未运行构建；本次只修改项目上下文文档，不影响运行时代码。
- 后续注意事项：后续每次完成代码或安装验证后，优先更新“当前进度”和“变更记录”，保持该文件代表最新项目状态。
