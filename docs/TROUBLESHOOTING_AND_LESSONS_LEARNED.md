# Troubleshooting and Lessons Learned Log - ContextWeaver

This document records significant issues encountered during the development of the ContextWeaver project, the solutions implemented, and key lessons learned. The aim is to build a knowledge base for future maintenance, development, and to avoid repeating past mistakes.

## Entry Format

Each new entry should follow the format below:

---

## [YYYY-MM-DD] - [Brief, Descriptive Title of Issue or Lesson]

**Phase/Task in Development Plan:** (e.g., Phase 3, Task 4 - Context Block Indicator Management)

**Problem Encountered:**
*   **Symptoms:** (Detailed description of what went wrong. What was the expected behavior? What was the actual behavior? Include specific error messages, unexpected UI behavior, or incorrect data handling.)
*   **Context:** (Relevant conditions, e.g., specific user input, state of VSCE/CE, browser version if applicable.)
*   **Initial Diagnosis/Hypothesis (if any):** (What was initially thought to be the cause?)

**Investigation & Iterations:**
*   (Briefly describe the key steps taken to diagnose the issue. What approaches were tried that didn't work? What information was crucial for diagnosis – e.g., specific API documentation, user-provided clarification?)

**Solution Implemented:**
*   (Clear description of the final fix or approach that worked. If code changes were made via tools, summarize the nature of the changes, e.g., "Modified file X to correctly handle null values from IPC message Y by adding a conditional check.")
*   (If specific tool calls were critical, mention their purpose, e.g., "Used `write_to_file` to update the error handling logic in `ipcClient.ts`.")

**Key Takeaway(s) / How to Avoid in Future:**
*   (What was learned from this experience? Are there broader implications for design, testing, or API usage?)
*   (e.g., "Lesson: Always validate payload structures received over IPC, even if they are expected to conform to a schema, to prevent runtime errors." or "Takeaway: The `someChromeApi.featureX` has an undocumented edge case when parameter Y is an empty string; ensure this is handled explicitly.")
*   (e.g., "Prevention: Add more specific unit tests for IPC message parsing.")

---

**(Example Entry - The development assistant can use this as a template for its first real entry)**

## 2025-05-27 - IPC Handshake Fails Due to Token Mismatch

**Phase/Task in Development Plan:** Phase 1, Task 5 - Initial "Handshake" Test

**Problem Encountered:**
*   **Symptoms:** The Chrome Extension (CE) was unable to establish a successful "ping" connection with the VS Code Extension (VSCE) server. The CE console showed a "401 Unauthorized" or similar error after sending the initial request, and the VSCE server logs indicated an authentication failure. Expected behavior was a successful "pong" response.
*   **Context:** Both extensions were running locally. A shared secret token was configured in both.
*   **Initial Diagnosis/Hypothesis:** The tokens were not matching, or the authentication logic in the VSCE server was flawed.

**Investigation & Iterations:**
*   Verified that the token string was identical in both the CE's configuration and the VSCE's server-side check.
*   Added detailed logging on the VSCE server to inspect the received token and the expected token.
*   Discovered that an extra whitespace character was inadvertently included when the token was copied into the CE's configuration UI by the user (simulated).

**Solution Implemented:**
*   The development assistant planned to advise the user to ensure no leading/trailing whitespace in the token configuration.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson:** User input for sensitive configurations like tokens should always be sanitized (e.g., trimmed) before use or comparison to prevent common copy-paste errors.
*   **Prevention:** Implement client-side trimming in the CE's configuration UI if possible, and always trim on the server-side as a fallback. Update IPC design document to specify token sanitization.

---
<!-- New entries should be added below this line, following the format above. -->