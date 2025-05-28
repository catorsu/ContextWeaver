# ContextWeaver

ContextWeaver is a VS Code and Chrome extension pair designed to help users easily gather and utilize context from their VS Code workspace when interacting with Large Language Models (LLMs) in the Chrome browser.

## Project Purpose

The primary goal of ContextWeaver is to streamline the process of providing relevant code snippets, file contents, and project structure information to LLMs, making it more convenient and efficient for developers to leverage AI assistance for coding tasks.

## Planned Features (from SRS)

### VS Code Extension (VSCE)

*   **FR-VSCE-001:** Open and read files from the active VS Code workspace.
*   **FR-VSCE-002:** Access and list the file/folder structure of the workspace.
*   **FR-VSCE-003:** Provide a search functionality for files and symbols within the workspace.
*   **FR-VSCE-004 & FR-VSCE-007 (Snippet Sending):** Provides a context menu option ("Send Snippet to LLM Context") to capture selected text, its file path, line numbers, and language ID, then send this data to the active Chrome Extension target.
*   **FR-VSCE-005:** Implement an IPC mechanism (WebSocket server) to communicate with the Chrome Extension, including port fallback if the default is busy.
*   **FR-VSCE-007:** Handle `.gitignore` specifications to exclude irrelevant files/folders.
*   **FR-VSCE-008:** Allow users to select one or more open projects/workspaces if multiple are open (V2).
*   **FR-VSCE-009:** Allow users to configure project-specific settings (V2).

### Chrome Extension (CE)

*   **FR-CE-001:** Detect active LLM chat interfaces in the browser (e.g., ChatGPT, Bard, Claude, Perplexity).
*   **FR-CE-002:** Provide a user interface (e.g., floating button/panel) near the LLM's input area.
*   **FR-CE-003:** Implement an IPC client to communicate with the VS Code Extension.
*   **FR-CE-004:** Request workspace data (file tree, file content, search results) from VSCE.
*   **FR-CE-005:** Display retrieved workspace data in a structured and user-friendly way.
*   **FR-CE-006:** Allow users to select context items (files, code snippets) from the displayed data.
*   **FR-CE-007:** Insert selected context into the LLM chat input, formatted appropriately (e.g., with Markdown code blocks).
*   **FR-CE-008:** Manage connection status with VSCE and provide feedback to the user.
*   **FR-CE-009:** Provide a manual reconnection option in the extension's settings.
*   **FR-CE-010:** Allow users to configure preferred LLM interface selectors if detection fails (V2).

### Inter-Plugin Communication (IPC)

*   **FR-COM-001:** Define and implement a clear and versioned IPC protocol between VSCE and CE.
    *   The detailed IPC protocol has been designed and is documented in [`docs/IPC_Protocol_Design.md`](docs/IPC_Protocol_Design.md).

### Security

*   **SEC-001:** IPC communication relies on `localhost` binding. Token-based authentication has been removed.
*   **SEC-002:** VSCE must respect VS Code's Workspace Trust feature.

## Setup and Usage

Detailed instructions on how to build, install, and use the extensions, including updated IPC configuration and connection management, will be added here.

Instructions on how to build, install, and use the extensions will be added here.

## Project Structure

ContextWeaver is developed using a monorepo structure. For details on the directory layout and component locations, please refer to the [ARCHITECTURE.MD](docs/ARCHITECTURE.MD) document.
