# TypeScript Commenting Standards

When asked to add, refactor, or modify comments in this project, you **MUST** strictly adhere to the following rules. Your primary task is to implement the comment refactoring plan, ensuring all new and existing comments conform to these standards.

---

### **Rule 1: File-Level Header Comment**
*   Every `.ts` file must begin with a JSDoc block (`/** ... */`).
*   It must include the following tags:
    *   `@file`: The name of the file (e.g., `contentScript.ts`).
    *   `@description`: A brief summary of the file's purpose and responsibilities.
    *   `@module`: The logical module path (e.g., `ContextWeaver/VSCE`).

### **Rule 2: API-Level Comments (JSDoc)**
*   All exported `class`, `interface`, `type`, `enum`, and `function` declarations must have a JSDoc block.
*   The block must contain:
    *   A concise, one-sentence description of the entity's purpose.
    *   `@param {type} name` - For each parameter, describe its purpose.
    *   `@returns {type}` - Describe the function/method's return value.
    *   `@deprecated` - (Optional) If the entity is deprecated, explain why and what to use instead.

### **Rule 3: Inline Implementation Comments**
*   Use single-line comments (`//`) to explain the **"why"** behind complex, non-obvious, or critical sections of code. Avoid explaining the "what."
*   Use comments to clarify workarounds, performance optimizations, or tricky logic.
*   Use `// TODO:` or `// FIXME:` to mark areas that require future attention, followed by a clear description of the task.

### **Rule 4: Constants and Configuration Objects**
*   For simple exported constants, a brief single-line comment (`//`) above the declaration is sufficient.
*   For complex exported configuration objects, use a full JSDoc block (`/** ... */`) to explain the object's structure and the purpose of its properties.

### **Rule 5: Language**
*   All comments **MUST** be written in clear and professional English. Any existing non-English comments must be translated.