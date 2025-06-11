# Troubleshooting and Lessons Learned Log - ContextWeaver

This document records significant issues encountered during the development of the ContextWeaver project, the solutions implemented, and key lessons learned. The aim is to build a knowledge base for future maintenance, development, and to avoid repeating past mistakes.

**How to Add a New Entry:**
1.  Scroll to the very bottom of this document.
2.  Locate the comment line: `<!-- Add new log entries above this line | This comment must remain at the end of the file -->`.
3.  Insert your new log entry (following the "Entry Format" below) on the blank line *immediately above* this comment.
4.  Ensure this comment line remains the absolute last line in the file after you add your content.
5.  Follow the "Entry Format" for your new log.

## Entry Format

Each new entry should follow the format below:

---
## [] - [Brief, Descriptive Title of Issue or Lesson]

**Phase/Task in Development Plan:** (e.g., Phase 3, Task 4 - Context Block Indicator Management)

**Problem Encountered:**
*   **Symptoms:** (Detailed description of what went wrong. What was the expected behavior? What was the actual behavior? Include specific error messages, unexpected UI behavior, or incorrect data handling.)
*   **Context:** (Relevant conditions, e.g., specific user input, state of VSCE/CE, browser version if applicable.)
*   **Initial Diagnosis/Hypothesis (if any):** (What was initially thought to be the cause?)

**Investigation & Iterations:**
*   (Briefly describe the key steps taken to diagnose the issue. What approaches were tried that didn't work? What information was crucial for diagnosis – e.g., specific API documentation, user-provided clarification?)

**Solution Implemented:**
*   (Clear description of the final fix or approach that worked. Summarize the nature of the changes without referencing specific files or tools.)

**Key Takeaway(s) / How to Avoid in Future:**
*   (What was learned from this experience? Are there broader implications for design, testing, or API usage?)
*   (e.g., "Lesson: Always validate payload structures received over IPC, even if they are expected to conform to a schema, to prevent runtime errors." or "Takeaway: The `someChromeApi.featureX` has an undocumented edge case when parameter Y is an empty string; ensure this is handled explicitly.")
*   (e.g., "Prevention: Add more specific unit tests for IPC message parsing.")

---
## [1] - VSCE Fails to Activate When Debugging from Monorepo Root

**Phase/Task in Development Plan:** Phase 1, Task 3 - VSCE - Basic Server Implementation

**Problem Encountered:**
*   **Symptoms:** The VS Code Extension was inactive when debugging was initiated from the monorepo root. The Extension Development Host launched, but the extension itself didn't activate. Initial configuration errors were misleading.
*   **Context:** Project structured as a monorepo with extension in a subdirectory.
*   **Initial Diagnosis/Hypothesis:** Incorrect VS Code extension loading context or configuration errors.

**Investigation & Iterations:**
*   Resolving configuration errors in the root did not fix the activation issue.
*   The problem was resolved by opening the extension's subfolder directly as the root workspace in VS Code and then launching the debugger.

**Solution Implemented:**
*   The debugging workflow was changed: **Always open the specific extension folder as the root workspace in VS Code before starting a debugging session.**

**Key Takeaway(s) / How to Avoid in Future:**
*   **Debugging Context:** For VS Code extension development within a monorepo, the individual extension's subfolder must be opened as the root in VS Code for debugging. This ensures VS Code correctly identifies the extension manifest and avoids conflicts.
*   **Manifest Validation:** VS Code may apply strict validation to a `package.json` at the workspace root, potentially leading to misleading errors if the intent is to debug a nested extension.
*   **Output Channels:** Use dedicated output channels for extension-specific logs to simplify debugging, especially when the main Debug Console is noisy.
*   **Prevention:** Document the correct debugging procedure in project guides.

---
## [2] - CE IPC Client Connection & UI Issues

**Phase/Task in Development Plan:** Phase 1, Task 4 - CE - Basic Client Implementation

**Problem Encountered:**
*   **Symptoms:** Multiple issues during CE client setup:
    1.  **Manifest/Path Errors:** Extension failed to load due to incorrect paths in manifest and for loading the unpacked extension itself.
    2.  **Connection Refused:** Service worker couldn't connect to WebSocket server, showing connection refused error.
    3.  **Resource Loading:** Errors loading notification icons and scripts in HTML pages.
    4.  **Multiple Notifications:** Saving settings on the options page triggered excessive "Disconnected"/"Connected" notifications.
    5.  **Messaging Error:** Service worker failed to send status messages to the options page ("Receiving end does not exist").
*   **Context:** Initial Chrome Extension client development and testing.

**Investigation & Iterations & Solution Implemented:**
1.  **Manifest/Paths:** Corrected the "Load unpacked" directory path in Chrome to the extension root. Updated manifest's service worker path. Added necessary build commands.
2.  **Connection Refused:** Changed the WebSocket URL from localhost to 127.0.0.1, which successfully established the connection.
3.  **Resource Loading:** Used Chrome runtime API for notification icon paths. Corrected script paths in HTML files to point to compiled assets. Ensured full extension reloads in Chrome.
4.  **Multiple Notifications:** Identified that explicit connection close in the settings update handler, combined with retry logic, caused multiple notifications. Introduced a flag to track intentional disconnects and modified close handler to check this flag, suppressing notifications for intentional disconnects.
5.  **Messaging Error:** Realized the options page needed an active message listener for status updates. Changed the service worker to use runtime messaging for these status updates, and options page was updated to listen and request initial status.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Paths:** Meticulously check all paths in manifest and HTML files, ensuring they point to the correct locations of compiled/bundled assets relative to the extension's root.
*   **Resource URLs:** Use Chrome runtime API for reliable access to extension resources (like images) from service workers or other extension contexts.
*   **`localhost` vs. `127.0.0.1`:** `127.0.0.1` can sometimes be more reliable than `localhost` for local WebSocket connections from within a Chrome extension's service worker.
*   **Service Worker to Extension Page Communication:** For updating UI on specific extension pages from the service worker, use targeted runtime messaging and ensure pages have active listeners.
*   **Stateful Reconnect Logic:** Carefully manage state during connection/reconnection sequences to prevent unintended side-effects.
*   **Chrome Extension Reloading:** After making changes to HTML files or manifest, ensure the unpacked extension is fully reloaded in Chrome's extensions page.

---
## [3] - IPC Simplification and Robustness Enhancements

**Phase/Task in Development Plan:** Phase 1, Task 3 & 4 - Basic IPC Implementation

**Problem Encountered:**
*   **Symptoms:** The initial IPC design included token-based authentication and basic port handling. This added setup complexity for users (manual token sync) and lacked robustness if the default port was in use.
*   **Context:** Streamlining user experience and reducing setup friction.

**Investigation & Iterations & Solution Implemented:**
1.  **Token Authentication Removal:**
    *   Analyzed security: localhost binding of the server was deemed sufficient for V1, as direct external access is prevented. The risk from local malicious software spoofing messages for (primarily) read-only context was considered acceptable to improve ease of use.
    *   Removed token validation logic from server and token handling from client components.
2.  **Port Fallback Implementation (VSCE):**
    *   Enhanced server to attempt binding to subsequent ports (up to 3 retries after the default) if the configured port is in use.
    *   Added information messages to notify users of the actual port used or if all attempts fail.
3.  **Manual Reconnection Button (CE):**
    *   Added a "Connect/Reconnect to VS Code" button in Chrome Extension options.
    *   Implemented logic to send a reconnect message to the service worker, which then forces a disconnection and triggers reconnection.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Security vs. Usability:** For localhost-bound IPC with primarily read-only data, the complexity of token authentication can outweigh benefits. Prioritize ease of use where appropriate.
*   **Port Conflicts:** Implementing port fallback in the server improves out-of-the-box reliability. Clear user notification of the active port is crucial.
*   **User Connectivity Control:** A manual "Reconnect" option in the Chrome Extension's options page empowers users to troubleshoot connection issues.

---
## [4] - VS Code Workspace API Issues in Extension Development Host

**Phase/Task in Development Plan:** Phase 2, Task 1 - File System Data Provisioning

**Problem Encountered:**
*   **Symptoms:** When testing IPC commands, VS Code workspace APIs were consistently undefined or empty. This occurred even if the workspace was trusted and folders were open in the main VS Code window.
*   **Context:** The issue arose because testing was performed with the workspace/folders open in the main VS Code window, while the extension was running in the separate Extension Development Host window.
*   **Initial Diagnosis/Hypothesis:** Timing issue or misunderstanding of workspace APIs.

**Investigation & Iterations:**
*   Detailed logging confirmed that workspace folders were empty from the extension's perspective running in the Extension Development Host.
*   Clarification of the testing setup (folders open in main VS Code, not Extension Development Host) and how multi-root workspaces were configured within the Extension Development Host was key to diagnosis.

**Solution Implemented:**
*   The testing procedure was corrected: **All workspace operations (opening folders, adding to workspace, trusting workspace) must be performed within the Extension Development Host window** where the extension is actively running during a debug session.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Extension Development Host Context:** VS Code extension APIs related to the workspace operate on the state of the Extension Development Host window, not the main VS Code window used for development.
*   **Testing Procedure:** For features interacting with the workspace, the Extension Development Host window must be the testing environment, correctly configured with open folders and trust settings.
*   **Logging for Diagnosis:** When diagnosing workspace-related issues, log the direct output of workspace APIs.
*   **API Behavior:** Workspace folder APIs require the provided URI to exactly match one of the root folder URIs.

---
## [5] - Verifying Server Push Functionality with a Test WebSocket Client

**Phase/Task in Development Plan:** Phase 2, Task 4 - Snippet Sending Functionality

**Problem Encountered:**
*   **Symptoms:** Needed a way to test the server's ability to correctly prepare and push messages to a Chrome Extension client, particularly before the client's receiving logic for such messages was fully implemented.
*   **Context:** Implementing IPC push features where server initiates messages.

**Investigation & Iterations & Solution Implemented:**
*   A simple Node.js WebSocket client script was created.
*   This script connects to the IPC WebSocket server.
*   Upon connection, it mimics the Chrome Extension's behavior by sending a registration message to the server.
*   The script then listens for and logs incoming messages from the server.
*   When the "Send Snippet to LLM Context" command was triggered in the VS Code extension, the test client successfully received and logged the push message, confirming the server's sending logic and data formatting.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Isolated Push Testing:** For features where the server pushes data to the client, a lightweight external WebSocket client is a valuable tool for testing the server's sending logic independently of the client's receiving implementation.
*   **Client Behavior Mimicking:** The test client should simulate essential handshake or registration messages that the server expects from a real client to ensure proper targeting and communication.
*   **Best Practice:** For asynchronous server-to-client pushes, consider creating a minimal test client early in the development of the server-side push logic.

---
## [6] - Jest Mock Configuration for External Libraries

**Phase/Task in Development Plan:** Phase 2, Task 1 - File System Data Provisioning

**Problem Encountered:**
*   **Symptoms:** Test for gitignore rules application was failing: filter type was "default" instead of "gitignore", and tree formatting was incorrect for single files due to unexpected filtering.
*   **Context:** Unit testing file tree functionality that uses an external filtering library.
*   **Initial Diagnosis/Hypothesis:** Jest mock for external library not correctly simulating filtering behavior.

**Investigation & Iterations:**
*   Initial global mock didn't allow test-specific behavior.
*   Test data complexity also contributed to tree formatting issues.

**Solution Implemented:**
1.  Simplified global mock to a factory function.
2.  In the test, created a specific mock instance with custom behavior.
3.  Simplified test input to directly match expected output for the specific filtering scenario.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Console Output in Tests:** `console.error` messages in test output for error handling paths are expected and part of coverage, not test failures.
*   **Mock Design for Configurable Instances:** For libraries like `ignore` that return configurable instances, use a minimal global mock (factory function). Allow individual tests to provide their own mock instances with specific behaviors.
*   **Test Data Simplicity:** For complex formatting tests (e.g., trees), start with minimal data matching the exact expected output to isolate logic errors from data complexity.
*   **Mock Chain Consistency:** Ensure the entire chain of mocks (e.g., `ignore()` factory and `parseGitignore` which returns an `ignore` instance) is configured consistently.

---
## [7] - TypeScript Error Accessing Mocked Module Properties in Jest

**Phase/Task in Development Plan:** Unit Testing

**Problem Encountered:**
*   **Symptoms:** When unit testing modules importing mocked dependencies, TypeScript threw errors about properties not existing on the mocked module type. This occurred even if the property was defined in the mock factory.
*   **Context:** Jest unit tests for extension components, trying to use mocked API parts.

**Investigation & Iterations:**
*   Mock correctly replaced the runtime object.
*   The issue was TypeScript, at compile-time, still using the actual module's type definition, which might not align with the mock's structure or how TypeScript infers callability/constructibility.

**Solution Implemented:**
*   To resolve the TypeScript compile-time error, cast the mocked module to `any` before accessing the mocked property.
*   This bypasses TypeScript's static type checking for that access, trusting the Jest mock's runtime structure.

**Key Takeaway(s) / How to Avoid in Future:**
*   **TypeScript vs. Jest Mocks:** When mocking entire modules, TypeScript's static type checking refers to the original module's types. If a mock's structure for a property doesn't align with the original type signature, TypeScript errors can occur.
*   **Type Assertions for Mocks:** Use type assertions to bridge the gap between TypeScript's compile-time understanding and Jest's runtime reality for mocked properties.

---
## [8] - Mocking Custom Errors and instanceof Checks in Jest Tests

**Phase/Task in Development Plan:** Unit Testing - Workspace Pre-checks

**Problem Encountered:**
*   **Symptoms:** Unit tests for error handling failed. The code used instanceof checks for custom error types. Tests mocked a service method to reject with a plain object.
*   **Context:** Testing error handling that differentiates custom error types.
*   **Initial Diagnosis/Hypothesis:** Plain error object wouldn't satisfy instanceof checks.

**Investigation & Iterations:**
*   Test output showed generic error handling instead of the expected specific error handling, confirming the instanceof check failed.

**Solution Implemented:**
*   Ensured custom error class was exported.
*   Imported custom error class into the test file.
*   Modified the mock service method to reject with a true instance of the custom error class.
*   This made the instanceof check evaluate to true.

**Key Takeaway(s) / How to Avoid in Future:**
*   **instanceof with Custom Errors:** When testing code using instanceof for custom error types, mocking with a plain object (even with identical properties) is insufficient. The mock must reject with (or throw) an actual instance of the custom error class.
*   **Export Custom Errors:** Ensure custom error classes are exported if they are part of an API contract or used in instanceof checks externally.

---
## [9] - Jest's toHaveBeenCalledWith Fails for Structurally Identical Object Instances

**Phase/Task in Development Plan:** Unit Testing - Command Handlers

**Problem Encountered:**
*   **Symptoms:** Jest test matcher failed. Diff showed Expected and Received objects were structurally identical, but the test indicated a mismatch.
*   **Context:** Expected object was created inline in the test assertion, while mock function was called by code under test with an object created within that code. They were different instances.
*   **Initial Diagnosis/Hypothesis:** The matcher performs deep equality, but for objects created via constructors/factories, being different memory instances can cause failure if internal properties (e.g., method references) differ.

**Investigation & Iterations:**
*   Confirmed that while the matcher does deep equality, different instances of complex objects (especially if their methods are also mocks) can lead to mismatches.

**Solution Implemented:**
*   Replaced exact object matching with partial object matching using `expect.objectContaining()`.
*   This checks for specified key-value pairs without requiring strict instance equality.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Object Argument Matching:** When asserting mock calls with object arguments, if exact instance identity isn't critical (or hard to reproduce), partial object matching is more robust. It checks for specified key-value pairs without requiring strict instance equality or comparing all properties.
*   **Reduce Test Brittleness:** Prefer partial object matching for object arguments in Jest matchers, especially when objects are dynamically created in the code under test. This focuses on significant data rather than instance identity.

---
## [10] - Fixing Gitignore Tests: Filter Type Propagation and Mock Configuration

**Phase/Task in Development Plan:** Phase 2, Task 1 - File System Data Provisioning

**Problem Encountered:**
*   **Symptoms:** The test "should apply gitignore rules" failed. Expected filter type of "gitignore" but received "default"; tree included files that should have been filtered.
*   **Context:** Unit testing gitignore handling.
*   **Initial Diagnosis/Hypothesis:** Incorrect library mock application or filter type flag propagation.

**Investigation & Iterations:**
1.  Initial mock didn't allow custom ignore behavior per test.
2.  Test setup correctly mocked parsing to return a custom instance that did ignore files, but filter type remained "default".
3.  The code's logic for filter type was based on whether any files were actually filtered by gitignore, not just on the presence of a valid gitignore instance.

**Solution Implemented:**
1.  Ensured library mock correctly handled ES module format.
2.  Modified filter type determination logic to set type based on filter instance presence.
3.  Simplified mock setup in tests to provide gitignore content via mock file system.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Test Design for Filters:** When testing filter/rules-based logic, the "mode" of operation (e.g., gitignore vs. default) should often be determined by the presence of valid rules/configuration, not just by whether items were actually filtered.
*   **ES Module Mocking:** For ES modules in Jest, use `__esModule: true` and provide exports correctly (e.g., `default` export).
*   **Comprehensive Test State:** For features like gitignore filtering, set up all mock state before tests.

---
## [11] - Jest Mock Initialization Order and TypeScript Errors with Custom Mock Properties

**Phase/Task in Development Plan:** Phase 2, Task 7 - Unit and Integration Testing

**Problem Encountered:**
*   **Symptoms:**
    1.  **ReferenceError:** `ReferenceError: Cannot access 'mockVariableName' before initialization` when `jest.mock('moduleName', factory)`'s factory referred to mock implementation variables declared with `const`/`let`. Jest's hoisting of `jest.mock` caused factory execution before variable declarations.
    2.  **TypeScript Error (TS2339):** After resolving ReferenceError (e.g., using `jest.doMock`), `TS2339: Property 'customProperty' does not exist on type 'OriginalType'` occurred when a mock object (e.g., for `ignore` instance) was augmented with custom properties (e.g., `patterns: string[]`) for mock's internal logic, and these were accessed without type assertion.
*   **Context:** Unit testing search functionality, which depends on external APIs and other modules, requiring complex mock setup.

**Investigation & Iterations:**
1.  **ReferenceError:** Moving variable declarations for mock implementations before mock setup was unwieldy. Confirmed Jest's hoisting as the cause.
2.  **Switch to Non-Hoisted Mocks:** Refactored to use non-hoisted mock approach. Placed mock calls at top of test file, before imports. Mock implementation functions defined before mock calls using them. Used dynamic imports in tests to get mocked module.
3.  **TypeScript Error:** Custom properties on mock instances caused TypeScript errors on access because the type doesn't define those properties.

**Solution Implemented:**
1.  **ReferenceError Fix:** Adopted non-hoisted mocking for all module mocks. Ensured mock calls are at the very top of the test file, before any import statements. Variables referenced inside mock factories were declared before those calls.
2.  **TypeScript Error Fix:** When accessing custom properties added to a typed mock object for its internal implementation, cast the mock object to `any` before access.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Jest Hoisting:** Some mock functions are hoisted. If their factory refers to variables, ReferenceErrors are likely. For complex mocks or precise initialization order, non-hoisted approaches are more robust.
*   **Order with Non-Hoisted Mocks:** Place non-hoisted mock calls at the top of test files, before importing modules dependent on these mocks. Variables used in mock factories must be declared before the factory.
*   **TypeScript & Custom Mock Properties:** If adding custom properties to a typed mock for internal logic, TypeScript will error if they aren't on the original type. Use type assertion or define a specific mock interface.
*   **Iterative Mocking:** Mock complex dependencies iteratively, starting with directly used parts and expanding as needed.

---
## [12] - Jest Test Issues with Server and Async Mock Object Handling

**Phase/Task in Development Plan:** Phase 2, Task 7 - Unit and Integration Testing

**Problem Encountered:**
*   **Symptoms:** Jest tests for server class failed due to issues with mocked object references, async timing, and mock implementation setups. Specifically, "should return file tree for a specified valid workspace folder" test failed.
*   **Context:** Unit testing server message handling, especially file tree command.
*   **Initial Diagnosis/Hypothesis:** Incorrect mock setup, message handling timing, or mock object reference inconsistencies.

**Investigation & Iterations:**
1.  Initial basic mock setup for WebSocket client instance failed to properly capture and handle message callbacks.
2.  Attempting to find and invoke message handler via mock call inspection improved routing but still had object comparison issues.

**Solution Implemented:**
1.  Created helper function to wrap message handling in a promise for proper async flow.
2.  Established shared reference objects for URI and workspace folder instances to ensure consistent comparisons in mocks and assertions.
3.  Simplified mock implementations.
4.  Added thorough cleanup in test setup.
5.  Used console logging for debugging object references during test development.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Mock Object References:** For tests involving object comparisons, maintain consistent object references. Create objects once and reuse references.
*   **Async Test Helpers:** For complex async operations (e.g., WebSocket message handling), create helper functions wrapping the flow in Promises with clear resolution points.
*   **Test Setup Cleanup:** Ensure thorough cleanup (reset mocks, reset listeners, re-establish clean mock instances) to prevent test interference.
*   **Object Reference Debugging:** Use console logging (and stringify objects) during test development to understand object reference behavior.

---
## [13] - Jest Test Failures with WebSocket Message Handling

**Phase/Task in Development Plan:** Phase 2, Task 7 - Unit and Integration Testing

**Problem Encountered:**
*   **Symptoms:** Three unit tests for folder content command handler failed:
    1.  Successful path test: mock send function was not called.
    2.  Error path tests: TypeError parsing mock calls as no calls were made.
*   **Context:** Unit testing WebSocket message handling for folder content operations.
*   **Initial Diagnosis/Hypothesis:** Mock setup for URI handling and workspace folder references wasn't managing object identities and async message processing correctly, preventing WebSocket send calls.

**Investigation & Iterations:**
*   Improved mock implementations for URI parsing and file operations.
*   Made workspace folder references more consistent.
*   Enhanced mock setup for URI handling.
*   Added Promise wrapping around message handling and proper mock reset/cleanup.
*   Some tests passed, but async timing issues persisted.

**Solution Implemented:**
1.  **Mock State Management:** Used proper cleanup for consistent test state.
2.  **URI Mocking:** Improved URI mocks to better match expected behavior.
3.  **Workspace Folder Mocking:** Ensured mock service correctly returned mock workspace folder objects based on URI matching.
4.  **Async WebSocket Testing:** Wrapped client message sending and server response in a Promise that resolves when mock send is called.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Mock State Management:** Use proper cleanup for consistent test state, especially with multiple interacting mocks.
*   **URI Mocking:** Carefully mock URI systems to return objects with behavior consistent with actual API.
*   **Async WebSocket Testing:** Always wrap WebSocket message handling in Promises that resolve upon the expected mock call, ensuring async operations complete before assertions.
*   **Object Reference Consistency:** Maintain consistent mock object references (URIs, workspace folders) and use precise path/URI matching logic in mock implementations.

---
## [14] - Verifying Error Logging: Mocking Console in Tests

**Phase/Task in Development Plan:** Unit Testing - Server Stop Method

**Problem Encountered:**
*   **Symptoms:** Needed to verify that console error was called with specific arguments when an error occurs during a non-critical part of an operation (e.g., failing to close one client WebSocket during server shutdown).
*   **Context:** Testing server stop method's error handling for individual client cleanup.

**Solution Implemented:**
*   Used spy on console methods in test setup to verify calls and suppress output.
*   Asserted specific console calls with expected arguments in the test case.
*   Restored original console methods in test teardown to prevent interference.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Testing Console Logs:** Use spies to verify calls to console methods and their arguments. Mocking the implementation keeps test output clean.
*   **Restore Spies:** Always restore spies on global objects like console in test teardown to ensure test isolation.

---
## [15] - Unit Testing Server Methods by Direct State Manipulation

**Phase/Task in Development Plan:** Unit Testing - Server Methods

**Problem Encountered:**
*   **Symptoms:** Needed to test public methods of server that depend on internal server state (e.g., connected clients list, active WebSocket server instance) without simulating full client connections/message sequences for each test.
*   **Context:** Testing methods not directly handling messages but operating on server's established state.

**Solution Implemented:**
*   In test setup or specific tests, directly accessed and manipulated the internal state of the server instance using type assertions.
*   Added mock clients, simulated active server state, or simulated stopped server state as needed.
*   This allowed precise setup of conditions for testing the target method's logic in isolation.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Direct State Manipulation for Unit Tests:** For unit testing specific public methods of stateful classes (like a server), directly manipulating internal state can be effective if simulating all prerequisites is overly complex.
*   **Caution:** Use judiciously for unit tests where internal state setup is necessary and document clearly. This makes tests more reliant on internal implementation details. Integration tests should verify methods through external interactions.
*   **Test Isolation:** Ensure proper cleanup and test setup prevent state leakage.

---
## [16] - Message Push from Server Not Received by Content Script

**Phase/Task in Development Plan:** Phase 3 - Message Receiving and Insertion

**Problem Encountered:**
*   **Symptoms:** Server logs indicated successful sending of push messages. However, the content script's message listener was not triggered for these messages. Content did not appear, and indicators were not created.
*   **Context:** Testing message sending after implementing tab registration in service worker.
*   **Initial Diagnosis/Hypothesis:** Issue in service worker's forwarding of messages to content script, or content script's listener.

**Investigation & Iterations:**
*   Detailed logging in server confirmed WebSocket state was OPEN and message sent.
*   Detailed logging in service worker showed it received the message via WebSocket but then encountered "Error: Could not establish connection. Receiving end does not exist." when attempting to forward using runtime messaging.

**Solution Implemented:**
*   Modified service worker message handling.
*   For push messages, instead of broadcasting with runtime messaging, it now uses tab-specific messaging.
*   The target tab ID is extracted from the message payload.
*   This directs the message specifically to the content script on the intended tab.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Targeted Tab Messaging:** When a service worker needs to send a message to a content script on a specific, known tab, tab-specific messaging is more reliable than general runtime messaging. The latter can fail with "Receiving end does not exist" if it can't immediately find an active listener, while tab-specific messaging directly targets the specified tab.
*   **Prevention:** For targeted service worker to content script communication to a known tab, prefer tab-specific messaging. Ensure target tab ID is correctly passed and utilized.

---
## [17] - CSS Content Property Emoji/Unicode Rendering

**Phase/Task in Development Plan:** Phase 3 - UI and Functionality Implementation

**Problem Encountered:**
*   **Symptoms:** An emoji intended for a CSS content property appeared as garbled characters in the UI.
*   **Context:** Defining CSS for an error icon in content script. Source file was UTF-8 encoded.
*   **Initial Diagnosis/Hypothesis:** Encoding mismatch during CSS string construction/injection or browser parsing.

**Investigation & Iterations:**
*   Verified source file encoding (UTF-8).
*   Observed that directly pasting the emoji into the CSS string in TypeScript led to Mojibake.

**Solution Implemented:**
*   Replaced the direct emoji character in the CSS content property with its CSS escape sequence.
*   Used Unicode escape sequence for the warning sign emoji.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Unicode in CSS content:** Directly embedding Unicode characters (especially emojis) in CSS content properties defined within JavaScript/TypeScript strings can lead to encoding issues if not handled perfectly.
*   **CSS Escape Sequences:** For reliability, prefer using CSS escape sequences for Unicode characters in content properties. This avoids potential encoding problems during string manipulation or injection.

---
## [18] - TypeScript Control Flow Analysis with Method Side Effects

**Phase/Task in Development Plan:** Chrome Extension Development - Service Worker Connection Retry Logic

**Problem Encountered:**
*   **Symptoms:** TypeScript error "This expression is not callable. Type 'never' has no call signatures" when attempting to call a class property that should have been reassigned by a method call. The error occurred in connection retry logic where promise handlers were being reset and reinitialized.
*   **Context:** In a WebSocket client class, the connection retry logic needed to reset promise handlers to null, reinitialize them via a method call, then use the newly initialized handlers. The pattern was: set property to null, call initialization method, then use the property.
*   **Initial Diagnosis/Hypothesis:** TypeScript's control flow analysis wasn't tracking that a method call would reassign the nulled properties, leading to incorrect type narrowing.

**Investigation & Iterations:**
*   Examined the code flow pattern: class property set to null, followed by a method call that reassigns it, followed by an attempt to use the property.
*   Confirmed the initialization method properly creates a new Promise and assigns resolve/reject handlers to class properties.
*   Discovered that TypeScript's control flow analysis doesn't track side effects of method calls. After setting a property to null, TypeScript considers it null in that code branch, and a subsequent type guard narrows it to never (impossible type).

**Solution Implemented:**
*   Used a type assertion with an intermediate variable to help TypeScript understand the property's type after the method call.
*   This bypasses TypeScript's incorrect narrowing by explicitly asserting the expected type.

**Key Takeaway(s) / How to Avoid in Future:**
*   **TypeScript Control Flow Limitations:** TypeScript's control flow analysis cannot track side effects of method calls. When a property is set to null and then reassigned in a method, TypeScript may not understand the reassignment.
*   **Type Assertions for Side Effects:** When methods have side effects that reassign properties, use type assertions or intermediate variables to help TypeScript understand the post-method-call state.
*   **Alternative Patterns:** Consider returning values from methods instead of relying on side effects, or restructure code to make the flow more explicit to TypeScript's analysis (e.g., have the initialization method return the handlers rather than assigning them as side effects).
*   **Prevention:** When designing APIs that modify class properties as side effects, document this behavior clearly and consider whether the design could be more explicit about state changes to work better with TypeScript's type system.

---
## [19] - Regex-based Content Removal Fails Partially Due to Content Containing Wrapping Tags

**Phase/Task in Development Plan:** Phase 3 - Context Block Indicator Management & Content Insertion/Removal

**Problem Encountered:**
*   **Symptoms:** When removing content (specifically `contentScript.ts` itself, or any file containing strings identical to the extension's own wrapping tags like `</FileContents>`) from an LLM chat input via its context indicator's "x" button, only a portion of the content block was removed. The beginning of the block up to the point where the internal `</FileContents>` string occurred was deleted, but the rest of the file content and the true outer closing tag remained. This issue was specific to files whose content included strings that matched the extension's own XML-like wrapper tags.
*   **Context:** The removal logic in `contentScript.ts` used a regular expression with a non-greedy match `([\s\S]*?)` for the content between custom tags (e.g., `<FileContents id="...">` and `</FileContents>`).
*   **Initial Diagnosis/Hypothesis:** The non-greedy regex was prematurely terminating its content match upon encountering an instance of the closing tag string *within* the actual file content being wrapped, rather than matching up to the legitimate, outermost closing tag.

**Investigation & Iterations:**
1.  Verified that the regular expression for identifying the block to remove was correctly constructed to match the outer tags and capture content non-greedily.
2.  Initial tests with simple file contents worked correctly, suggesting the regex itself was fundamentally sound for "clean" content.
3.  The issue was consistently reproducible when the `contentScript.ts` file itself was inserted, as this file contained the string `</FileContents>` within its `formatFileContentsForLLM` function's return statement.
4.  Detailed logging using `regex.exec()` in a loop confirmed that the non-greedy `([\s\S]*?)` was indeed stopping at the first occurrence of `</FileContents>` it found, even if that occurrence was part of the *content* rather than the *wrapper*.
5.  Confirmed that the issue was independent of the insertion method (e.g., "active file" vs. "search") as long as the problematic file (`contentScript.ts`) was the one being inserted and removed.

**Solution Implemented:**
*   Modified the `formatFileContentsForLLM` function in `contentScript.ts`.
*   Before a file's content is wrapped in the Markdown code block and then the outer XML-like tags (e.g., `<FileContents>`), the function now processes the raw file content.
*   This processing step iterates through a predefined list of the extension's own wrapping tag names (e.g., `FileContents`, `FileTree`, `CodeSnippet`).
*   For each tag name, it uses regular expressions to find occurrences of `</tagName` and `<tagName` within the raw file content.
*   It then replaces these occurrences by inserting a zero-width space (`\u200B`) between the `<` or `</` and the `tagName` (e.g., `</FileContents>` becomes `</\u200BFileContents>`, and `<FileContents` becomes `<\u200BFileContents`).
*   This "neutralizes" any instances of the wrapping tags within the file content, preventing them from being mistakenly recognized by the removal regex as the legitimate outer closing tag. The legitimate outer tags added by `formatFileContentsForLLM` are not subjected to this neutralization.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Content vs. Wrapper Tag Collisions:** When wrapping arbitrary content (especially source code) with custom tags for later parsing or removal via regex, be aware that the content itself might contain strings identical to your wrapper tags.
*   **Non-Greedy Matching Pitfalls:** Non-greedy quantifiers (like `*?` or `+?`) in regex are powerful but will stop at the *very first* opportunity the rest of the regex can match. If the "rest of the regex" (e.g., a closing tag) can be found prematurely within the content, it will lead to incorrect partial matches.
*   **Sanitize/Neutralize Content:** When content can contain sequences that conflict with control/wrapper structures, implement a sanitization or neutralization step. Inserting zero-width spaces or other non-printing, non-interfering characters into potentially problematic sequences within the content can break undesired regex matches without significantly altering the visual or semantic meaning of the content for the end-user or LLM (though LLM interpretation of such characters should be considered).
*   **Robust Regex for Removal:** While the removal regex was made robust with backreferences (`</\1>`), this alone cannot solve the issue if the *content* itself provides a "valid" (but incorrect) earlier closing tag for the non-greedy matcher. The primary fix lies in ensuring the content doesn't offer such false positives.
*   **Testing with Self-Referential Content:** Always test systems that process or wrap code with the system's own source code as input, as this is a common way to uncover self-referential bugs or tag collisions.

---
## [20] - Redundant Content Wrapping Leading to Nested Tags

**Phase/Task in Development Plan:** Phase 3 - Full Integration and Testing

**Problem Encountered:**
*   **Symptoms:** When inserting a file tree or a folder's content, the resulting text in the LLM chat input was incorrectly formatted with nested wrapper tags (e.g., `<FileContents id="..."><FileContents>...</FileContents></FileContents>`). This broke the content removal logic, as the removal regex would only match the inner block, leaving orphaned content in the input field.
*   **Context:** The issue was caused by a violation of the Separation of Concerns principle. The VSCE's `fileSystemService` was pre-wrapping the file tree in `<FileTree>` tags, and the CE's `formatFileContentsForLLM` function was pre-wrapping content in `<FileContents>` tags. The client-side insertion logic then added another, outer wrapper tag with the unique ID, leading to the nested structure.

**Investigation & Iterations:**
*   Confirmed that the VSCE `getFileTree` response payload contained a string that already included `<FileTree>` tags.
*   Confirmed that the CE `formatFileContentsForLLM` function returned a string that already included `<FileContents>` tags.
*   Identified that multiple locations in the CE (`processContentInsertion`, `createBrowseViewButtons`, `createOpenFilesFormElements`) were attempting to add a final wrapper tag to what they assumed was raw content, but was in fact already-wrapped content.

**Solution Implemented:**
*   The architecture was refactored to enforce a strict Separation of Concerns.
*   **VSCE (`fileSystemService.ts`):** The `getFileTree` function was modified to return only the raw, unwrapped ASCII tree string.
*   **CE (`contentScript.ts`):** The `formatFileContentsForLLM` function was modified to return only the concatenated, unwrapped `File: ...` blocks.
*   **CE (Insertion Logic):** All call sites in the CE that insert content are now solely responsible for wrapping the received raw content in the appropriate top-level tag (e.g., `<FileContents id="...">`) before insertion. This ensures there is a single, unambiguous source of truth for the final formatting.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Data Providers vs. Presenters:** A service or module that provides data (like an IPC backend) should provide raw, unformatted data. The component that consumes and displays that data (the presenter, or client) should be responsible for all presentation-layer formatting (like adding HTML/XML tags). This clear boundary prevents redundant processing and bugs caused by incorrect assumptions about data format.
*   **Single Source of Truth:** The logic for applying a specific format (like the final wrapper tag with a unique ID) should exist in exactly one place. In this case, it now correctly resides in the CE's content insertion logic. This aligns with the DRY principle and improves maintainability.
*   **Prevention:** When designing an API or IPC contract, be explicit about the format of the data being exchanged. Specify whether data is raw or pre-formatted.

---

<!-- Add new log entries above this line | This comment must remain at the end of the file -->