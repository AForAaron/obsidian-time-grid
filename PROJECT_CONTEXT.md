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
  - `src/components/TaskPanel.ts`：全库任务索引、六分区列表、四态管理、编辑入口、折叠状态与源文件跳转
  - `src/components/TaskEditModal.ts`：描述、到期日、优先级和长期标签编辑弹窗，含只读诊断与可复制错误
  - `src/components/TaskDeleteConfirmModal.ts`：任务删除二次确认、目标原文预览与失败保留
- 数据工具：
  - `src/utils/dailyNotes.ts`：打开或创建日记
  - `src/utils/dailyNotesParser.ts`：读取日记日期与 `simple-time-tracker` 数据
  - `src/utils/writingStats.ts`：统计启用后全库 Markdown 新增字数
  - `src/utils/icons.ts`：图标工具
  - `src/utils/taskParser.ts`：Tasks emoji 语法解析、状态语义、分区与排序纯函数
  - `src/utils/taskIndex.ts`：基于 metadataCache 的全量与增量任务索引
  - `src/utils/taskWriter.ts`：基于 `Vault.process()` 的任务严格定位、状态序列化与原子写回
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
- 任务模块使用 `metadataCache.listItems` 定位任务，扫描期间异步分批；所有任务写入只经过 `TaskWriter` 和 `Vault.process()`。
- 任务按逾期、今天、待分类、长期、未来、已完成六区全量归类；异常、未知状态和循环任务仍显示并标注只读。
- 写入前要求目标原文在文件中全局唯一；找不到、重复、循环、异常和未知状态任务拒绝写入并重新索引。
- 任务状态固定为待办、进行中、完成、取消；可选记录完成或取消的终态日期，重新打开时移除终态日期。
- 使用现有 Node、TypeScript 和 esbuild 测试脚本；修改后至少运行 `npm test` 与 `npm run build`。
- 根目录 `main.js` 和 `styles.css` 是构建/发布产物，受 `.gitignore` 忽略；修改源码后需要重新构建，并用 `install.sh` 同步到实际 Obsidian vault 的 `.obsidian/plugins/time-grid/`。
- 安装到 Obsidian 后，需要关闭/开启 Time Grid 插件、执行 Reload app without saving，或重启 Obsidian 才能加载新的 JS/CSS。

## 当前进度

截至 2026-08-01，项目处于可构建、可安装到 Obsidian vault 使用的阶段。当前重点进度记录如下：

- 基础插件骨架已完成：插件清单、TypeScript 入口、esbuild 构建、安装脚本和右侧面板注册流程已具备。
- 核心时间可视化已完成：已包含近 3 个月、近 6 个月、近 1 年活动热力图、本月日期网格、24 小时网格和 60 分钟网格。
- 日记数据接入已完成：可以读取 Obsidian 日记，并解析 `simple-time-tracker` 代码块作为计时数据来源。
- 今日计时分布已完成新版本：圆环图、中心总时长、空状态、格式异常状态、进行中状态、任务配色、Top 5 + 其他合并和图例悬停联动已实现。
- 计时统计边界已修正：`simple-time-tracker` 时长会按当前日期边界裁剪，避免跨日记录影响单日统计。
- 写作增量统计已具备：插件启用后为全库 Markdown 建立字数基线，并按日期记录新增字数。
- 最新构建/安装状态：任务模块 Phase 1–4 已通过 28 项自动测试、生产打包和临时 Git vault 写入验收；构建产物已同步到两个真实 vault，安装文件哈希与仓库产物一致。
- 任务模块 Phase 1 已完成：真实 Aaron_Ob vault 索引 625 条任务，面板显示活跃 453、逾期 18、今天 2、待分类 433。
- 任务模块 Phase 2 已完成：四态菜单、完成/重新打开快捷按钮、终态日期、严格唯一定位、失败重扫和写作统计抑制已接入；异常、未知状态、循环和重复任务保持只读或拒写。
- 任务模块 Phase 3 已完成：支持编辑描述、到期日、优先级和长期标签；失败时弹窗保持打开并提供可复制错误；只读任务只显示诊断和源文件入口。
- 任务模块 Phase 4 已完成：支持删除二次确认、顺延一天、Shift 顺延一周，以及待分类“设为今天/设为长期”；无到期日不显示顺延。
- 已加入基于现有 esbuild/Node 的 `npm test`，当前覆盖 28 个任务解析、状态转换、分区、排序、路径排除、字段级安全写回、日期顺延、删除和统计抑制用例。

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

### 2026-08-01（任务模块 Phase 1）

- 修改等级：L2 功能增强
- 变更摘要：新增全库任务只读索引和六分区面板；支持 Tasks emoji 字段、四态解析、异常只读、折叠持久化、手动重扫、源文件跳转、渲染上限及任务设置。
- 涉及文件：`src/types/task.ts`、`src/utils/taskParser.ts`、`src/utils/taskIndex.ts`、`src/components/TaskPanel.ts`、`src/main.ts`、`src/views/TimeGridView.ts`、`src/utils/writingStats.ts`、`src/styles/main.css`、`tests/taskCore.test.ts`
- 验证方式：`npm test` 9 项通过；`npm run build` 通过；同步至两个真实 vault，并在 Aaron_Ob 的 Obsidian 1.12.7 中确认面板索引 625 条、分区和 50 条渲染限制正常。
- 后续注意事项：Phase 1 为零写操作；Phase 2 才接入 `Vault.process()`、四态管理、严格重复拒写和终态日期。

### 2026-08-01（任务模块 Phase 2）

- 修改等级：L3 跨模块改动
- 变更摘要：新增唯一原文定位和 `Vault.process()` 原子写回；加入待办、进行中、完成、取消四态菜单、完成/重新打开快捷按钮和可选终态日期；失败时 Notice 提示并重新索引；任务管理产生的字符差异从今日新增字数中扣除。
- 涉及文件：`manifest.json`、`src/utils/taskWriter.ts`、`src/components/TaskPanel.ts`、`src/utils/writingStats.ts`、`src/main.ts`、`src/views/TimeGridView.ts`、`src/styles/main.css`、`tests/obsidianStub.ts`、`tests/taskCore.test.ts`、`scripts/run-task-tests.mjs`
- 验证方式：`npm test` 21 项通过；`npm run build` 通过；在专用临时 Git vault 中通过 Obsidian 1.12.7 完成 17 次真实状态写入，确认无空白差异、终态日期正确、历史缺空格任务在合法编辑后规范化。
- 后续注意事项：临时 vault 的 20 次综合写入及编辑器并发验收将在 Phase 3–4 补足；真实 vault 继续只做非破坏性检查。

### 2026-08-01（任务模块 Phase 3）

- 修改等级：L3 跨模块改动
- 变更摘要：新增任务编辑弹窗，支持描述、到期日快捷选择/清除、优先级和长期标签；字段级序列化只修改目标字段并保留未知元数据；只读任务显示诊断，保存失败保持弹窗并显示可复制错误。
- 涉及文件：`src/components/TaskEditModal.ts`、`src/components/TaskPanel.ts`、`src/utils/taskWriter.ts`、`src/views/TimeGridView.ts`、`src/styles/main.css`、`tests/taskCore.test.ts`
- 验证方式：`npm test` 25 项通过；`npm run build` 通过；专用临时 Git vault 累计完成 20 次真实写入，并验证四字段联合编辑、快捷日期不提交表单、重复原文拒写后弹窗保持打开且文件无变化。
- 后续注意事项：Phase 4 继续复用同一 writer 定位路径；删除仅移除目标行，顺延只对有到期日任务显示，最终补做编辑器并发测试。

### 2026-08-01（任务模块 Phase 4）

- 修改等级：L3 跨模块改动
- 变更摘要：新增删除二次确认、顺延一天/Shift 一周、待分类设为今天/长期和行级操作按钮；所有操作继续通过 `TaskWriter` 严格定位，删除只移除目标行。
- 涉及文件：`src/components/TaskDeleteConfirmModal.ts`、`src/components/TaskEditModal.ts`、`src/components/TaskPanel.ts`、`src/utils/taskWriter.ts`、`src/views/TimeGridView.ts`、`src/styles/main.css`、`tests/taskCore.test.ts`
- 验证方式：`npm test` 28 项通过；`npm run build` 通过；专用临时 Git vault 验证顺延、二次确认删除、快速分类、相邻行保留，以及编辑器修改 Whiskey 与 Time Grid 顺延 Tango 的同文件并发写入，两份改动均保留。
- 后续注意事项：最终仅向两个真实 vault 安装构建产物并做非破坏性冒烟检查；不得在真实 vault 触发任何任务写入。

### 2026-08-01（任务模块最终验收）

- 修改等级：L0 文档或注释
- 变更摘要：完成 Phase 1–4 总验收，核对正式规格副本一致性、最低 Obsidian 版本、阶段提交链、双 vault 安装哈希和真实界面加载结果。
- 涉及文件：`PROJECT_CONTEXT.md`
- 验证方式：`npm test` 28 项通过；`npm run build`、`git diff --check` 通过；正式规格两份 SHA-256 一致；Aaron_Ob 加载 627 条任务（活跃 454），第二真实 vault 加载 0 条并显示正确空状态；两处均未触发任务写入。
- 后续注意事项：分支 `codex/task-integration` 推送后由用户审阅并合并到 `main`；本轮不包含面板内新建任务与循环任务修改。
