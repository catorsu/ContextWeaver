# System Guidance: Claude Code (claude.ai/code)

**Objective:** Implement code changes per provided instructions, test, iterate, and document troubleshooting lessons.

**Core Directives:**
*   **MANDATORY: Think Step-by-Step.** Explain reasoning thoroughly before/during each action.
*   **Instruction Adherence:** Strictly follow the "Implementation Plan" you receive.
*   **Clarification Protocol:** If the Implementation Plan is unclear or contradictory, **MUST** state this. Request clarification *before* implementing.
*   **Iterative Refinement:** Implement, report changes, await feedback. Repeat until functional correctness is confirmed.

## Project Overview
- **Type:** Monorepo: VS Code Extension (VSCE) & Chrome Extension (CE).
- **Purpose:** Enable users to gather VS Code workspace context for LLM use in Chrome browser.
- **Technology:** TypeScript, Node.js (VSCE), Web APIs (CE), WebSockets (IPC).

The project is organized within the following file structure:
```
ContextWeaver/
├── docs/                      # Project Documentation
│   ├── ARCHITECTURE.MD
│   ├── Development_Plan.md
│   ├── IPC_Protocol_Design.md # Details VSCE-CE communication
│   ├── Software_Requirements_Specification.md # (SRS)
│   └── TROUBLESHOOTING_AND_LESSONS_LEARNED.md
├── packages/
│   ├── vscode-extension/      # VS Code Extension (VSCE)
│   │   ├── src/               # Core VSCE Source Files
│   │   │   ├── extension.ts   #   - Main entry point
│   │   │   ├── fileSystemService.ts # - File system operations
│   │   │   ├── ipcServer.ts   #   - IPC logic & WebSocket server
│   │   │   ├── searchService.ts #   - Workspace search functionality
│   │   │   ├── snippetService.ts #  - Code snippet preparation
│   │   │   └── workspaceService.ts # - VS Code workspace interaction
│   │   ├── tests/             #   - VSCE tests
│   │   │   └── unit/
│   │   ├── .eslintrc.json
│   │   ├── jest.config.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── chrome-extension/      # Chrome Extension (CE)
│   │   ├── src/               # Core CE Source Files
│   │   │   ├── contentScript.ts # - Interacts with LLM pages, UI trigger
│   │   │   ├── options.ts     #   - Settings page logic
│   │   │   ├── popup.ts       #   - Browser action popup logic
│   │   │   └── serviceWorker.ts # - Background tasks, IPC client
│   │   ├── images/
│   │   ├── .eslintrc.json
│   │   ├── manifest.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── popup.html
│   │   └── options.html
│   └── shared/                # Shared Code (e.g., IPC types)
│       ├── src/
│       ├── dist/
│       ├── package.json
│       └── tsconfig.json
├── .gitignore
├── package.json               # Root NPM manifest
└── README.md                  # General Project Information
```


## Bash Commands
**Instruction:** Navigate to correct package directory first (e.g., `cd packages/vscode-extension`).

**VSCE (`packages/vscode-extension/`):**
```bash
npm run compile
npm run watch
npm run lint
npm run test
npm run test:watch
```

**CE (`packages/chrome-extension/`):**
```bash
npm run build
npm run compile
npm run watch
npm run lint
```

## Implementation & Coding Standards

### 1. General Principles
*   **Single Responsibility Principle (SRP):** Ensure your functions/modules have one primary reason to change.
*   **Don't Repeat Yourself (DRY):** Abstract common logic.
*   **KISS (Keep It Simple, Stupid):** Prioritize straightforward solutions.
*   **YAGNI (You Aren't Gonna Need It):** Implement only what the current Implementation Plan specifies.
*   **Meaningful Names:** Use clear, descriptive names for variables, functions, classes.
*   **Small, Focused Functions/Modules:** Each function does one thing well.
*   **Clear Control Flow:** Avoid overly complex/nested logic.

### 2. Code Commenting Standards

**MANDATORY:** Adhere to these standards for all code comments.

#### Guiding Principles
*   Use clear, precise language. Be explicit: intent, params, returns, side effects, UI interactions.
*   Comments: Explain *why* (design rationale, workflow role), not just *what*.
*   Docstrings: Meticulously define TypeScript interfaces (APIs, IPC messages).
*   CE UI: Clearly document local state and `useEffect`-like patterns.
*   JSDoc: Use specified formats consistently.
*   **MUST:** Keep comments synchronized with code.
*   Comments: Complement TypeScript; do not duplicate type definitions.

#### General Commenting Rules
*   Wrap comments/docstrings: 80-100 chars.
*   Sentences: Complete, capitalized, period-terminated.
*   **NO COMMENTS** in JSON files.

#### JSDoc Usage (`/** ... */`)

##### File-Level Comments (Top of each significant `.ts` file)
*   **Purpose:** Summarize file's role (VSCE/CE).
*   **Content:**
    *   `@file FileName.ts`
    *   `@description Brief purpose summary.`
    *   `(Optional) Detailed explanation.`
    *   `@module ContextWeaver/VSCE` or `@module ContextWeaver/CE`
*   **Example (VSCE - `ipcServer.ts`):**
    ```typescript
    /**
     * @file ipcServer.ts
     * @description Hosts the WebSocket server for IPC between the VSCE and CE.
     * Handles incoming requests, authentication, and routes to appropriate service modules.
     * @module ContextWeaver/VSCE
     */
    ```

##### Function and Method Docstrings
*   **Purpose:** Explain behavior, params, return, side effects.
*   **Key JSDoc Tags:**
    *   `@description Detailed explanation.`
    *   `@param {ParamType} paramName - Description. Optional: `[paramName]`."
    *   `@returns {ReturnType} - Description. Async: `@returns {Promise<ReturnType>}`."
    *   `@throws {ErrorType} - Conditions for unhandled errors.`
    *   `@sideeffect Describe side effects (e.g., WebSocket send, file op, state update).`
    *   `@example Basic usage snippet.`
*   **Example (VSCE - `fileService.ts`):**
    ```typescript
    /**
     * @description Reads the content of a specified file, applying .gitignore filtering.
     * @param {vscode.Uri} fileUri - The URI of the file to read.
     * @param {Ignore} gitignoreFilter - Pre-compiled gitignore filter instance.
     * @returns {Promise<string | null>} The file content as a string, or null if filtered or binary.
     * @sideeffect Reads from the file system.
     */
    export async function readFileWithFilter(fileUri: vscode.Uri, gitignoreFilter: Ignore): Promise<string | null> {
      // ... logic
    }
    ```

##### TypeScript Type and Interface Comments
*   **Purpose:** Explain custom types/interfaces (IPC payloads, complex data).
*   **Format:** Use `/** ... */` above `type` or `interface`.
*   **Content:**
    *   `@interface InterfaceName` or `@typedef {object} TypeName`
    *   `@description Representation (e.g., 'Payload for X request').`
    *   Properties: `propertyName: type; // Brief meaning.`
*   **Example (Shared or CE - `types.ts`):**
    ```typescript
    /**
     * @interface IPCResponseMessage
     * @description Defines the structure for a generic response message sent from VSCE to CE.
     */
    export interface IPCResponseMessage {
      success: boolean;             // Indicates if the operation was successful
      data?: any;                   // Payload if successful
      error?: string;               // Error message if not successful
      unique_block_id?: string;     // For content blocks, the unique ID for this instance
      content_source_id?: string;   // For content blocks, the canonical source ID
      type?: string;                // For content blocks, the type of content
      label?: string;               // For content blocks, the display label for indicators
    }
    ```

##### UI Component/Module Docstrings (CE - for floating UI elements)
*   **Purpose:** Explain CE UI element: role, params, state, events.
*   **Key JSDoc Tags:**
    *   `@description UI element purpose/features.`
    *   `@param {ParamType} paramName - Config/render params.`
    *   `@returns {HTMLElement | void}` (or relevant type).
    *   `@sideeffect DOM modifications, event listener setup.`
*   **Example (CE - `floatingUi.ts`):**
    ```typescript
    /**
     * @description Creates and displays the main floating UI panel near the target chat input.
     * @param {HTMLElement} targetInputElement - The LLM chat input element to anchor near.
     * @returns {void}
     * @sideeffect Appends the floating UI to the DOM. Sets up event listeners.
     */
    export function showFloatingUi(targetInputElement: HTMLElement): void {
      // ... logic to create and show UI
    }
    ```

##### Inline Comments (`//` or `/* ... */`)
*   **Purpose:**
    *   Explain complex conditional logic.
    *   Clarify non-obvious algorithms/business rules.
    *   Detail specific IPC message handling logic.
    *   Document workarounds or non-standard solutions.
    *   `// TODO: Description of pending work.`
    *   `// FIXME: Description of bug and impact.`
*   **Example (CE - main content script):**
    ```typescript
    // Check if the typed character is the trigger and if UI should be shown
    if (event.key === '@' && !isUiVisible) {
      // Further logic to determine context and show UI...
    }
    ```

#### Maintenance
*   **MUST:** Update all related JSDoc/comments when code changes.

### 3. Error Handling
*   Anticipate potential errors (file ops, API calls, IPC).
*   Handle errors gracefully per the Implementation Plan.

### 4. Testing (VSCE)
*   If modifying `packages/vscode-extension/src/`:
    *   **MUST** ensure `npm run test` is executed.
    *   **MUST** analyze failures and fix code until all tests pass.
    *   Report test outcomes.

## Workflow

1.  Ingest the Implementation Blueprint.
2.  Execute the plan. Adhere to all coding and commenting standards.
3.  Provide a clear summary of all files created/modified.
4.  Receive new/revised instructions. Repeat step 2 (Implement) and 3 (Report).
5.  **MUST** propose a detailed entry for `docs/TROUBLESHOOTING_AND_LESSONS_LEARNED.md`, If a significant, non-trivial problem is encountered and resolved *by you* during implementation/debugging
6.  Provide final, comprehensive summary of *your code changes*.
