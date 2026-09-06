# TimeGrid 任务面板固定头部（Sticky Header）改造需求 · 像素级规格版

> **【留档说明】本需求书已执行完成**：sticky header 方案已在 commit `f172755` 落地（feat: pin panel headers, unify button tiers, split routine callouts）。本文件仅作需求书模板与历史留档，非现行规格。

> 本文件是提交给 Claude Code 的需求描述。你（Claude Code）**已拥有 TimeGrid 完整仓库的访问权限**（Claude Design 中已上传整个项目）。一切真实规格（DOM 结构、类名、token 值）**以仓库源码为唯一权威**，请直接读取以下文件获取：
> - `src/views/TimeGridView.ts` —— 时间视图 DOM 结构
> - `src/components/TaskPanel.ts` —— 任务视图 DOM 结构
> - `src/styles/main.css` —— 全部真实类名与 `--tg-*` token
>
> 本文件附录 A / B / C 是从源码与截图提取的**静态快照**，仅作快速对照与视觉基准；若附录与仓库源码有任何出入，**以仓库源码为准**。
>
> **最重要的一条规则：禁止即兴设计。**
> 所有颜色 / 圆角 / 字号 / 间距 / 类名必须来自**仓库源码**（`--tg-*` token 与现有类名，见附录 B/A 对照），不允许使用你自己的默认色板、默认字体、组件库（Bootstrap / Tailwind / shadcn 等）或"看起来差不多"的值。最终演示页的视觉应与真实插件截图（附录 C）**难以区分**——把两图并排放，除了滚动行为差异，看不出其它差别，才算合格。

---

## 0. 动手前必做（顺序不可颠倒）

1. **先读仓库源码**（你拥有完整仓库权限，这是唯一权威）：`src/views/TimeGridView.ts`、`src/components/TaskPanel.ts`、`src/styles/main.css`。本文件附录 A/B/C 是静态快照，仅作对照；**若与源码有出入，以源码为准**。
2. **读附录 C 的 4 张真实截图**（绝对路径在本文件内），它们是视觉验收的基准。
3. 核对现状（源码已确认）：时间视图切换器**已是 sticky**（差分隔线）；任务视图头部**完全未固定**（本次主体工作量）。
4. 最后写 sticky 逻辑。**视觉保持 1:1，只加行为。**

---

## 背景

TimeGrid 是 Obsidian 插件，渲染为一个侧栏视图（ItemView）。桌面端面板宽度约 380–420px（可拖窄到 320px），平板 500–800px，手机 ≤520px。默认暗色主题，需同时兼容浅色。

面板有两个模式，通过顶部「时间 / 任务」分段切换器切换：

1. **时间视图（sundial）**：切换器下方依次是「长期轨迹」热力图、「本月位置」日历、「此刻」半圆计时拨盘 + 数字时钟、开始计时面板、「今日去向」活动列表。
2. **任务视图（task panel）**：切换器下方依次是「任务中心」标题区（标题 + 副标题 + 右侧 ＋/↻ 两个图标按钮）、2 列统计卡片（总任务 / 逾期 / 今天 / 活跃）、搜索框（placeholder「搜索任务、标签或文件…」）、筛选按钮（「筛选」sliders-horizontal 图标，描边 ghost 样式）；再往下是计时条（可选）、每日流程（Routine）分组卡、以及各任务区块列表（逾期 / 今天 / 待分类 / 长期 / 未来 / 已结束）。

## 现状与问题（以源码为准，请勿凭想象推测）

以下结论直接从插件源码（`TimeGridView.ts` / `TaskPanel.ts` / `main.css`）核对得出，**与早期口头描述有出入，以本节为准**：

1. **唯一的滚动容器是视图根 `.tg-container`**（即 Obsidian ItemView 的 `contentEl`）。CSS：`overflow-y: auto; overflow-x: hidden; padding: clamp(8px, 2.5cqi, 12px); background: var(--tg-bg)`。两个视图的内容都直接躺在它的滚动流里。插件代码里滚动监听也挂在它身上（`.tg-container` 上的 passive scroll listener）。
2. **时间视图的切换器其实已经是 sticky**：`.tg-view-header { position: sticky; top: 0; z-index: 20; background: var(--tg-bg); padding: 0 0 10px; }`。所以时间视图的问题不是"没固定"，而是：滚动时固定区与内容之间**没有分隔线/投影**，且个别主题下视觉上仍有轻微透出感，需要按第 2 节要求补齐。
3. **任务视图的头部目前完全不固定**：`.tg-task-center-header` 只是普通流内元素（`position: relative`），滚动时标题/统计卡/搜索框/筛选按钮全部随内容滚走（见附录 C 第 4 张截图）。**这是本次改造的主要工作量。**
4. 任务视图头部下方还有一个**可选的计时条** `.tg-task-timer-strip`，它在 DOM 上插在 `.tg-task-center-header` **之后**（即视觉上位于筛选按钮下方、任务区上方）。按本需求它属于滚动内容（首个滚动元素）；若你判断一并固定效果更好，可作为可选方案说明，但默认实现按"固定到筛选按钮为止"。
5. **sticky 不需要任何 DOM 重排**：`.tg-view-panes`、`.tg-view-pane`、`.tg-task-panel`、`.tg-task-center-header` 这条祖先链上没有 `overflow: hidden/auto`（`.tg-task-panel` 是 `overflow: visible`），sticky 可以直接生效。需要注意的只有两点：`.tg-container` 自身的 padding（sticky 顶到 scrollport 顶部时要抵消 padding 缝隙），以及 `.tg-task-panel` 有 `max-width: 760px; margin-inline: auto`（固定区宽度跟随 panel，两侧留空是正确视觉，与截图一致）。

## 需求（目标行为）

### 1. 时间视图：固定切换器（增强现状）

- 「时间 / 任务」切换器继续钉在面板最上方，**不随滚动移动**（现状已 sticky，保持）。
- 其余全部内容（热力图、日历、计时、列表…）在其下方正常滚动。
- 滚动位置 > 0 时，切换器固定区底部出现分隔线（见第 3 节）；回到顶部时消失。

### 2. 任务视图：固定到筛选按钮（新增能力）

从上到下整体固定（不随滚动移动）：

1. 「任务中心」标题区（`.tg-task-center-header` 内的标题行 + 统计卡 + 搜索/筛选行）
2. 2 列统计卡片
3. 搜索框
4. 筛选按钮行

**筛选按钮以下**（计时条、每日流程、各任务区块）是唯一的滚动区域。固定区内不允许出现内部滚动。

实现提示（供参考，允许等价方案）：给 `.tg-task-center-header` 增加 `position: sticky; top: 0; z-index: 20;`，背景用完全不透明色（见第 3 节），并用负 margin 抵消 `.tg-container` 的 padding，使固定区背景横向铺满 scrollport，不留透明缝。

### 3. 防穿模（硬性要求）

- 固定区域背景**完全不透明**：时间视图继续用 `var(--tg-bg)`（= `--background-secondary`）；任务视图固定区用 `var(--tg-panel-bg)`（= `--background-primary`）或 `var(--tg-bg)`，与截图观察一致即可，但**必须不透明**。**禁止**半透明 + `backdrop-blur` 方案。
- 固定区 `z-index` 高于滚动内容（切换器现状 `z-index: 20`，沿用同级）。
- 滚动内容与固定区之间的分隔：当滚动位置 > 0 时，固定区底部出现 `1px` 分隔线（颜色 `var(--tg-border-default)`）+ 轻微投影（可参考 `--tg-shadow-menu` 的强度）；回到顶部时消失。用 passive scroll listener 加 `.is-scrolled` class 实现（插件现有滚动监听就在 `.tg-container` 上，演示页同样挂在唯一滚动容器上），或纯 CSS `scroll-timeline`。**分隔线必须由滚动位置驱动，不得依赖 hover。**
- sticky 生效的前提已核实（见"现状与问题"第 5 条），无需重排业务 DOM；若你的实现确实需要调整结构，输出最小结构调整说明并用注释标注。

### 4. 三端适配（桌面 / 平板 / 手机，硬性要求）

**架构性要求（与源码对齐）**：插件的真实适配体系是**容器查询（container query）而非 viewport 媒体查询**——因为桌面端面板是侧栏，宽度变化时视口不变。任务视图容器已声明 `container: tg-task-view / inline-size`，真实断点为：

| 断点 | 触发条件（真实源码） | 行为 |
|---|---|---|
| 极窄 | `@container tg-task-view (max-width: 320px)` | 统计卡 gap 收紧（7→5px）、标题区 padding 收紧等 |
| 常规 | 默认 | 统计卡 2 列（`grid-template-columns: repeat(2, minmax(0, 1fr))`，gap 7px） |
| 宽面板 | `@container tg-task-view (min-width: 521px)` | 统计卡变 **4 列一行** |

时间视图对应 `container: tg-sundial / inline-size`（断点 299px / 420px / 760px），演示页时间视图也应对齐这套行为。

触屏与设备方向（真实源码）：
- `@media (hover: none), (pointer: coarse)` 下所有按钮 `min-width/min-height: 44px`（触达区）。
- `@media (hover: hover) and (pointer: fine)` 才启用 hover 类交互。
- `@media (prefers-reduced-motion: reduce)` 下动画全部关闭。

| 环境 | 典型面板宽度 | 特点与要求 |
|---|---|---|
| 桌面 | 380–420px（可拖到 ~320px） | 鼠标 hover 可用；固定区宽度随侧栏拖动自适应 |
| 平板（iPad 等） | 500–800px，可能分屏全宽 | **纯触屏，无 hover**；≥521px 时统计卡 4 列一行；固定/滚动行为与手机一致 |
| 手机 | ≤520px，通常全宽 | 纯触屏；44px 触达区；统计卡保持 2×2；不得横向滚动 |

三端共同要求：
- 固定/滚动行为在**所有环境一致**：切换器（时间视图）、标题+统计+搜索+筛选（任务视图）永远固定
- 触屏设备上任何依赖 hover 才可见的反馈不得是唯一信息来源——分隔线由滚动位置驱动
- 平板/手机上滚动惯性不得与 sticky 冲突出现回弹抖动
- 虚拟键盘弹出（点击搜索框）时固定区不得遮挡或错位（iOS 上重点验证：键盘把视口压矮后 sticky 仍正确）

### 5. 其他技术约束

- 侧栏极窄（320px）时不得出现横向滚动或挤压错位
- **纯 CSS `position: sticky` 优先**；**不要**用 JS 手动 translate
- 深浅主题自适应：颜色全部走 CSS 变量（附录 B 的 Obsidian 原生变量或 `--tg-*` token），不要硬编码色值
- 不改变任何 DOM 的事件行为；只调整结构包裹、CSS 与必要的滚动监听（listener 必须 `{ passive: true }` 且在销毁时移除）
- 滚动监听挂载点：唯一滚动容器 `.tg-container`（与插件现状一致）

---

## 交付物

> **重要前提：你拥有完整仓库权限，交付的不是孤立演示页，而是「演示页 + 可直接合并的真实改动」双轨产出。**

1. **可交互演示 HTML**（单文件或三文件均可），内置：
   - `timegrid-sticky.css`：全部 sticky/分隔线样式（类名前缀 `tg-`，风格可直接合并进插件 `src/styles/main.css`）
   - `timegrid-sticky.js`：passive scroll 监听 + `.is-scrolled` 切换（监听卸载干净）
   - 演示页必须同时还原**两个视图**并可通过切换器切换，两个视图都要有足够高的内容以产生滚动
   - **演示页必须使用真实类名**（`tg-container`、`tg-view-header`、`tg-task-center-header`…），类名必须与仓库源码一致，臆造即失败
2. **可直接合并的改动清单**（这是给 Cursor agent 整合用的主体）：
   - CSS 增量：sticky 化、`is-scrolled` 分隔线、容器查询调整——逐条注明应插入 `src/styles/main.css` 的哪个位置
   - DOM/TS 最小改动：如需包裹层或挂载滚动监听，以 diff 形式注明改 `TaskPanel.ts` / `TimeGridView.ts` 的哪个方法、监听在构造时挂 `.tg-container`、`destroy()` 时卸载
   - 类名映射表：新增的 sticky 增量类（如 `.is-scrolled`、`.tg-sticky-*`）单独列出并注明「落地时挂到哪个真实节点」
3. **简短落地说明**：改动落在哪些文件哪些位置、监听如何注册与卸载。

---

## 验收标准（按此逐条自检）

- [ ] 视觉：演示页与附录 C 截图并排对比，颜色/圆角/字号/间距/布局肉眼难以区分（两个视图分别对比）
- [ ] 时间视图：滚动任意内容，「时间/任务」切换器位置纹丝不动
- [ ] 任务视图：滚动时标题/统计/搜索/筛选纹丝不动，仅筛选按钮以下内容滚动
- [ ] 滚动中无任何内容穿透固定区背景（固定区完全不透明）
- [ ] 滚动 > 0 时固定区底部分隔线出现，回到顶部时消失；回到顶部瞬间无残影
- [ ] 320px 宽度无横向滚动
- [ ] 容器宽度 ≥521px 时统计卡 4 列一行，≤320px 时统计卡收紧（演示页可通过拖拽窗口宽度验证）
- [ ] 三端验证：桌面（鼠标 hover）、平板（触屏、500–800px）、手机（触屏、≤520px、虚拟键盘弹出时 sticky 不错位）
- [ ] 深浅主题下均无不协调的色块（演示页提供深/浅切换开关，只切换附录 B 中两套变量值）
- [ ] 未使用任何外部字体、图标库、CSS 框架；图标用内联 SVG 按截图绘制（lucide 风格线性图标：clock、list-checks、plus、refresh-cw、search、sliders-horizontal、list-checks、circle-alert、sun、activity）

---

# 附录 A：真实 DOM 树（源码逐行核对）

> 缩进即嵌套。`→` 标注节点角色。所有类名真实有效，**演示页必须使用这些类名**。

```
.tg-container                          ← ItemView contentEl；【唯一滚动容器】
│                                        CSS: overflow-y:auto; overflow-x:hidden;
│                                        padding: clamp(8px,2.5cqi,12px);
│                                        background: var(--tg-bg) [--background-secondary]
├── .tg-view-header                    ← 【时间视图固定区】已 sticky top:0 z-index:20
│   │                                    background: var(--tg-bg); padding: 0 0 10px;
│   │                                    display:flex; justify-content:center
│   └── .tg-view-switcher              ← 分段切换器槽（role=tablist）
│       │                                display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
│       │                                width:min(760px,100%); padding:3px; border-radius:8px;
│       │                                background: var(--tg-surface-sunken);
│       │                                border:1px solid color-mix(in srgb, var(--tg-border) 82%, transparent)
│       ├── button.tg-view-switcher-button            ← 「时间」（icon clock-3 + label）
│       │   ├── span.tg-view-switcher-icon            ← 14×14 线性 SVG
│       │   └── span.tg-view-switcher-label
│       └── button.tg-view-switcher-button.is-active  ← 「任务」；is-active = 选中态
│                                                    （accent 描边 1.5px + 17% accent 填充）
└── .tg-view-panes                     ← 普通容器，无自身样式
    ├── .tg-view-pane.tg-time-view     ← 时间视图面板；.is-active 时 display:block
    │   │                                container: tg-sundial / inline-size
    │   └── .tg-sundial-root           ← 时间视图内容顶层（flex column, gap:15px, padding:14px）
    │       ├── .tg-sundial-context
    │       │   ├── section.tg-sundial-context-block.tg-sundial-trend   ← 「长期轨迹」热力图区块
    │       │   └── section.tg-sundial-context-block.tg-sundial-month   ← 「本月位置」日历区块
    │       ├── section.tg-sundial-now-zone
    │       │   ├── .tg-sundial-dial-panel   ← 「此刻」半圆拨盘 + 16:50:19 数字钟 + 摘要
    │       │   └── section.tg-timer-panel   ← 「开始计时」面板
    │       └── section.tg-sundial-activity  ← 「今日去向」活动列表
    └── .tg-view-pane.tg-task-view     ← 任务视图面板；.is-active 时 display:block
        │                                container: tg-task-view / inline-size
        └── .tg-task-panel             ← 任务视图内容顶层
            │                           max-width:760px; margin-inline:auto;
            │                           padding: 2px 0 18px; overflow: visible
            ├── .tg-task-center-header ← 【任务视图固定区（本次新增 sticky）】现状 position:relative
            │   ├── .tg-task-center-heading
            │   │   ├── .tg-task-center-title-box
            │   │   │   ├── h2.tg-task-center-title        ← 「任务中心」
            │   │   │   └── .tg-task-center-subtitle       ← 「聚焦现在，轻松安排接下来」
            │   │   └── .tg-task-center-actions
            │   │       ├── button.tg-task-icon-button     ← ＋（plus 图标，aria-label 新建任务）
            │   │       └── button.tg-task-icon-button     ← ↻（refresh-cw 图标；is-spinning 时旋转）
            │   ├── .tg-task-stats                         ← 统计卡 grid（默认 2 列 gap 7px）
            │   │   ├── .tg-task-stat.is-total             ← 总任务（icon list-checks）
            │   │   ├── .tg-task-stat.is-overdue           ← 逾期（icon circle-alert，红色 tone）
            │   │   ├── .tg-task-stat.is-today             ← 今天（icon sun，紫色 tone）
            │   │   └── .tg-task-stat.is-active            ← 活跃（icon activity，绿色 tone）
            │   │       每张卡内部：span.tg-task-stat-icon + .tg-task-stat-text
            │   │                   （> span.tg-task-stat-value + span.tg-task-stat-label）
            │   └── .tg-task-controls                      ← flex column, gap:7px
            │       ├── .tg-task-search                    ← 相对定位容器
            │       │   ├── span.tg-task-search-icon       ← 绝对定位 left:10px，14×14 放大镜
            │       │   └── input.tg-task-search-input     ← placeholder「搜索任务、标签或文件…」
            │       └── .tg-task-filter-buttons            ← flex, gap:5px
            │           └── button.tg-task-filter-button   ← 「筛选」sliders-horizontal 图标
            │                                             （有筛选条件时其后还有 .tg-task-filter-reset「清除」）
            │                                             （激活态 .is-active：accent 描边 + 13% accent 填充）
            ├── .tg-task-timer-strip                       ← 可选计时条（DOM 上插在 header 之后）→ 滚动内容
            ├── .tg-routine-area                           ← 每日流程区（flex column, gap:5px）
            │   └── .tg-routine-group                      ← 流程分组卡（紫色微染描边）
            │       ├── .tg-routine-header
            │       │   ├── button.tg-routine-summary      ← ↻图标 + 标题 + 副标题 + 「2 / 3」进度 + chevron
            │       │   └── button.tg-routine-group-menu   ← settings-2 图标
            │       └── .tg-routine-items > .tg-task-row…  ← 流程任务行
            └── .tg-task-section.tg-task-section-{overdue|today|unsorted|goal|future|done}
                ├── button.tg-task-section-heading         ← 区块标题卡（42px 高，可折叠）
                │   ├── span.tg-task-section-heading-main  ← 区块图标(26×26圆角块) + 标题 + 副标题
                │   └── span.tg-task-section-heading-meta  ← 计数胶囊 + chevron
                └── .tg-task-list > .tg-task-row…          ← 任务行卡（左侧色条 + checkbox + 标题 + 状态徽章）
```

**固定区归属速查：**

| 节点 | 角色 |
|---|---|
| `.tg-container` | 唯一滚动容器（scroll listener 挂这里，passive） |
| `.tg-view-header` | 时间视图固定区（已 sticky，需补 `.is-scrolled` 分隔线） |
| `.tg-task-center-header` | 任务视图固定区（**本次改造核心**：relative → sticky） |
| `.tg-task-timer-strip` 及以下 | 滚动内容 |

# 附录 B：真实设计 token 表

> 左列是插件/Obsidian 中真实存在的变量名，中列是 CSS 中的**字面定义**（从 `src/styles/main.css` 原样摘录）。演示页脱离 Obsidian 运行时无法解析 Obsidian 原生变量，因此必须在演示页 `:root` 上**先定义 Obsidian 基础变量，再原样照抄 `--tg-*` 定义链**，不得改动任何数值。
> 观察基准是**暗色主题**（4 张截图均为暗色）。

## B1. Obsidian 基础变量（演示页需自行定义，值为 Obsidian 默认主题近似取样，深浅两套）

| 变量 | 暗色值 | 浅色值 | 用途 |
|---|---|---|---|
| `--background-primary` | `#1e1e1e` | `#ffffff` | 卡片/面板底色 |
| `--background-secondary` | `#161616` | `#f6f6f6` | 视图底色（比 primary 更深） |
| `--background-modifier-border` | `#2e2e2e` | `#e0e0e0` | 描边 |
| `--background-modifier-hover` | `rgba(255,255,255,0.055)` | `rgba(0,0,0,0.055)` | hover 面 |
| `--text-normal` | `#dadada` | `#222222` | 主文字 |
| `--text-muted` | `#999999` | `#808080` | 次文字 |
| `--text-faint` | `#666666` | `#b3b3b3` | 弱文字（副标题） |
| `--text-error` | `#e75545` | `#e75545` | 逾期红 |
| `--interactive-accent` | `#7d5bd8`（按截图取样；Obsidian 版本/用户主题可能为 `#8a5cf6`） | 同左 | accent 紫 |
| `--color-green` | `#46c94f` | `#0fb20f` | 完成/活跃绿 |
| `--color-yellow` | `#e0ac00` | `#b98a00` | 待分类黄 |
| `--color-purple` | `#a882ff` | `#7c3aed` | 长期紫 |
| `--color-blue` | `#086ddd` | `#0084ff` | 未来蓝 |
| `--font-interface` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif`（系统栈，**禁止**外部字体） | 同左 | 全部文字 |

> 上表字面值是近似取样，允许 ±10% 内微调以贴近截图；但**结构性的 color-mix 混合比例（下表）必须一字不差**。若运行环境能打开真实 Obsidian 取值，以实测为准。

## B2. `--tg-*` token 定义链（原样照抄，混合比例不得改动）

```css
.tg-container {
	--tg-surface-app: var(--background-secondary);            /* 视图底 */
	--tg-surface-panel: var(--background-primary);            /* 卡片底 */
	--tg-surface-sunken: color-mix(in srgb, var(--background-secondary) 78%, var(--background-primary)); /* 切换器槽底 */
	--tg-surface-hover: var(--background-modifier-hover);
	--tg-border-default: var(--background-modifier-border);
	--tg-border-subtle: color-mix(in srgb, var(--background-modifier-border) 74%, transparent);
	--tg-text-primary: var(--text-normal);
	--tg-text-muted: var(--text-muted);
	--tg-text-faint: var(--text-faint);
	--tg-bg: var(--tg-surface-app);
	--tg-panel-bg: var(--tg-surface-panel);
	--tg-text: var(--tg-text-primary);
	--tg-muted: var(--tg-text-muted);
	--tg-border: var(--tg-border-default);
	--tg-accent: var(--interactive-accent);
	--tg-accent-strong: color-mix(in srgb, var(--interactive-accent) 72%, white);
	--tg-today-ring: color-mix(in srgb, #ffd166 86%, var(--text-normal));   /* 日历「今天」金描边（截图1/3可见） */

	--tg-text-xs: 11px;
	--tg-text-sm: 12px;
	--tg-text-base: 13px;
	--tg-text-lg: 16px;
	--tg-radius-sm: 4px;
	--tg-radius-md: 8px;
	--tg-radius-pill: 999px;
	--tg-panel-radius: 8px;
	--tg-module-padding: 16px;
	--tg-gap: 12px;
	--tg-heatmap-cell-size: 10px;
	--tg-heatmap-gap: 3px;
	--tg-shadow-menu: 0 4px 16px color-mix(in srgb, var(--background-modifier-box-shadow) 30%, transparent);
	--tg-shadow-tooltip: 0 8px 24px color-mix(in srgb, var(--background-modifier-box-shadow) 34%, transparent);
}
```

任务面板局部 token（挂在 `.tg-task-panel` 上）：

```css
.tg-task-panel {
	--tg-task-radius-sm: var(--tg-radius-sm);   /* 4px */
	--tg-task-radius: var(--tg-radius-md);      /* 8px */
	--tg-task-radius-lg: 10px;
	--tg-task-space-1: 4px;
	--tg-task-space-2: 8px;
	--tg-task-space-3: 12px;
	--tg-task-space-4: 16px;
	--tg-task-card: var(--tg-surface-panel);    /* 卡片底色 */
	--tg-task-soft-border: var(--tg-border-subtle);
	--tg-task-overdue: var(--tg-status-overdue);    /* → --text-error */
	--tg-task-today: var(--tg-status-today);        /* → --interactive-accent */
	--tg-task-unsorted: var(--tg-status-triage);    /* → --color-yellow */
	--tg-task-goal: var(--tg-status-longterm);      /* → --color-purple */
	--tg-task-future: var(--tg-status-future);      /* → --color-blue */
	--tg-task-done: var(--tg-status-done);          /* → --color-green */
	--tg-task-cancelled: var(--tg-status-cancelled);/* → --text-faint */
}
/* 暗色下 soft-border 用 --tg-border-subtle；浅色主题覆写为：
   color-mix(in srgb, var(--background-modifier-border) 88%, transparent) */
```

按钮体系 token（真实存在于 `.tg-container` 作用域）：

```css
.tg-container {
	--tg-btn-h: 36px;          /* 一级按钮高（切换器按钮同高） */
	--tg-btn-h-sm: 34px;
	--tg-btn-radius: 6px;      /* 图标按钮圆角 */
	--tg-btn-font: var(--tg-text-sm, 12px);
	--tg-btn-pad-x: 14px;
}
```

## B3. 关键组件的实测样式值（演示页必须一致）

| 组件 / 类名 | 关键值（真实源码） |
|---|---|
| 切换器槽 `.tg-view-switcher` | 2 列 grid；`width:min(760px,100%)`；`padding:3px`；圆角 8px；槽底 `--tg-surface-sunken`；边框 `1px solid color-mix(in srgb, var(--tg-border) 82%, transparent)` |
| 切换器按钮 `.tg-view-switcher-button` | 高 36px；`padding:0 12px`；`border:1.5px solid transparent`；圆角 6px；字 12px/600，色 `--tg-muted`；图标 14×14 |
| 切换器选中 `.is-active` | 边框 `--tg-accent`；背景 `color-mix(in srgb, var(--tg-accent) 17%, transparent)`；文字 `--tg-text` |
| 任务中心标题 `.tg-task-center-title` | `font-size:17px; line-height:1.3; font-weight:720; letter-spacing:-0.01em; color:var(--tg-text)` |
| 副标题 `.tg-task-center-subtitle` | `font-size:10.5px; line-height:1.4; color:var(--text-faint); margin-top:2px` |
| 图标按钮 `.tg-task-icon-button` | 30×30；圆角 6px；SVG 15×15；透明底，hover `--background-modifier-hover` |
| 统计 grid `.tg-task-stats` | `grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin-bottom:10px`；容器宽 ≥521px 时 4 列 |
| 统计卡 `.tg-task-stat` | `min-height:48px; padding:8px 9px; gap:8px;` 圆角 8px；边框 `--tg-task-soft-border`；底 `--tg-task-card` |
| 统计卡图标 `.tg-task-stat-icon` | 25×25；圆角 7px；SVG 13×13；tone 色 `color-mix(in srgb, <tone色> 12%, transparent)` 底 + tone 色图标（overdue 红 / today 紫 / active 绿 / total 用 `--text-muted` 10%） |
| 统计值 `.tg-task-stat-value` | `font-size:16px; font-weight:720; font-variant-numeric:tabular-nums; line-height:1.05` |
| 统计标签 `.tg-task-stat-label` | `font-size:11px; color:var(--tg-muted); margin-top:2px` |
| 搜索/筛选行 `.tg-task-controls` | `display:flex; flex-direction:column; gap:7px` |
| 搜索框 `.tg-task-search-input` | 高 36px；`padding:0 34px 0 32px`；圆角 8px；边框 `--tg-task-soft-border`；底 `--tg-task-card`；字 12px；放大镜图标绝对定位 `left:10px` 14×14；focus：边框 `color-mix(in srgb, var(--interactive-accent) 62%, var(--tg-task-soft-border))` + `box-shadow:0 0 0 2px color-mix(in srgb, var(--interactive-accent) 13%, transparent)` |
| 筛选按钮 `.tg-task-filter-button` | 高 30px；`padding:0 8px; gap:5px`；圆角 8px；字 12px；描边 ghost：`border:1px solid var(--tg-border-default); background:transparent; color:var(--tg-text-muted)`；`.is-active`/hover：accent 边 + `color-mix(in srgb, var(--tg-accent) 13%, transparent)` 底 |
| 计时条 `.tg-task-timer-strip` | 4 列 grid `10px minmax(0,1fr) auto auto`；`padding:9px 10px; margin:-5px 0 15px`；圆角 8px；带描边 |
| 流程分组卡 `.tg-routine-group` | 圆角 8px；边框 `color-mix(in srgb, var(--tg-task-today) 32%, var(--tg-task-soft-border))`（紫色微染）；底 `color-mix(in srgb, var(--tg-task-today) 5%, var(--tg-task-card))` |
| 区块标题卡 `.tg-task-section-heading` | `min-height:42px; padding:7px 9px; margin:0 0 7px;` 圆角 8px；边框 `--tg-task-soft-border`；底 `--tg-task-card`；区块图标块 26×26 圆角 8px（tone 色 12% 底）；标题 12px/680；副标题 9px faint；计数胶囊圆角 999px、9px/650 |
| 任务行 `.tg-task-row` | `padding:10px 12px;` 圆角 8px；边框 `--tg-task-soft-border`；底 `--tg-task-card`；左侧 3px tone 色条（`::before`） |
| 区块间距 | `.tg-task-section + .tg-task-section { margin-top: 9px }`；`.tg-routine-area { gap:5px; margin-bottom:9px }` |

**声明：以上任何数值不得即兴修改。演示页的 `--tg-*` 定义链直接复制 B2 代码块，组件值直接对照 B3 表格。**

# 附录 C：真实截图（视觉验收唯一基准）

运行环境（macOS 本机）可直接读取以下绝对路径。**动手前必须逐张查看**，并以此校准颜色、间距、字号、图标形状：

1. **时间视图 · 顶部（未滚动）**
   `/Users/aaron/.cursor/projects/Users-aaron-Obsidian-Proj-TimeGrid/assets/Screenshot_2026-09-05_at_16.50.19-bb0a03f6-37fd-4420-948e-1ddda5a0b763.png`
   看点：切换器选中态（时间）、热力图网格、日历「5」金色描边、半圆拨盘与 `16:50:19` 数字钟、开始计时面板输入框与「▶ 开始」按钮。

2. **任务视图 · 顶部（未滚动）**
   `/Users/aaron/.cursor/projects/Users-aaron-Obsidian-Proj-TimeGrid/assets/Screenshot_2026-09-05_at_16.50.28-46d9bf79-4656-4648-bdc8-5893b3a84172.png`
   看点：「任务中心」标题 + ＋/↻ 按钮、2×2 统计卡（342/20/8/147 与四个 tone 色）、搜索框、筛选按钮、每日流程分组卡（紫色描边、`2 / 3` 进度、绿色「完成」徽章、紫色左色条的任务行）。

3. **时间视图 · 滚动中**
   `/Users/aaron/.cursor/projects/Users-aaron-Obsidian-Proj-TimeGrid/assets/Screenshot_2026-09-05_at_17.04.39-3ccd505f-b3cd-4166-b967-c99814ef4ae0.png`
   看点：切换器固定不动、内容从其下方滚过（热力图被顶部裁切）——演示页需复刻同款行为并加分隔线。

4. **任务视图 · 滚动中（现状问题现场）**
   `/Users/aaron/.cursor/projects/Users-aaron-Obsidian-Proj-TimeGrid/assets/Screenshot_2026-09-05_at_17.04.48-719b7475-184f-4913-8604-3872cbda75b6.png`
   看点：任务中心标题/统计卡已被滚出视口，仅剩筛选按钮可见——这正是本次改造要消除的状态（改造后标题+统计+搜索+筛选应全部固定）。

> 交付前自检方法：把你的演示页截图与上述 4 张逐一并排对比，差异超过"滚动行为本身"即视为不合格。

---

## 与旧版需求描述的差异声明（避免被旧描述误导）

1. 旧描述称"切换器悬浮且背景半透明穿模"——实际 `.tg-view-header` 已 sticky 且背景不透明；时间视图工作量只剩分隔线与细节校准。
2. 旧描述要求"滚动容器必须是固定区的兄弟节点"——实际唯一滚动容器就是视图根 `.tg-container`，固定区就在其滚动流内，**无需任何 DOM 重排**。
3. 旧描述称统计卡恒为 2×2——实际 ≥521px 容器宽时为 4 列一行（容器查询驱动）。
4. 旧描述建议用媒体断点做三端适配——实际插件用**容器查询**（侧栏宽度≠视口宽度），演示页应对齐这一体系。
5. 筛选按钮确为常驻描边（ghost）样式，与旧描述一致。
