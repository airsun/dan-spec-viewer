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

## 6. UI Hierarchy Refinement (Read > Select > Control)

- [x] 6.1 De-emphasize low-frequency operations by moving `unbind` and `stop service` into a secondary workspace actions area.
- [x] 6.2 Reduce `Bind Workspace` interruption to the primary reading surface (later converged into Sync Center).
- [x] 6.3 Tighten typography and control sizing to reduce panel density while preserving readability.
- [x] 6.4 Increase prominence of high-frequency objects (`Change`, `Capability`, `File`) in navigation and reading flow.
- [x] 6.5 Verify new interaction flow keeps primary review actions within two steps.

## 7. Sync Center, Timeline, and Localization

- [x] 7.1 Replace separate bind area with unified Sync Center that combines bind + refresh actions.
- [x] 7.2 Add visible sync state feedback (idle/syncing/success/failed) and operation summary in UI.
- [x] 7.3 Persist and expose timeline events for bind/refresh/change/capability updates via API.
- [x] 7.4 Enrich change/capability cards with timeline-related metadata (recent updates and event summaries).
- [x] 7.5 Localize primary UI text to Chinese and add optional logo rendering with text fallback.
- [x] 7.6 Verify sync status flow, timeline rendering, and Chinese UI behavior end-to-end.

## 8. Capability Selection Consistency

- [x] 8.1 Introduce unified capability row component style for both navigation capability list and global capability overview.
- [x] 8.2 Add shared selected-capability state and synchronize active highlight across capability sections.
- [x] 8.3 Remove mixed bullet/list presentation in capability overview and align metadata placement for scanability.
- [x] 8.4 Verify capability click-through still jumps to related spec while preserving visible selected context.

## 9. Workspace/Sync Interaction Zoning

- [x] 9.1 Move current-workspace refresh into workspace selector local action area.
- [x] 9.2 Move `unbind all` from workspace local area into global sync center danger group.
- [x] 9.3 Reduce sync center entry prominence with compact icon-first affordance and concise label.
- [x] 9.4 Add icon-guided controls for high-frequency workspace actions (`refresh current`, `workspace actions`) with accessible tooltips.
- [x] 9.5 Verify interaction mapping: local actions operate on selected workspace only, global actions affect all bound workspaces.
