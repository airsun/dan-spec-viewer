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

### 1) 安装到 PATH（推荐）

```bash
npm link
```

安装后可直接使用 `spec-readr` 命令。

### 2) 在当前目录一键启动并 link

```bash
spec-readr up
```

行为：

- 当前目录自动 link 到 workspace registry
- 若本机已有 spec-readr web 进程在运行：跳过 serve，直接复用
- 若未运行：自动启动 web 并输出访问地址

### 3) 在另一个目录继续 link（不冲突）

```bash
cd /another/openspec/workspace
spec-readr up
```

第二次执行会复用已运行服务，只做 link + refresh。

可选：手动打开 `http://127.0.0.1:4173`

目录要求：目标路径下存在 `openspec/`。

### 4) Web 内继续操作（推荐）

进入页面后，日常操作集中在右上角的 **Sync Center 弹出层**：

- `添加并刷新`：绑定新 workspace 并立即索引
- `刷新当前`：只刷新选中的 workspace
- `刷新全部`：刷新所有已绑定 workspace
- 右上角状态会显示 `空闲 / 同步中 / 成功 / 失败` 与最近摘要

## 安装与构建

### 环境要求

- Node.js 18+（建议 20+）
- npm 8+

### 安装方式怎么选

| 场景 | 命令 | 说明 |
|---|---|---|
| 本地开发、边改边试 | `npm link` | 全局命令通过软链接指向当前源码目录；改代码后命令行为会立即变化。 |
| 脱离工程目录直接使用 | `npm i -g git+ssh://git@github.com/airsun/dan-spec-viewer.git` | 不需要本地保留仓库目录，适合普通使用者。 |
| 内网/离线发包 | `npm pack` + `npm i -g *.tgz` | 用制品分发，避免目标机直连 Git 仓库。 |

`npm link` 本质是“全局软链接”，不是独立安装包；如果你希望命令与本地工程目录解耦，请优先使用 Git 安装或 `tgz` 包安装。

### 方式 A：开发态安装到 PATH（推荐）

在仓库根目录执行：

```bash
npm link
```

这会把当前源码链接为可执行命令，适合边改边用。

### 方式 B：全局安装（非 link）

在仓库根目录执行：

```bash
npm i -g .
```

适合固定版本使用，不依赖软链接。

### 方式 C：脱离工程目录安装（推荐给使用者）

如果不希望在本地保留工程目录，可以直接从 Git 安装：

```bash
npm i -g git+ssh://git@github.com/airsun/dan-spec-viewer.git
```

或从 techlab 安装：

```bash
npm i -g git+ssh://git@git.tech.skytech.io/infra/spec-viewer.git
```

### 方式 D：离线/内网包安装

先在有仓库访问权限的环境打包：

```bash
npm pack
```

再在目标机器安装 `*.tgz`：

```bash
npm i -g ./dan-spec-readr-<version>.tgz
```

### 方式 E：不安装，直接运行

```bash
node ./src/cli.js up
node ./src/cli.js web
```

### 验证是否安装成功

```bash
spec-readr --help
```

### 更新后是否需要重新执行 `npm link`

分两种情况：

- **你是 `npm link` 开发态安装**：通常不需要重跑。`spec-readr` 会直接指向当前源码目录，代码改动会立即生效。
- **你是全局安装（`npm i -g ...`）**：需要重新执行安装命令来升级版本。

建议仅在以下情况重新执行 `npm link`：

- 首次安装或你执行过 `npm unlink -g spec-readr`
- `package.json` 的 `name/bin` 配置发生变化
- 你切换到另一个仓库目录，希望命令改为指向新目录

### 卸载

```bash
npm unlink -g spec-readr
```

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
# 一键：link 当前目录，必要时启动 web
spec-readr up [path] [--label <name>] [--port <number>]

# 仅启动 web（前台）
spec-readr web [--port 4173]

# 停止已记录的 web 进程
spec-readr down

# 只做 link/unlink/list/refresh
spec-readr link [path] [--label <name>]
spec-readr unlink <id|path>
spec-readr ls
spec-readr status
spec-readr refresh --all
spec-readr refresh <workspace-id>
spec-readr clear [--with-stop]

# 兼容别名
specreadr ...
readr ...
```

兼容旧命令仍可用（`workspace add/rm/ls`, `rescan`, `serve`）。

## 启动脚本

提供快捷脚本：

```bash
./scripts/spec-readr-web.sh
```

脚本优先调用 PATH 中的 `spec-readr web`，找不到时回退到 `node ./src/cli.js web`。

## Web 使用方式

### 左栏：Navigation

- `工作区检索`：支持输入名称/路径进行模糊检索，并在下拉中快速切换目标 workspace
- `Spec Cards`：按 Change 队列进入审阅（默认）
- `File Browser`：按文件路径直接浏览

### Sync Center（主操作区）

- 位置：Topbar 右上角（局部弹出层）
- `添加并刷新`：输入 workspace 路径（可选 label）后一次完成 bind + refresh
- `刷新当前`：针对当前下拉选中的 workspace 做增量同步
- `刷新全部`：全量同步所有已绑定 workspace
- 同步状态在右上角常驻显示结果摘要（变更数、能力数、文件数等）

### 低频操作（工作区选择右侧“操作”菜单）

- `解绑当前工作区`：取消当前 workspace link
- `清空所有工作区`：清空全部 linked workspaces
- `停止服务`：停止当前 spec-readr web 进程
- 页面会显示服务状态（running/stopped）

### 中栏：Review Reader

- `串读`：按 Change Pack 顺序阅读（proposal → design → tasks → spec）
- `并排`：并排对照两个 artifact

### 右栏：Capability Lens

- 当前 Change 的 impacted capabilities
- capability/change 的时间线事件（同步、变更新增/更新等）
- 跨 workspace 的 capability 全局概览

## 数据与状态

默认数据目录：`~/.spec-readr/`

- `workspaces.json`：workspace 绑定状态
- `index-cache.json`：最近一次索引缓存
- `runtime.json`：当前 web 进程信息（pid/port）

可通过环境变量覆盖：

```bash
SPEC_READR_DATA_DIR=/custom/path spec-readr up
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
