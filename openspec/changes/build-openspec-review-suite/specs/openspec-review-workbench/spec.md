## ADDED Requirements

### Requirement: Dual Navigation Modes
The web navigation pane SHALL support both File Browser mode and Spec Card mode for each bound workspace.

#### Scenario: Switch from file browser to spec card mode
- **WHEN** the user changes navigation mode in the workspace panel
- **THEN** the system MUST render the same workspace content using the selected mode without leaving the current workspace context.

### Requirement: Change-first Review Queue
The web application SHALL provide a Change-first review queue as the default entry, prioritizing items that require timely review.

#### Scenario: Open workspace with active changes
- **WHEN** the selected workspace contains one or more active changes
- **THEN** the system MUST default to the Change-centric queue view rather than raw file tree view.

### Requirement: Relationship-aware Reading
The reading area SHALL provide Change Pack preview that presents proposal, design, tasks, and specs as a coherent set.

#### Scenario: Open a change pack
- **WHEN** the user opens a change in review mode
- **THEN** the system MUST allow sequential reading across proposal, design, tasks, and related spec files.

### Requirement: Side-by-side Comparison
The reading area SHALL support parallel preview of two artifacts in one workspace context.

#### Scenario: Compare design and tasks
- **WHEN** the user selects compare view and chooses `design.md` and `tasks.md`
- **THEN** the system MUST render both artifacts simultaneously and preserve artifact identity in each pane.

### Requirement: Unified Sync Center
The web application SHALL provide a unified sync center that combines workspace binding and index refresh actions.

#### Scenario: Bind and refresh in one flow
- **WHEN** the user submits a workspace path from sync center
- **THEN** the system MUST perform bind and refresh in a unified interaction and present a single status result.

#### Scenario: Refresh existing workspaces
- **WHEN** the user triggers refresh from sync center
- **THEN** the system MUST show in-progress status and completion summary without forcing a full page reload.

### Requirement: Localized and Branded UI
The web application SHALL support Chinese-first UI labels and optional custom logo branding.

#### Scenario: Render Chinese UI
- **WHEN** the application loads in default locale
- **THEN** primary navigation, actions, statuses, and helper texts MUST render in Chinese.

#### Scenario: Render custom logo if provided
- **WHEN** a logo asset is present in the configured public path
- **THEN** the header MUST prefer that logo and gracefully fall back to text branding if the logo is absent.

### Requirement: Workspace-first and Global-sync Interaction Zoning
The workbench SHALL separate workspace-scoped actions from global sync actions by interaction location and emphasis.

#### Scenario: Refresh current workspace from workspace selector area
- **WHEN** the user is operating within the workspace selector control
- **THEN** the system MUST provide a direct current-workspace refresh action in that same local area.

#### Scenario: Keep global actions in sync center
- **WHEN** the user opens sync center
- **THEN** the system MUST present global actions (`bind workspace`, `refresh all`, `unbind all`) in that center and avoid duplicating `unbind all` in local workspace controls.

#### Scenario: De-emphasize sync center entry
- **WHEN** sync center is displayed in topbar
- **THEN** the entry SHOULD use compact icon-first affordance and concise labeling to reduce primary visual weight.

### Requirement: Icon-guided High-frequency Controls
The workbench SHALL support icon-guided controls for high-frequency operations while preserving textual clarity via labels or tooltips.

#### Scenario: Show compact icon controls for workspace actions
- **WHEN** the workspace selector is visible
- **THEN** the system MUST provide intuitive icon buttons for frequent actions such as refresh-current and local action menu access.
