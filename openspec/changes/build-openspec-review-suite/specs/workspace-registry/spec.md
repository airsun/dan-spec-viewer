## ADDED Requirements

### Requirement: Workspace Binding Lifecycle
The system SHALL provide CLI commands to bind, unbind, and list OpenSpec workspaces on the web service host.

#### Scenario: Bind a valid workspace
- **WHEN** the user runs the bind command with a reachable directory containing `openspec/`
- **THEN** the system MUST persist the workspace entry and expose it to the Web application.

#### Scenario: Unbind an existing workspace
- **WHEN** the user runs the unbind command for a previously bound workspace
- **THEN** the system MUST remove the binding state and stop exposing that workspace in Web navigation.

### Requirement: Workspace State Persistence
The system SHALL persist workspace binding state across service restarts.

#### Scenario: Restart service with existing bindings
- **WHEN** the service restarts after one or more workspaces were bound
- **THEN** the same workspace list MUST be restored without requiring rebind.

### Requirement: Workspace Accessibility Status
The system SHALL distinguish "bound" from "currently readable" and surface accessibility status.

#### Scenario: Bound workspace becomes unreadable
- **WHEN** a bound directory is missing or lacks permissions
- **THEN** the system MUST keep the binding record and mark the workspace as error/unreadable for review visibility.

