# Test Coverage Analysis

## Chrome Extension Files Without Tests

### Service Worker Core Files
- `src/serviceWorker.ts` - Main service worker entry point
- `src/serviceWorkerClient.ts` - Client for service worker communication
- `src/serviceWorker/ports/IpcClient.ts` - IPC client interface

### Service Worker Handlers (Missing Tests)
- `src/serviceWorker/handlers/GetActiveFileInfoHandler.ts`
- `src/serviceWorker/handlers/GetContentsForSelectedOpenFilesHandler.ts`
- `src/serviceWorker/handlers/GetEntireCodebaseHandler.ts`
- `src/serviceWorker/handlers/GetFileTreeHandler.ts`
- `src/serviceWorker/handlers/GetFolderContentHandler.ts`
- `src/serviceWorker/handlers/GetWorkspaceDetailsHandler.ts`
- `src/serviceWorker/handlers/GetWorkspaceProblemsHandler.ts`
- `src/serviceWorker/handlers/IMessageHandler.ts` - Interface file
- `src/serviceWorker/handlers/ListFolderContentsHandler.ts`
- `src/serviceWorker/handlers/MessageHandlerMap.ts`
- `src/serviceWorker/handlers/PushSnippetHandler.ts`
- `src/serviceWorker/handlers/index.ts` - Export file

### UI Services (All Missing Tests)
- `src/ui/services/ContextAPIService.ts`
- `src/ui/services/TextInsertionService.ts`
- `src/ui/services/ThemeService.ts`

### UI Components (All Missing Tests)
- `src/ui/components/DOMFactory.ts`
- `src/ui/components/FloatingPanel.ts`
- `src/ui/components/IndicatorManager.ts`
- `src/ui/components/NotificationManager.ts`
- `src/ui/components/StyleManager.ts`

### UI Handlers (All Missing Tests)
- `src/ui/handlers/ActionHandler.ts`
- `src/ui/handlers/InputHandler.ts`
- `src/ui/handlers/MessageHandler.ts`

### UI View Renderers (All Missing Tests)
- `src/ui/view/renderers/browseRenderer.ts`
- `src/ui/view/renderers/openFilesRenderer.ts`
- `src/ui/view/renderers/optionsRenderer.ts`
- `src/ui/view/renderers/searchRenderer.ts`
- `src/ui/view/ViewManager.ts`

### UI Core Files (All Missing Tests)
- `src/ui/AppCoordinator.ts`
- `src/ui/stateManager.ts`
- `src/ui/main.ts`

### Other Files (Missing Tests)
- `src/contentScript.ts` - Content script entry point
- `src/popup.ts` - Extension popup script
- `src/ceLogger.ts` - Chrome extension logger
- `src/uiManager.ts` - UI Manager
- `src/ui/utils/domUtils.ts` - Has test in wrong location (tests/domUtils.test.ts)

### UI Port Interfaces (No Tests Needed - Interfaces)
- `src/ui/ports/IDomFactory.ts`
- `src/ui/ports/IFloatingPanel.ts`
- `src/ui/ports/IIndicatorManager.ts`
- `src/ui/ports/INotificationManager.ts`
- `src/ui/ports/IStyleManager.ts`

## VS Code Extension Files Without Tests

### Core Services (Missing Tests)
- `src/core/services/AggregationService.ts` - Has test
- `src/core/services/DiagnosticsService.ts` - **Missing test**
- `src/core/services/SnippetService.ts` - **Missing test**

### IPC Handlers (All Missing Tests)
- `src/adapters/primary/ipc/handlers/GetActiveFileInfoHandler.ts`
- `src/adapters/primary/ipc/handlers/GetContentsForFilesHandler.ts`
- `src/adapters/primary/ipc/handlers/GetEntireCodebaseHandler.ts`
- `src/adapters/primary/ipc/handlers/GetFileContentHandler.ts`
- `src/adapters/primary/ipc/handlers/GetFileTreeHandler.ts`
- `src/adapters/primary/ipc/handlers/GetFilterInfoHandler.ts`
- `src/adapters/primary/ipc/handlers/GetFolderContentHandler.ts`
- `src/adapters/primary/ipc/handlers/GetOpenFilesHandler.ts`
- `src/adapters/primary/ipc/handlers/GetWorkspaceDetailsHandler.ts`
- `src/adapters/primary/ipc/handlers/GetWorkspaceProblemsHandler.ts`
- `src/adapters/primary/ipc/handlers/ListFolderContentsHandler.ts`
- `src/adapters/primary/ipc/handlers/RegisterActiveTargetHandler.ts`
- `src/adapters/primary/ipc/handlers/SearchWorkspaceHandler.ts`

### Other Files (Missing Tests)
- `src/adapters/primary/ipc/CommandRegistry.ts`
- `src/adapters/secondary/logging/VSCodeOutputChannelLogger.ts`
- `src/extension.ts` - Main extension entry point

### Entity Classes (Missing Tests)
- `src/core/entities/Aggregation.ts`
- `src/core/entities/Client.ts`

### Files That Don't Need Tests
- `src/adapters/primary/ipc/ICommandHandler.ts` - Interface file
- `src/adapters/primary/ipc/types.ts` - Type definitions
- `src/core/ports/IAggregationService.ts` - Interface file
- `src/core/ports/IAggregationStrategy.ts` - Interface file
- `src/core/ports/IFilterService.ts` - Interface file

## Summary

### Chrome Extension Test Coverage Gaps:
- **28 files** need tests (excluding interfaces and export files)
- Critical gaps: All UI components, services, handlers, and view renderers
- Service worker handlers are partially tested (3 out of 12)

### VS Code Extension Test Coverage Gaps:
- **18 files** need tests (excluding interfaces and type files)
- Critical gaps: All IPC handlers, DiagnosticsService, SnippetService
- Core services and aggregation strategies have good coverage

### Priority Files for Testing:
1. **Chrome Extension**: UI services and components (foundation for UI functionality)
2. **VS Code Extension**: IPC handlers (core communication layer)
3. **Both**: Main entry points (extension.ts, serviceWorker.ts, contentScript.ts)