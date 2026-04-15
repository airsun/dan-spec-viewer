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

