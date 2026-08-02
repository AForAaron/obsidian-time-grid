# Time Grid 项目上下文

这个文件是项目的长期同步记录。以后每次修改 Time Grid 时，先读本文件了解当前状态；修改完成后，再把实际变化同步到这里，避免每次都重新介绍项目背景。

## 项目定位

Time Grid 是一个 Obsidian 插件，用于在右侧面板展示极简时间管理与可视化信息。核心主题是“向死而生”，通过日历、小时、分钟、活动热力图和今日计时分布帮助用户感知时间使用情况。

## 当前功能快照

- 插件入口：`src/main.ts`
- 主视图：`src/views/TimeGridView.ts`
- UI 组件：
  - `src/components/SundialTimeView.ts`：方案三“此刻回环”生产时间视图，组合长期轨迹、本月位置、日晷、内置计时器、快捷建议与今日去向，并呈现冲突、异常、写入失败和跨日恢复状态
  - `src/components/TimeHeatmap.ts`：近 3 个月、近 6 个月、近 1 年活动热力图
  - `src/components/MonthHeatmap.ts`：本月日期网格
  - `src/components/DayGrid.ts`：24 小时网格
  - `src/components/HourGrid.ts`：当前小时 60 分钟网格
  - `src/components/DailyPieChart.ts`：今日 `simple-time-tracker` 计时分布圆环图，含默认空状态、进行中状态和状态说明
  - `src/components/TaskPanel.ts`：独立任务中心、统计卡片、即时搜索、统一筛选浮层、六分区卡片、自定义四态/更多菜单、悬停预览、触屏展开与源文件跳转
  - `src/components/TaskEditModal.ts`：描述、到期日、优先级和长期标签编辑弹窗，含只读诊断与可复制错误
  - `src/components/TaskDeleteConfirmModal.ts`：任务删除二次确认、目标原文预览与失败保留
  - `src/components/RoutineManagerModal.ts`：多个每日流程组合与项目的创建、排序、启停和计划管理
  - `src/components/RoutineItemEditModal.ts`：星期、日期区间、提醒、优先级及“同时应用到今天”编辑
  - `src/components/RoutineMigrationModal.ts`：旧日记模板的一次确认式迁移预览
- 数据工具：
  - `src/utils/dailyNotes.ts`：打开或创建日记
  - `src/utils/dailyNotesParser.ts`：读取日记日期与 `simple-time-tracker` 数据
  - `src/utils/timerFormat.ts`：计时名称、时间、代码块与建议显示的纯函数
  - `src/utils/timerRepository.ts`：`simple-time-tracker` 唯一块定位、原子写回、冲突检测、跨日拆分和快捷建议数据访问
  - `src/utils/timerController.ts`：空闲、运行、冲突、异常、恢复与写入失败状态编排
  - `src/utils/writingStats.ts`：统计启用后全库 Markdown 新增字数
  - `src/utils/icons.ts`：图标工具
  - `src/utils/taskParser.ts`：Tasks emoji 语法解析、状态语义、分区与排序纯函数
  - `src/utils/taskIndex.ts`：基于 metadataCache 的全量与增量任务索引
  - `src/utils/taskWriter.ts`：基于 `Vault.process()` 的任务严格定位、状态序列化与原子写回
  - `src/utils/taskView.ts`：任务搜索、状态/优先级/来源组合筛选、分区计数与未来时间分组纯函数
  - `src/utils/taskUi.ts`：任务浮层碰撞定位、菜单操作可用性与每日流程展示进度纯函数
  - `src/utils/routineRepository.ts`：配置笔记、模板迁移、实例生成及旧格式稳定 ID 领养
  - `src/utils/routineIndex.ts`：今天组合、昨日漏做、日记存在状态与诊断快照
  - `src/utils/routineWriter.ts`：流程定义、组合、项目及今天实例的唯一写入入口
  - `src/utils/routineReminder.ts`：仅应用运行期间生效的一次性本地提醒调度
- 样式入口：`src/styles/main.css`
- 构建配置：`esbuild.config.mjs`
- 插件清单：`manifest.json`

## 当前实现约束

- 插件默认注册并打开 Obsidian 右侧面板。
- 主视图提供“时间 / 任务”双视图，首次默认时间视图并持久化最后选择；任务视图打开时暂停时间组件的每秒刷新，但任务索引与午夜重新分区继续工作。
- 时间视图采用 Claude Design 方案三“此刻回环 · 日晷仪表”的生产布局；长期轨迹支持 3 个月、6 个月、1 年切换并记忆选择，默认 6 个月。
- Time Grid 可以直接开始、停止和原子切换计时，但日记中的 `simple-time-tracker` JSON 仍是唯一数据真相源；插件数据只保存兼容的计时恢复指针。
- 任一时刻只允许一个运行活动；多个运行项、多个计时块、异常 JSON 或异常插入标记一律进入诊断状态并拒绝自动写入。计时切换使用同一时间戳结束旧段并开始新段。
- 无今日日记时仅在日记核心插件可用时按其配置与模板创建；无计时块时优先使用 `time-grid-timer-slot` 成对标记，否则在文末追加“时间记录”。所有修改经 `Vault.process()` 重新读取并只替换目标 JSON。
- 运行计时在本地午夜拆分；关闭期间跨日不超过 24 小时自动补齐，超过 24 小时必须先选择补齐并继续、首个午夜结束或暂不处理。恢复决策前禁止开始新计时。
- 快捷建议合并最近 7 天活动、今日/逾期任务和今日流程并去重；建议只贡献活动名称，计时操作不改变任务或每日流程状态。
- 计时器写回造成的 Markdown 字符差异会从“新增字数”中扣除；真实 vault 计时写入必须由用户明确授权后再测试。
- 活动热力图依赖日记和 `simple-time-tracker` 代码块计算计时时长。
- 今日计时分布会区分无日记、无计时块、格式错误、空记录和有效记录；没有计时时仍显示默认空圆环。
- `simple-time-tracker` 时长按当前日期边界裁剪，避免跨日计时污染单日统计。
- 新增字数统计从插件启用后建立基线，不回填历史新增字数。
- 任务模块使用 `metadataCache.listItems` 定位任务，扫描期间异步分批；所有任务写入只经过 `TaskWriter` 和 `Vault.process()`。
- 任务中心按逾期、今天、待分类、长期、未来、已结束六区展示；未来细分明天、7 天内和更晚，完成与取消合并为已结束并保留状态区分；异常、未知状态和循环任务仍显示并标注只读。
- 任务搜索覆盖描述、标签和文件路径；状态、优先级、来源类别之间使用 AND，同类选项使用 OR。搜索、筛选和触屏展开仅保留在当前会话。
- 任务菜单、筛选和完整预览统一使用 `document.body` portal 层，并在外部点击、滚动、Esc、窗口失焦时关闭；菜单行为继续调用既有任务操作接口。
- “每日流程”使用专用 Markdown 配置笔记保存多个组合和未来计划，每篇日记保存当天真实 checklist 实例；不使用 Tasks `🔁` 语法，也不建立数据库。
- 历史新旧格式流程实例均从普通任务索引排除；昨天未完成项目只作为只读提醒，不进入逾期，今天仅在日记创建后生成全新实例。
- 配置与今天实例分开编辑；修改未来默认不改今天，可显式选择同时应用。跳过今天写取消状态并保留日记原文，既有日记不会因定义删除或停用而追溯改变。
- 旧模板迁移必须先显示预览并由用户确认，随后备份模板、创建配置笔记并替换生成槽位；真实 vault 的验证不得自动点击确认迁移。
- 写入前要求目标原文在文件中全局唯一；找不到、重复、循环、异常和未知状态任务拒绝写入并重新索引。
- 任务状态固定为待办、进行中、完成、取消；可选记录完成或取消的终态日期，重新打开时移除终态日期。
- 使用现有 Node、TypeScript 和 esbuild 测试脚本；修改后至少运行 `npm test` 与 `npm run build`。
- 根目录 `main.js` 和 `styles.css` 是构建/发布产物，受 `.gitignore` 忽略；生产构建会把 `src/styles/main.css` 同步为根目录 `styles.css`，之后用 `install.sh` 安装到实际 Obsidian vault 的 `.obsidian/plugins/time-grid/`。
- 安装到 Obsidian 后，需要关闭/开启 Time Grid 插件、执行 Reload app without saving，或重启 Obsidian 才能加载新的 JS/CSS。

## 当前进度

截至 2026-08-02，项目处于可构建、可安装到 Obsidian vault 使用的阶段。当前重点进度记录如下：

- 基础插件骨架已完成：插件清单、TypeScript 入口、esbuild 构建、安装脚本和右侧面板注册流程已具备。
- 核心时间可视化已完成日晷重组：包含可切换的近 3 个月、近 6 个月、近 1 年长期轨迹、本月位置、外圈今日进度、内圈当前小时、内置计时控制和今日去向。
- 日记数据接入已完成：可以读取 Obsidian 日记，并解析 `simple-time-tracker` 代码块作为计时数据来源。
- 今日计时分布已完成新版本：圆环图、中心总时长、空状态、格式异常状态、进行中状态、任务配色、Top 5 + 其他合并和图例悬停联动已实现。
- 计时统计边界已修正：`simple-time-tracker` 时长会按当前日期边界裁剪，避免跨日记录影响单日统计。
- 写作增量统计已具备：插件启用后为全库 Markdown 建立字数基线，并按日期记录新增字数。
- 最新构建/安装状态：日晷时间视图与内置计时器保持 Task 面板及任务写入规则不变；64 项核心自动测试、每日流程临时 Git vault 24 次写入、计时器临时 Git vault 9 次写入、生产打包均已通过；最终构建（`main.js` SHA-256 `235cc043…`）已同步到 Aaron_Ob 与 Documents Obsidian Vault。工作区改动尚未提交。
- 任务模块 Phase 1 已完成：真实 Aaron_Ob vault 索引 625 条任务，面板显示活跃 453、逾期 18、今天 2、待分类 433。
- 任务模块 Phase 2 已完成：四态菜单、完成/重新打开快捷按钮、终态日期、严格唯一定位、失败重扫和写作统计抑制已接入；异常、未知状态、循环和重复任务保持只读或拒写。
- 任务模块 Phase 3 已完成：支持编辑描述、到期日、优先级和长期标签；失败时弹窗保持打开并提供可复制错误；只读任务只显示诊断和源文件入口。
- 任务模块 Phase 4 已完成：支持删除二次确认、顺延一天、Shift 顺延一周，以及待分类“设为今天/设为长期”；无到期日不显示顺延。
- 任务中心 UI 重设计已完成：顶部双视图切换、最后视图持久化、四统计卡、即时搜索、状态/优先级/来源组合筛选、过滤计数、未来三组、已结束合并、桌面完整浮层、触屏行内展开，以及统一 portal 状态菜单、更多菜单和筛选浮层均已接入。
- 响应式样式使用任务视图容器查询，覆盖 `≤320px`、`321–520px`、`>520px`；极窄侧栏固定 2×2 统计与收口筛选，不再常驻编辑、顺延、删除按钮，深色与浅色均使用 Obsidian 主题变量和 `color-mix`。
- 已加入基于现有 esbuild/Node 的 `npm test`，当前覆盖 52 个核心用例及独立临时 Git vault 集成验证；包含配置格式、稳定 ID、日期计划、模板迁移、幂等生成、历史排除、今天编辑、取消语义、提醒判断、重复/错日期只读、CRLF/BOM、并发旧版本拒写、任务卡视觉契约和无行动描述任务过滤。

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

### 2026-08-01（任务中心 UI 重设计）

- 修改等级：L3 跨模块改动
- 变更摘要：将任务面板改为独立“任务”视图并保留“时间”视图；新增最后视图持久化、四统计卡、即时搜索、状态/优先级/来源组合筛选、匹配计数、未来三组、已结束合并、柔和任务卡、四态菜单、更多操作菜单、桌面延迟浮层与触屏行内展开。基于任务容器实现 280/420/720 设计规则和深浅主题；生产构建现在自动同步最新 CSS，避免安装旧样式。
- 涉及文件：`esbuild.config.mjs`、`src/components/TaskPanel.ts`、`src/main.ts`、`src/styles/main.css`、`src/types/task.ts`、`src/utils/taskView.ts`、`src/utils/writingStats.ts`、`src/views/TimeGridView.ts`、`tests/taskCore.test.ts`
- 验证方式：`npm test` 33 项通过；`npm run build`、`git diff --check` 通过；临时 vault 在 Obsidian 1.12.7 中验证深色、浅色、只读任务和极窄侧栏；Aaron_Ob 以 628 条实时任务完成模式记忆、2×2 统计、搜索 `1 / 18` 分区计数和无写回冒烟。
- 后续注意事项：本轮没有修改 `TaskWriter`、Markdown 定位或原子写回规则，也没有加入新建任务、批量操作或循环任务编辑；最终分支需由用户审阅并合并到 `main`。

### 2026-08-01（全界面设计系统落地）

- 修改等级：L3 跨模块改动
- 变更摘要：将 `Time Grid Design System/` 纳入视觉真相源并修复交互原型；在生产 CSS 建立 Obsidian 主题 token 桥接，统一双视图、时间模块、任务中心和任务弹窗；以共享 portal 生命周期替换状态、更多操作和筛选原生浮层；新增每日流程可选展示模型，但不接入生产数据。
- 涉及文件：`.gitignore`、`Time Grid Design System/`、`src/components/TaskPanel.ts`、`src/components/TaskEditModal.ts`、`src/components/TaskDeleteConfirmModal.ts`、`src/styles/main.css`、`src/types/task.ts`、`src/utils/taskUi.ts`、`tests/taskCore.test.ts`
- 验证方式：`npm test` 38 项通过；`npm run build`、`git diff --check` 通过；设计原型完成 280/420/720px、深浅主题和桌面/触屏状态检查；Aaron_Ob 以 628 条实时任务验证 2×2 统计、单一筛选入口、筛选 portal、更多菜单和 Esc 关闭，全程未触发任务写回。
- 后续注意事项：`TaskWriter`、Markdown 定位和 `Vault.process()` 未改变；每日流程实际识别、历史排除、统计和写回留待下一阶段；最终分支由用户审阅后合并到 `main`。

### 2026-08-02（每日流程完整集成）

- 修改等级：L4 数据格式与迁移
- 变更摘要：新增独立的每日流程定义与日记实例系统，支持多个组合、星期和生效区间、提醒、优先级、排序、启停、编辑今天/修改未来、仅今天项目加入未来和跳过今天；今天日记与组合卡双向同步，完成与跳过同时保留在组合卡和已结束区。旧模板通过预览、备份、配置笔记和生成槽位完成一次确认式迁移，历史流程从普通任务索引排除，昨天漏做只读提醒且不算逾期。
- 涉及文件：`src/types/routine.ts`、`src/utils/routineFormat.ts`、`src/utils/routineMarker.ts`、`src/utils/routineRepository.ts`、`src/utils/routineIndex.ts`、`src/utils/routineWriter.ts`、`src/utils/routineReminder.ts`、`src/components/Routine*.ts`、`src/components/TaskPanel.ts`、`src/main.ts`、`src/views/TimeGridView.ts`、`src/styles/main.css`、`tests/taskCore.test.ts`、`tests/routineVault.integration.ts`
- 验证方式：`npm test` 49 项核心用例通过，临时 Git vault 完成 24 次真实文件写入并拒绝并发旧版本写回；`npm run build` 与 `git diff --check` 通过。Aaron_Ob 只读加载后普通任务由 628 降至 339，正确显示昨日漏做 5 项和“创建今日日记后启用每日流程”；迁移预览准确识别 `00-Templates/Daily.md.md` 的 5 项，随后取消，配置笔记、备份和模板均未改变。
- 后续注意事项：真实 vault 尚未执行迁移；用户应在 Time Grid 中审阅并点击“确认迁移”。分支 `codex/routine-integration` 只推送、不自动合并 `main`。

### 2026-08-02（Claude 任务卡精确校准）

- 修改等级：L1 展示层校准
- 变更摘要：将状态菜单按钮拆分为透明交互层与独立视觉标签，状态标签统一为 `38×18px` 左右的透明背景、1px 细边框药丸；同步校准任务卡内边距、3px 分区色线、13px 双行标题、18px checkbox 视觉和 26px 更多按钮。触屏仍保留至少 36px 交互热区，第三方主题无法再把状态标签覆盖为圆形默认按钮。
- 涉及文件：`src/components/TaskPanel.ts`、`src/styles/main.css`、`tests/taskCore.test.ts`
- 验证方式：`npm test` 51 项核心用例和临时 Git vault 24 次写入通过；`npm run build`、设计系统 bundle 语法检查与 `git diff --check` 通过。Aaron_Ob 中重新加载插件后确认新版 DOM 为 54 个 `.tg-task-status-control` 与 54 个内部标签，首个可见标签计算尺寸为 `38×18px`，背景透明、无阴影、边框 1px；四态菜单可打开并用 Esc 关闭，全程未执行任务写入。
- 后续注意事项：仅复制新构建文件不足以刷新已打开的插件实例；需要关闭/开启 Time Grid 插件或重启 Obsidian。旧安装产物的临时回滚备份位于 `/private/tmp/time-grid-ui-backup.wyBEyk`。

### 2026-08-02（空 checkbox 与纯日期占位过滤）

- 修改等级：L1 索引过滤修补
- 变更摘要：普通任务索引现在要求 checkbox 具有可执行的行动描述；纯空白、只含 Tasks 元数据以及描述严格等于 `YYYY-MM-DD` 的 checkbox 不再进入 Time Grid。日期后仍有行动文字（例如 `2026-02-25 复盘`）继续作为正常任务。过滤只影响 Time Grid 展示与统计，不删除或改写任何 Markdown；以后为占位 checkbox 补上描述后会由增量索引自动恢复为任务。
- 涉及文件：`src/utils/taskParser.ts`、`src/utils/taskIndex.ts`、`tests/taskCore.test.ts`
- 验证方式：`npm test` 52 项核心用例和临时 Git vault 24 次写入通过；`npm run build`、`git diff --check` 通过。Aaron_Ob 重载新版插件后总任务由 345 降为 285、活跃由 204 降为 144、待分类由 177 降为 117，恰好排除 60 个实际曾进入普通任务索引的占位项；搜索纯日期 `2026-02-25` 显示无匹配，全程未触发任务写回。
- 后续注意事项：当前纯日期规则刻意只匹配完整 ISO 日期；含时间、说明或其他行动文字的任务不会被误排除。安装前回滚备份位于 `/private/tmp/time-grid-empty-task-backup.0mKDyO`。

### 2026-08-02（日晷时间视图与内置计时器原型）

- 修改等级：L0 设计原型与规格
- 变更摘要：在 `Time Grid Design System 2` 保留三方案探索页，并将方案三“此刻回环”深化为独立高保真原型；加入日晷下方的手输、最近活动、今日任务和每日流程计时入口，以及空闲、运行、切换、自动准备、冲突、JSON 异常、并发写入失败和跨日恢复状态。原型支持 280/320/420/720px、深浅主题、键盘焦点和 reduced-motion，仅模拟交互，不写入日记。
- 涉及文件：`Time Grid Design System 2/ui_kits/time-view-redesign/sundial-timer.html`、`Time Grid Design System 2/ui_kits/time-view-redesign/SUNDIAL_SPEC.md`、`Time Grid Design System 2/_ds_manifest.json`、`Time Grid Design System 2/readme.md`、`PROJECT_CONTEXT.md`
- 验证方式：抽取内联 JavaScript 通过 `node --check`；Design System manifest 可解析且新卡片唯一；Chrome 实际渲染 280/320/420/720px 深浅主题，并检查空闲、运行、冲突和跨日恢复状态；`git diff --check` 通过。
- 后续注意事项：本阶段未修改 `src/`、Task 面板或真实 vault。用户确认原型后，才进入 `TimerRepository`、`TimerController` 和生产日记写入实现。

### 2026-08-02（日晷时间视图与内置计时器生产实现）

- 修改等级：L3 跨模块改动
- 变更摘要：按已确认的 Claude Design 方案三“此刻回环”重组生产时间视图，没有另行发挥视觉方案；新增 Time Grid 内直接开始、停止和原子切换计时，以及最近活动、今日/逾期任务和每日流程建议。计时数据继续兼容 `simple-time-tracker`，新增唯一代码块与插入标记校验、未知字段保留、冲突确认、跨午夜拆分、关闭恢复和超过 24 小时人工决策；计时写入从新增字数中扣除，Task 面板、任务写入和每日流程生命周期保持不变。
- 涉及文件：`src/components/SundialTimeView.ts`、`src/types/timer.ts`、`src/utils/timerFormat.ts`、`src/utils/timerRepository.ts`、`src/utils/timerController.ts`、`src/main.ts`、`src/views/TimeGridView.ts`、`src/utils/dailyNotes.ts`、`src/utils/dailyNotesParser.ts`、`src/utils/writingStats.ts`、`src/types/task.ts`、`src/styles/main.css`、`tests/taskCore.test.ts`、`tests/timerVault.integration.ts`、`scripts/run-timer-vault-tests.mjs`、`package.json`
- 验证方式：`npm test` 通过 64 项核心用例、每日流程临时 Git vault 24 次写入和计时器临时 Git vault 9 次写入；计时集成覆盖自动创建、开始、停止、原子切换、未知字段及并发文本保留、冲突确认、跨午夜拆分和危险内容拒写。`npm run build`、`git diff --check` 通过。Aaron_Ob 的 Obsidian 1.12.7 深色约 320px 侧栏实际加载最终构建，确认日晷布局、干净的流程建议、官方空计时块状态和原 Task 视图统计；今日日记检查前后大小与修改时间不变，未执行真实计时写入。
- 后续注意事项：两处真实 vault 已安装同哈希最终构建；旧插件备份位于 `/private/tmp/time-grid-sundial-backup-20260802/`。真实 vault 的开始、停止、切换及跨日写入仍需用户明确授权后再做冒烟测试。工作区改动尚未提交。

### 2026-08-02（跨日恢复指针修复与双 vault 同步）

- 修改等级：L1 局部修补
- 变更摘要：修复超过 24 小时选择「补齐并继续」后仍因旧恢复指针重新进入 `recovery-required` 的问题；成功恢复后先清除指针再刷新，非单运行态也会清空指针。补充 `timeRange` / `timerRecovery` 数据迁移断言，并将最终构建同步到 Aaron_Ob 与 Documents Obsidian Vault。
- 涉及文件：`src/utils/timerController.ts`、`tests/taskCore.test.ts`、`PROJECT_CONTEXT.md`
- 验证方式：`npm test` 64 项核心用例、Routine 临时 vault 24 次写入、Timer 临时 vault 9 次写入通过；`npm run build`、`git diff --check` 通过；两处 vault 的 `main.js` / `styles.css` SHA-256 与工作区一致。
- 后续注意事项：重载 Obsidian 后才会看到最新 JS；真实计时写入仍需用户明确授权。如需入库，请明确要求创建提交。
