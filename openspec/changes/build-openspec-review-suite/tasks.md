## 1. Workspace Registry (CLI + State)

- [x] 1.1 Define workspace registry storage model and persistence format.
- [x] 1.2 Implement CLI commands for workspace bind, unbind, and list.
- [x] 1.3 Implement workspace validation and error status reporting for unreadable paths.

## 2. OpenSpec Discovery and Indexing

- [x] 2.1 Implement OpenSpec artifact discovery for each bound workspace.
- [x] 2.2 Build normalized index model for changes, artifacts, and capabilities.
- [x] 2.3 Add explicit refresh/rescan flow and expose last scan state.

## 3. Review Workbench UI

- [x] 3.1 Implement dual navigation modes: file browser mode and spec card mode.
- [x] 3.2 Implement Change-first default review queue for active changes.
- [x] 3.3 Implement Change Pack reading flow for proposal, design, tasks, and spec artifacts.
- [x] 3.4 Implement side-by-side artifact comparison view.

## 4. Capability Lens

- [x] 4.1 Implement persistent capability lens panel in review layout.
- [x] 4.2 Implement capability-to-spec jump within current workspace context.
- [x] 4.3 Implement cross-workspace capability overview grouped by workspace.

## 5. Verification

- [x] 5.1 Validate no-edit constraint: all views are read-only.
- [x] 5.2 Validate navigation and reading behavior against spec scenarios.
- [x] 5.3 Perform end-to-end review flow checks for at least one multi-workspace setup.
