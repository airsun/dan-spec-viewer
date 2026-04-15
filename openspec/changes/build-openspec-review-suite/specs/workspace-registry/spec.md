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

### Requirement: CLI Distribution and Installation Modes
The system SHALL support CLI installation modes that are decoupled from a local source checkout, while keeping `npm link` as a development-only workflow.

#### Scenario: Install CLI without local repository checkout
- **WHEN** a user installs the CLI via global package sources (for example Git URL or packaged `tgz`)
- **THEN** the installed command MUST be invokable from `PATH` and MUST provide the same workspace binding lifecycle behavior as development installs.

#### Scenario: Development install via npm link
- **WHEN** a user installs the CLI via `npm link` from a local repository
- **THEN** the system MUST treat this as a development-mode installation and documentation MUST clearly distinguish it from production distribution modes.

#### Scenario: Optional standalone executable distribution
- **WHEN** a prebuilt standalone executable is provided for a target platform
- **THEN** the executable MUST expose the same command surface and registry compatibility as the Node-based CLI.
