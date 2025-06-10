# ContextWeaver Project Guidelines

## Build Commands

### TypeScript Compilation Check
To ensure your TypeScript code compiles correctly across the monorepo:

1. **Build shared types first** (required after modifying shared interfaces):
   ```bash
   cd packages/shared && npm run build
   ```

2. **Compile VS Code extension**:
   ```bash
   cd packages/vscode-extension && npm run compile
   ```

3. **Build Chrome extension**:
   ```bash
   cd packages/chrome-extension && npm run build
   ```

**IMPORTANT**: Always run these commands in order after making changes to shared types to ensure all packages compile successfully.

## Testing and Linting Commands

### Running Tests
To run tests across the monorepo:

1. **Run all tests** (from root directory):
   ```bash
   # Run tests for all packages that have test suites
   npm test --workspaces --if-present
   ```

2. **Run tests for specific packages**:
   ```bash
   # VS Code extension tests
   cd packages/vscode-extension && npm test
   
   # Chrome extension tests
   cd packages/chrome-extension && npm test
   ```

### Code Quality Check
To run TypeScript compilation and linting checks:

1. **Run full check** (from root directory):
   ```bash
   npm run check
   ```
   This command will:
   - Run TypeScript compilation check (`tsc --noEmit`) for all packages
   - Run ESLint for all packages

2. **Fix auto-fixable lint issues**:
   ```bash
   # Fix Chrome extension
   cd packages/chrome-extension && npm run lint -- --fix
   
   # Fix VS Code extension
   cd packages/vscode-extension && npm run lint -- --fix
   ```

**NOTE**: The project allows `any` types with warnings (not errors) as configured in `.eslintrc.json`. These warnings can be addressed gradually over time.

## TypeScript Commenting Rules

**IMPORTANT: YOU MUST follow these rules when generating or modifying TypeScript (`.ts`) code.**

### 1. File-Level Header Comment:
*   Every `.ts` file must begin with a JSDoc block (`/** ... */`).
*   It must include the following tags:
    *   `@file`: The name of the file (e.g., `contentScript.ts`).
    *   `@description`: A brief summary of the file's purpose and responsibilities.
    *   `@module`: The logical module path (e.g., `ContextWeaver/VSCE`).

### 2. API-Level Comments (JSDoc):
*   All exported `class`, `interface`, `type`, `enum`, and `function` declarations must have a JSDoc block.
*   The block must contain:
    *   A concise, one-sentence description of the entity's purpose.
    *   `@param {type} name` - For each parameter, describe its purpose.
    *   `@returns {type}` - Describe the function/method's return value.
    *   `@deprecated` - (Optional) If the entity is deprecated, explain why and what to use instead.

### 3. Inline Implementation Comments:
*   Use single-line comments (`//`) to explain the **"why"** behind complex, non-obvious, or critical sections of code. Avoid explaining the "what."
*   Use comments to clarify workarounds, performance optimizations, or tricky logic.
*   Use `// TODO:` or `// FIXME:` to mark areas that require future attention, followed by a clear description of the task.

### 4. Constants and Configuration Objects:
*   For simple exported constants, a brief single-line comment (`//`) above the declaration is sufficient.
*   For complex exported configuration objects, use a full JSDoc block (`/** ... */`) to explain the object's structure and the purpose of its properties.


## Git Commit Message Guidelines

**IMPORTANT: YOU MUST follow this rule for all Git commits.**

*   Commit messages must not contain the word "claude" in any form. This is a strict project requirement.