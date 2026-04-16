## ADDED Requirements

### Requirement: Persistent Capability Lens
The web application SHALL provide a persistent capability lens alongside Change-focused reading.

#### Scenario: Read a change with impacted capabilities
- **WHEN** the user opens a change that references one or more capabilities
- **THEN** the system MUST show the impacted capability list without forcing navigation away from the reading view.

### Requirement: Capability-to-Artifact Jump
The capability lens SHALL support direct navigation from a capability item to related spec artifacts.

#### Scenario: Jump to impacted spec from capability lens
- **WHEN** the user selects a capability in the lens panel
- **THEN** the system MUST open the related spec artifact in the reading area.

### Requirement: Cross-workspace Capability Overview
The system SHALL provide a global capability overview for all currently bound workspaces.

#### Scenario: View capability overview across workspaces
- **WHEN** the user opens global capability view
- **THEN** the system MUST present capabilities grouped by workspace and show their latest related change context.

### Requirement: Capability and Change Timeline Visibility
The web application SHALL provide timeline views to show recent evolution of capabilities and changes.

#### Scenario: View capability timeline
- **WHEN** the user selects a capability in the lens
- **THEN** the system MUST show recent related change events in reverse chronological order.

#### Scenario: View workspace change timeline
- **WHEN** the user browses current workspace context
- **THEN** the system MUST expose recent change updates with timestamps and event types.
