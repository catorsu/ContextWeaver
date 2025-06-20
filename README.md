# ContextWeaver

ContextWeaver is a VS Code and Chrome extension pair designed to help users easily gather and utilize context from their VS Code workspace when interacting with Large Language Models (LLMs) in the Chrome browser.

## Project Purpose

The primary goal of ContextWeaver is to streamline the process of providing relevant code snippets, file contents, and project structure information to LLMs, making it more convenient and efficient for developers to leverage AI assistance for coding tasks.

## Features

### VS Code Extension (VSCE)

*   **File System Structure:** Traverses active workspace folder(s) and generates textual representations of file and folder hierarchies.
*   **File Content Access:** Reads and provides full UTF-8 text content of any specified file within active workspace(s).
*   **Folder Content Aggregation:** Reads and concatenates content of all text files within specified folders (including subfolders), respecting filters.
*   **Entire Codebase Content:** Reads and concatenates content of all text files within workspace folders, respecting filters.
*   **Smart Filtering:** Applies `.gitignore` rules from workspace roots plus default exclusion patterns (node_modules, .git, etc.).
*   **Search Service:** Provides real-time search for file and folder names within trusted workspace folders.
*   **Code Snippet Sending:** Context menu integration to extract selected text with metadata and send to Chrome Extension.
*   **Multi-Root Workspace Support:** Handles multiple workspace folders, associating data with originating workspace.
*   **Workspace Trust Integration:** Respects VS Code's workspace trust feature for security.
*   **Multi-Window Support:** Aggregates context from multiple VS Code windows using primary/secondary server architecture.
*   **Workspace Problems:** Collects and formats all workspace diagnostics (errors, warnings, info, hints) from VS Code's language services.
*   **Local IPC Server:** Hosts WebSocket server on localhost with automatic port fallback for Chrome Extension communication.

### Chrome Extension (CE)

*   **@ Trigger Activation:** Detects `@` trigger in LLM chat inputs and displays contextual floating UI.
*   **Quick Access Options:** Presents immediate options like "Insert Active File's Content" and "Insert Content of Currently Open Files".
*   **Real-Time Search:** Interprets `@<query>` for instant search, sending queries to VS Code and displaying live results.
*   **Content Insertion Actions:** Supports insertion of various content types:
    *   File tree structures for workspace overview
    *   Entire codebase content (filtered by .gitignore rules)
    *   Individual file contents
    *   Multiple selected files from open tabs
    *   Search result files and folders
    *   **Interactive Browse View:** When clicking folders in search results, opens hierarchical tree interface for fine-grained file/subfolder selection
*   **Smart Content Management:** Inserts content into LLM input with identifiable blocks, replacing trigger text seamlessly.
*   **Intuitive UI Controls:** Floating UI dismissible via Escape key or clicking outside; auto-dismisses after content insertion.
*   **Multi-Project Organization:** Groups options and results by workspace when multiple VS Code projects are open.
*   **Code Snippet Integration:** Receives and inserts code snippets sent from VS Code context menu.
*   **Visual Context Indicators:** Displays removable indicators above chat input showing what context has been added, with click-to-inspect functionality.
*   **Duplicate Prevention:** Prevents re-insertion of identical content sources (code snippets exempt for flexibility).
*   **Connection Management:** Provides manual IPC reconnection option with status feedback.
*   **Multi-Window Support:** Aggregates and displays context from multiple open VS Code windows.
*   **Workspace Problems Integration:** Inserts formatted list of current workspace diagnostics (errors, warnings, info, hints).
*   **Theme Awareness:** Automatically adapts to browser's light/dark theme preferences.
*   **Modular UI Architecture:** Employs a robust, modular design using a `UIManager` Facade to orchestrate specialized components for styling (`StyleManager`), DOM creation (`DOMFactory`), notifications (`NotificationManager`), and UI elements (`FloatingPanel`, `IndicatorManager`). This ensures a clean separation of concerns and maintainability.

### Inter-Plugin Communication (IPC)

*   **Versioned Protocol:** Implements a clear, versioned IPC protocol for reliable communication between VS Code and Chrome extensions.
*   **WebSocket Communication:** Uses WebSocket connections for real-time, bidirectional data exchange.
*   **Automatic Port Discovery:** VS Code extension attempts multiple ports (30001+) with automatic fallback; Chrome extension scans the same range.
*   **Multi-Window Architecture:** Primary/secondary server model enables multiple VS Code windows to share context seamlessly.
*   **Detailed Documentation:** Complete protocol specification available in [`docs/IPC_Protocol_Design.md`](docs/IPC_Protocol_Design.md).

### Security

*   **Localhost-Only Binding:** IPC server binds exclusively to `localhost` (127.0.0.1) for security isolation.
*   **Workspace Trust Integration:** Respects VS Code's Workspace Trust feature, only operating on trusted workspace folders.
*   **No External Network Access:** All communication occurs locally between browser and VS Code on the same machine.

## Setup and Usage

Detailed instructions on how to build, install, and use the extensions, including IPC configuration (port setting) and connection management, will be added here.

## Project Structure

ContextWeaver is developed using a monorepo structure with a clean **hexagonal (ports and adapters)** architecture:

```
packages/
├── shared/                          # Shared TypeScript definitions
│   └── src/
│       ├── ipc-types.ts            # IPC message contracts
│       ├── data-models.ts          # Core data structures
│       └── logger.ts               # Unified logging interface
├── vscode-extension/               # Backend data provider
│   └── src/
│       ├── core/                   # Application-agnostic business logic
│       │   ├── entities/           # Core data structures (Client, Aggregation)
│       │   ├── ports/              # Service interfaces (hexagonal ports)
│       │   └── services/           # Core application services
│       ├── adapters/               # Infrastructure-specific implementations
│       │   ├── primary/ipc/        # IPC server, handlers, strategies
│       │   └── secondary/logging/  # Output adapters (logging)
│       └── extension.ts            # Dependency injection entry point
└── chrome-extension/               # Frontend user interface
    └── src/
        ├── ui/                     # Content script modular architecture
        └── serviceWorker/          # Background IPC client

```

This architecture separates core business logic from infrastructure concerns, making the system more maintainable, testable, and following clean architecture principles.

For detailed component relationships and design decisions, please refer to the [ARCHITECTURE.md](docs/ARCHITECTURE.md) document.
