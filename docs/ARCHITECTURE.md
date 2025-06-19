# ContextWeaver: System Architecture

## 1. Introduction

This document outlines the software architecture of the ContextWeaver system. It describes the major components, their responsibilities, interactions, and key design decisions. This document is intended to be a living document, updated as the system evolves.

The primary goal of the ContextWeaver is to provide users with a convenient and efficient way to add content and context from their VS Code projects directly into Large Language Model (LLM) chat interfaces.

Refer to the `SRS.md` for detailed functional and non-functional requirements.

## 2. Guiding Principles

The architecture adheres to principles of modern software engineering, including:
*   Separation of Concerns
*   Single Responsibility Principle (SRP)
*   KISS (Keep It Simple, Stupid)
*   DRY (Don't Repeat Yourself)
*   Security by Design
*   Maintainability and Testability

## 3. System Overview

The ContextWeaver consists of two main applications:

*   **VS Code Extension (VSCE):** Runs within Visual Studio Code, responsible for accessing project data, file system operations, and hosting the IPC server.
*   **Chrome Extension (CE):** Runs within the Google Chrome browser, responsible for the user interface, interacting with LLM web pages, and acting as the IPC client.

These components communicate via a local Inter-Plugin Communication (IPC) mechanism.

### 3.1. High-Level Package Architecture

ContextWeaver is developed within a single Git repository (monorepo) to facilitate management of shared code, ensure type safety across components, and streamline coordinated development. The architecture is composed of three primary packages.

```mermaid
graph TD
    subgraph "ContextWeaver Monorepo"
        direction LR
        root("package.json (Root)")
        
        subgraph "packages/"
            direction TB
            A["<a href='../packages/vscode-extension'>vscode-extension</a>"]
            B["<a href='../packages/chrome-extension'>chrome-extension</a>"]
            C["<a href='../packages/shared'>@contextweaver/shared</a>"]
        end

        A -- Consumes --> C
        B -- Consumes --> C
        A -- "Communicates via IPC (WebSocket)" --> B
    end

    subgraph "Key Responsibilities"
        A_Desc("<b>VS Code Extension</b><br/>- IPC Server<br/>- File System Access<br/>- Search & Diagnostics")
        B_Desc("<b>Chrome Extension</b><br/>- IPC Client<br/>- UI/UX Management<br/>- DOM Interaction")
        C_Desc("<b>Shared Code</b><br/>- IPC Type Definitions<br/>- Data Models<br/>- Logger")
    end

    A --- A_Desc
    B --- B_Desc
    C --- C_Desc

    style A fill:#007ACC,stroke:#FFF,stroke-width:2px,color:#FFF
    style B fill:#4285F4,stroke:#FFF,stroke-width:2px,color:#FFF
    style C fill:#333,stroke:#FFF,stroke-width:2px,color:#FFF
```

*   **`packages/vscode-extension`**: This is the backend of the system, running inside VS Code. It is responsible for all interactions with the local development environment, including file system access, running searches, and collecting diagnostics. It hosts the WebSocket-based `IPCServer` that listens for requests from the Chrome extension.

*   **`packages/chrome-extension`**: This is the frontend, running in the user's browser. It is responsible for all user-facing UI, including the floating panel and context indicators. It detects user actions on LLM websites and communicates with the VS Code extension via its `IPCClient` to fetch data.

*   **`packages/shared`**: A critical internal library that contains code shared between the two extensions. Its primary purpose is to define the IPC contract through TypeScript interfaces (`ipc-types.ts`, `data-models.ts`), ensuring that both the client and server communicate using the same, type-safe structures.

## 4. Detailed Component Architecture

### 4.1. VS Code Extension (VSCE)

The VS Code Extension acts as the backend data provider for the system. Its architecture is service-oriented, with a central `IPCServer` that acts as the primary entry point for requests from the Chrome Extension.

```mermaid
graph TD
    subgraph "VSCode Extension Core"
        A[extension.ts] --> B(IPCServer)
        A --> C(SearchService)
        A --> D(WorkspaceService)
        A --> E(SnippetService)
        A --> F(DiagnosticsService)

        B -- routes to --> C
        B -- routes to --> D
        B -- routes to --> G(fileSystemService.ts)
        B -- routes to --> F
        B -- uses --> E

        C -- uses --> D
        C -- uses --> G
        G -- uses --> D
        F -- uses --> D
    end

    subgraph "External Communication"
        H[Chrome Extension IPCClient] <--> B
    end
```

*   **Responsibilities:**
    *   **Data Provider:** Accessing and providing file/folder structures, file content, and search results from the active VS Code workspace(s).
    *   **Filtering Logic:** Applying `.gitignore` rules or default filters to exclude irrelevant content.
    *   **IPC Server:** Hosting a local server (WebSocket) to listen for requests from the CE. Includes port fallback mechanism and message routing.
    *   **Snippet Handling:** Capturing selected code snippets and pushing them to the CE.
    *   **Workspace Management:** Handling multi-root workspaces and respecting VS Code's Workspace Trust feature.
*   **Key Modules:**
    *   `extension.ts`: The main entry point for the VSCE, responsible for activating and coordinating all services and the IPC server. It also registers commands, such as the one for sending snippets.
    *   `ipcServer.ts`: The **primary adapter** for external communication. It manages the WebSocket server, handles client connections, routes incoming IPC requests to the appropriate service methods, and contains the logic for handling outgoing pushes (like snippets). It also implements the primary/secondary architecture for multi-window support.
    *   `WorkspaceService.ts`: Centralizes all logic for interacting with the VS Code workspace API, such as getting workspace folders and checking the trust state. It acts as a foundational service used by other services.
    *   `fileSystemService.ts`: Handles all direct interactions with the file system (reading files, listing directories, traversing structures) via the VS Code `fs` API. It encapsulates the logic for `.gitignore` parsing and applying filtering rules.
    *   `searchService.ts`: Provides file/folder search capabilities, utilizing the `WorkspaceService` and `fileSystemService` to perform filtered searches across trusted folders.
    *   `diagnosticsService.ts`: Responsible for fetching and formatting workspace diagnostics (problems) from VS Code's language services.
    *   `snippetService.ts`: Prepares snippet data (selected text, file path, line numbers, etc.). It is used by the `sendSnippet` command handler in `extension.ts`.
*   **Technology Stack:**
    *   TypeScript
    *   VS Code API
    *   Node.js (runtime environment provided by VS Code)
    *   WebSocket library (`ws`)

### 4.2. Chrome Extension (CE)

The Chrome Extension is designed using a modular architecture that resembles the **Ports and Adapters** (or Hexagonal) pattern. This separates the core application logic from the services it interacts with, making the system more maintainable and testable.

```mermaid
graph TD
    subgraph "Content Script Core"
        A[main.ts] --> B(AppCoordinator)
        
        subgraph "Input Adapters"
            G(InputHandler) --> B
            H(MessageHandler) --> B
        end

        subgraph "Application Core"
            B -- Manages --> D(StateManager)
            B -- Uses --> E(ContextAPIService)
            B -- Uses --> I(ThemeService)
            B -- Uses --> J(TextInsertionService)
            B -- Uses --> F(ViewManager)
            B -- Uses --> C(UIManager)
        end

        subgraph "Output Adapters"
            E -- "Sends Messages To" --> K(serviceWorker.ts)
            C -- "Manipulates" --> DOM
        end
    end

    subgraph "Service Worker"
        K --> L(IPCClient)
        K --> M(MessageHandlerMap)
        L --> N[VSCE IPC Server]
    end
    
    subgraph "UI Subsystem (Managed by UIManager)"
        C -- Composes --> C1(FloatingPanel)
        C -- Composes --> C2(IndicatorManager)
        C -- Composes --> C3(NotificationManager)
        C -- Composes --> C4(StyleManager)
        C -- Composes --> C5(DOMFactory)
    end

    style B fill:#f9f,stroke:#333,stroke-width:2px
```

*   **Responsibilities:**
    *   **User Interface (UI):** Rendering and managing the floating UI for context selection, displaying context block indicators, and handling user interactions.
    *   **LLM Page Interaction:** Detecting trigger characters (`@`) in chat inputs, inserting content, and managing the display of context indicators on supported LLM web pages.
    *   **IPC Client:** Connecting to the VSCE server, sending requests, and handling responses.
    *   **State Management:** Managing the state of active context blocks and duplicate content prevention.
*   **Key Modules:**
    *   `AppCoordinator.ts`: The central orchestrator (the "application core"). It initializes all other components and wires them together, handling the main application logic flow without being directly dependent on external technologies like the DOM or `chrome` APIs.
    *   `InputHandler.ts` & `MessageHandler.ts`: These are the primary **input adapters**. They listen for external events—user input from the DOM and messages from the service worker, respectively—and translate them into calls to the `AppCoordinator`.
    *   `UIManager.ts`: A **Facade** that simplifies interactions with the UI subsystem. It can be considered part of the UI **output adapter**. It abstracts away the complexity of managing individual UI components like the `FloatingPanel`, `IndicatorManager`, and `NotificationManager`.
    *   `ViewManager.ts`: Manages which view is currently displayed in the floating panel (e.g., general options, search results, browse view). It uses specific `renderer` modules to generate the content for each view.
    *   `StateManager.ts`: A centralized store for the content script's state, managed by the `AppCoordinator`.
    *   `ContextAPIService.ts`: An **output adapter** that provides a clean, async API for the `AppCoordinator` to request data from the backend. It abstracts the details of communicating with the service worker.
    *   `serviceWorker.ts`: The background process that manages the persistent WebSocket connection to the VSCE via its own `IPCClient`. It acts as the bridge between the content script and the VSCE, using a `MessageHandlerMap` to route requests.
*   **Technology Stack:**
    *   TypeScript/JavaScript
    *   Chrome Extension APIs (Content Scripts, Service Workers, Storage, etc.)
    *   HTML, CSS (for UI elements)
    *   WebSocket API (browser-native)

## 5. Inter-Plugin Communication (IPC)

*   **Mechanism:** WebSocket connection over `localhost`, with port fallback if the default port is in use.
*   **Protocol:** JSON-based messages. (Detailed message schemas are defined in the `docs/IPC_Protocol_Design.md` document).
*   **Authentication:** Removed. Relies on `localhost` binding for security.
*   **Key Data Flows:**
    *    CE requests project data (file tree, file content, folder content, search, directory listings) from VSCE.
    *   VSCE responds with data or error messages.
    *   VSCE pushes code snippets to CE.
    *   CE registers its active tab/context with VSCE for snippet targeting.

## 6. Data Model

The primary data structures, especially those used for Inter-Plugin Communication (IPC) and for representing core entities like context blocks, files, and search results, are formally defined as TypeScript interfaces within the `packages/shared/src/` directory.

Key data models include:
*   **`ContextBlockMetadata`**: Defined in `packages/shared/src/data-models.ts`. Describes the metadata for each block of content inserted into the LLM chat.
*   **`FileData`**: Defined in `packages/shared/src/data-models.ts`. Represents the content and properties of a single file.
*   **`SearchResult`**: Defined in `packages/shared/src/data-models.ts`. Structure for items returned by the workspace search.
*   **`DirectoryEntry`**: Defined in `packages/shared/src/data-models.ts`. Structure for items listed in a directory.
*   **IPC Payloads**: All request, response, and push message payloads are defined as interfaces in `packages/shared/src/ipc-types.ts`.

Refer to these TypeScript files for the authoritative definitions of these structures. The `docs/IPC_Protocol_Design.md` provides a human-readable overview that aims to mirror these type definitions.

## 7. Key Design Decisions & Rationale

*This section logs key architectural decisions using stable, sequential identifiers (e.g., `[D-001]`) for permanent referencing.*

*   **[D-001] Decision:** Chose WebSockets for IPC.
    *   **Rationale:** Allows for bidirectional communication, efficient for pushing snippets from VSCE to CE, and well-supported in both Node.js (VSCE) and browser environments (CE).
*   **[D-002] Decision:** Root `.gitignore` only for V1.
    *   **Rationale:** Simplifies initial implementation complexity, aligning with SRS 1.2. Future versions may support subdirectory `.gitignore` files.
*   **[D-003] Decision:** Adopt a monorepo structure.
    *   **Rationale:** Simplifies management of shared code (e.g., IPC type definitions), versioning, and coordinated development and issue tracking between the VS Code Extension and Chrome Extension components.
*   **[D-004] Decision:** Removed token-based authentication for IPC.
    *   **Rationale:** Simplified user setup and reduced friction. Security relies on the VSCE server binding exclusively to `localhost`, mitigating external access risks. The risk from other local malicious software was deemed acceptable for V1 given the nature of data exchanged.
*   **[D-005] Decision:** Use `chrome.tabs.sendMessage` to broadcast `push_snippet` messages from the CE Service Worker to all matching Content Scripts.
    *   **Rationale:** Resolved "Receiving end does not exist" errors by actively querying for all supported LLM tabs and sending the message to each one. This broadcast approach is more robust than relying on a single `targetTabId` and aligns with the multi-window architecture where a snippet from any VS Code window should be available to any active LLM tab.
*   **[D-006] Decision:** Introduced a `packages/shared/src` module for defining common TypeScript types for IPC and data models.
    *   **Rationale:** To enforce type safety, ensure consistency between the Chrome Extension (CE) and VS Code Extension (VSCE), improve maintainability, and adhere to DRY (Don't Repeat Yourself) principles for the IPC contract. This makes the communication protocol explicit and verifiable at compile-time.
*   **[D-007] Decision:** Refactored the main Chrome Extension content script into a modular architecture using an `AppCoordinator` and specialized services/handlers.
    *   **Rationale:** To improve separation of concerns, reduce the complexity of a single file, enhance readability, maintainability, and testability, adhering to the Single Responsibility Principle (SRP).
*   **[D-008] Decision:** Implemented a Primary/Secondary Architecture for multi-window support.
    *   **Rationale:** To provide robust multi-window support for VS Code, enabling the Chrome Extension to aggregate data from multiple VS Code instances. This design centralizes coordination in a primary VSCE instance through leader election. The primary forwards requests to secondary instances and aggregates responses, simplifying client-side logic while ensuring data consistency across windows.
*   **[D-009] Decision:** Implemented client-side tree building for the "Browse" view.
    *   **Rationale:** To offload view-specific logic from the VS Code Extension to the Chrome Extension. The VSCE provides a flat, recursive list of directory entries, and the CE constructs the hierarchical tree view. This makes the backend API simpler and more generic, reduces IPC payload complexity, and allows for more flexible rendering on the client side.
*   **[D-010] Decision:** Adopted SVG icons with CSS masking for UI elements.
    *   **Rationale:** To achieve high-quality, scalable, and theme-aware icons without relying on external font libraries. SVG assets combined with CSS `mask-image` and `background-color` allow for dynamic coloring based on the UI theme (light/dark mode) using a single set of assets.

## 8. Security Considerations

*   IPC server in VSCE binds only to `localhost`.
*   IPC authentication via shared secret token has been removed. Security relies on `localhost` binding.
*   VSCE respects Workspace Trust.
*   CE content scripts operate with necessary but minimal permissions.

## 9. Future Architectural Considerations

*   More sophisticated IPC discovery (beyond fixed port range).
*   Potential for abstracting data providers in VSCE if other IDEs were to be supported (highly speculative).
*   Enhanced diagnostics aggregation across multiple workspace folders.

---

## Appendix A: Monorepo File Structure

For those needing a complete file-by-file view, the following structure is provided.

<details>
<summary>Click to expand the full file tree</summary>

```
.
├── docs
│   ├── ARCHITECTURE.md
│   ├── IPC_Protocol_Design.md
│   └── SRS.md
├── packages
│   ├── chrome-extension
│   │   ├── .eslintrc.json
│   │   ├── jest.config.js
│   │   ├── manifest.json
│   │   ├── package.json
│   │   ├── popup.html
│   │   ├── src
│   │   │   ├── ceLogger.ts
│   │   │   ├── contentScript.ts
│   │   │   ├── popup.ts
│   │   │   ├── serviceWorker.ts
│   │   │   ├── serviceWorkerClient.ts
│   │   │   ├── uiManager.ts
│   │   │   ├── serviceWorker
│   │   │   │   ├── handlers
│   │   │   │   │   ├── GetActiveFileInfoHandler.ts
│   │   │   │   │   ├── GetContentsForSelectedOpenFilesHandler.ts
│   │   │   │   │   ├── GetEntireCodebaseHandler.ts
│   │   │   │   │   ├── GetFileContentHandler.ts
│   │   │   │   │   ├── GetFileTreeHandler.ts
│   │   │   │   │   ├── GetFolderContentHandler.ts
│   │   │   │   │   ├── GetOpenFilesHandler.ts
│   │   │   │   │   ├── GetWorkspaceDetailsHandler.ts
│   │   │   │   │   ├── GetWorkspaceProblemsHandler.ts
│   │   │   │   │   ├── IMessageHandler.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── ListFolderContentsHandler.ts
│   │   │   │   │   ├── MessageHandlerMap.ts
│   │   │   │   │   ├── PushSnippetHandler.ts
│   │   │   │   │   └── SearchWorkspaceHandler.ts
│   │   │   │   ├── ports
│   │   │   │   │   └── IpcClient.ts
│   │   │   │   └── ipcClient.ts
│   │   │   └── ui
│   │   │       ├── AppCoordinator.ts
│   │   │       ├── main.ts
│   │   │       ├── stateManager.ts
│   │   │       ├── components
│   │   │       │   ├── DOMFactory.ts
│   │   │       │   ├── FloatingPanel.ts
│   │   │       │   ├── IndicatorManager.ts
│   │   │       │   ├── NotificationManager.ts
│   │   │       │   └── StyleManager.ts
│   │   │       ├── handlers
│   │   │       │   ├── ActionHandler.ts
│   │   │       │   ├── InputHandler.ts
│   │   │       │   └── MessageHandler.ts
│   │   │       ├── ports
│   │   │       │   ├── IDomFactory.ts
│   │   │       │   ├── IFloatingPanel.ts
│   │   │       │   ├── IIndicatorManager.ts
│   │   │       │   ├── INotificationManager.ts
│   │   │       │   └── IStyleManager.ts
│   │   │       ├── services
│   │   │       │   ├── ContextAPIService.ts
│   │   │       │   ├── TextInsertionService.ts
│   │   │       │   └── ThemeService.ts
│   │   │       ├── utils
│   │   │       │   ├── domUtils.ts
│   │   │       │   └── formatters.ts
│   │   │       └── view
│   │   │           ├── ViewManager.ts
│   │   │           └── renderers
│   │   │               ├── browseRenderer.ts
│   │   │               ├── openFilesRenderer.ts
│   │   │               ├── optionsRenderer.ts
│   │   │               └── searchRenderer.ts
│   │   ├── tests
│   │   │   ├── contentScript.test.ts
│   │   │   └── setup.js
│   │   └── tsconfig.json
│   ├── shared
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── data-models.ts
│   │   │   ├── index.ts
│   │   │   ├── ipc-types.ts
│   │   │   └── logger.ts
│   │   └── tsconfig.json
│   └── vscode-extension
│       ├── .eslintrc.json
│       ├── .vscodeignore
│       ├── jest.config.js
│       ├── package.json
│       ├── src
│       │   ├── diagnosticsService.ts
│       │   ├── extension.ts
│       │   ├── fileSystemService.ts
│       │   ├── ipcServer.ts
│       │   ├── searchService.ts
│       │   ├── snippetService.ts
│       │   ├── vsceLogger.ts
│       │   ├── workspaceService.ts
│       │   └── ipc
│       │       └── ports
│       │           ├── ICommandHandler.ts
│       │           ├── ICommandRegistry.ts
│       │           └── IpcServer.ts
│       ├── tests
│       │   └── unit
│       │       ├── fileSystemService.test.ts
│       │       └── ipcServer.test.ts
│       └── tsconfig.json
├── package.json
└── README.md
```

</details>

---
*This document should be updated by the development assistant whenever significant architectural changes are made, new components are added, or key design decisions are finalized.*