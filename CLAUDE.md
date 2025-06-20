# ContextWeaver Project Guidelines

## Project Overview

**System Architecture:** ContextWeaver bridges VS Code and Chrome to insert project context into LLM chats via local IPC.

**Key Project Documents:**
- `docs/ARCHITECTURE.md` - System components, design decisions (D-XXX), package responsibilities
- `docs/IPC_Protocol_Design.md` - Message types, payloads, error codes, protocol schemas  
- `docs/SRS.md` - Functional requirements (FR-XXX), user workflows, system capabilities

**Shared Type Definitions:**
- `packages/shared/src/ipc-types.ts` - All IPC message interfaces and payloads
- `packages/shared/src/data-models.ts` - Core data structures (ContextBlockMetadata, FileData, etc.)

## Package Structure & Conventions

| Package | Module System | Role | Key Responsibilities |
|---------|---------------|------|---------------------|
| `packages/shared` | **ES Modules** | API Guardian | IPC types, data models, shared utilities |
| `packages/vscode-extension` | **CommonJS** | Data Provider | File system access, IPC server, workspace management |
| `packages/chrome-extension` | **ES Modules** | UI Implementer | User interface, IPC client, content insertion |

## Code Standards

### Critical Requirements
- **Use Shared Types**: Import all IPC/data types from `@contextweaver/shared` - never create local duplicates
- **Follow IPC Protocol**: Use exact message schemas from `packages/shared/src/ipc-types.ts`
- **No `any` Types**: Use proper typing with `// TODO:` comments if unavoidable
- **Use Defined Error Codes**: From IPC protocol (e.g., `WORKSPACE_NOT_TRUSTED`, `FILE_NOT_FOUND`)

### JSDoc Documentation

**File Header** (required for all `.ts` files except `index.ts` and simple tests):
```typescript
/**
 * @file filename.ts
 * @description Brief purpose description.
 * @module ContextWeaver/[VSCE|CE|Shared]
 */
```

**API Documentation Priority:**
- **MUST Document**: All exports in `packages/shared`, IPC handlers, core services (`*Service.ts`)
- **SHOULD Document**: Complex business logic, multi-property interfaces
- **MAY Skip**: Simple type aliases, self-explanatory constants (except in `packages/shared`)

### Essential Code Patterns

**IPC Message Handling:**
```typescript
import { IPCMessageRequest, GetFileContentPayload } from '@contextweaver/shared';

// Implements FR-VSCE-002: Data Provider - File Content
async handleGetFileContent(payload: GetFileContentPayload): Promise<...>
```

**Error Responses:**
```typescript
return {
  success: false,
  error: "File not found",
  errorCode: "FILE_NOT_FOUND"  // From IPC protocol
};
```

**Metadata Objects:**
```typescript
const metadata: ContextBlockMetadata = {
  unique_block_id: generateUUID(),
  content_source_id: normalizedUri,
  type: "file_content",
  label: fileName,
  workspaceFolderUri: folder.uri.toString(),
  workspaceFolderName: folder.name,
  windowId: this.windowId
};
```

### Comment Guidelines

**Add Comments For:**
- **FR Implementation**: `// Implements FR-CE-014: Context Block Indicator Display`
- **Complex Logic**: `// Apply gitignore filtering with default patterns`
- **Workarounds**: `// HACK: Chrome race condition workaround (issue #123)`
- **Security**: `// Sanitize content to prevent tag injection`

**Never Comment:** Self-evident code actions or leave commented-out code blocks.

## Build & Test Commands

**Full Clean Rebuild (execute in order):**
```bash
npm run build --workspace=@contextweaver/shared
npm run compile --workspace=contextweaver-vscode  
npm run build --workspace=contextweaver-chrome
```

**Quick Operations:**
- **Type Check**: `npm run check`
- **All Tests**: `npm test --workspaces --if-present`
- **Lint & Fix**: `npm run lint --workspaces --if-present -- --fix`

## Quick Reference Checklist

- [ ] Correct module system for target package
- [ ] Types imported from `@contextweaver/shared`
- [ ] No new `any` types
- [ ] JSDoc headers on new files
- [ ] IPC messages use exact schemas from shared types
- [ ] Error codes match IPC protocol definitions
- [ ] FR-XXX references when implementing functional requirements
- [ ] Tests pass and linting clean