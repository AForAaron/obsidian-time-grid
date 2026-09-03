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
  - `src/components/RoutinePromoteModal.ts`：把今天的临时项目提升为长期流程定义
  - `src/components/TaskTimerModal.ts`：从任务卡启动计时的标题编辑、原子切换确认与「同时完成上一个任务」勾选
  - `src/components/TimerStopModal.ts`：停止计时时的「停止并完成 / 仅停止 / 继续计时」三选一
  - `src/components/TaskCreateModal.ts`：新建任务弹窗，默认到期日为今天且可清除
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
  - `src/utils/taskTimer.ts`：任务计时资格判定、默认标题清理、关联任务解析与开始/停止的状态联动纯函数
  - `src/utils/taskInbox.ts`：收件箱插槽定位、新任务序列化、撞车检测与 ID 生成纯函数
  - `src/utils/vaultPaths.ts`：逐级创建父目录的共享工具
  - `src/utils/routineFormat.ts`：流程配置笔记与今天实例的解析、序列化、计划求值及旧格式块识别纯函数
  - `src/utils/routineMarker.ts`：流程实例的隐藏身份标记读写
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
- 时间视图采用 Claude Design 方案三“此刻回环 · 日晷仪表”的生产布局；计时控制面板的视觉与 DOM 真相源为 `Time Grid Design System 3` 的 TimerPanel / Button / SuggestionChips。长期轨迹支持 3 个月、6 个月、1 年切换并记忆选择，默认 6 个月。
- Time Grid 可以直接开始、停止和原子切换计时，但日记中的 `simple-time-tracker` JSON 仍是唯一数据真相源；插件数据只保存兼容的计时恢复指针。
- 任一时刻只允许一个运行活动；多个运行项、多个计时块、异常 JSON 或异常插入标记一律进入诊断状态并拒绝自动写入。计时切换使用同一时间戳结束旧段并开始新段。
- 无今日日记时仅在日记核心插件可用时按其配置与模板创建；无计时块时优先使用 `time-grid-timer-slot` 成对标记，否则在文末追加“时间记录”。所有修改经 `Vault.process()` 重新读取并只替换目标 JSON。
- 运行计时在本地午夜拆分；关闭期间跨日不超过 24 小时自动补齐，超过 24 小时必须先选择补齐并继续、首个午夜结束或暂不处理。恢复决策前禁止开始新计时。
- 快捷建议合并最近 7 天活动、今日/逾期任务和今日流程并去重；建议只贡献活动名称。
- 任务与计时的关联只存在于 `TimerController` 的内存中，不写入日记也不写入 `data.json`；只在从任务卡启动计时时建立，手输、建议启动和重启后恢复的计时一律视为无关联，绝不按活动名反查任务。关联在计时身份（活动名 + 开始时间）发生任何变化时立即失效。
- 两个停止入口统一走 `TimeGridView.requestStopTimer()`。存在可完成的关联任务时先弹窗（因此「继续计时」才有意义），选定后先停计时、成功后才改任务状态；无关联时保持一点即停。任务在停止前解析，因为计时一停关联就失效。
- 原子切换弹窗提供默认不勾的「同时把上一个任务标为完成」。计时写入永远先落盘，之后任何状态写入失败都只降级为部分成功，绝不回滚计时。
- 插件内新建的任务统一写入收件箱（默认 `Time Grid Tasks.md`，可在设置中修改），不写进日记。位置由唯一的 `time-grid-task-slot` 插槽决定：缺失时自动补一对，出现多个或顺序颠倒则拒绝写入。新任务使用 Tasks 兼容格式并带 `➕` 创建日期，`📅` 默认当天且可清除；只有当整行与收件箱内已有行完全相同时才补 `🆔`，以保证之后仍能按「原文全局唯一」安全改写。
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

截至 2026-08-19，项目处于可构建、可安装到 Obsidian vault 使用的阶段。当前重点进度记录如下：

- 基础插件骨架已完成：插件清单、TypeScript 入口、esbuild 构建、安装脚本和右侧面板注册流程已具备。
- 核心时间可视化已完成日晷重组：包含可切换的近 3 个月、近 6 个月、近 1 年长期轨迹、本月位置、外圈今日进度、内圈当前小时、内置计时控制和今日去向。
- 日记数据接入已完成：可以读取 Obsidian 日记，并解析 `simple-time-tracker` 代码块作为计时数据来源。
- 今日计时分布已完成新版本：圆环图、中心总时长、空状态、格式异常状态、进行中状态、任务配色、Top 5 + 其他合并和图例悬停联动已实现。
- 计时统计边界已修正：`simple-time-tracker` 时长会按当前日期边界裁剪，避免跨日记录影响单日统计。
- 写作增量统计已具备：插件启用后为全库 Markdown 建立字数基线，并按日期记录新增字数。
- 最新构建/安装状态：日晷时间视图与内置计时器保持 Task 面板及任务写入规则不变；64 项核心自动测试、每日流程临时 Git vault 24 次写入、计时器临时 Git vault 9 次写入、生产打包均已通过；最终构建（`main.js` SHA-256 `235cc043…`）已同步到 Aaron_Ob 与 Documents Obsidian Vault。该批改动已提交（`622bee8`）。
- 当前开发状态：任务菜单已接入现有全局计时器，支持自定义标题、原子切换确认、待办自动转进行中、只读任务计时和任务页实时计时条；72 项核心自动测试、每日流程临时 Git vault 24 次写入、计时器临时 Git vault 9 次写入和生产打包已通过。最终构建已同步到 Aaron_Ob 与 Documents Obsidian Vault，两个安装目录的 `main.js`、`styles.css`、`manifest.json` 与工作区哈希一致。
- 任务模块 Phase 1 已完成：真实 Aaron_Ob vault 索引 625 条任务，面板显示活跃 453、逾期 18、今天 2、待分类 433。
- 任务模块 Phase 2 已完成：四态菜单、完成/重新打开快捷按钮、终态日期、严格唯一定位、失败重扫和写作统计抑制已接入；异常、未知状态、循环和重复任务保持只读或拒写。
- 任务模块 Phase 3 已完成：支持编辑描述、到期日、优先级和长期标签；失败时弹窗保持打开并提供可复制错误；只读任务只显示诊断和源文件入口。
- 任务模块 Phase 4 已完成：支持删除二次确认、顺延一天、Shift 顺延一周，以及待分类“设为今天/设为长期”；无到期日不显示顺延。
- 任务中心 UI 重设计已完成：顶部双视图切换、最后视图持久化、四统计卡、即时搜索、状态/优先级/来源组合筛选、过滤计数、未来三组、已结束合并、桌面完整浮层、触屏行内展开，以及统一 portal 状态菜单、更多菜单和筛选浮层均已接入。
- 响应式样式使用任务视图容器查询，覆盖 `≤320px`、`321–520px`、`>520px`；极窄侧栏固定 2×2 统计与收口筛选，不再常驻编辑、顺延、删除按钮，深色与浅色均使用 Obsidian 主题变量和 `color-mix`。
- 已加入基于现有 esbuild/Node 的 `npm test`，当前覆盖 72 个核心用例及独立临时 Git vault 集成验证；除原有任务、每日流程和计时数据边界外，已覆盖任务计时资格、Markdown 标题清理、切换竞态、计时失败不改状态、状态回写部分成功、只读任务和计时条资源清理。
- 2026-09-03 发布首个 GitHub Release `v0.2.0`（<https://github.com/AForAaron/time-grid-obsidian/releases/tag/v0.2.0>），附件为 `main.js`、`manifest.json`、`styles.css`；`versions.json` 已补齐。CI 产出的三个文件与本地构建、两个 vault 安装目录 SHA-256 完全一致，构建可复现。
- 2026-09-03 起版本为 `0.3.0`：新增停止计时询问是否完成、切换时可顺带完成上一个任务、以及插件内新建任务到专用收件箱。
- 真实 vault 的计时写入已于 2026-09-03 首次验证：在 Aaron_Ob 实际完成开始、原子切换和停止，切换处时间戳同毫秒，与备份的完整 diff 只有一行，测试后已逐字节还原。跨日恢复仍无法在真实 vault 自然触发，只有临时 Git vault 的集成写入作保障。

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
- 后续注意事项：真实 vault 尚未执行迁移；用户应在 Time Grid 中审阅并点击“确认迁移”。分支 `codex/routine-integration` 只推送、不自动合并 `main`。（2026-09-03 核实：两项均已完成——Aaron_Ob 迁移已于 2026-08-18 执行，配置笔记 `00-Templates/Time Grid Routines.md` 存在、`data.json` 的 `migrationVersion` 为 1、模板备份在 `00-Templates/副本保留/`；分支也已合并入 `main`。）

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
- 后续注意事项：两处真实 vault 已安装同哈希最终构建；旧插件备份位于 `/private/tmp/time-grid-sundial-backup-20260802/`。真实 vault 的开始、停止、切换及跨日写入仍需用户明确授权后再做冒烟测试。工作区改动尚未提交。（2026-09-03 核实：该批改动已提交；真实 vault 冒烟测试见 2026-09-03 条目。）

### 2026-08-02（跨日恢复指针修复与双 vault 同步）

- 修改等级：L1 局部修补
- 变更摘要：修复超过 24 小时选择「补齐并继续」后仍因旧恢复指针重新进入 `recovery-required` 的问题；成功恢复后先清除指针再刷新，非单运行态也会清空指针。补充 `timeRange` / `timerRecovery` 数据迁移断言，并将最终构建同步到 Aaron_Ob 与 Documents Obsidian Vault。
- 涉及文件：`src/utils/timerController.ts`、`tests/taskCore.test.ts`、`PROJECT_CONTEXT.md`
- 验证方式：`npm test` 64 项核心用例、Routine 临时 vault 24 次写入、Timer 临时 vault 9 次写入通过；`npm run build`、`git diff --check` 通过；两处 vault 的 `main.js` / `styles.css` SHA-256 与工作区一致。
- 后续注意事项：重载 Obsidian 后才会看到最新 JS；真实计时写入仍需用户明确授权。如需入库，请明确要求创建提交。

### 2026-08-18（Design System 3 计时 UI 替换）

- 修改等级：L2 功能增强（展示层）
- 变更摘要：以 `Time Grid Design System 3` 的 TimerPanel / Button / SuggestionChips 为真相源，替换生产计时控制面板的 DOM 与样式；采用四级按钮、运行态独立停止行、更大等宽累计时长、芯片建议区与 `@container tgtimer` 窄屏布局。修复运行态脉冲点错误调用 `document.createSpan()` 导致的 `HierarchyRequestError`，并让安装脚本在复制失败时立即退出且校验样式文件。计时写入逻辑、Task 面板与每日流程不变。
- 涉及文件：`src/components/SundialTimeView.ts`、`src/styles/main.css`、`tests/taskCore.test.ts`、`install.sh`、`PROJECT_CONTEXT.md`、`.gitignore`、`Time Grid Design System 3/`
- 验证方式：`npm test` 64 项核心用例、Routine 临时 vault 24 次写入、Timer 临时 vault 9 次写入通过；`npm run build`、`git diff --check`、`bash -n install.sh` 通过。最终构建安装到 `/Users/aaron/Documents/Obsidian Vault` 并与工作区 SHA-256 一致；在约 239px 的 Obsidian 侧栏通过内存快照验证空闲、运行、切换反馈、冲突、写入失败和跨日恢复，所有面板无横向溢出。
- 后续注意事项：QA 状态仅替换运行时内存快照，已恢复真实空闲控制器；测试 vault 未创建或修改任何日记，真实计时写入仍需用户明确授权。

### 2026-08-19（任务卡直接计时）

- 修改等级：L3 跨模块改动
- 变更摘要：待办/进行中普通任务、Routine 和只读循环任务的更多菜单已加入计时入口；新弹窗允许编辑清理过 Markdown 的默认标题，运行态要求确认原子切换并在提交前重读快照。计时成功后，可写待办转为进行中，只读任务不改状态；状态回写失败会保留已启动的计时并显示部分成功。任务页新增全局实时计时条、停止按钮及异常到时间页入口，每秒只更新时长文本。
- 涉及文件：`src/components/TaskTimerModal.ts`、`src/components/TaskPanel.ts`、`src/utils/taskTimer.ts`、`src/utils/taskUi.ts`、`src/utils/timerFormat.ts`、`src/components/SundialTimeView.ts`、`src/views/TimeGridView.ts`、`src/styles/main.css`、`tests/taskCore.test.ts`、`PROJECT_CONTEXT.md`
- 验证方式：`npm test` 通过 72 项核心用例、Routine 临时 vault 24 次写入和 Timer 临时 vault 9 次写入；`npm run build`、`git diff --check` 通过。在专用临时 Obsidian 1.12.7 vault 实际验证自定义标题启动、日记/计时块自动创建、待办转进行中、实时计时条、切换确认和停止后任务保持进行中；随后将同一构建安装到 Aaron_Ob 与 Documents Obsidian Vault，并确认三项插件文件哈希一致，未在真实 vault 启动计时或改写任务。
- 后续注意事项：计时数据仍完全复用 `TimerController` / `simple-time-tracker`，不持久化任务 ID 关联；覆盖前备份位于 `/private/tmp/time-grid-task-timer-backup.URysrW`，Obsidian 需重载插件或重启后使用新构建。

### 2026-09-03（文档校正、分支清理与 0.2.0 发布准备）

- 修改等级：L1 局部修补（文档 + 版本号，零运行时代码改动）
- 变更摘要：全面重写 `README.md`，补上任务中心、每日流程、内置计时器、日晷视图、数据来源表、数据安全约束、设置项清单和真实项目结构——此前 README 只描述最早的 5 个时间模块。校正 `PROJECT_CONTEXT.md` 三处过时陈述：「当前进度」章节内的「工作区改动尚未提交」直接改正为已提交（`622bee8`）；两条历史变更记录中的待办不改原文，只追加 2026-09-03 核实括注（Aaron_Ob 的流程迁移实际已于 2026-08-18 完成，`codex/routine-integration` 已合并）。「当前功能快照」补上此前遗漏的 `RoutinePromoteModal.ts`、`TaskTimerModal.ts`、`taskTimer.ts`、`routineFormat.ts`、`routineMarker.ts`。新增 `versions.json`，`manifest.json` / `package.json` / `package-lock.json` 版本统一升至 `0.2.0`。删除 4 个已完全合并进 `main` 的本地分支（`codex/routine-integration`、`codex/task-integration`、`codex/task-ui-redesign`、`cursor/sundial-timer-view`）及其残留 tracking 配置；`origin` 上的三个 codex 分支按用户决定保留作历史留档。
- 首次发布与 CI 修复：打 `v0.2.0` tag 触发 `release.yml` 时，构建步骤成功但创建 Release 报 403 `Resource not accessible by integration`——该 workflow 从未运行过，这个缺陷一直是潜伏的：仓库默认的 `GITHUB_TOKEN` 为只读，而 job 未声明写权限。已给 job 补上 `permissions: contents: write`，重新指向修复后的提交并重推 tag（原 tag 上没有任何 Release 产物，删除无损失），CI 转绿并成功创建 Release。
- 涉及文件：`README.md`、`PROJECT_CONTEXT.md`、`versions.json`、`manifest.json`、`package.json`、`package-lock.json`、`.github/workflows/release.yml`
- 验证方式：`npm test` 通过 72 项核心用例、每日流程临时 Git vault 24 次写入、计时器临时 Git vault 9 次写入；`npm run build`、`git diff --check` 通过；临时目录 `npm ci` 验证升版后的锁文件与 CI 一致（CI 用 `npm ci`）；`versions.json` 通过 JSON 解析；删分支前逐个用 `git merge-base --is-ancestor` 确认是 `main` 的祖先。最终构建已安装到 Aaron_Ob 与 Documents Obsidian Vault，三处 `main.js`（`71a21a9f…`）、`styles.css`（`0649c06d…`）、`manifest.json` SHA-256 一致；`main.js` 与上一版一致属预期，本轮未改任何 `src/` 代码。另外用真实的 `02-Daily Notes/2026-09-03.md` 内容干跑了 `inspectTimerContent` / `startTimerInContent`，结果为 `ready`、可写入——确认日记中 dataviewjs 代码块内的 `simple-time-tracker` 字面量不会被 `TRACKER_FENCE` 的行首锚定误判为第二个计时块。
- 真实 vault 冒烟测试（首次执行）：在 Aaron_Ob 的 Obsidian 1.12.7 中实际驱动 Time Grid 完成开始 → 原子切换 → 停止。空闲态、运行态（脉冲点、累计时长、独立停止行、切换活动区）、任务与流程建议芯片、停止后的今日去向双段圆环均渲染正常。日记写入结果：计时块始终为 1 个；`TimeGrid冒烟测试A` 记录 59.3 秒、`TimeGrid冒烟测试B` 记录 18.3 秒，两段均正常闭合；切换处 A 的 `endTime` 与 B 的 `startTime` 为同一毫秒 `2026-09-03T04:45:47.797Z`，无空隙无重叠。**与测试前备份的完整 diff 只有一行**——164 行日记的其余部分逐字节不变，无空行增减、无编码变化、无行尾变化。停止后 `timerRecovery.active` 正确回到 `null`，`writingStats` 未为当日记录任何新增字数，确认计时写入已被正确扣除。测试结束后日记已从备份逐字节还原（SHA-256 回到 `59501733…`），面板视图也已切回用户原本的任务视图，`data.json` 与基线一致。
- 后续注意事项：跨日恢复无法在真实 vault 自然触发（需真的跨过午夜），伪造需手改 `data.json` 的 `timerRecovery` 指针，属污染真实数据，故未做；该路径的保障仍来自临时 Git vault 的 9 次集成写入（含跨午夜拆分幂等与拒绝陈旧写回）。另确认日记中 dataviewjs 代码块内的 `simple-time-tracker` 字面量不会被 `TRACKER_FENCE` 的行首锚定误判为第二个计时块——这一点先用真实文件内容干跑 `inspectTimerContent` 验证（结果 `ready`），再由实际写入印证。备份位于会话 scratchpad 的 `vault-backup/`，已删分支的 SHA 记录在同目录 `deleted-branches.txt`。

### 2026-09-03（停止计时问完成 · 插件内新建任务）

- 修改等级：L3 跨模块改动
- 变更摘要：三项功能。其一，记住「这次计时是从哪条任务点开的」——关联只存在于 `TimerController` 的内存，只在从任务卡启动时建立，计时身份一变即失效，重新定位任务复用写入层同一套「原文在文件内全局唯一」的规则，命中 0 条或多条一律放弃而不猜。两个停止入口统一到 `TimeGridView.requestStopTimer()`：有可完成的关联任务时先弹「停止并完成 / 仅停止 / 继续计时」，无关联则保持一点即停。其二，原子切换弹窗新增默认不勾的「同时把上一个任务标为完成」。其三，新增 `TaskWriter.createTask()`——任务模块第一条「新增行」写入路径，落盘到专用收件箱的唯一 `time-grid-task-slot` 插槽，插槽异常一律拒写；新任务带 `➕` 创建日期与默认为今天的 `📅`，仅在与已有行撞车时才补 `🆔`。入口是任务中心顶部的「+」。顺带把 `ensureParentFolder` 提取为共享的 `vaultPaths` 工具，把 `timerStateKey` 与 `timerSuggestionName` 移入 `timerFormat` 以打断 `taskTimer` ↔ `timerController` 的循环引用。
- 涉及文件：`src/utils/taskTimer.ts`、`src/utils/timerController.ts`、`src/utils/timerFormat.ts`、`src/utils/taskInbox.ts`、`src/utils/taskWriter.ts`、`src/utils/vaultPaths.ts`、`src/utils/routineRepository.ts`、`src/utils/writingStats.ts`、`src/types/timer.ts`、`src/types/task.ts`、`src/components/TimerStopModal.ts`、`src/components/TaskCreateModal.ts`、`src/components/TaskTimerModal.ts`、`src/components/TaskPanel.ts`、`src/components/SundialTimeView.ts`、`src/views/TimeGridView.ts`、`src/main.ts`、`src/styles/main.css`、`tests/taskCore.test.ts`、`tests/taskInboxVault.integration.ts`、`tests/obsidianStub.ts`、`scripts/run-task-inbox-vault-tests.mjs`、`package.json`、`manifest.json`、`versions.json`、`README.md`
- 验证方式：`npm test` 通过 89 项核心用例（新增 17 项，覆盖关联解析的 0/1/多条分支、可完成性判定、计时身份指纹、停止的四种结果、切换时旧任务写入失败仍不阻塞新计时、新任务序列化、插槽 0/1/多个、撞车补 ID、路径归一化）、每日流程临时 Git vault 24 次写入、计时器 9 次写入，以及新增的收件箱临时 Git vault 7 次写入（含新建任务后立即被既有严格写入路径改写、撞 ID 的两条仍可各自唯一定位、插槽外的手写内容原样保留、CRLF 保持、插槽复制时拒写且原文一字不动）。`npm run build`、`git diff --check` 通过。最终构建已安装到 Aaron_Ob 与 Documents Obsidian Vault，三处文件 SHA-256 一致。
- 后续注意事项：**真实 vault 的 UI 冒烟测试尚未完成**。Aaron_Ob 窗口不是 Obsidian 的焦点窗口，`View > Force Reload` 始终作用在另一个 vault 窗口上，后台控制无法切换焦点窗口，请求全屏控制授权也未获应答，因此该窗口仍在运行 0.2.0 代码（已通过「切换视图触发保存后 `data.json` 中仍无 `inboxPath`」确认，不是功能缺陷）。整个过程中今日日记 SHA-256 未变、未创建收件箱文件、`timerRecovery` 保持为空、面板视图已还原。用户需手动点选 Aaron_Ob 窗口后重载插件，再验证「+」新建任务与停止计时弹窗。
