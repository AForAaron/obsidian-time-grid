# Time Grid 任务模块开发规格 (Task Integration Spec)

本文件是 Time Grid 插件「任务模块」的完整开发规格，供 Codex 直接执行。
开工前请先读 `PROJECT_CONTEXT.md` 了解项目现状；本模块完成后需按该文件的规则同步「当前功能快照」「当前实现约束」「当前进度」和「变更记录」。

## 0. 本轮确认的补充约束（优先于后文示例）

- AgentDeck 的 `Content/TASK_INTEGRATION_SPEC.md` 是正式规格，本文件是同步副本；两份内容必须保持一致。
- 状态语义固定为：`[ ]` 待办、`[/]` 进行中、`[x]` 完成、`[-]` 取消。完成与取消属于终态；其他状态字符可见但只读。
- 面板提供四态状态菜单。选择完成写入 `✅ 今天`，选择取消写入 `❌ 今天`；回到待办或进行中时移除终态日期。该行为由「记录终态日期」统一控制。
- 所有合法写操作前都必须确认目标原文在文件内唯一；即使行号仍命中，只要存在重复原文也必须按 ambiguous 拒绝写入。
- 写回采用片段级修改：除目标字段和缺失空格规范化外，BOM、换行风格、尾部换行、缩进、列表符号、callout 前缀、未知字段位置及未修改间距均须保留。
- 无效日期、重复已知字段、无法可靠拆解、未知 checkbox 状态和带 `🔁` 的循环任务都必须显示，但在 Phase 1-4 中只读，并提供源文件跳转。
- Time Grid 自己发起的任务写操作不计入「今日新增字数」。
- 本轮不支持在面板中新建任务；Phase 5 拖拽排期仍不在本规格范围。
- 排除路径按 vault 根目录相对路径段匹配；默认 `00-Templates` 只排除根目录同名文件夹及其后代。
- Phase 2-4 的破坏性验收在专用临时 Git vault 完成；真实 vault 只做安装、数量核对和非破坏性冒烟检查。

---

## 1. 背景与定位

Time Grid 目前是**纯只读**的时间感知面板：热力图、月格、24 小时格、60 分钟格、今日计时圆环。所有组件只读日记、不写文件。

本模块引入插件的**第一次写操作**，这是最大的风险来源。所有设计决策优先保证「不损坏用户笔记」，其次才是功能完整。

### 与「向死而生」主题的关系

本模块的核心原则是**全量呈现，不做隐藏**。

时间是有限的，逃避一个任务不会让它消失，只会让它在你看不见的地方继续消耗你。因此：

- **不过滤**。全库所有任务，包括逾期半年的、没有日期的、看不出该归哪里的，全部进入面板。
- **不静默丢弃**。任何一条任务如果不符合已有分区规则，必须落进「待分类」区，绝不因为规则没覆盖到就消失。
- **不默认折叠痛点**。逾期区和待分类区永远默认展开。可以折叠「未来」和「已完成」，但不能折叠你欠下的东西。
- **提供出路**。全量呈现的前提是给用户「解决」的手段：勾选、改期、编辑、删除、标记为长期。看得见且改得动，才不是压迫。

---

## 2. 设计原则（不可协商）

| 原则 | 含义 |
|---|---|
| Markdown 是唯一真相 | 任务永远是笔记里的一行 `- [ ] ...`。插件不维护独立数据库，不做私有存储格式。 |
| 兼容 Tasks 插件语法 | 完全复用 obsidian-tasks 的 emoji 字段约定。用户可以同时使用 Tasks 插件、Dataview、本插件，互不冲突。 |
| 写入宁可失败不可猜错 | 定位不到目标行时，中止写入并明确报错，**绝不**按相似度猜测。 |
| 单一写入出口 | 所有写操作必须经过 `taskWriter.ts`，禁止任何组件直接调用 `vault.modify`。 |
| 不静默失败 | 每一次写入失败都必须通过 Notice 告知用户，并自动重扫该文件。 |

---

## 3. 数据来源与格式约定

### 3.1 扫描范围

全库所有 `.md` 文件中的任务列表项。

排除规则（可配置，默认值）：
- 排除模板目录：`00-Templates`
- 排除路径可在设置中追加，逗号分隔

### 3.2 识别的字段（Tasks 插件标准语法）

| 字段 | 标记 | 示例 | 说明 |
|---|---|---|---|
| 到期 | `📅` | `📅 2026-08-05` | due |
| 计划 | `⏳` | `⏳ 2026-08-03` | scheduled |
| 开始 | `🛫` | `🛫 2026-08-01` | start |
| 创建 | `➕` | `➕ 2026-07-24` | created |
| 完成 | `✅` | `✅ 2026-08-01` | done |
| 取消 | `❌` | `❌ 2026-08-01` | cancelled |
| 优先级 | `🔺⏫🔼🔽⏬` | `⏫` | highest / high / medium / low / lowest |
| 重复 | `🔁` | `🔁 every week` | recurrence，本模块只读不改 |
| 依赖 ID | `🆔` | `🆔 abc123` | 只读保留 |
| 被阻塞 | `⛔` | `⛔ abc123` | 只读保留 |

**未识别的字段必须原样保留**。编辑任务时只替换已知字段，其余部分（包括 `🔁`、`🆔`、`⛔`、任意自定义文本）原封不动写回。

**容错要求**：用户 vault 中存在描述与 emoji 之间缺空格的历史数据（如 `给妈妈写论文📅 2026-02-28`）。解析器必须容忍无空格写法；发生合法写入时统一补上空格。

### 3.3 日期格式

统一 `YYYY-MM-DD`。字符串直接比较即可，不需要 Date 对象参与排序和分区判断。

---

## 4. 模块划分与文件清单

新增文件，不修改现有组件的内部逻辑：

```
src/utils/taskParser.ts        单行 Markdown ⇄ TGTask 的双向转换（纯函数，无副作用）
src/utils/taskIndex.ts         全库扫描、增量更新、内存索引、变更通知
src/utils/taskWriter.ts        所有写操作的唯一出口
src/components/TaskPanel.ts    分区列表 UI
src/components/TaskEditModal.ts 编辑弹窗
src/types/task.ts              类型定义
```

需要修改的现有文件：

```
src/views/TimeGridView.ts      挂载 TaskPanel
src/main.ts                    初始化 taskIndex、注册 metadataCache 监听、注册设置项
src/styles/main.css            新增任务面板样式，类名前缀统一 tg-task-
```

---

## 5. 数据模型

`src/types/task.ts`

```ts
export type TaskSection =
  | 'overdue'    // 逾期
  | 'today'      // 今天到期
  | 'unsorted'   // 无日期、无 #goal —— 待分类
  | 'goal'       // 带 #goal 标签的长期方向
  | 'future'     // 未来到期
  | 'done';      // 已完成

export type TaskPriority =
  | 'highest' | 'high' | 'medium' | 'low' | 'lowest';

export interface TGTask {
  /** 稳定标识：`${filePath}#L${line}`，仅用于本次会话内的 UI key */
  id: string;

  filePath: string;
  /** 0-indexed 行号 */
  line: number;
  /** 原始整行文本，写回时用于校验，绝不可省略 */
  raw: string;
  /** 该行的缩进前缀（空格/Tab + 列表符号），写回时原样保留 */
  indent: string;

  checked: boolean;
  /** checkbox 内的状态字符，如 ' ' 'x' '/' '-'，原样保留 */
  statusChar: string;

  /** 剥离所有已识别 emoji 字段后的纯描述文本，已 trim */
  description: string;

  due?: string;
  scheduled?: string;
  start?: string;
  created?: string;
  doneDate?: string;
  cancelledDate?: string;
  priority?: TaskPriority;

  /** 未识别字段的原始片段，按出现顺序，写回时追加在末尾 */
  trailing: string[];

  /** 行内标签，含 # 前缀 */
  tags: string[];

  section: TaskSection;
}

export type WriteFailReason =
  | 'file-missing'
  | 'line-mismatch-not-found'
  | 'line-mismatch-ambiguous'
  | 'io-error';

export type WriteResult =
  | { ok: true }
  | { ok: false; reason: WriteFailReason; message: string };
```

---

## 6. 扫描层规格 (`taskIndex.ts`)

### 6.1 定位任务行

**必须使用 `metadataCache` 提供的结构化信息，不要自己写正则扫描整个文件找 checkbox。**

```ts
const cache = this.app.metadataCache.getFileCache(file);
const items = cache?.listItems?.filter(i => i.task !== undefined) ?? [];
```

`ListItemCache.task` 为 checkbox 内的字符，`position.start.line` 为 0-indexed 行号。

取文本用 `vault.cachedRead(file)`（只读专用，比 `read` 便宜），按 `\n` 切分后按行号取。

### 6.2 全量扫描

插件加载时执行一次。遍历 `vault.getMarkdownFiles()`，逐文件调用 `scanFile`。

- 必须异步分批，禁止在主线程一次性同步跑完
- 建议每处理 50 个文件 `await new Promise(r => setTimeout(r, 0))` 让出主线程
- 扫描期间面板显示「正在建立索引...」，不阻塞其他组件

### 6.3 增量更新

```ts
this.registerEvent(
  this.app.metadataCache.on('changed', (file) => {
    if (file instanceof TFile && file.extension === 'md') {
      this.taskIndex.reindexFile(file);
    }
  })
);
this.registerEvent(
  this.app.vault.on('delete', (file) => this.taskIndex.dropFile(file.path))
);
this.registerEvent(
  this.app.vault.on('rename', (file, oldPath) => {
    this.taskIndex.dropFile(oldPath);
    if (file instanceof TFile) this.taskIndex.reindexFile(file);
  })
);
```

`reindexFile` 需要 debounce 300ms，避免用户连续打字时反复重建。

### 6.4 索引结构与通知

```ts
class TaskIndex {
  private byFile: Map<string, TGTask[]>;
  private listeners: Set<() => void>;

  getAll(): TGTask[]
  getBySection(section: TaskSection): TGTask[]
  onChange(cb: () => void): () => void  // 返回取消订阅函数
}
```

索引变化后通知订阅者，TaskPanel 据此重绘。**重绘必须保留用户当前的分区折叠状态和滚动位置。**

---

## 7. 写入层规格 (`taskWriter.ts`) —— 本模块最关键部分

### 7.1 必须使用 `Vault.process()`

Obsidian 1.6+ 提供的原子读-改-写 API。**禁止使用 `read()` + `modify()` 的组合**，那会在用户同时编辑该文件时丢失数据。

### 7.2 三层定位策略

```ts
async function applyEdit(
  app: App,
  task: TGTask,
  newRaw: string | null   // null 表示删除该行
): Promise<WriteResult> {

  const file = app.vault.getAbstractFileByPath(task.filePath);
  if (!(file instanceof TFile)) {
    return { ok: false, reason: 'file-missing',
             message: `文件不存在：${task.filePath}` };
  }

  let result: WriteResult = { ok: true };

  try {
    await app.vault.process(file, (content) => {
      const lines = content.split('\n');
      const target = task.raw.trim();

      // 第一层：行号命中且内容完全一致
      if (lines[task.line]?.trim() === target) {
        return writeAt(lines, task.line, newRaw);
      }

      // 第二层：行号漂移，全文搜索唯一匹配
      const hits: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === target) hits.push(i);
      }
      if (hits.length === 1) {
        return writeAt(lines, hits[0], newRaw);
      }

      // 第三层：找不到或有重复 —— 放弃，绝不猜
      result = hits.length === 0
        ? { ok: false, reason: 'line-mismatch-not-found',
            message: `在 ${task.filePath} 中找不到这一行，可能已被修改` }
        : { ok: false, reason: 'line-mismatch-ambiguous',
            message: `在 ${task.filePath} 中发现 ${hits.length} 行完全相同的任务，无法判断改哪一条` };
      return content;   // 原样返回 = 不做任何修改
    });
  } catch (e) {
    return { ok: false, reason: 'io-error', message: String(e) };
  }

  return result;
}

function writeAt(lines: string[], idx: number, newRaw: string | null): string {
  if (newRaw === null) lines.splice(idx, 1);
  else lines[idx] = newRaw;
  return lines.join('\n');
}
```

### 7.3 失败后的行为

写入失败时**必须**：

1. `new Notice(result.message, 8000)` 告知用户
2. 自动调用 `taskIndex.reindexFile(file)` 刷新索引
3. 面板上该条任务恢复原状（不能显示成已改）
4. Notice 文案末尾附加「已自动刷新，请重试」

**不允许**像 Tasks 插件那样把该条标记为脏数据后永久拒绝响应。每一次点击都应该是一次全新的尝试。

对 `line-mismatch-ambiguous`，Notice 中额外提示：「请在源文件中把重复的任务改得不同」，并提供一个「打开源文件」按钮。

### 7.4 对外接口

```ts
toggleDone(task: TGTask): Promise<WriteResult>
updateTask(task: TGTask, patch: Partial<TGTask>): Promise<WriteResult>
deleteTask(task: TGTask): Promise<WriteResult>
postpone(task: TGTask, days: number): Promise<WriteResult>
markAsGoal(task: TGTask): Promise<WriteResult>     // 追加 #goal 标签
```

所有方法内部都先用 `taskParser.serialize()` 生成 newRaw，再走 `applyEdit`。

### 7.5 完成任务的语义

勾选完成时：
- `statusChar` 由 `' '` 改为 `'x'`
- 若设置中开启「记录完成日期」，追加 `✅ YYYY-MM-DD`
- 若任务带 `🔁`，**本模块不处理循环任务的下一条生成**。检测到 `🔁` 时弹 Notice 提示「循环任务请在源文件或 Tasks 插件中完成」，并中止写入。这是 Phase 1-4 的明确边界。

---

## 8. 分区与排序规格

### 8.1 分区判定

```ts
function classify(task: TGTask, today: string): TaskSection {
  if (task.checked) return 'done';
  if (task.tags.includes('#goal')) return 'goal';
  if (!task.due) return 'unsorted';
  if (task.due < today) return 'overdue';
  if (task.due === today) return 'today';
  return 'future';
}
```

判定顺序不可调换。`#goal` 优先于日期，因为长期方向即使被顺手加了日期，也不该出现在逾期区制造噪音。

**兜底保证**：这个函数必须对任意输入返回一个合法 section，不允许返回 undefined。任何新增规则都不得破坏「所有任务必有归属」。

### 8.2 分区展示顺序与默认状态

| 顺序 | 分区 | 标题 | 默认折叠 | 备注 |
|---|---|---|---|---|
| 1 | overdue | 🔴 逾期 | 否 | 永远展开，不提供「记住折叠」 |
| 2 | today | 📅 今天 | 否 | |
| 3 | unsorted | ❓ 待分类 | 否 | 永远展开 |
| 4 | goal | 🎯 长期 | 否 | 可折叠，但默认展开 |
| 5 | future | 🔮 未来 | 是 | 可记住折叠状态 |
| 6 | done | ✅ 已完成 | 是 | 默认只显示今日完成，可切换为全部 |

前三区的折叠状态**不持久化**——每次打开插件都是展开的。这是刻意的设计：你可以临时收起来，但下次必须重新面对。

### 8.3 区内排序

- overdue：`due` 升序（最久的在最上面）
- today：`priority` 降序 → `due` 升序
- unsorted：`created` 降序，无 created 则按文件路径
- goal：文件路径升序
- future：`due` 升序
- done：`doneDate` 降序

### 8.4 分区标题

格式：`{图标} {名称} ({数量})`

数量始终显示，即使分区被折叠。**折叠只能隐藏细节，不能隐藏数字。**

---

## 9. UI 规格 (`TaskPanel.ts`)

### 9.1 位置

挂载于 `TimeGridView` 内，置于 `DailyPieChart` 下方，作为面板最后一个 section。

### 9.2 任务行结构

```
[☐] 任务描述文本                          📅 08-05  ⏫   [✏️] [⏩] [🗑]
     └ 文件名 (仅在设置开启时显示)
```

- **复选框**：点击 → `toggleDone`。乐观更新 UI，失败时回滚
- **描述文本**：单击 → 打开 `TaskEditModal`；`Ctrl/Cmd + 单击` → 跳转源文件对应行
- **日期**：`MM-DD` 格式，逾期显示为警告色
- **优先级**：仅非默认优先级时显示图标
- **✏️**：打开编辑弹窗
- **⏩**：顺延一天。`Shift + 点击` 顺延一周
- **🗑**：删除。**必须二次确认**，用 `ConfirmModal` 显示完整任务内容 + 所在文件

按钮默认半透明，鼠标悬停行时显示为完全不透明。

### 9.3 待分类区的特殊处理

该区每行额外提供两个快捷操作，这是「解决而非逃避」的具体落地：

- **[设为今天]** → 写入 `📅 {today}`，任务立刻移入今天区
- **[设为长期]** → 追加 ` #goal`，任务立刻移入长期区

目的是让用户能在三秒内清空这个区，而不是长期视而不见。

### 9.4 顶部状态条

```
共 142 条 · 逾期 17 · 今天 5 · 待分类 3          [🔄 重新索引]
```

「重新索引」按钮触发全量重扫，用于索引出问题时的手动恢复。

### 9.5 空状态

- 索引中：「正在建立任务索引...」
- 全库无任务：「还没有任务。在任意笔记里写 `- [ ] 内容` 即可。」
- 某分区为空：不渲染该分区标题

### 9.6 性能

任务超过 200 条时，每个分区默认只渲染前 50 条，底部显示「还有 N 条，点击展开」。避免一次性构建上千个 DOM 节点拖垮面板。

---

## 10. 编辑弹窗规格 (`TaskEditModal.ts`)

字段：

| 字段 | 控件 | 说明 |
|---|---|---|
| 描述 | 单行文本框 | 自动聚焦并全选 |
| 到期日 | 日期输入 + 快捷按钮 | 快捷：今天 / 明天 / 下周 / 清除 |
| 优先级 | 单选按钮组 | 无 / 最低 / 低 / 中 / 高 / 最高 |
| 标签 | 只读展示 + `#goal` 开关 | 其他标签在描述里手动编辑 |
| 所在文件 | 只读文本 + 跳转按钮 | |

底部：`[保存]` `[取消]` `[删除]`

保存时生成新的 raw 并调用 `updateTask`。**保存失败时弹窗不关闭**，在弹窗内显示错误信息，让用户可以复制内容后手动处理。

---

## 11. 设置项

在插件设置页新增「任务」分组：

| 设置 | 类型 | 默认值 |
|---|---|---|
| 启用任务面板 | 开关 | 开 |
| 排除路径 | 文本（逗号分隔） | `00-Templates` |
| 长期任务标签 | 文本 | `#goal` |
| 完成时记录日期 | 开关 | 开 |
| 显示任务所在文件名 | 开关 | 关 |
| 已完成区显示范围 | 下拉 | 仅今日 / 近 7 天 / 全部 |
| 每区最多渲染条数 | 数字 | 50 |

---

## 12. 分阶段实施

严格按顺序，每阶段独立构建、独立验证、独立提交。**前一阶段未验证通过不得开始下一阶段。**

### Phase 1 — L2｜只读列表
- `taskParser.ts`、`taskIndex.ts`、`types/task.ts`
- `TaskPanel.ts` 仅渲染分区列表，所有交互只有「跳转源文件」
- **零写操作**
- 验收：全库任务数量与 Tasks 插件 `not done` 查询结果一致；分区归类正确；无任务丢失

### Phase 2 — L3｜勾选完成
- `taskWriter.ts` 完整实现三层定位
- 只接入 `toggleDone`
- 验收：正常勾选写回成功；**故意制造两行完全相同的任务，确认报 ambiguous 且未修改文件**；勾选后源文件内容正确、索引自动刷新

### Phase 3 — L3｜编辑弹窗
- `TaskEditModal.ts`、`updateTask`
- 验收：编辑后未识别字段（`🔁`、`🆔`、自定义文本）原样保留；日期格式正确

### Phase 4 — L3｜删除与顺延
- `deleteTask`、`postpone`、`markAsGoal`
- 待分类区快捷按钮
- 验收：删除有二次确认；删除后该行从源文件消失且相邻行未受影响

### Phase 5 — L4｜时间格子联动（可选，本规格不展开）
将任务拖入 24 小时格完成排期。涉及数据格式变更（需存储时间段），属破坏性改动，需另立规格。

---

## 13. 验收标准（全阶段通用）

1. `npm run build` 通过 TypeScript 检查与生产打包
2. `bash install.sh` 同步到两个 vault 后，重载 Obsidian 能看到新 UI 标记（建议加 `tg-task-panel` 类名作为确认锚点）
3. **数据安全测试**（每次涉及写操作的阶段必做）：
   - 用 Git 记录测试 vault 状态
   - 执行 20 次以上各类写操作
   - `git diff` 检查：只有目标行发生变化，无意外的空行增减、无编码变化、无行尾符变化
4. **并发测试**：源文件在另一个面板打开的状态下执行写操作，确认不丢失编辑器内的未保存改动
5. 任务总数与 Tasks 插件查询结果对得上，无遗漏

---

## 14. 已知风险与边界

| 风险 | 应对 |
|---|---|
| 完全相同的两行任务 | 拒绝写入并明确提示，不猜 |
| 循环任务 `🔁` | Phase 1-4 不支持，检测到即拒绝并提示 |
| 任务在 callout / 引用块内 | `metadataCache.listItems` 能正确识别，但缩进前缀必须原样保留 |
| 任务在代码块内 | `listItems` 不会包含代码块内容，天然规避 |
| 大型 vault 首次索引慢 | 异步分批 + 让出主线程 + 索引中状态提示 |
| 用户手动编辑导致行号漂移 | 第二层内容匹配兜底 + metadataCache 自动重索引 |
| 跨设备 Git 同步后索引过期 | 提供手动「重新索引」按钮 |

---

## 15. 完成后需同步到 PROJECT_CONTEXT.md

- **当前功能快照**：新增 `src/utils/taskParser.ts`、`taskIndex.ts`、`taskWriter.ts`、`src/components/TaskPanel.ts`、`TaskEditModal.ts`、`src/types/task.ts`
- **当前实现约束**：追加「插件现在会写入用户笔记；所有写操作经 `taskWriter.ts` 的 `Vault.process` 原子路径，定位失败时中止并提示，不做模糊匹配」
- **当前进度**：记录已完成到哪个 Phase 及验证结果
- **变更记录**：每个 Phase 追加一条，含日期、修改等级、变更摘要、涉及文件、验证方式、后续注意事项
