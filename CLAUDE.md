# System Guidance: Claude Code (claude.ai/code)

**Objective:** Assist with code in this repository.
**Environment:** WSL (Ubuntu), accessing project files on Windows filesystem.
**Primary Task:** Fix project bugs.
**CRITICAL PRE-FIX STEP:** ALWAYS consult `docs/TROUBLESHOOTING_AND_LESSONS_LEARNED.md` for past issues/solutions BEFORE proposing fixes.

## Project Overview
- **Name:** ContextWeaver
- **Type:** Monorepo: VS Code Extension (VSCE) & Chrome Extension (CE).
- **Purpose:** Enable users to gather VS Code workspace context for LLM use in Chrome browser.
- **Structure:**
    - `packages/vscode-extension`: VSCE source code.
    - `packages/chrome-extension`: CE source code.
    - `packages/shared`: Shared code (likely IPC type definitions).
    - `docs/`: All project documentation.
- **Technology:** TypeScript, Node.js (VSCE), Web APIs (CE), WebSockets (IPC).

## Key Files & Documentation
**MANDATORY: Consult these documents for context when fixing bugs or implementing changes. Paths are relative to project root.**
- `docs/Software_Requirements_Specification.md` (SRS): Features and requirements.
- `docs/Development_Plan.md`: Tasks and phases.
- `docs/ARCHITECTURE.MD`: System architecture.
- `docs/IPC_Protocol_Design.md`: VSCE-CE communication details. **CRUCIAL for IPC bugs.**
- `docs/TROUBLESHOOTING_AND_LESSONS_LEARNED.md`: **MUST REVIEW for past issues/solutions BEFORE proposing fixes. Critical for debugging.**
- `README.md` (project root): General project info.

**Core VSCE Files (`packages/vscode-extension/src/`):**
- `extension.ts`: VSCE main entry point.
- `ipcServer.ts`: WebSocket server & IPC logic management.
- `fileSystemService.ts`: File system operations handling.
- `searchService.ts`: Workspace search implementation.
- `workspaceService.ts`: VS Code workspace interaction management (trust, folders).
- `snippetService.ts`: Code snippet preparation.

**Core CE Files (`packages/chrome-extension/src/`):**
- `serviceWorker.ts`: Background logic, IPC client.
- `options.ts`: Settings page logic.
- `popup.ts`: Browser action popup logic.
- `manifest.json` (`packages/chrome-extension/`): CE manifest.

## Bash Commands
**Instruction:** Navigate to correct package directory first (e.g., `cd packages/vscode-extension`). All commands are Linux-style.

**VSCE (`packages/vscode-extension/`):**
```bash
npm run compile      # TypeScript compilation
npm run watch        # Watch mode compilation
npm run lint         # Run ESLint
npm run test         # Run Jest tests
npm run test:watch   # Jest watch mode
```

**CE (`packages/chrome-extension/`):**
```bash
npm run build        # Compile and bundle
npm run compile      # TypeScript compilation
npm run watch        # Watch mode
npm run lint         # Run ESLint
```

## Code Style
- **Language:** TypeScript.
- **ESLint:** MUST adhere to project ESLint rules (`.eslintrc.json` in each package).
    - Key rules: semicolons always; single quotes.
- **Coding/Commenting Standards:** **MANDATORY:** Follow detailed standards in user's system prompt (`<CodeCommentGuide>`) (emphasizes docstrings, JSDoc, inline comments, type hints, clear styling).
- **Architecture:** Refer to `<DevelopmentBestPracticesGuide>` for architectural principles.

## Workflow & Bug Fixing
- **Primary Goal:** Identify and fix bugs.
- **MANDATORY: Think step-by-step. Explain reasoning thoroughly before and during each action.**

- **Iterative Process:**
    1.  **Understand Bug & Gather Context:**
        1.1. Review user's bug description.
        1.2. **CRITICAL:** Consult `docs/TROUBLESHOOTING_AND_LESSONS_LEARNED.md` for past issues/solutions.
        1.3. Examine relevant codebase (VSCE/CE `src/`) for current implementation and potential bug location.
        1.4. If bug relates to requirements, architecture, or IPC: Review `docs/Software_Requirements_Specification.md`, `docs/ARCHITECTURE.MD`, `docs/IPC_Protocol_Design.md`.
        1.5. **Clarify Ambiguities:** If bug description, user intent, docs (incl. `TROUBLESHOOTING_AND_LESSONS_LEARNED.md`), or codebase are unclear/conflicting/incomplete:
            *   **DO NOT GUESS.** Do not make assumptions.
            *   Ask user specific questions for clarification (issue, details, code/doc explanation).
            *   Await user feedback before proceeding.
    2.  **Analyze and Plan Solution:**
        2.1. Analyze bug's root cause using gathered context and user clarifications.
        2.2. Outline step-by-step fix plan. Explain reasoning.
        2.3. **Handle API/Implementation Uncertainty:** If uncertain about usage/parameters/strategy for VS Code/Chrome APIs, project utilities, or complex logic:
            *   **DO NOT GUESS.** Do not integrate uncertain code.
            *   State specific API/function/logic and your uncertainty.
            *   Ask user for clarification, examples, API docs, or preferred approach.
            *   Await user feedback before implementing.
    3.  **Implement Fix:**
        3.1. Implement fix once plan is clear and all ambiguities/uncertainties are resolved via user feedback.
    4.  **Run Automated Tests (if applicable):**
        4.1. If VSCE code (`packages/vscode-extension/src/`) modified: **MUST** `cd packages/vscode-extension/` (WSL) and run `npm run test`.
        4.2. Analyze test output. If VSCE tests fail: **MUST** debug, revise fix, re-implement, re-run until all pass. Report results (pass/fail, errors). **DO NOT proceed if tests fail.**
        4.3. If bug/fix relates to CE: Run available CE command-line tests. If none, state CE testing is manual.
    5.  **Guide User Testing (Manual/UI):**
        5.1. After automated tests pass: Instruct user on specific manual/UI tests (Windows: VS Code, Chrome) to verify fix and check regressions. (For tests you cannot perform: UI, E2E).
    6.  **Iterate Based on Feedback:**
        6.1. Analyze user's testing feedback.
        6.2. If bug unresolved or new issues (from automated or manual tests): **MUST** return to Step 1 or 2. Re-evaluate, gather context, ask questions, refine plan, re-implement. **DO NOT proceed if fix unconfirmed.**
    7.  **Post-Verification Documentation Check:**
        7.1. After user confirms fix (and automated tests pass): **MUST** consider if documentation needs updates due to the fix. Check:
            *   `README.md` (user-facing behavior, setup, usage changes).
            *   `docs/ARCHITECTURE.MD` (architectural implications).
            *   `docs/IPC_Protocol_Design.md` (IPC impact).
            *   `docs/Software_Requirements_Specification.md` (requirement clarification/alteration).
            *   **`docs/TROUBLESHOOTING_AND_LESSONS_LEARNED.md`** (significant bug/resolution for future log).
        7.2. If updates needed: Propose specific changes for relevant document(s).
        7.3. **Final Work Summary:** After all previous steps (including doc proposals) are complete and user has confirmed the fix: **MUST** provide a final summary. Use first-person ("I"). Report:
            *   What work was completed.
            *   Brief explanation of how the problem was solved.
            *   List of all files modified, using relative paths from project root (e.g., `packages/vscode-extension/src/extension.ts`).

## Testing
**Testing Responsibilities Overview:**

**1. Automated Tests (Run by YOU, Claude Code, in WSL):**
   - **VSCE Unit Tests:**
     - **Command:** `npm run test` (from `packages/vscode-extension/`).
     - **Trigger:** After YOU modify any file in `packages/vscode-extension/src/`.
     - **Your Responsibility:** Per workflow, **MUST** run these tests. **MUST** ensure they pass before requesting user manual testing. Analyze failures; iterate on fixes.
     - **Location:** `packages/vscode-extension/tests/unit/`.
   - **CE Command-Line Tests (If any):**
     - If CE command-line test scripts exist (e.g., for non-UI logic): YOU **MUST** run them if relevant to your changes.

**2. Manual & Debug Tests (Performed by User in Windows):**
   - **Manual End-to-End Testing (VSCE & CE):**
     - **User Responsibility:** Perform after your changes (and after your automated tests pass).
     - **Your Role:** Provide user clear, specific instructions for testing fix verification and regression checks (especially UI interactions, full E2E flows).
   - **VSCE Debugging:**
     - **User Responsibility:** Perform if needed.
     - **Setup:** User opens `C:\project\ContextWeaver\packages\vscode-extension` in Windows VS Code; presses F5.

## Development Environment
- **Your OS:** WSL (Ubuntu 24.04) on Windows 11.
- **Project Files Location:** Windows filesystem (e.g., `/mnt/c/project/ContextWeaver`).
- **User IDE (Dev/Debug):** VS Code (`^1.100.2`) on Windows.
- **User Browser (CE Test):** Google Chrome (`^137.0.7151.56`) on Windows.

## Important Notes & Known Issues
- **IPC:** WebSockets on `localhost` (Windows/WSL accessible). Token auth removed. VSCE: port fallback. CE: connects via `127.0.0.1`. Refer to `docs/IPC_Protocol_Design.md`.
- **Monorepo Context:** **Instruction:** Run package-specific commands (e.g., `npm install`) from within the respective package directory (e.g., `cd packages/vscode-extension` in WSL).
