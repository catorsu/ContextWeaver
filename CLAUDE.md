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
