# TimeGrid CLI (`tg`)

在 Obsidian 之外查看 TimeGrid 任务的命令行工具。读取同一个 vault，复用 TimeGrid 插件的 task 解析器，**不写任何 vault 文件**（只把 HTML 输出到 `$TMPDIR`），所以不会影响你的 Obsidian 数据。

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

# 元信息：vault 路径、扫描统计、耗时
npm run where

# 仅过期
npm run overdue

# 未来 N 天（默认 7）
npm run upcoming           # 7 天
npm run upcoming -- 14     # 14 天

# 搜任务描述
npm run search -- 写RP
```

`html` 子命令输出 `$TMPDIR/timegrid-today.html`（macOS 通常是 `/var/folders/.../T/`），stdout 打印文件路径，方便 Shortcut 的「Show Web View」动作直接拿来用。HTML 自包含，零外部依赖，**点任务直接跳 Obsidian 对应文件**。

所有命令都接受 vault 路径通过 `TG_VAULT` 环境变量覆盖：

```bash
TG_VAULT=/path/to/vault npm run today
```

否则按以下顺序找：

1. 环境变量 `TG_VAULT`
2. 当前目录或祖先目录（最多向上 8 层）里的 `.timegrid-vault`（TimeGrid 插件在用同一个）
3. `~/.timegrid-vault`
4. macOS `~/Library/Application Support/obsidian/obsidian.json` 里唯一打开的 vault

## 输出长什么样

### `npm run today`（终端纯文本）

```
2026-09-08  ·  161 文件  ·  409 任务  ·  0.04s

今日 (5)
────────────────────────────────────
   [ ] 分析RP 如何写  09-08
   [ ] 写RP  09-08

逾期 (9)
────────────────────────────────────
P1 [ ] 给妈妈写论文  02-28
P2 [ ] 心理治疗相关的书籍  03-11
```

每行格式：`P? [ ] 描述  MM-DD`。无优先级的任务不显示 P 标签。

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
   - 加 `Show Web View` 动作，URL 填 `Run Shell Script` 的输出
2. 要拿当前输出路径：在 `Run Shell Script` 的 `Input` 设成 `Output`，下一个动作能引用它（不要写死 `/tmp/timegrid-today.html`，那个路径不稳定）

**最简方案（推荐）**：把 `Run Shell Script` 的输出作为 `Show Web View` 的 URL。

## 文件清单

```
tools/timegrid-cli/
├── package.json          # npm scripts + devDeps
├── tsconfig.json         # 类型检查 + @timegrid/* 路径别名
├── build.mjs             # esbuild 打包（用根目录的 esbuild），输出 dist/tg.mjs
├── README.md             # 本文件
├── .gitignore            # 忽略 node_modules/ 和 dist/
└── src/
    ├── index.ts          # 入口，子命令路由
    ├── vault.ts          # 找 vault 路径
    ├── parser.ts         # 扫 vault + 复用 taskParser
    ├── classify.ts       # 今日 / 逾期分类与排序
    ├── layout.ts         # 纯文本单列布局（TTY 下带 ANSI 颜色）
    ├── html.ts           # HTML 渲染（带 P1-P5 颜色 + 可点击）
    ├── writer.ts         # 原子写 HTML 到 $TMPDIR
    └── obsidian.ts       # obsidian:// URL 构造器
```

## 布局与解析

- **布局**：单列纵向堆叠（今日 / 逾期两个 section），适合 Shortcuts 的窄弹窗。宽度取 `process.stdout.columns`，小于 40 或拿不到时回退到 36。
- **颜色**：只在 `process.stdout.isTTY` 为真时输出 ANSI；管道 / Shortcuts 里自动是纯文本。
- **分类**：今日列取 `section === 'today'` 的全部未完成任务；逾期列只取 `section === 'overdue'` 且**带优先级**的任务（逾期太多时只看重要的）。
- **排序**（与插件任务面板一致）：先按优先级降序；同优先级内，今日/未来按到期日**升序**（最快到期的在前），逾期按到期日**降序**（最近逾期的在前）。`tg overdue`、`tg upcoming` 同样套用这套排序。
- **解析**：CLI 直接 import 父目录的 [`src/utils/taskParser.ts`](../../src/utils/taskParser.ts)，由 `tsconfig.json` 的 `paths` 和 `build.mjs` 的 `alias` 双重映射到 `@timegrid/task-core`。改插件的解析器，CLI 自动同步，零拷贝、零 drift。

## 已知限制

- 跳过 `>` blockquote 包裹的任务（callout 内的 `- [ ]`），插件会处理但 CLI 不展开
- 跳过带 blocking 诊断的任务行（未知状态、重复字段等），插件里这些任务显示为只读
- 不监听文件变化，每次运行都重新扫一遍（通常 0.05s 内）
- 不真正调起 `obsidian://` URL（只在 `where` 里打印示例）
- 不做实时刷新 / FSEvents
