# Dan Spec Readr

一个面向 OpenSpec 的只读审阅套件：`CLI` 负责绑定工作目录，`Web` 负责关系化预览 `proposal/design/tasks/spec`。

## 背景与理念

在 Claude Code 这类终端优先的工作环境中，编写与执行很高效，但对 Spec 的整体阅读体验并不总是友好，尤其当你需要同时理解：

- Change 的推进脉络（proposal → design → tasks → spec）
- Capability 的全局影响范围（跨 change、跨 workspace）
- 设计语言在多个文档中的一致性

Dan Spec Readr 的定位不是替代终端，而是作为终端工作流的阅读补位：

- 在终端里继续做生成、修改、执行；
- 在 Web 里做关系化审阅与并排对照；
- 让 OpenSpec 从“文件集合”变成“可阅读的设计语言”。

核心目标是帮助你跳出单文件和单窗口视角，用更低认知负担完成 Spec 阶段的推进与复核。

## 先看结论

- 这是一个 **Change-first** 的审阅工具，不是通用 Markdown 管理器。
- 目标是回答两件事：
  - 现在该审哪个 Change（推进视角）
  - 当前 Change 影响哪些 Capability（全局视角）
- 当前版本 **只读**，不支持在线编辑。

## 3 分钟上手

### 1) 启动 Web 服务

```bash
node ./src/cli.js serve --port 4173
```

打开：`http://127.0.0.1:4173`

### 2) 绑定一个 OpenSpec 工作目录

```bash
node ./src/cli.js workspace add /abs/path/to/your-workspace --label demo
```

目录要求：目标路径下存在 `openspec/`。

### 3) 触发一次索引刷新

```bash
node ./src/cli.js rescan --all
```

然后在 Web 页面中选择 workspace 开始阅读。

## 核心模型

```text
CLI (workspace registry)
        │
        ▼
OpenSpec scanner / indexer
        │
        ▼
Web review workbench
  ├─ Navigation: Spec Cards / File Browser
  ├─ Reader: Story / Compare
  └─ Capability Lens: impacted + global
```

- `Workspace`：被绑定的本地工作目录
- `Change Pack`：`proposal + design + tasks + specs/*/spec.md`
- `Capability Lens`：当前 Change 影响范围 + 跨 workspace 全局能力视图

## CLI 命令

```bash
# 绑定目录
node ./src/cli.js workspace add <path> [--label <name>]

# 解绑目录（按 id 或 path）
node ./src/cli.js workspace rm <id|path>

# 列出已绑定目录
node ./src/cli.js workspace ls

# 重扫索引
node ./src/cli.js rescan --all
node ./src/cli.js rescan <workspace-id>

# 启动 Web
node ./src/cli.js serve [--port 4173]
```

## Web 使用方式

### 左栏：Navigation

- `Spec Cards`：按 Change 队列进入审阅（默认）
- `File Browser`：按文件路径直接浏览

### 中栏：Review Reader

- `Story`：串读 Change Pack（proposal → design → tasks → spec）
- `Compare`：并排对照两个 artifact

### 右栏：Capability Lens

- 当前 Change 的 impacted capabilities
- 跨 workspace 的 capability 全局概览

## 数据与状态

默认数据目录：`./.dan-spec-readr/`

- `workspaces.json`：workspace 绑定状态
- `index-cache.json`：最近一次索引缓存

可通过环境变量覆盖：

```bash
READR_DATA_DIR=/custom/path node ./src/cli.js serve
```

## 只读边界

- 所有文档内容通过 `/api/file` 只读返回
- 前端不提供编辑入口
- 工具定位是审阅与对照，不负责写回 OpenSpec 文件

## 验证

运行端到端验证：

```bash
node ./scripts/verify.js
```

验证覆盖：

- 多 workspace 绑定与索引
- Review queue 行为
- 文件只读接口
- Web 侧 refresh / unbind 流程

## 与 OpenSpec 工作流配合

推荐流程：

1. 用 OpenSpec 生成/推进变更（`proposal/design/specs/tasks`）
2. 用 Dan Spec Readr 做 Change-first 审阅
3. 审阅完成后回到 OpenSpec 流程归档变更
