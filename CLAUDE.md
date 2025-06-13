# ContextWeaver Project Guidelines

This guide provides instructions for working on the ContextWeaver project. Adherence to these guidelines is mandatory to ensure consistency, quality, and maintainability.

## 1. Core Principles & Architecture

This project follows strict architectural principles. Before making changes, you MUST be familiar with the project's documentation.

- **Separation of Concerns**: The VSCE (`packages/vscode-extension`) is the data provider. The CE (`packages/chrome-extension`) is the UI/presentation layer. Do not mix these responsibilities. Data formatting for presentation (e.g., adding HTML/XML tags) happens in the CE. The VSCE provides raw data. Refer to `docs/ARCHITECTURE.md`.
- **Single Source of Truth (IPC)**: All IPC message types and data models are defined in `packages/shared`. YOU MUST use and import these shared types. Do not define local versions. Refer to `docs/IPC_Protocol_Design.md` and the files in `packages/shared/src/`.
- **Documentation First**: For any changes affecting functionality, architecture, or IPC, you MUST update the relevant documents (`SRS.md`, `ARCHITECTURE.md`, `IPC_Protocol_Design.md`) before or alongside the code changes.

## 2. Build & Compilation Workflow

The project is a TypeScript monorepo. The build order is critical.

- **Full Rebuild**: To perform a full, clean rebuild of the entire project, run the commands in this specific order from the root directory:
  1. `npm run build --workspace=@contextweaver/shared`
  2. `npm run compile --workspace=contextweaver-vscode`
  3. `npm run build --workspace=contextweaver-chrome`
- **Quick Check**: To quickly check for TypeScript errors across the project, run this from the root:
  ```bash
  npm run check
  ```

## 3. Testing & Linting

- **Run All Tests**: From the root directory, run all tests for all packages:
  ```bash
  npm test --workspaces --if-present
  ```
- **Run Specific Tests**: To run tests for a single package, navigate to its directory and run `npm test`. For example:
  ```bash
  cd packages/vscode-extension && npm test
  ```
- **Linting**: Run the linter from the root to check all packages:
  ```bash
  npm run lint --workspaces --if-present
  ```
- **Auto-fix Lint Issues**: To automatically fix simple linting issues:
  ```bash
  npm run lint --workspaces --if-present -- --fix
  ```

## 4. Code Style & Conventions

### TypeScript & Modules
- The VS Code extension (`packages/vscode-extension`) uses **CommonJS** modules (`require`/`module.exports`).
- The Chrome extension (`packages/chrome-extension`) and the shared package (`packages/shared`) use **ES Modules** (`import`/`export`).
- Adhere to the module system of the package you are working in.

### Type Safety
- **Use Shared Types**: Always import and use types from `@contextweaver/shared` for IPC messages and data models. This is non-negotiable.
- **Avoid `any`**: The project is configured to warn on explicit `any` (`"@typescript-eslint/no-explicit-any": "warn"`). Avoid introducing new `any` types. If you must use one temporarily, add a `// TODO:` comment explaining why and how it will be fixed.

### Commenting Rules
**IMPORTANT: YOU MUST follow these rules when generating or modifying TypeScript (`.ts`) code.**

- **File-Level Header**: Every `.ts` file must begin with a JSDoc block (`/** ... */`) including `@file`, `@description`, and `@module` tags.
  - Example from `ipcServer.ts`:
    ```typescript
    /**
     * @file ipcServer.ts
     * @description Hosts the WebSocket server for IPC...
     * @module ContextWeaver/VSCE
     */
    ```
- **API-Level JSDoc**: All exported `class`, `interface`, `type`, `enum`, and `function` declarations must have a JSDoc block with a description and `@param`/`@returns` tags where applicable.
- **Inline Comments**: Use `//` to explain the **"why"** of complex or non-obvious code, not the "what".