# TimeGrid CLI (`tg`)

在 Obsidian 之外查看 TimeGrid 任务的命令行工具。读取同一个 vault，复用 TimeGrid 插件的 task 解析器，**只读不写**，所以不会影响你的 Obsidian 数据。

## 装

```bash
cd tools/timegrid-cli
npm install
```

只装一次。`tsc` 借根目录的；运行时只用一个 esbuild 打的 bundle（`dist/tg.mjs`）。

## 用

```bash
# 终端：今日 + 逾期（纯文本，ANSI 颜色在真终端里生效）
npm run today

# Shortcuts 用：写到 $TMPDIR/timegrid-today.html
npm run html

# 元信息
npm run where

# 仅过期
npm run overdue

# 未来 N 天（默认 7）
npm run upcoming           # 7 天
npm run upcoming -- 14     # 14 天

# 搜
npm run search -- 写RP
```

`html` 子命令输出 `$TMPDIR/timegrid-today.html`（macOS 通常是 `/var/folders/.../T/`），stdout 打印文件路径，方便 Shortcut 的「Show Web View」动作直接拿来用。HTML 自包含，零外部依赖，**点任务直接跳 Obsidian 对应文件**。

所有命令都接受 vault 路径通过 `TG_VAULT` 环境变量覆盖：

```bash
TG_VAULT=/path/to/vault npm run today
```

否则按以下顺序找：
1. 当前目录或父目录里的 `.timegrid-vault`（TimeGrid 插件在用同一个）
2. `~/.timegrid-vault`
3. macOS Obsidian 的 `obsidian.json` 里唯一打开的 vault

## 输出长什么样

### `npm run today`（终端纯文本）

```
2026-09-08  ·  161 文件  ·  409 任务  ·  0.04s

今日 (5)
────────────────────────────────────
   [ ] 分析RP 如何写  09-08
   [ ] 写RP  09-08
   [ ] 整理 套瓷  09-08
   [ ] 发送邮件 套瓷 附RP  09-08
   [ ] 记录每周或者每月或每年定时花出去的钱  09-08

逾期 (9)
────────────────────────────────────
P1 [ ] 给妈妈写论文  02-28
P2 [ ] 心理治疗相关的书籍  03-11
P2 [ ] 所有的新闻都行业趋势的整理  03-11
P2 [ ] 如何合理的消耗每个月的 flowith o…  08-02
P2 [ ] 东航整理资料  09-02
P2 [ ] 鼠鼠滑梯  09-02
P3 [ ] 瑞记，能否直接在付款之后就弹出一个记账，直…  08-21
P3 [ ] 整理action6照片  09-02
P4 [ ] 多模型讨论分工解决问题是怎么做到的？  09-05
```

### `npm run html`（输出到 `$TMPDIR/timegrid-today.html`）

HTML 自包含（CSS 内联、零外部依赖），Shortcuts 用「Show Web View」打开。视觉上：
- 深色 / 浅色主题跟随系统设置
- P1 红 / P2 黄 / P3 青 / P4 灰 / P5 暗灰
- 每个任务可点击，**直接跳 Obsidian 对应文件**
- 描述过长 ellipsis 截断，hover 高亮

## 用 macOS Shortcuts 显示 HTML

1. Shortcut 编辑器里：
   - `Run Shell Script` 命令改成 `npm run html`（或者用绝对路径的 `node dist/tg.mjs html`）
   - 删掉 `Show Output` 动作
   - 加 `Show Web View` 动作，URL 填：`file://<输出路径>`
2. 要拿当前输出路径：在 `Run Shell Script` 的 `Input` 设成 `Output`，下一个动作能引用（或者写死路径，简单起见直接 `file:///tmp/timegrid-today.html` 不可靠，应该用上一个动作的输出）

**最简方案（推荐）**：把 `Run Shell Script` 的输出作为 `Show Web View` 的 URL。

## 文件清单

```
tools/timegrid-cli/
├── package.json          npm scripts + devDeps
├── tsconfig.json         别名 + 类型检查
├── build.mjs             esbuild 打包（用根目录的 esbuild）
├── README.md             本文件
├── .gitignore            忽略 node_modules/ 和 dist/
└── src/
    ├── index.ts          入口，子命令路由
    ├── vault.ts          找 vault 路径
    ├── parser.ts         扫 vault + 复用 taskParser
    ├── classify.ts       今日 / 逾期 分类
    ├── layout.ts         纯文本两列布局
    ├── html.ts           HTML 渲染（带 P1-P5 颜色 + 可点击）
    ├── writer.ts         原子写 HTML 文件
    └── obsidian.ts       obsidian:// URL 构造器
```
│⏫ ☐ 心理治疗相关的书籍  📅03-11│                                                 │
│🔼 ☐ 瑞记，能否直接在付款之后就弹出一个记账，直接选择记账的类型，分单人是谁？  📅08-21│                                                 │
│🔼 ☐ 整理action6照片  📅09-02│                                                 │
│🔽 ☐ 多模型讨论分工解决问题是怎么做到的？  📅09-05│                                                 │
│☐ 调酒师证  📅07-24│                                                 │
│☐ 滑雪🎿  📅03-15│                                                 │
│☐ 健身教练证  📅07-24│                                                 │
│☐ 经济学书籍  📅07-24│                                                 │
│☐ 潜水计划  📅03-15│                                                 │
│☐ 人文类书籍  📅07-24│                                                 │
│☐ 社会学书籍  📅07-24│                                                 │
│☐ 营养师资格证  📅07-24│                                                 │
│☐ 发送邮件 套瓷 附RP  📅09-08│                                                 │
│☐ 分析RP 如何写  📅09-08│                                                 │
│☐ 记录每周或者每月或每年定时花出去的钱  📅09-08│                                                 │
│☐ 写RP  📅09-08│                                                 │
│☐ 整理 套瓷  📅09-08│                                                 │
└─────────────────────────────────────────────────┴─────────────────────────────────────────────────┘

  扫了 161 个 .md  ·  共 409 条任务  ·  0.0s
```

## 布局规则

- **左列（今日）**：`section === 'today' || 'overdue'` 的非 done 任务，按优先级 → 到期日 → 描述排序
- **右列（🔺 未完成）**：`section === 'future' || 'overdue'` 且**带优先级**的任务，按优先级 → 到期日排序
- 优先级 emoji：`🔺` highest / `⏫` high / `🔼` medium / `🔽` low / `⏬` lowest
- 长描述自动截断 + ellipsis

## 改布局

**所有视觉相关都在 [`src/layout.ts`](src/layout.ts) 一个文件里**。改完 `npm run today` 立刻看到效果。

要改的事举例：
- 列宽（`MIN_COL_WIDTH` / `DEFAULT_COL_WIDTH` / `MAX_COL_WIDTH`）
- 任务行格式（`renderTaskLine`）
- 排序（`src/classify.ts` 里的 `sortForToday` / `sortForUpcoming`）
- 加 ANSI 颜色（在 `renderTaskLine` 里给 `priorityPrefix` 包 ANSI 码）
- 加 `--json` 输出

## 改解析规则

**CLI 直接 import 父目录的 [`src/utils/taskParser.ts`](../../src/utils/taskParser.ts)**（通过 tsconfig 的 `paths` 别名）。所以你改 plugin 的 task 解析器，CLI 自动同步。零拷贝、零 drift。

## 文件清单

```
tools/timegrid-cli/
├── package.json          # npm scripts + devDeps
├── tsconfig.json         # 别名 + 类型检查
├── build.mjs             # esbuild 打包（用根目录的 esbuild）
├── README.md             # 本文件
├── .gitignore            # 忽略 node_modules/ 和 dist/
└── src/
    ├── index.ts          # 入口，子命令路由
    ├── vault.ts          # 找 vault 路径
    ├── parser.ts         # 扫 vault + 复用 taskParser
    ├── classify.ts       # 今日 / 未完成 分类
    ├── layout.ts         # 两列文本布局
    └── obsidian.ts       # obsidian:// URL 构造器（未实装跳转）
```

## 不影响 TimeGrid 插件

- CLI 在独立文件夹，**不触碰** `src/`、`package.json`、`tests/`、`install.sh`
- 只通过 `import { parseTaskLine } from '@timegrid/task-core'` 读 plugin 的解析器
- 根 `tsconfig.json` 加了 `"exclude": ["tools/**"]`，所以根 `npm run build` 不会扫到 CLI

## 已知限制（MVP）

- 跳过 `>` blockquote 包裹的任务（callout 内的 `- [ ]`），插件会处理但 CLI 第一版不展开
- 不监听文件变化，每次 `npm run today` 都重新扫一次（0.05s 已经够快）
- 不真正调起 `obsidian://` URL（`tg open` 子命令还没写）
- 不做实时刷新 / FSEvents
- 不带颜色（终端兼容性考虑；后续可在 `renderTaskLine` 加 ANSI）
