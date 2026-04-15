## Why

当前基于 OpenSpec 的阅读流程仍偏“文件导向”，难以在 spec 阶段持续、及时地推进审阅。需要一个以 Change 推进为主、同时保留 Capability 全局视角的阅读套件，帮助团队快速判断“现在该看什么”并高效完成审阅。

## What Changes

- 提供 CLI 命令在 Web 服务端维护多个 OpenSpec 工作目录的绑定/解绑/查询状态。
- Web 目录区支持两种浏览模式：文件浏览模式与 Spec 卡片模式，并可快速切换。
- Web 阅读区支持 Change Pack 预览（proposal、design、tasks、spec 关系化串读）与并排对照阅读。
- 默认以 Change 推进视角展示“待审阅项”，同时常驻 Capability 全局镜像面板。
- 当前版本仅提供只读预览，不支持在线编辑。

## Capabilities

### New Capabilities
- `workspace-registry`: 管理多工作目录绑定状态，并发现目录下 OpenSpec 相关文件。
- `openspec-review-workbench`: 面向 Change 推进的审阅工作台，提供模式切换与关系化阅读体验。
- `capability-lens`: 在推进审阅时持续提供 Capability 影响范围与全局视角。

### Modified Capabilities
- None.

## Impact

- 新增 CLI 子命令与状态存储（工作目录绑定信息）。
- 新增 Web 服务端目录扫描/索引逻辑（OpenSpec 文件关系解析）。
- 新增 Web 前端阅读工作台（目录模式、Change Pack、并排对照、Cap 全局镜）。
- 影响 OpenSpec 文件读取路径、目录可达性校验与索引刷新机制。
