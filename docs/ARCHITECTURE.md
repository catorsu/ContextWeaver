# ContextWeaver: System Architecture

**Version:** 0.1
**Date:** May 26, 2025

## 1. Introduction

This document outlines the software architecture of the ContextWeaver system. It describes the major components, their responsibilities, interactions, and key design decisions. This document is intended to be a living document, updated as the system evolves.

The primary goal of the ContextWeaver is to provide users with a convenient and efficient way to add content and context from their VS Code projects directly into Large Language Model (LLM) chat interfaces.

Refer to the `SRS.md` for detailed functional and non-functional requirements.
Refer to the `Development_Plan.md` for the project's development phases and tasks.

## 2. Guiding Principles

The architecture adheres to principles outlined in the `<Guide_LLM_Context_Helper_Development>` document, including:
*   Separation of Concerns
*   Single Responsibility Principle (SRP)
*   KISS (Keep It Simple, Stupid)
*   DRY (Don't Repeat Yourself)
*   Security by Design
*   Maintainability and Testability

## 3. System Overview

The ContextWeaver consists of two main components:

*   **VS Code Extension (VSCE):** Runs within Visual Studio Code, responsible for accessing project data, file system operations, and hosting the IPC server with port fallback capabilities.
*   **Chrome Extension (CE):** Runs within the Google Chrome browser, responsible for the user interface (floating panel, context indicators), interacting with LLM web pages, and acting as the IPC client.

These components communicate via an Inter-Plugin Communication (IPC) mechanism.

![High-Level Architecture Diagram Placeholder](diagrams/high_level_architecture.png)
*(A diagram should be added here once the core components are more defined, showing VSCE, CE, IPC, and user interaction points.)*

## 3.1. Version Control and Monorepo Structure

ContextWeaver will be developed within a single Git repository (monorepo) to facilitate management of shared code (e.g., IPC types) and coordinated development between the VS Code Extension and the Chrome Extension.

The project follows this directory structure:

```
ContextWeaver/
├── docs/                      # Project documentation
│   ├── ARCHITECTURE.MD
│   ├── Development_Plan.md
│   ├── IPC_Protocol_Design.md
│   ├── SRS.md
│   └── TROUBLESHOOTING_AND_LESSONS_LEARNED.md
├── packages/
│   ├── vscode-extension/      # VS Code Extension (VSCE)
│   │   ├── src/               # Source files for VSCE
│   │   │   ├── extension.ts
│   │   │   ├── fileSystemService.ts
│   │   │   ├── ipcServer.ts
│   │   │   ├── searchService.ts
│   │   │   ├── snippetService.ts
│   │   │   └── workspaceService.ts
│   │   ├── tests/             # Tests for VSCE
│   │   │   └── unit/          #   - Unit test files (e.g., ipcServer.test.ts)
│   │   ├── .eslintrc.json     # ESLint configuration
│   │   ├── jest.config.js     # Jest configuration
│   │   ├── package.json       # NPM manifest
│   │   └── tsconfig.json      # TypeScript configuration
│   ├── chrome-extension/      # Chrome Extension (CE)
│   │   ├── src/               # Source files for CE
│   │   │   ├── contentScript.ts
│   │   │   ├── popup.ts           // Handles settings and connection management
│   │   │   ├── serviceWorker.ts
│   │   │   ├── uiManager.ts         // ADDED
│   │   │   ├── stateManager.ts      // ADDED
│   │   │   └── serviceWorkerClient.ts // ADDED
│   │   ├── images/            # Static image assets
│   │   ├── .eslintrc.json     # ESLint configuration
│   │   ├── manifest.json      # CE manifest
│   │   ├── package.json       # NPM manifest
│   │   ├── tsconfig.json      # TypeScript configuration
│   │   └── popup.html         // Main popup UI with settings
│   └── shared/                # Shared code
│       ├── src/               # Source files for shared code
│       │   ├── data-models.ts     // ADDED
│       │   ├── ipc-types.ts       // ADDED
│       │   └── index.ts           // ADDED
│       ├── package.json       # NPM manifest
│       └── tsconfig.json      # TypeScript configuration
├── .gitignore                 # Specifies gitignored files
├── package.json               # Root NPM manifest (workspaces, common scripts)
└── README.md                  # Project README
```

*(Note: This diagram aims to represent a comprehensive view of the project structure, including source code, key configuration files, and commonly generated directories like `node_modules/` and `dist/` (which are typically gitignored but essential for development and building). It omits OS-specific generated files and AI-development-environment-specific files like `.claude/` or `CLAUDE.md`. The exact contents of `src/` and `tests/` directories will evolve as development progresses and should be updated here accordingly.)*

The diagram above outlines the ContextWeaver monorepo's primary source-controlled structure. Adherence to this structure achieves the following:

*   **Modular Development:** Enables independent development, building, and testing for each core package (`vscode-extension`, `chrome-extension`, `shared`).
*   **Code Reusability:** Consolidates shared code (IPC types, utilities, constants) in `packages/shared/` for use by all extensions, ensuring consistency and reducing duplication.
*   **Centralized Control:** Utilizes the root `package.json` for managing project-wide dependencies and defining common operational scripts.

**Documentation Mandate: Structural Updates**
This `Version Control and Monorepo Structure` section (diagram and text) **MUST** be updated immediately if any of the following occur:
    1.  Modification of the top-level directory layout.
    2.  Addition, removal, or renaming of packages within `packages/`.
    3.  Architecturally significant changes to a package's internal source organization or key configuration files.
Accurate and current structural documentation is mandatory for project integrity and contributor clarity.

## 4. Component Breakdown

### 4.1. VS Code Extension (VSCE)

*   **Responsibilities:**
    *   **Data Provider:** Accessing and providing file/folder structures, file content, and search results from the active VS Code workspace(s).
    *   **Filtering Logic:** Applying `.gitignore` rules or default filters to exclude irrelevant content.
    *   **IPC Server:** Hosting a local server (WebSocket) to listen for requests from the CE. Includes port fallback mechanism and message routing.
    *   **Snippet Handling:** Capturing selected code snippets and pushing them to the CE.
    *   **Workspace Management:** Handling multi-root workspaces and respecting VS Code's Workspace Trust feature.
*   **Key Modules (Planned/Conceptual):**
    *   `ipcServer.ts`: Manages the WebSocket server, connection handling (client registration), and message deserialization/serialization. Implements the primary/secondary architecture for multi-window support, including leader election, secondary VSCE registration, request forwarding to secondary instances, and response aggregation. (Note: Token-based authentication has been removed).
    *   `fileSystemService.ts`: Handles all interactions with the file system (reading files, listing directories, traversing structures). It also includes logic for `.gitignore` parsing and applying default/gitignore-based filtering rules.
    *   `searchService.ts`: Provides file/folder search capabilities within the workspace.
    *   `workspaceService.ts`: Centralizes logic for interacting with the VS Code workspace. It provides information about open workspace folders (including multi-root scenarios), their URIs, names, and the overall workspace trust state. It's used by other services to ensure operations are performed on trusted and valid workspaces.
    *   `snippetService.ts`: Responsible for preparing snippet data (selected text, file path, line numbers, language ID, and associated metadata) when triggered by the user. It does not directly handle IPC sending but provides the data to `extension.ts` for dispatch.
    *   `diagnosticsService.ts`: Responsible for fetching and formatting workspace diagnostics (problems). Retrieves all diagnostics from VS Code's language services, filters them by workspace folder, and formats them into a human-readable list with severity levels, file paths, line numbers, and diagnostic messages.
    *   `extension.ts`: The main entry point for the VSCE, responsible for activating and coordinating modules.
*   **Technology Stack:**
    *   TypeScript
    *   VS Code API
    *   Node.js (runtime environment provided by VS Code)
    *   WebSocket library (e.g., `ws`)

### 4.2. Chrome Extension (CE)

*   **Responsibilities:**
    *   **User Interface (UI):** Rendering and managing the floating UI for context selection, displaying context block indicators, and handling user interactions.
    *   **LLM Page Interaction:** Detecting trigger characters (`@`) in chat inputs, inserting content, and managing the display of context indicators on supported LLM web pages.
    *   **IPC Client:** Connecting to the VSCE server, sending requests, and handling responses.
    *   **State Management:** Managing the state of active context blocks and duplicate content prevention.
*   **Key Modules (Planned/Conceptual):**
    *   `contentScript.ts`: Injected into LLM web pages. Responsible for detecting user triggers (`@`), orchestrating UI interactions by utilizing `UIManager`, managing application state via `StateManager`, and delegating communication with the service worker to `ServiceWorkerClient`.
    *   `serviceWorker.ts`: Manages the IPC client connection to the VSCE. Handles messages from `contentScript.ts`, relays requests to VSCE, and forwards VSCE responses and push messages.
    *   `uiManager.ts`: Encapsulates all logic related to the floating UI panel and context indicators. Provides methods for creating UI elements, managing display state, and handling notifications (toasts) and loading overlays.
    *   `stateManager.ts`: Centralizes the management of client-side state for `contentScript.ts`, including active context blocks, search state, and the target LLM input element.
    *   `serviceWorkerClient.ts`: Acts as an abstraction layer (API client) for `contentScript.ts` to communicate with `serviceWorker.ts`.
    *   `popup.ts`: Handles the logic for the browser action popup (`popup.html`), which now contains all user-facing settings (IPC port) and connection management controls.
    *   **Technology Stack:**
    *   TypeScript/JavaScript
    *   Chrome Extension APIs (Content Scripts, Service Workers, Storage, etc.)
    *   HTML, CSS (for UI elements)
    *   WebSocket API (browser-native)

### 4.3. Inter-Plugin Communication (IPC)

*   **Mechanism:** WebSocket connection over `localhost`, with port fallback if the default port is in use.
*   **Protocol:** JSON-based messages. (Detailed message schemas are defined in the `docs/IPC_Protocol_Design.md` document).
*   **Authentication:** Removed. Relies on `localhost` binding for security.
*   **Key Data Flows:**
    *    CE requests project data (file tree, file content, folder content, search, directory listings) from VSCE.
    *   VSCE responds with data or error messages.
    *   VSCE pushes code snippets to CE.
    *   CE registers its active tab/context with VSCE for snippet targeting.

## 5. Data Model (Key Structures)

The primary data structures, especially those used for Inter-Plugin Communication (IPC) and for representing core entities like context blocks, files, and search results, are now formally defined as TypeScript interfaces within the `packages/shared/src/` directory.

Key data models include:
*   **`ContextBlockMetadata`**: Defined in `packages/shared/src/data-models.ts`. Describes the metadata for each block of content inserted into the LLM chat.
*   **`FileData`**: Defined in `packages/shared/src/data-models.ts`. Represents the content and properties of a single file.
*   **`SearchResult`**: Defined in `packages/shared/src/data-models.ts`. Structure for items returned by the workspace search.
*   **`DirectoryEntry`**: Defined in `packages/shared/src/data-models.ts`. Structure for items listed in a directory.
*   **IPC Payloads**: All request, response, and push message payloads are defined as interfaces in `packages/shared/src/ipc-types.ts`.

Refer to these TypeScript files for the authoritative definitions of these structures. The `docs/IPC_Protocol_Design.md` provides a human-readable overview that aims to mirror these type definitions.

## 6. Key Design Decisions & Rationale

*(This section will log significant design choices made during development and the reasons behind them. Examples:)*
*   **[YYYY-MM-DD] Decision:** Chose WebSockets for IPC.
    *   **Rationale:** Allows for bidirectional communication, efficient for pushing snippets from VSCE to CE, and well-supported in both Node.js (VSCE) and browser environments (CE).
*   **[YYYY-MM-DD] Decision:** Root `.gitignore` only for V1.
    *   **Rationale:** Simplifies initial implementation complexity, aligning with SRS 1.2. Future versions may support subdirectory `.gitignore` files.
*   **[YYYY-MM-DD] Decision:** Adopt a monorepo structure.
    *   **Rationale:** Simplifies management of shared code (e.g., IPC type definitions), versioning, and coordinated development and issue tracking between the VS Code Extension and Chrome Extension components.
*   **[2025-05-28] Decision:** Removed token-based authentication for IPC.
    *   **Rationale:** Simplified user setup and reduced friction. Security relies on the VSCE server binding exclusively to `localhost`, mitigating external access risks. The risk from other local malicious software was deemed acceptable for V1 given the nature of data exchanged. (See `TROUBLESHOOTING_AND_LESSONS_LEARNED.md` entry `[2025-05-28] - IPC Simplification...`)
*   **[2025-06-02] Decision:** Use `chrome.tabs.sendMessage(targetTabId, ...)` for forwarding `push_snippet` messages from CE Service Worker to Content Script.
    *   **Rationale:** Resolved "Receiving end does not exist" errors encountered when using `chrome.runtime.sendMessage`. Targeting the specific content script via its known `targetTabId` (provided in the snippet payload) proved more reliable for this push mechanism. (See `TROUBLESHOOTING_AND_LESSONS_LEARNED.md` entry `[2025-06-02] - Snippet Push from VSCE Not Received by CE Content Script`)
*   **[June 05, 2025] Decision:** Introduced a `packages/shared/src` module for defining common TypeScript types for IPC and data models.
    *   **Rationale:** To enforce type safety, ensure consistency between the Chrome Extension (CE) and VS Code Extension (VSCE), improve maintainability, and adhere to DRY (Don't Repeat Yourself) principles for the IPC contract. This makes the communication protocol explicit and verifiable at compile-time.
*   **[June 05, 2025] Decision:** Modularized the main Chrome Extension content script (`contentScript.ts`) by extracting responsibilities into `UIManager.ts` (UI rendering and DOM utilities), `StateManager.ts` (client-side state management), and `ServiceWorkerClient.ts` (abstraction for communication with the service worker).
    *   **Rationale:** To improve separation of concerns, reduce the complexity of `contentScript.ts`, enhance readability, maintainability, and the potential for future testing, adhering to the Single Responsibility Principle (SRP).
*   **[June 05, 2025] Decision:** Refined connection management logic within `IPCClient` (in `serviceWorker.ts`) and integrated shared types for all IPC messages handled by `IPCClient` (service worker) and `IPCServer` (VS Code extension).
    *   **Rationale:** To improve the stability and predictability of the WebSocket connection and retry mechanisms. Using shared types ensures robust, type-safe communication between the browser and VS Code components.
*   **[June 05, 2025] Decision:** Aligned the return types of core VS Code Extension services (`fileSystemService.ts`, `searchService.ts`) with the shared types.
    *   **Rationale:** To reduce the need for data transformation or casting within `ipcServer.ts`, making the data flow from services to IPC responses more direct and type-safe.
*   **[2025-06-XX] Decision:** Implemented Primary/Secondary architecture for multi-window VS Code support.
    *   **Rationale:** To enable the Chrome Extension to aggregate data (search results, open files, etc.) from multiple VS Code windows simultaneously. The primary/secondary model provides a scalable solution where one VSCE instance acts as a coordinator, forwarding requests to other VS Code windows and aggregating their responses. This approach avoids the complexity of the Chrome Extension managing multiple direct connections while ensuring all open VS Code windows can contribute data to the LLM context. The leader election mechanism ensures automatic failover if the primary window is closed.
*   **Decision:** Use client-side logic to build hierarchical tree views from a flat list of file entries provided by the VSCE.
    *   **Rationale:** Simplifies the backend (VSCE) logic by having it provide a simple, flat list of all recursive descendants. This offloads the view-specific task of rendering a tree to the client (CE), making the API more generic and reducing the complexity of the data sent over IPC. (Reflected in `contentScript.ts`'s `buildTreeStructure` function).
*   **Decision:** Implement UI icons using SVG files with CSS masking for coloring.
    *   **Rationale:** Provides high-quality, scalable icons without relying on external font libraries. Using CSS `mask-image` and `background-color` allows for easy, dynamic theme-aware coloring (light/dark mode) with a single set of SVG assets. (Reflected in `uiManager.ts`'s `createIcon` method).

## 7. Security Considerations

*   IPC server in VSCE binds only to `localhost`.
*   IPC authentication via shared secret token has been removed. Security relies on `localhost` binding.
*   VSCE respects Workspace Trust.
*   CE content scripts operate with necessary but minimal permissions.

## 8. Future Architectural Considerations (Post V1)

*   Support for multiple VS Code windows.
*   More sophisticated IPC discovery (beyond fixed port range).
*   Potential for abstracting data providers in VSCE if other IDEs were to be supported (highly speculative).

## 9. Diagrams

*(This section will list and potentially embed key architectural diagrams as they are created. E.g., sequence diagrams for IPC, component diagrams.)*

*   `diagrams/high_level_architecture.png`
*   `diagrams/ipc_sequence_example.png` (Placeholder)

---
*This document should be updated by the development assistant whenever significant architectural changes are made, new components are added, or key design decisions are finalized, especially at the end of relevant Development Plan phases.*
