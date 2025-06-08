/**
 * @file data-models.ts
 * @description Defines common data models and interfaces used across the ContextWeaver
 * VS Code Extension and Chrome Extension for consistent data exchange.
 * @module ContextWeaver/Shared
 */

/**
 * @description Metadata for a block of content inserted into the LLM chat.
 * As per IPC_Protocol_Design.md Section 4 and FR-IPC-005.
 */
export interface ContextBlockMetadata {
    unique_block_id: string; // UUID for this specific instance of content
    content_source_id: string; // Canonical identifier for the source (file path, folder path, special ID)
    type: "file_tree" | "file_content" | "folder_content" | "codebase_content" | "code_snippet";
    label: string; // User-friendly label for the indicator
    workspaceFolderUri: string | null;
    workspaceFolderName: string | null;
}

/**
 * @description Structure for holding file content and its metadata.
 * Used in various IPC responses.
 */
export interface FileData {
    fullPath: string; // Normalized, absolute path
    content: string;
    languageId: string; // e.g., 'typescript', 'python'
}

/**
 * @description Type for filter application status, used in various IPC responses.
 */
export type FilterType = 'gitignore' | 'default' | 'none' | 'not_applicable';

/**
 * @description Defines the structure for a search result item.
 * As per IPC_Protocol_Design.md 3.2.8 and searchService.ts.
 */
export interface SearchResult {
    path: string; // fsPath of the file/folder
    name: string; // Name for display
    type: 'file' | 'folder';
    uri: string; // Full URI string of the entry
    content_source_id: string; // Canonical ID, typically same as URI string
    workspaceFolderUri: string; // URI of the workspace folder this result belongs to
    workspaceFolderName: string; // Name of the workspace folder
    relativePath: string; // Relative path from the workspace root
    filterTypeApplied?: FilterType; // ADDED: Optional field
}

/**
 * @description Structure for file and folder entries in a directory listing.
 * As per IPC_Protocol_Design.md 3.2.13.
 */
export interface DirectoryEntry {
    name: string;
    type: 'file' | 'folder';
    uri: string; // Full URI string of the entry
    content_source_id: string; // Canonical ID, typically same as URI string
}
