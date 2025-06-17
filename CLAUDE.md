# ContextWeaver Project Guidelines

This guide provides instructions for working on the ContextWeaver project. Adherence to these guidelines is mandatory to ensure consistency, quality, and maintainability.

## 1. Core Principles & Architecture

This project follows strict architectural principles. Before making changes, you MUST be familiar with the project's documentation.

- **Separation of Concerns**: The project is divided into a data provider (VSCE) and a UI/presentation layer (CE). You MUST adhere to the specific roles and conventions defined for each package in Section 4. Refer to `docs/ARCHITECTURE.md` for more detail.
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

*You MUST prioritize and strictly follow the conventions and standards outlined below when generating or modifying code.*

### Package-Specific Roles & Conventions
Each package in the monorepo has specific technical rules and a distinct conceptual role. Adhere to the corresponding conventions when modifying a file.

#### `packages/shared` (Role: API Guardian)
- **Module System**: You MUST use **ES Modules** (`import`/`export`).

#### `packages/vscode-extension` (Role: Data Provider)
- **Module System**: You MUST use **CommonJS** (`require`/`module.exports`).

#### `packages/chrome-extension` (Role: UI Implementer)
- **Module System**: You MUST use **ES Modules** (`import`/`export`).

#### General Rule for `utils` Folders
- Helper functions within any `utils` sub-folder may have relaxed documentation standards for obvious, pure functions. However, you **MUST** document any helper that has side effects.

### Type Safety
- **Constraint**: You MUST import and use types from `@contextweaver/shared` for all IPC messages and shared data models. Do not define local, duplicative types.
- **Constraint**: You MUST NOT introduce new `any` types. The project is configured to warn on explicit `any`. If a temporary `any` is unavoidable, you MUST add a `// TODO:` comment explaining why and create a follow-up task to fix it.

### TypeScript Commenting Standards

#### 1. File Header (JSDoc)
A JSDoc file header is required for all `.ts` files except for `index.ts` re-export files and simple test files.

- **Mandatory Format**:
  ```typescript
  /**
   * @file filename.ts
   * @description A brief, one-sentence summary of the file's purpose.
   * @module ContextWeaver/[VSCE|CE|Shared]
   */
  ```

#### 2. API Documentation (JSDoc)
All exported entities (`class`, `interface`, `type`, `enum`, `function`) require a JSDoc block based on the following priority tiers and package-specific overrides.

**Package Overrides (Highest Priority):**
- **`packages/shared`**: All Tier 1 and Tier 2 items MUST be documented. The "MAY Skip" rule does not apply. This package is the API contract and requires full documentation.
- **`packages/vscode-extension` & `packages/chrome-extension`**: Follow the Tier 1/2/3 system below.

**Tier 1 - MUST Document (Strictly)**:
- Public methods of exported classes.
- Exported functions, especially those in service modules (`*Service.ts`).
- Complex configuration objects.

**Tier 2 - SHOULD Document**:
- Internal interfaces with multiple properties.
- Helper functions with side effects.
- Types requiring usage examples.

**Tier 3 - MAY Skip (If Self-Documenting, except in `packages/shared`)**:
- Simple type aliases (e.g., `type UserID = string;`).
- Enums with descriptive values.
- Constants with self-explanatory names (e.g., `const MAX_RETRIES = 5;`).

- **Mandatory JSDoc Format**:
  ```typescript
  /**
   * A brief description of the entity's purpose and usage.
   * @param paramName - Description of the parameter's role. (Omit type if obvious from TS signature).
   * @returns Description of the return value. (Omit type if obvious from TS signature).
   */
  ```

#### 3. Inline Implementation Comments (`//`)
The principle for inline comments is **justification, not description**.

- **MUST Add Comments For**:
    - **Complex Business Logic**: `// Apply 15% discount for premium users.`
    - **Workarounds**: `// HACK: Use setTimeout to fix Chrome race condition (see bug CW-123).`
    - **Performance Optimizations**: `// This is O(n) instead of O(n^2) because we pre-sort the array.`
    - **Security-Critical Code**: `// Sanitize input here to prevent XSS attacks.`
    - **"Magic" Values**: `const RETRY_DELAY_MS = 250; // API rate limit allows 4 req/sec.`

- **Negative Constraints**:
    - **NEVER** write comments that restate the code in English (e.g., `// Loop through users`).
    - **NEVER** leave commented-out code blocks. Delete them.

#### 4. Special Cases & Patterns
- **Type Assertions**: MUST be justified with a comment explaining why the assertion is safe.
  ```typescript
  // This is safe because the data is validated against configSchema before parsing.
  const config = JSON.parse(data) as Config;
  ```
- **TODO/FIXME**: Use a structured format.
  ```typescript
  // TODO(CW-123): Refactor this to use the new AuthenticationService.
  // FIXME: This causes a memory leak under high load.
  ```
- **Generated Code**: Mark the top of the file with `/* AUTO-GENERATED - DO NOT EDIT */`.