REFACTORING_SPECIFICATION:
========================

EXECUTIVE_SUMMARY:
REFACTORING_SCOPE: This refactoring initiative addresses critical architectural issues within the ContextWeaver VS Code extension. The primary problems are a God Object (`ipcServer.ts`) managing too many responsibilities, a Long Method (`AggregationService.ts`) with complex conditional logic, and severe code duplication in file system traversal logic (`fileSystemService.ts`). The goal is to migrate the codebase to a clean, standard hexagonal architecture, separating core logic from infrastructure adapters.
TOTAL_COMPONENTS: 34
ESTIMATED_COMPLEXITY: High
MIGRATION_PHASES: 4
PRIMARY_PATTERNS: Service Layer Pattern, Extract Method Pattern, Strategy Pattern

CURRENT_STATE_ANALYSIS:
CRITICAL_ISSUES:
- **C:/project/ContextWeaver/packages/vscode-extension/src/ipcServer.ts**: Identified as a God Object and containing Long Methods. To be refactored using the **Service Layer Pattern**.
- **C:/project/ContextWeaver/packages/vscode-extension/src/core/services/AggregationService.ts**: Contains a Long Method (`completeAggregation`) with a complex switch statement. To be refactored using the **Extract Method Pattern**, evolving into a **Strategy Pattern**.
- **C:/project/ContextWeaver/packages/vscode-extension/src/fileSystemService.ts**: Contains severe code duplication in file traversal logic. To be refactored using the **Extract Method Pattern** to create a single, unified traversal utility.

PRESERVATION_REQUIREMENTS:
- **IPC Protocol Integrity:** The system must maintain strict adherence to the IPC protocol defined in `IPC_Protocol_Design.md` and the data structures in `@contextweaver/shared` to ensure compatibility between the VS Code and Chrome extensions.
- **Multi-Window Support:** The leader election (`findPrimaryAndInitialize`) and response aggregation (`completeAggregation`) logic are core to the multi-window feature and must be preserved.
- **File Filtering Logic:** The application of `.gitignore` and default ignore patterns is a critical feature that must be functionally maintained through any refactoring.
- **Workspace Trust Security:** All file system operations must continue to respect and be gated by VS Code's Workspace Trust security model.
- **File System I/O:** Recursive file system operations are performance-sensitive, especially on large projects. Any refactoring should aim to maintain or improve the efficiency of file traversal and content reading.
- **IPC Responsiveness:** The central message handling loop in the IPC server is a performance hotspot. Its ability to process requests quickly must not be degraded.
- **VS Code API:** The extension's functionality is tightly coupled to the `vscode` API, particularly for workspace, file system, and diagnostics access.
- **`ignore` Library:** The behavior of the file filtering system relies on the specific implementation of the `ignore` npm package.

TARGET_ARCHITECTURE:

PATTERN_APPLICATIONS:
COMPONENT: C:/project/ContextWeaver/packages/vscode-extension/src/ipcServer.ts
PATTERN: Service Layer Pattern
RATIONALE: The `ipcServer.ts` file is a God Object managing WebSocket connections, client state, primary/secondary leader election, message parsing, command routing, and response aggregation. Applying the Service Layer Pattern will decompose these responsibilities into smaller, focused services like `ConnectionService` and `MultiWindowService`. This directly addresses the God Object issue by separating concerns, improving maintainability, and simplifying the critical message handling logic.
---
COMPONENT: C:/project/ContextWeaver/packages/vscode-extension/src/core/services/AggregationService.ts
PATTERN: Extract Method Pattern / Strategy Pattern
RATIONALE: The `completeAggregation` method is a Long Method due to its large `switch` statement handling logic for different command types. This violates the Open/Closed Principle. Each `case` block will be extracted into a dedicated Strategy class (e.g., `SearchAggregationStrategy`). An `AggregationStrategyFactory` will select the appropriate strategy at runtime, making the `AggregationService` a clean dispatcher and simplifying the addition of new aggregatable commands.
---
COMPONENT: C:/project/ContextWeaver/packages/vscode-extension/src/fileSystemService.ts
PATTERN: Extract Method Pattern
RATIONALE: This file suffers from severe code duplication, with recursive directory traversal logic implemented multiple times. A single, generic, and reusable private function for recursive, filtered directory traversal will be created. This core function will accept a callback to process each found entry, eliminating duplication, shortening public methods, and centralizing the critical filtering and traversal logic.
---

NEW_FILE_STRUCTURE:
```
src/
├── core/                                  # Application-agnostic business logic and domain
│   ├── entities/                          # Core data structures
│   │   ├── Aggregation.ts                 # Defines AggregationSession, AggregationResponse
│   │   └── Client.ts                      # Defines the Client data structure
│   ├── ports/                             # Interfaces for services (hexagonal ports)
│   │   ├── IAggregationService.ts         # Interface for the AggregationService
│   │   ├── IAggregationStrategy.ts        # Interface for different aggregation strategies
│   │   └── IFilterService.ts              # Interface for the FilterService
│   └── services/                          # Core application services
│       ├── AggregationService.ts          # (Refactored) Manages aggregation sessions, uses Strategy pattern
│       ├── DiagnosticsService.ts          # (Moved) Fetches workspace diagnostics
│       ├── FileSystemService.ts           # (Refactored) Handles all file system operations with unified traversal
│       ├── FilterService.ts               # (Moved) Manages .gitignore and default ignore patterns
│       ├── MultiWindowService.ts          # (New) Manages Primary/Secondary leader election and forwarding
│       ├── SearchService.ts               # (Moved) Implements workspace search logic
│       ├── SnippetService.ts              # (Moved) Prepares code snippets for sending
│       └── WorkspaceService.ts            # (Moved) Interacts with VS Code workspace APIs
├── adapters/                              # Infrastructure-specific implementations
│   ├── primary/                           # Driving adapters (e.g., UI, IPC)
│   │   └── ipc/                           # Handles all Inter-Plugin Communication
│   │       ├── CommandRegistry.ts         # (Moved) Maps command strings to handlers
│   │       ├── ConnectionService.ts       # (New) Manages WebSocket server, connections, and clients
│   │       ├── ICommandHandler.ts         # (Moved) Interface for all command handlers
│   │       ├── ipcServer.ts               # (Refactored) Thin coordinator for IPC, delegates to services
│   │       ├── aggregation/               # (New) Home for aggregation strategies
│   │       │   ├── AggregationStrategyFactory.ts # (New) Creates the correct strategy for a command
│   │       │   ├── DefaultAggregationStrategy.ts # (New) Strategy for commands that use the primary's response
│   │       │   ├── GetContentsForFilesAggregationStrategy.ts # (New) Strategy for get_contents_for_files
│   │       │   └── SearchAggregationStrategy.ts # (New) Strategy for search_workspace
│   │       └── handlers/                  # (Moved) All specific command handlers
│   │           ├── GetActiveFileInfoHandler.ts
│   │           ├── GetContentsForFilesHandler.ts
│   │           ├── GetEntireCodebaseHandler.ts
│   │           ├── GetFileContentHandler.ts
│   │           ├── GetFileTreeHandler.ts
│   │           ├── GetFilterInfoHandler.ts
│   │           ├── GetFolderContentHandler.ts
│   │           ├── GetOpenFilesHandler.ts
│   │           ├── GetWorkspaceDetailsHandler.ts
│   │           ├── GetWorkspaceProblemsHandler.ts
│   │           ├── ListFolderContentsHandler.ts
│   │           ├── RegisterActiveTargetHandler.ts
│   │           └── SearchWorkspaceHandler.ts
│   └── secondary/                         # Driven adapters (e.g., logging, external APIs)
│       └── logging/
│           └── VSCodeOutputChannelLogger.ts # (Moved) Logger implementation for VS Code
└── extension.ts                           # (Refactored) Main activation entry point, handles dependency injection
```

COMPONENT_MAPPING:
COMPONENT: ipcServer
FROM: C:/project/ContextWeaver/packages/vscode-extension/src/ipcServer.ts
TO: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/ipcServer.ts
RESPONSIBILITIES:
- Acts as a thin coordinator for the IPC system.
- Delegates connection management to `ConnectionService`.
- Delegates multi-window logic to `MultiWindowService`.
- Routes incoming parsed messages to the `CommandRegistry`.
DEPENDENCIES: `ConnectionService`, `MultiWindowService`, `CommandRegistry`
---
COMPONENT: ConnectionService
FROM: (New File)
TO: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/ConnectionService.ts
RESPONSIBILITIES:
- Manages the WebSocket server lifecycle (start, stop, port scanning).
- Handles new client connections and disconnections.
- Manages the map of connected clients.
- Handles raw message parsing and transmission.
DEPENDENCIES: `ws`, `vscode` (for logging)
---
COMPONENT: MultiWindowService
FROM: (New File)
TO: C:/project/ContextWeaver/packages/vscode-extension/src/core/services/MultiWindowService.ts
RESPONSIBILITIES:
- Implements the primary/secondary leader election logic.
- Manages registration of secondary VSCE instances.
- Forwards requests from the primary to secondaries.
- Forwards responses and pushes from secondaries to the primary.
- Initiates response aggregation via `AggregationService`.
DEPENDENCIES: `ConnectionService`, `AggregationService`
---
COMPONENT: AggregationService
FROM: C:/project/ContextWeaver/packages/vscode-extension/src/core/services/AggregationService.ts
TO: C:/project/ContextWeaver/packages/vscode-extension/src/core/services/AggregationService.ts (Refactored)
RESPONSIBILITIES:
- Manages the lifecycle of aggregation sessions (start, timeout, completion).
- Collects responses from primary and secondary instances.
- Delegates the actual aggregation logic to a strategy provided by `AggregationStrategyFactory`.
DEPENDENCIES: `AggregationStrategyFactory`
---
COMPONENT: FileSystemService
FROM: C:/project/ContextWeaver/packages/vscode-extension/src/fileSystemService.ts
TO: C:/project/ContextWeaver/packages/vscode-extension/src/core/services/FileSystemService.ts (Refactored)
RESPONSIBILITIES:
- Provides a unified, non-duplicated method for recursive, filtered directory traversal.
- Exposes public methods (`getFileTree`, `getFolderContents`, etc.) that utilize the unified traversal logic.
DEPENDENCIES: `FilterService`, `vscode`
---

INTERFACE_CONTRACTS:
INTERFACE: IAggregationStrategy
LOCATION: src/core/ports/IAggregationStrategy.ts
METHODS:
- `aggregate(responses: AggregationResponse[]): unknown`
CONSUMERS: `AggregationService`
---
INTERFACE: IFilterService
LOCATION: src/core/ports/IFilterService.ts
METHODS:
- `createFilterForWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<{ filter: Ignore; type: FilterType }>`
CONSUMERS: `FileSystemService`, `SearchService`, All file-based command handlers
---
INTERFACE: ICommandHandler
LOCATION: src/adapters/primary/ipc/ICommandHandler.ts
METHODS:
- `handle(request: { payload: TReq; client: ClientContext }): Promise<TRes>`
CONSUMERS: `CommandRegistry`, `ipcServer`
---

MIGRATION_STRATEGY:

PHASE_1: Foundational Restructuring
OBJECTIVE: Establish the new 'standard' architectural directory structure and move existing components without significant logic changes.
COMPONENTS: All existing service, handler, and utility files.
RISK_LEVEL: Low
---

PHASE_2: Decompose the IPC God Object
OBJECTIVE: Break down the `ipcServer.ts` God Object into `ConnectionService` and `MultiWindowService` to improve maintainability and isolate complex logic.
COMPONENTS: `ipcServer.ts`, `ConnectionService.ts` (New), `MultiWindowService.ts` (New)
RISK_LEVEL: High
---

PHASE_3: Refine Service Implementations
OBJECTIVE: Address the `Long_Method` and `Duplication` issues in `AggregationService` and `fileSystemService` by applying the Extract Method and Strategy patterns.
COMPONENTS: `AggregationService.ts`, `fileSystemService.ts`, `AggregationStrategyFactory.ts` (New), various `*AggregationStrategy.ts` (New)
RISK_LEVEL: Medium
---

PHASE_4: Final Integration and Dependency Injection
OBJECTIVE: Solidify the new architecture by updating the main `extension.ts` entry point to use dependency injection, ensuring all services are correctly instantiated and wired together.
COMPONENTS: `extension.ts`
RISK_LEVEL: Medium
---

IMPLEMENTATION_GUIDANCE:
DECOMPOSITION_PRIORITIES:
1. **`ipcServer.ts` Decomposition**: This is the highest-risk and highest-priority task. The separation of concerns between the new `ConnectionService` (managing WebSockets) and `MultiWindowService` (managing primary/secondary logic) must be clearly defined to avoid introducing race conditions or breaking the multi-window feature.
2. **`fileSystemService.ts` Unification**: Refactoring the duplicated file traversal logic is critical for maintainability. The new unified `traverseDirectoryRecursive` function must be robust and thoroughly tested to ensure it correctly handles all filtering and recursion scenarios for `getFileTree`, `getFolderContents`, and `getDirectoryListing`.

TESTING_REQUIREMENTS:
- MAINTAIN_COVERAGE: Unit test coverage for all refactored services (`ConnectionService`, `MultiWindowService`, `AggregationService`, `FileSystemService`) must be >= 90%.
- CRITICAL_PATHS:
  - **Multi-window search:** A search query from the CE must correctly aggregate results from two separate VS Code windows.
  - **Multi-window snippet:** Sending a snippet from a secondary VS Code window must correctly appear in the CE.
  - **Large codebase insertion:** The "Insert Entire Codebase" feature must function correctly on a large project without performance degradation.
  - **File tree generation:** Must produce the correct ASCII tree, respecting `.gitignore` rules.

PERFORMANCE_CONSTRAINTS:
- RESPONSE_TIME: maintain < 200ms for typical IPC requests (e.g., search, get active file).
- MEMORY_USAGE: maintain < 100MB additional memory usage during large codebase processing.

SUCCESS_CRITERIA:
FUNCTIONAL:
- All existing features, including all context insertion types and multi-window support, operate without any regressions.

NON_FUNCTIONAL:
- Unit test coverage for all refactored core services and adapters is >= 90%.
- Performance benchmarks for file traversal and search operations show no degradation.

ARCHITECTURAL:
- The `ipcServer.ts` file is reduced to a thin coordinator, with its LoC and cyclomatic complexity significantly decreased.
- The `fileSystemService.ts` file contains zero duplicated recursive traversal logic.
- The `AggregationService.ts` `completeAggregation` method is a simple dispatcher that delegates to strategy objects.

========================

TASKS:
========================

===== TASK-001-STRUCT-001 ===== [ ]
REQUIRES: none
ENABLES: TASK-001-STRUCT-002
COMPLEXITY: SIMPLE

OPERATION: CREATE_DIRECTORIES
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/

CREATE_DIRS:
- src/core/entities
- src/core/ports
- src/core/services
- src/adapters/primary/ipc/aggregation
- src/adapters/primary/ipc/handlers
- src/adapters/secondary/logging

VERIFY:
- BUILD: true
- TEST: true
- BEHAVIOR: DIRECTORY_EXISTS[src/core/entities, src/core/ports, src/core/services, src/adapters/primary/ipc/aggregation, src/adapters/primary/ipc/handlers, src/adapters/secondary/logging]
===== END TASK-001-STRUCT-001 =====

===== TASK-001-STRUCT-002 ===== [ ]
REQUIRES: TASK-001-STRUCT-001
ENABLES: TASK-001-MOVE-001, TASK-001-MOVE-002, TASK-001-MOVE-003
COMPLEXITY: SIMPLE

OPERATION: CREATE_FILES
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/

CREATE_FILES:
- src/core/entities/Client.ts -> EXPORT[interface Client]
- src/core/entities/Aggregation.ts -> EXPORT[interface AggregationResponse, interface AggregationSession]
- src/core/ports/IAggregationStrategy.ts -> EXPORT[interface IAggregationStrategy]

VERIFY:
- BUILD: npx tsc --noEmit src/core/entities/Client.ts src/core/entities/Aggregation.ts src/core/ports/IAggregationStrategy.ts
- TEST: true
- BEHAVIOR: FILE_EXISTS[src/core/entities/Client.ts, src/core/entities/Aggregation.ts, src/core/ports/IAggregationStrategy.ts]
===== END TASK-001-STRUCT-002 =====

===== TASK-001-MOVE-001 ===== [ ]
REQUIRES: TASK-001-STRUCT-002
ENABLES: TASK-001-IMPORT-001
COMPLEXITY: MODERATE

OPERATION: MOVE_FILES
TARGET: C:/project/ContextWeaver/packages/vscode-extension/

MOVE:
- src/core/services/FilterService.ts -> src/core/services/FilterService.ts
- src/core/ports/IFilterService.ts -> src/core/ports/IFilterService.ts
- src/fileSystemService.ts -> src/core/services/FileSystemService.ts
- src/searchService.ts -> src/core/services/SearchService.ts
- src/snippetService.ts -> src/core/services/SnippetService.ts
- src/workspaceService.ts -> src/core/services/WorkspaceService.ts
- src/diagnosticsService.ts -> src/core/services/DiagnosticsService.ts

VERIFY:
- BUILD: true
- TEST: true
- BEHAVIOR: FILE_MOVED[src/fileSystemService.ts -> src/core/services/FileSystemService.ts] && FILE_MOVED[src/searchService.ts -> src/core/services/SearchService.ts]
===== END TASK-001-MOVE-001 =====

===== TASK-001-MOVE-002 ===== [ ]
REQUIRES: TASK-001-STRUCT-002
ENABLES: TASK-001-IMPORT-001
COMPLEXITY: MODERATE

OPERATION: MOVE_FILES
TARGET: C:/project/ContextWeaver/packages/vscode-extension/

MOVE:
- src/adapters/primary/ipc/CommandRegistry.ts -> src/adapters/primary/ipc/CommandRegistry.ts
- src/adapters/primary/ipc/ICommandHandler.ts -> src/adapters/primary/ipc/ICommandHandler.ts
- src/adapters/primary/ipc/types.ts -> src/adapters/primary/ipc/types.ts
- src/ipcServer.ts -> src/adapters/primary/ipc/ipcServer.ts
- src/core/services/AggregationService.ts -> src/core/services/AggregationService.ts
- src/core/ports/IAggregationService.ts -> src/core/ports/IAggregationService.ts

VERIFY:
- BUILD: true
- TEST: true
- BEHAVIOR: FILE_MOVED[src/ipcServer.ts -> src/adapters/primary/ipc/ipcServer.ts] && FILE_MOVED[src/core/services/AggregationService.ts -> src/core/services/AggregationService.ts]
===== END TASK-001-MOVE-002 =====

===== TASK-001-MOVE-003 ===== [ ]
REQUIRES: TASK-001-STRUCT-002
ENABLES: TASK-001-IMPORT-001
COMPLEXITY: MODERATE

OPERATION: MOVE_FILES
TARGET: C:/project/ContextWeaver/packages/vscode-extension/

MOVE:
- src/adapters/primary/ipc/handlers/GetActiveFileInfoHandler.ts -> src/adapters/primary/ipc/handlers/GetActiveFileInfoHandler.ts
- src/adapters/primary/ipc/handlers/GetContentsForFilesHandler.ts -> src/adapters/primary/ipc/handlers/GetContentsForFilesHandler.ts
- src/adapters/primary/ipc/handlers/GetEntireCodebaseHandler.ts -> src/adapters/primary/ipc/handlers/GetEntireCodebaseHandler.ts
- src/adapters/primary/ipc/handlers/GetFileContentHandler.ts -> src/adapters/primary/ipc/handlers/GetFileContentHandler.ts
- src/adapters/primary/ipc/handlers/GetFileTreeHandler.ts -> src/adapters/primary/ipc/handlers/GetFileTreeHandler.ts
- src/adapters/primary/ipc/handlers/GetFilterInfoHandler.ts -> src/adapters/primary/ipc/handlers/GetFilterInfoHandler.ts
- src/adapters/primary/ipc/handlers/GetFolderContentHandler.ts -> src/adapters/primary/ipc/handlers/GetFolderContentHandler.ts
- src/adapters/primary/ipc/handlers/GetOpenFilesHandler.ts -> src/adapters/primary/ipc/handlers/GetOpenFilesHandler.ts
- src/adapters/primary/ipc/handlers/GetWorkspaceDetailsHandler.ts -> src/adapters/primary/ipc/handlers/GetWorkspaceDetailsHandler.ts
- src/adapters/primary/ipc/handlers/GetWorkspaceProblemsHandler.ts -> src/adapters/primary/ipc/handlers/GetWorkspaceProblemsHandler.ts
- src/adapters/primary/ipc/handlers/ListFolderContentsHandler.ts -> src/adapters/primary/ipc/handlers/ListFolderContentsHandler.ts
- src/adapters/primary/ipc/handlers/RegisterActiveTargetHandler.ts -> src/adapters/primary/ipc/handlers/RegisterActiveTargetHandler.ts
- src/adapters/primary/ipc/handlers/SearchWorkspaceHandler.ts -> src/adapters/primary/ipc/handlers/SearchWorkspaceHandler.ts

VERIFY:
- BUILD: true
- TEST: true
- BEHAVIOR: FILE_COUNT[src/adapters/primary/ipc/handlers/] == 13
===== END TASK-001-MOVE-003 =====

===== TASK-001-MOVE-004 ===== [ ]
REQUIRES: TASK-001-STRUCT-002
ENABLES: TASK-001-IMPORT-001
COMPLEXITY: SIMPLE

OPERATION: MOVE_FILE
TARGET: C:/project/ContextWeaver/packages/vscode-extension/

MOVE:
- src/vsceLogger.ts -> src/adapters/secondary/logging/VSCodeOutputChannelLogger.ts

VERIFY:
- BUILD: true
- TEST: true
- BEHAVIOR: FILE_MOVED[src/vsceLogger.ts -> src/adapters/secondary/logging/VSCodeOutputChannelLogger.ts]
===== END TASK-001-MOVE-004 =====

===== TASK-001-IMPORT-001 ===== [ ]
REQUIRES: TASK-001-MOVE-001, TASK-001-MOVE-002, TASK-001-MOVE-003, TASK-001-MOVE-004
ENABLES: TASK-002-CONNSVC-001, TASK-002-MWINSVC-001
COMPLEXITY: COMPLEX

OPERATION: UPDATE_IMPORTS
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/**/*.ts

BULK_TRANSFORM:
- FIND{import .* from './(fileSystemService|searchService|...)'} -> TRANSFORM{./(fileSystemService|...) -> ../core/services/$1}
- FIND{import .* from './(ipcServer|...)'} -> TRANSFORM{./(ipcServer|...) -> ../adapters/primary/ipc/$1}
- FIND{import .* from './(vsceLogger)'} -> TRANSFORM{./(vsceLogger) -> ../adapters/secondary/logging/VSCodeOutputChannelLogger}
- FIND{import .* from './(GetFileTreeHandler)'} -> TRANSFORM{./(GetFileTreeHandler) -> ./handlers/$1}
- ... and all other necessary import path corrections based on the new file structure.

VERIFY:
- BUILD: npm run build
- TEST: npm run test
- BEHAVIOR: No "module not found" errors during build or test execution.
===== END TASK-001-IMPORT-001 =====

===== TASK-002-CONNSVC-001 ===== [ ]
REQUIRES: TASK-001-IMPORT-001
ENABLES: TASK-002-IPCSVR-001
COMPLEXITY: COMPLEX

OPERATION: SERVICE_EXTRACTION
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/ConnectionService.ts

METHOD_EXTRACTION: @ipcServer.ts -> ConnectionService.ts
- EXTRACT[tryStartServerOnPort, wss, clients, activePort, sendMessage, sendError]
- EXTRACT[WebSocket server creation logic from `becomePrimary`]
- EXTRACT[Client connection handling (`wss.on('connection', ...)`)]
- KEEP[PRESERVE:Port scanning and fallback logic]

VERIFY:
- BUILD: npx tsc --noEmit src/adapters/primary/ipc/ConnectionService.ts
- TEST: Create new unit tests in `tests/unit/connectionService.test.ts` for port scanning and client management.
- BEHAVIOR: The service can start a WebSocket server on an available port within the specified range.
===== END TASK-002-CONNSVC-001 =====

===== TASK-002-MWINSVC-001 ===== [ ]
REQUIRES: TASK-001-IMPORT-001
ENABLES: TASK-002-IPCSVR-001
COMPLEXITY: COMPLEX

OPERATION: SERVICE_EXTRACTION
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/core/services/MultiWindowService.ts

METHOD_EXTRACTION: @ipcServer.ts -> MultiWindowService.ts
- EXTRACT[isPrimary, primaryWebSocket, secondaryClients, findPrimaryAndInitialize, becomePrimary, becomeSecondary, handleSecondaryMessage, handleRegisterSecondary, broadcastToSecondaries, handleForwardedResponse, handleForwardedPush, handleSnippetSendRequest]
- KEEP[PRESERVE:Leader election logic and primary/secondary state transitions]

VERIFY:
- BUILD: npx tsc --noEmit src/core/services/MultiWindowService.ts
- TEST: Create new unit tests in `tests/unit/multiWindowService.test.ts` for leader election and message forwarding.
- BEHAVIOR: The service correctly identifies as primary or secondary based on port availability.
===== END TASK-002-MWINSVC-001 =====

===== TASK-002-IPCSVR-001 ===== [ ]
REQUIRES: TASK-002-CONNSVC-001, TASK-002-MWINSVC-001
ENABLES: TASK-004-EXT-001
COMPLEXITY: COMPLEX

OPERATION: REFACTOR_COORDINATOR
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/ipcServer.ts

REFACTOR:
- REMOVE all logic extracted to `ConnectionService` and `MultiWindowService`.
- INJECT `ConnectionService`, `MultiWindowService`, `CommandRegistry` via constructor.
- REWRITE `start()` -> this.multiWindowService.start(this.connectionService)
- REWRITE `handleMessage()` -> Delegate to `MultiWindowService` for forwarding, then to `CommandRegistry` for local execution.
- KEEP[PRESERVE:Workspace trust check logic before command execution]

VERIFY:
- BUILD: npm run build
- TEST: Update `ipcServer.test.ts` to mock and inject the new services.
- BEHAVIOR: An incoming IPC message for `search_workspace` is correctly routed to the `SearchWorkspaceHandler`.
===== END TASK-002-IPCSVR-001 =====

===== TASK-003-FSS-001 ===== [ ]
REQUIRES: TASK-001-IMPORT-001
ENABLES: TASK-003-FSS-002
COMPLEXITY: COMPLEX

OPERATION: EXTRACT_METHOD
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/core/services/FileSystemService.ts

EXTRACT_METHOD:
- CREATE private `_traverseDirectoryRecursive(dirUri, baseUri, filter, processEntryCallback)`
- `processEntryCallback(entry: {uri, name, type}): void`
- MOVE traversal logic from `generateFileTreeTextInternal`, `getFolderContentsForIPC`, `getDirectoryListingRecursive` into `_traverseDirectoryRecursive`.
- KEEP[PRESERVE:Sorting logic, ignore filtering, and error handling]

VERIFY:
- BUILD: npx tsc --noEmit src/core/services/FileSystemService.ts
- TEST: Create specific unit tests for `_traverseDirectoryRecursive` with mock callbacks.
- BEHAVIOR: The internal method correctly traverses a mock directory structure and applies filters.
===== END TASK-003-FSS-001 =====

===== TASK-003-FSS-002 ===== [ ]
REQUIRES: TASK-003-FSS-001
ENABLES: TASK-004-EXT-001
COMPLEXITY: MODERATE

OPERATION: REFACTOR_ADAPTER
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/core/services/FileSystemService.ts

REFACTOR:
- REWRITE `getFileTree`, `getFolderContentsForIPC`, `getDirectoryListing` to use `_traverseDirectoryRecursive`.
- Each method will provide a specific `processEntryCallback` to build its required data structure (e.g., tree string, array of file contents).
- REMOVE old duplicated traversal logic from these public methods.

VERIFY:
- BUILD: npm run build
- TEST: Run existing `fileSystemService.test.ts`. All tests should pass without modification to the tests themselves.
- BEHAVIOR: `getFileTree` produces the exact same output string for a given mock file system as before the refactor.
===== END TASK-003-FSS-002 =====

===== TASK-003-AGGS-001 ===== [ ]
REQUIRES: TASK-001-IMPORT-001
ENABLES: TASK-003-AGGS-002, TASK-003-AGGS-003, TASK-003-AGGS-004, TASK-003-AGGS-005
COMPLEXITY: SIMPLE

OPERATION: CREATE_INTERFACE
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/core/ports/IAggregationStrategy.ts

INTERFACE: IAggregationStrategy
METHODS:
- `aggregate(responses: AggregationResponse[]): unknown`
TYPES:
- `AggregationResponse{windowId: string, payload: unknown}`

VERIFY:
- BUILD: npx tsc --noEmit src/core/ports/IAggregationStrategy.ts
- TEST: true
- BEHAVIOR: `exports.IAggregationStrategy` is defined.
===== END TASK-003-AGGS-001 =====

===== TASK-003-AGGS-002 ===== [ ]
REQUIRES: TASK-003-AGGS-001
ENABLES: TASK-003-AGGS-006
COMPLEXITY: SIMPLE

OPERATION: CREATE_STRATEGY
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/aggregation/SearchAggregationStrategy.ts

IMPLEMENT: IAggregationStrategy
- EXTRACT logic from `case 'search_workspace'` in `AggregationService.completeAggregation`.
- The `aggregate` method will combine `results` arrays from all responses.
- KEEP[PRESERVE:Error handling and combining logic]

VERIFY:
- BUILD: npx tsc --noEmit src/adapters/primary/ipc/aggregation/SearchAggregationStrategy.ts
- TEST: Create unit test `searchAggregationStrategy.test.ts`.
- BEHAVIOR: Given two response payloads, the strategy correctly merges their `results` arrays.
===== END TASK-003-AGGS-002 =====

===== TASK-003-AGGS-003 ===== [ ]
REQUIRES: TASK-003-AGGS-001
ENABLES: TASK-003-AGGS-006
COMPLEXITY: SIMPLE

OPERATION: CREATE_STRATEGY
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/aggregation/GetContentsForFilesAggregationStrategy.ts

IMPLEMENT: IAggregationStrategy
- EXTRACT logic from `case 'get_contents_for_files'` in `AggregationService.completeAggregation`.
- The `aggregate` method will combine `data` and `errors` arrays from all responses.
- KEEP[PRESERVE:Logic for concatenating both successful data and errors]

VERIFY:
- BUILD: npx tsc --noEmit src/adapters/primary/ipc/aggregation/GetContentsForFilesAggregationStrategy.ts
- TEST: Create unit test `getContentsForFilesAggregationStrategy.test.ts`.
- BEHAVIOR: Correctly merges `data` and `errors` from multiple response payloads.
===== END TASK-003-AGGS-003 =====

===== TASK-003-AGGS-004 ===== [ ]
REQUIRES: TASK-003-AGGS-001
ENABLES: TASK-003-AGGS-006
COMPLEXITY: SIMPLE

OPERATION: CREATE_STRATEGY
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/aggregation/DefaultAggregationStrategy.ts

IMPLEMENT: IAggregationStrategy
- EXTRACT logic from `default` case in `AggregationService.completeAggregation`.
- The `aggregate` method will find the response from the primary window (`this.windowId`) and return its payload.
- KEEP[PRESERVE:Fallback to the first available response if primary is missing]

VERIFY:
- BUILD: npx tsc --noEmit src/adapters/primary/ipc/aggregation/DefaultAggregationStrategy.ts
- TEST: Create unit test `defaultAggregationStrategy.test.ts`.
- BEHAVIOR: Returns the primary's payload when present.
===== END TASK-003-AGGS-004 =====

===== TASK-003-AGGS-005 ===== [ ]
REQUIRES: TASK-003-AGGS-001
ENABLES: TASK-003-AGGS-006
COMPLEXITY: SIMPLE

OPERATION: CREATE_STRATEGY
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/aggregation/GetWorkspaceDetailsAggregationStrategy.ts

IMPLEMENT: IAggregationStrategy
- EXTRACT logic from `case 'get_workspace_details'` in `AggregationService.completeAggregation`.
- The `aggregate` method will combine `workspaceFolders` arrays and determine the overall `isTrusted` status.
- KEEP[PRESERVE:Logic for combining folders and calculating trust]

VERIFY:
- BUILD: npx tsc --noEmit src/adapters/primary/ipc/aggregation/GetWorkspaceDetailsAggregationStrategy.ts
- TEST: Create unit test `getWorkspaceDetailsAggregationStrategy.test.ts`.
- BEHAVIOR: Correctly merges `workspaceFolders` from multiple response payloads.
===== END TASK-003-AGGS-005 =====

===== TASK-003-AGGS-006 ===== [ ]
REQUIRES: TASK-003-AGGS-002, TASK-003-AGGS-003, TASK-003-AGGS-004, TASK-003-AGGS-005
ENABLES: TASK-003-AGGS-007
COMPLEXITY: MODERATE

OPERATION: CREATE_FACTORY
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/aggregation/AggregationStrategyFactory.ts

CREATE_FACTORY: AggregationStrategyFactory
- METHOD `createStrategy(command: string): IAggregationStrategy`
- Use a `switch` or `Map` to return the correct strategy instance based on the command name.
- `search_workspace` -> `SearchAggregationStrategy`
- `get_contents_for_files` -> `GetContentsForFilesAggregationStrategy`
- `get_workspace_details` -> `GetWorkspaceDetailsAggregationStrategy`
- `default` -> `DefaultAggregationStrategy`

VERIFY:
- BUILD: npx tsc --noEmit src/adapters/primary/ipc/aggregation/AggregationStrategyFactory.ts
- TEST: Create unit test `aggregationStrategyFactory.test.ts`.
- BEHAVIOR: `createStrategy('search_workspace')` returns an instance of `SearchAggregationStrategy`.
===== END TASK-003-AGGS-006 =====

===== TASK-003-AGGS-007 ===== [ ]
REQUIRES: TASK-003-AGGS-006
ENABLES: TASK-004-EXT-001
COMPLEXITY: COMPLEX

OPERATION: REFACTOR_ADAPTER
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/core/services/AggregationService.ts

REFACTOR:
- INJECT `AggregationStrategyFactory` via constructor.
- REWRITE `completeAggregation` method.
- REMOVE the large `switch` statement.
- REPLACE with: `const strategy = this.strategyFactory.createStrategy(command); const payload = strategy.aggregate(responses);`
- KEEP[PRESERVE:Session management logic (timeout, completion flag, map cleanup)]

VERIFY:
- BUILD: npm run build
- TEST: Update `aggregationService.test.ts` to mock and inject the factory.
- BEHAVIOR: The service correctly delegates to the mock strategy returned by the mock factory.
===== END TASK-003-AGGS-007 =====

===== TASK-004-EXT-001 ===== [ ]
REQUIRES: TASK-002-IPCSVR-001, TASK-003-FSS-002, TASK-003-AGGS-007
ENABLES: TASK-004-HNDLR-001
COMPLEXITY: COMPLEX

OPERATION: WIRING_INTEGRATION
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/extension.ts

REFACTOR: `activate()` function
- INSTANTIATE all new and refactored services: `FilterService`, `WorkspaceService`, `FileSystemService`, `SearchService`, `AggregationStrategyFactory`, `AggregationService`, `ConnectionService`, `MultiWindowService`.
- INJECT dependencies into constructors (e.g., inject `AggregationStrategyFactory` into `AggregationService`).
- INSTANTIATE `CommandRegistry`.
- INSTANTIATE all command handlers, injecting their required services (e.g., `SearchWorkspaceHandler` needs `SearchService`).
- REGISTER all handlers with the `CommandRegistry`.
- INSTANTIATE `ipcServer` and inject its dependencies (`ConnectionService`, `MultiWindowService`, `CommandRegistry`).

VERIFY:
- BUILD: npm run build
- TEST: `npm run test` should pass, verifying the DI graph is complete and correct.
- BEHAVIOR: The extension activates without errors. The `contextweaver.helloWorld` command still functions.
===== END TASK-004-EXT-001 =====

===== TASK-004-HNDLR-001 ===== [ ]
REQUIRES: TASK-004-EXT-001
ENABLES: TASK-004-TESTS-001
COMPLEXITY: MODERATE

OPERATION: REFACTOR_ADAPTER
TARGET: C:/project/ContextWeaver/packages/vscode-extension/src/adapters/primary/ipc/handlers/

REFACTOR: All command handlers
- Update constructors to accept injected service dependencies instead of creating them or accessing globals.
- Example: `GetFileTreeHandler` constructor changes from `(filterService, workspaceService, windowId)` to `(fileSystemService, windowId)`.
- Ensure all handlers use the injected services.

VERIFY:
- BUILD: npm run build
- TEST: Update unit tests for handlers to mock and inject dependencies.
- BEHAVIOR: All IPC commands function as before the refactor.
===== END TASK-004-HNDLR-001 =====

===== TASK-004-TESTS-001 ===== [ ]
REQUIRES: TASK-004-HNDLR-001
ENABLES: TASK-004-CLEANUP-001
COMPLEXITY: MODERATE

OPERATION: UPDATE_TESTS
TARGET: C:/project/ContextWeaver/packages/vscode-extension/tests/unit/

REFACTOR:
- `ipcServer.test.ts`: Rewrite to test the new coordinator role, mocking `ConnectionService` and `MultiWindowService`.
- `filterService.test.ts`, `searchService.test.ts`, `fileSystemService.test.ts`: Update import paths and ensure they still pass.
- CREATE new test files for `ConnectionService`, `MultiWindowService`, and all aggregation strategies.

VERIFY:
- BUILD: true
- TEST: `npm run test`
- BEHAVIOR: Test coverage for refactored components is >= 90%.
===== END TASK-004-TESTS-001 =====

===== TASK-004-CLEANUP-001 ===== [ ]
REQUIRES: TASK-004-TESTS-001
ENABLES: TASK-004-CLEANUP-002
COMPLEXITY: SIMPLE

OPERATION: CLEANUP_CODE
TARGET: C:/project/ContextWeaver/packages/vscode-extension/

REMOVE:
- Delete old, now-unused interface files like `src/ipc/ports/ICommandRegistry.ts`, `src/ipc/ports/ICommandHandler.ts`, `src/ipc/ports/IpcServer.ts`.
- Remove any commented-out code blocks from the refactoring.
- Ensure all files have the correct headers and module descriptions.

VERIFY:
- BUILD: npm run build
- TEST: npm run test
- BEHAVIOR: Project is clean of dead code and unused files.
===== END TASK-004-CLEANUP-001 =====

===== TASK-004-CLEANUP-002 ===== [ ]
REQUIRES: TASK-004-CLEANUP-001
ENABLES: none
COMPLEXITY: SIMPLE

OPERATION: UPDATE_DOCS
TARGET: C:/project/ContextWeaver/README.md, C:\project\ContextWeaver\docs\ARCHITECTURE.md

UPDATE:
- Review the "Project Structure" and "Features" sections of the `README.md`.
- Update file paths and architectural descriptions to reflect the new hexagonal structure.
- Ensure `docs/ARCHITECTURE.MD` accurately describes the new component model.

VERIFY:
- BUILD: true
- TEST: true
- BEHAVIOR: The `README.md` and `ARCHITECTURE.md` accurately reflects the refactored codebase structure.
===== END TASK-004-CLEANUP-002 =====

========================