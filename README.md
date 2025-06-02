# ContextWeaver

ContextWeaver is a VS Code and Chrome extension pair designed to help users easily gather and utilize context from their VS Code workspace when interacting with Large Language Models (LLMs) in the Chrome browser.

## Project Purpose

The primary goal of ContextWeaver is to streamline the process of providing relevant code snippets, file contents, and project structure information to LLMs, making it more convenient and efficient for developers to leverage AI assistance for coding tasks.

## Planned Features (from SRS)

### VS Code Extension (VSCE)

*   **FR-VSCE-001 (Data Provider - File System Structure):** Shall be able to traverse the active workspace folder(s) and generate a textual representation of the file and folder hierarchy.
*   **FR-VSCE-002 (Data Provider - File Content):** Shall be able to read and provide the full UTF-8 text content of any specified file within the active workspace(s).
*   **FR-VSCE-003 (Data Provider - Folder Content):** Shall be able to read and concatenate the content of all text files within a specified folder (and its subfolders), respecting filters.
*   **FR-VSCE-004 (Data Provider - Entire Codebase Content):** Shall be able to read and concatenate the content of all text files within a specified active workspace folder, respecting filters.
*   **FR-VSCE-005 (Filtering Logic):** Shall apply `.gitignore` rules from the root of each workspace folder and default exclusion patterns.
*   **FR-VSCE-006 (Search Service):** Shall provide a search service for file and folder names within trusted workspace folders.
*   **FR-VSCE-007 (Snippet Sending):** Shall contribute a context menu item to extract selected text and its metadata, and send it to the CE.
*   **FR-VSCE-008 (Handling Multiple Workspace Folders):** Shall support multi-root workspaces, associating data with its originating workspace folder.
*   **FR-VSCE-009 (Workspace Trust):** Shall only perform file system operations within trusted workspace folders.
*   *(Related IPC Requirement FR-IPC-001 & FR-IPC-002): Hosts a local IPC server (WebSocket) with port fallback.*

### Chrome Extension (CE)

*   **FR-CE-001 (Trigger Activation):** Shall detect `@` trigger in LLM chat inputs and display a floating UI.
*   **FR-CE-002 (Floating UI - Basic Options):** Shall present options like "Insert Active File's Content" and "Insert Content of Currently Open Files".
*   **FR-CE-003 (Floating UI - Search Functionality):** Shall interpret `@<query>` for real-time search, sending queries to VSCE and displaying results.
*   **FR-CE-004 to FR-CE-009 (Content Actions):** Shall allow insertion of various content types (file tree, entire codebase, active file, open files, searched file/folder content, browsed folder content), including duplicate checks and context indicator creation. (Refer to SRS for detailed breakdown of FR-CE-004 through FR-CE-009).
*   **FR-CE-010 (Content Insertion):** Shall insert content into LLM input, replacing trigger text, with identifiable blocks.
*   **FR-CE-011 (UI Dismissal):** Floating UI shall be dismissible.
*   **FR-CE-012 (Handling Multiple VS Code Projects):** UI shall group options/results by workspace if multiple are present.
*   **FR-CE-013 (Snippet Insertion):** Shall listen for and insert pushed snippets from VSCE.
*   **FR-CE-014 & FR-CE-015 (Context Block Indicators):** Shall display and manage visual indicators for inserted content, allowing removal.
*   **FR-CE-016 (Duplicate Content Prevention):** Shall prevent re-insertion of identical content sources (except snippets).
*   **FR-CE-017 (Manual IPC Reconnection):** Shall provide a UI option for manual reconnection.
*   *(Related IPC Requirement FR-IPC-001): Acts as an IPC client to the VSCE.*

### Inter-Plugin Communication (IPC)

*   **FR-COM-001:** Define and implement a clear and versioned IPC protocol between VSCE and CE.
    *   The detailed IPC protocol has been designed and is documented in [`docs/IPC_Protocol_Design.md`](docs/IPC_Protocol_Design.md).

### Security

*   **SEC-001:** The VSCE IPC server is designed to bind only to `localhost` for security. Token-based authentication has been removed.
*   **SEC-002:** VSCE must respect VS Code's Workspace Trust feature.

## Setup and Usage

Detailed instructions on how to build, install, and use the extensions, including IPC configuration (port setting) and connection management, will be added here.

## Project Structure

ContextWeaver is developed using a monorepo structure. For details on the directory layout and component locations, please refer to the [ARCHITECTURE.MD](docs/ARCHITECTURE.MD) document.
