# ContextWeaver: System Architecture

**Version:** 0.1
**Date:** May 26, 2025

## 1. Introduction

This document outlines the software architecture of the ContextWeaver system. It describes the major components, their responsibilities, interactions, and key design decisions. This document is intended to be a living document, updated as the system evolves.

The primary goal of the ContextWeaver is to provide users with a convenient and efficient way to add content and context from their VS Code projects directly into Large Language Model (LLM) chat interfaces.

Refer to the `Software_Requirements_Specification.md` for detailed functional and non-functional requirements.
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

The proposed top-level directory structure will be:

```
ContextWeaver/
├── .git/
├── .vscode/                   # VS Code workspace settings
├── docs/                      # Project documentation (SRS, Architecture, Dev Plan, etc.)
├── packages/
│   ├── vscode-extension/      # Source code and build system for VSCE
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── chrome-extension/      # Source code and build system for CE
│   │   ├── src/
│   │   ├── manifest.json
│   │   └── tsconfig.json
│   └── shared/                # Shared code, e.g., IPC type definitions
│       ├── src/
│       └── tsconfig.json
├── .gitignore
├── package.json               # Root package.json for managing workspaces (e.g., with Yarn or Lerna)
└── README.md
```

This structure allows for:
*   Independent build processes for each extension.
*   A dedicated `shared` package for common code, easily imported by both extensions.
*   Centralized management of development dependencies and scripts via the root `package.json` if using a workspace manager like Yarn Workspaces or Lerna (to be decided in build system setup).

## 4. Component Breakdown

### 4.1. VS Code Extension (VSCE)

*   **Responsibilities:**
    *   **Data Provider:** Accessing and providing file/folder structures, file content, and search results from the active VS Code workspace(s).
    *   **Filtering Logic:** Applying `.gitignore` rules or default filters to exclude irrelevant content.
    *   **IPC Server:** Hosting a local server (WebSocket) to listen for requests from the CE. Includes port fallback mechanism and message routing.
    *   **Snippet Handling:** Capturing selected code snippets and pushing them to the CE.
    *   **Workspace Management:** Handling multi-root workspaces and respecting VS Code's Workspace Trust feature.
*   **Key Modules (Planned/Conceptual):**
    *   `ipcServer.ts`: Manages the WebSocket server, connection handling, authentication, and message deserialization/serialization.
    *   `fileSystemService.ts`: Handles all interactions with the file system (reading files, listing directories, traversing structures).
    *   `filterService.ts`: Implements `.gitignore` parsing and default filtering logic.
    *   `searchService.ts`: Provides file/folder search capabilities within the workspace.
    *   `workspaceService.ts`: Manages information about open workspace folders and trust status.
    *   `snippetService.ts`: Responsible for preparing snippet data (selected text, file path, line numbers, language ID, and associated metadata) when triggered by the user. It does not directly handle IPC sending but provides the data to `extension.ts` for dispatch.
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
    *   `contentScript.ts`: Injected into LLM web pages to handle UI triggers, DOM manipulation for the floating panel and indicators, and communication with the service worker.
    *   `serviceWorker.ts` (or `background.ts` if Manifest V2 features are needed, though V3 is preferred): Manages the IPC client connection to VSCE, handles messages from content scripts, and potentially maintains some background state.
    *   `uiManager.ts` (or similar, could be part_of `contentScript.ts`): Specifically handles the creation, display, and logic of the floating UI and context block indicators.
    *   `ipcClient.ts`: Encapsulates the logic for connecting to and communicating with the VSCE IPC server.
    *   `storageService.ts`: Manages any persistent settings for the CE (e.g., IPC token, port).
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
    *   CE requests project data (file tree, file content, search) from VSCE.
    *   VSCE responds with data or error messages.
    *   VSCE pushes code snippets to CE.
    *   CE registers its active tab/context with VSCE for snippet targeting.

## 5. Data Model (Key Structures)

*(This section will be populated with important data structures as they are defined, especially those used in IPC or for internal state management. Refer to `Software_Requirements_Specification.md` section 3.3 for initial data formatting requirements for LLM insertion.)*

*   **Context Block Metadata:** (As per FR-IPC-005)
    *   `unique_block_id`: string
    *   `content_source_id`: string
    *   `type`: string (e.g., "file_tree", "file_content", "code_snippet")
    *   `label`: string

## 6. Key Design Decisions & Rationale

*(This section will log significant design choices made during development and the reasons behind them. Examples:)*
*   **[YYYY-MM-DD] Decision:** Chose WebSockets for IPC.
    *   **Rationale:** Allows for bidirectional communication, efficient for pushing snippets from VSCE to CE, and well-supported in both Node.js (VSCE) and browser environments (CE).
*   **[YYYY-MM-DD] Decision:** Root `.gitignore` only for V1.
    *   **Rationale:** Simplifies initial implementation complexity, aligning with SRS 1.2. Future versions may support subdirectory `.gitignore` files.
*   **[YYYY-MM-DD] Decision:** Adopt a monorepo structure.
    *   **Rationale:** Simplifies management of shared code (e.g., IPC type definitions), versioning, and coordinated development and issue tracking between the VS Code Extension and Chrome Extension components.

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
