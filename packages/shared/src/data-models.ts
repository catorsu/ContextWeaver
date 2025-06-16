/**
 * @file data-models.ts
 * @description Defines common data models and interfaces used across the ContextWeaver
 * VS Code Extension and Chrome Extension for consistent data exchange.
 * @module ContextWeaver/Shared
 */

/**
 * Metadata for a block of content inserted into the LLM chat.
 * This data is used to render context indicators and manage content removal.
 * @property {string} unique_block_id - A UUID for this specific instance of content insertion.
 * @property {string} content_source_id - Canonical identifier for the source (e.g., file path, folder path, special ID).
 * @property {"FileTree" | "file_content" | "folder_content" | "codebase_content" | "CodeSnippet" | "WorkspaceProblems"} type - The type of content block.
 * @property {string} label - User-friendly label for the context indicator UI.
 * @property {string | null} workspaceFolderUri - The URI of the VS Code workspace folder this content belongs to.
 * @property {string | null} workspaceFolderName - The name of the VS Code workspace folder.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface ContextBlockMetadata {
    unique_block_id: string;
    content_source_id: string;
    type: "FileTree" | "file_content" | "folder_content" | "codebase_content" | "CodeSnippet" | "WorkspaceProblems";
    label: string;
    workspaceFolderUri: string | null;
    workspaceFolderName: string | null;
    windowId: string;
}

/**
 * Structure for holding file content and its associated metadata.
 * @property {string} fullPath - The normalized, absolute file system path of the file.
 * @property {string} content - The UTF-8 text content of the file.
 * @property {string} languageId - The VS Code language identifier (e.g., 'typescript', 'python').
 */
export interface FileData {
    fullPath: string;
    content: string;
    languageId: string;
}

/**
 * Describes which filter was applied during a file system operation.
 * - `gitignore`: A `.gitignore` file was found and used.
 * - `default`: No `.gitignore` was found; default ignore patterns were used.
 * - `none`: No files were ignored (or filtering was not applicable).
 * - `not_applicable`: Filtering does not apply to this operation (e.g., single file content).
 */
export type FilterType = 'gitignore' | 'default' | 'none' | 'not_applicable';

/**
 * Defines the structure for a single search result item.
 * @property {string} path - The file system path of the file or folder.
 * @property {string} name - The display name of the file or folder.
 * @property {'file' | 'folder'} type - The type of the search result.
 * @property {string} uri - The full URI string of the entry.
 * @property {string} content_source_id - The canonical identifier for the content source, typically the URI.
 * @property {string} workspaceFolderUri - The URI of the VS Code workspace folder this result belongs to.
 * @property {string} workspaceFolderName - The name of the VS Code workspace folder.
 * @property {string} relativePath - The path of the entry relative to its workspace root.
 * @property {FilterType} [filterTypeApplied] - The type of filter that was applied to this item during the search.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface SearchResult {
    path: string;
    name: string;
    type: 'file' | 'folder';
    uri: string;
    content_source_id: string;
    workspaceFolderUri: string;
    workspaceFolderName: string;
    relativePath: string;
    filterTypeApplied?: FilterType;
    windowId: string;
}

/**
 * Represents a single file or folder in a directory listing.
 * @property {string} name - The display name of the file or folder.
 * @property {'file' | 'folder'} type - The type of the directory entry.
 * @property {string} uri - The full URI string of the entry.
 * @property {string} content_source_id - The canonical identifier for the content source, typically the URI.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface DirectoryEntry {
    name: string;
    type: 'file' | 'folder';
    uri: string;
    content_source_id: string;
    windowId: string;
}
