/**
 * @file FileSystemService.ts
 * @description Provides services for accessing and processing file system data in the VS Code workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { TextDecoder } from 'util';
import { Ignore } from 'ignore';
import { Logger } from '@contextweaver/shared';
import {
  FileData as CWFileData,
  DirectoryEntry as CWDirectoryEntry,
  FilterType
} from '@contextweaver/shared';

/**
 * Service for handling file system operations with unified traversal logic.
 * Implements FR-VSCE-003: File System Operations
 */
export class FileSystemService {
  private readonly logger = new Logger('FileSystemService');

  /**
   * Generates a textual representation of the file and folder hierarchy for a given workspace folder.
   * Assumes `workspaceFolder` is valid and trusted.
   * @param workspaceFolder - The workspace folder to generate the tree for.
   * @param filter - The filter object containing ignore patterns and type.
   * @returns A Promise resolving to an object with the tree string and filter type, or an error string on failure.
   */
  async getFileTree(workspaceFolder: vscode.WorkspaceFolder, filter: { filter: Ignore; type: FilterType }): Promise<{ tree: string, filterTypeApplied: FilterType } | string> {
    try {
      const internalTree = await this._generateFileTreeTextInternal(workspaceFolder.uri, workspaceFolder.uri, '', filter.filter);
      const workspacePath = workspaceFolder.uri.fsPath.replace(/\\\\/g, '/'); // Ensure forward slashes for consistency
      // The content is the workspace path followed by the generated tree. The wrapper tag will be added by the client.
      const rawTreeContent = `${workspacePath}\n${internalTree.trim()}`;

      this.logger.trace('getFileTree: raw tree content to be sent:', rawTreeContent);

      return { tree: rawTreeContent, filterTypeApplied: filter.type };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in getFileTree for ${workspaceFolder.name}: ${errorMessage}`);
      return `Error generating file tree for ${workspaceFolder.name}: ${errorMessage}`;
    }
  }

  /**
   * Unified directory traversal method that eliminates code duplication.
   * @param dirUri The URI of the directory to traverse.
   * @param baseUri The base URI for calculating relative paths for ignore checks.
   * @param filter The ignore filter to apply.
   * @param processEntryCallback Callback function to process each entry.
   * @returns Promise that resolves when traversal is complete.
   */
  private async _traverseDirectoryRecursive(
    dirUri: vscode.Uri,
    baseUri: vscode.Uri,
    filter: Ignore,
    processEntryCallback: (entry: { uri: vscode.Uri; name: string; type: vscode.FileType; relativePath: string }) => Promise<void>
  ): Promise<void> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(dirUri);
      if (!entries) {
        return; // Return early if no entries
      }
      entries.sort((a, b) => {
        if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
        if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
        return a[0].localeCompare(b[0]);
      });

      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(dirUri, name);
        const relativePath = path.relative(baseUri.fsPath, entryUri.fsPath).replace(/\\/g, '/');
        const pathToCheck = (type === vscode.FileType.Directory && !relativePath.endsWith('/')) ? `${relativePath}/` : relativePath;
        const isIgnored = filter.ignores(pathToCheck);

        if (!isIgnored) {
          await processEntryCallback({ uri: entryUri, name, type, relativePath });
          
          if (type === vscode.FileType.Directory) {
            await this._traverseDirectoryRecursive(entryUri, baseUri, filter, processEntryCallback);
          }
        }
      }
    } catch (error) {
      const errorCode = error instanceof vscode.FileSystemError ? error.code : undefined;
      if (errorCode === 'FileNotFound') {
        this.logger.warn(`Directory not found during traversal: ${dirUri.fsPath}`);
        return; // Return early if directory not found for graceful handling
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error reading directory ${dirUri.fsPath}: ${errorMessage}`);
      throw error; // Re-throw to be caught by the caller
    }
  }

  /**
   * Recursively generates the textual representation of a directory's file and folder hierarchy.
   * Uses the unified traversal method to eliminate code duplication.
   * @param dirUri The URI of the current directory being processed.
   * @param baseUri The base URI of the workspace folder, used for calculating relative paths for ignore checks.
   * @param prefix The current prefix string for tree formatting (e.g., '├── ', '│   ').
   * @param filter The parsed .gitignore filter to apply.
   * @returns A Promise that resolves to the formatted string representation of the directory's contents.
   */
  private async _generateFileTreeTextInternal(
    dirUri: vscode.Uri,
    baseUri: vscode.Uri,
    prefix: string,
    filter: Ignore): Promise<string> {
    let treeString = '';
    const directChildren: Array<{ name: string; type: vscode.FileType; uri: vscode.Uri }> = [];
    
    try {
      // Get direct children of this directory only
      const entries = await vscode.workspace.fs.readDirectory(dirUri);
      entries.sort((a, b) => {
        if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
        if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
        return a[0].localeCompare(b[0]);
      });

      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(dirUri, name);
        const relativePath = path.relative(baseUri.fsPath, entryUri.fsPath).replace(/\\/g, '/');
        const pathToCheck = (type === vscode.FileType.Directory && !relativePath.endsWith('/')) ? `${relativePath}/` : relativePath;
        const isIgnored = filter.ignores(pathToCheck);

        if (!isIgnored) {
          directChildren.push({ name, type, uri: entryUri });
        }
      }

      for (let i = 0; i < directChildren.length; i++) {
        const { name, type, uri: entryUri } = directChildren[i];
        const isLast = (i === directChildren.length - 1);
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        const linePrefix = prefix + (isLast ? '└── ' : '├── ');
        treeString += `${linePrefix}${name}\n`;

        if (type === vscode.FileType.Directory) {
          const subdirContent = await this._generateFileTreeTextInternal(entryUri, baseUri, newPrefix, filter);
          if (subdirContent) { // Only add if there's content (avoids empty prefixes for fully ignored subdirs)
            treeString += subdirContent;
          }
        }
      }
    } catch (error) {
      const errorCode = error instanceof vscode.FileSystemError ? error.code : undefined;
      if (errorCode === 'FileNotFound') {
        this.logger.warn(`Directory not found during tree generation: ${dirUri.fsPath}`);
        return ''; // Return empty string if directory not found, prevents error propagation
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error reading directory ${dirUri.fsPath}: ${errorMessage}`);
      // Avoid adding error to tree string here, let higher level handle overall error
      throw error; // Re-throw to be caught by the caller of getFileTree
    }
    return treeString;
  }

  /**
   * @description Determines the language ID for a given file URI.
   * @param {vscode.Uri} fileUri - The URI of the file.
   * @returns {Promise<string>} The language ID (e.g., 'typescript', 'python'). Defaults to 'plaintext'.
   */
  private async _getLanguageId(fileUri: vscode.Uri): Promise<string> {
    try {
      const extension = path.extname(fileUri.fsPath).toLowerCase();
      const langMap: { [key: string]: string } = {
        '.ts': 'typescript', '.js': 'javascript', '.json': 'json', '.py': 'python',
        '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.cs': 'csharp', '.go': 'go',
        '.html': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less', '.xml': 'xml',
        '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown', '.rb': 'ruby', '.php': 'php',
        '.rs': 'rust', '.swift': 'swift', '.kt': 'kotlin', '.scala': 'scala',
        '.sh': 'shellscript', '.ps1': 'powershell', '.bat': 'bat',
      };
      return langMap[extension] || 'plaintext';
    } catch (e) {
      this.logger.warn(`Could not determine language for ${fileUri.fsPath}, defaulting to plaintext. Error: ${e}`);
      return 'plaintext';
    }
  }

  /**
   * Reads the content of a file and determines its language ID.
   * Returns null if the file is binary or a read error occurs.
   * @param fileUri - The URI of the file to read.
   * @returns A Promise resolving to an object with file data, or null.
   * @sideeffect Reads from the file system.
   */
  async getFileContentWithLanguageId(fileUri: vscode.Uri): Promise<CWFileData | null> {
    try {
      const fileData = await vscode.workspace.fs.readFile(fileUri);
      const sample = fileData.slice(0, 1024);
      if (sample.includes(0)) {
        this.logger.debug(`Skipping binary file (null byte detected): ${fileUri.fsPath}`);
        return null;
      }

      const decoder = new TextDecoder('utf-8', { fatal: true });
      let content: string;
      try {
        content = decoder.decode(fileData);
        if (content.includes('\uFFFD')) {
          this.logger.debug(`Skipping file with decoding errors (likely not UTF-8, or binary): ${fileUri.fsPath}`);
          return null;
        }
      } catch (decodeError) {
        const errorMessage = decodeError instanceof Error ? decodeError.message : String(decodeError);
        this.logger.debug(`Skipping binary file (decode error for ${fileUri.fsPath}): ${errorMessage}`);
        return null;
      }

      const languageId = await this._getLanguageId(fileUri);
      const fullPath = fileUri.fsPath.replace(/\\/g, '/');

      return {
        fullPath,
        content,
        languageId,
      };
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        this.logger.warn(`File not found: ${fileUri.fsPath}`);
        // Re-throw the specific error so the caller can distinguish between "not found" and other read errors.
        throw error;
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error reading file ${fileUri.fsPath}: ${errorMessage}`);
      }
      return null; // For other errors (e.g., permission denied), returning null is still a safe fallback.
    }
  }

  /**
   * Retrieves structured data for all text files within a specified folder and its subfolders.
   * The data is prepared for IPC to be formatted by the Chrome Extension.
   * @param folderUri - The URI of the folder whose contents are to be read.
   * @param workspaceFolder - The workspace folder context for applying ignore rules.
   * @param filter - The filter object containing ignore patterns and type.
   * @returns A Promise resolving to an object with an array of file data, or an error string on failure.
   */
  async getFolderContentsForIPC(
    folderUri: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder,
    filter: { filter: Ignore; type: FilterType }
  ): Promise<{ filesData: CWFileData[], filterTypeApplied: FilterType } | string> {

    const filesData: CWFileData[] = [];

    // Use the unified traversal method with a specific callback for folder contents
    const processEntryForFolderContents = async (entry: { uri: vscode.Uri; name: string; type: vscode.FileType; relativePath: string }) => {
      if (entry.type === vscode.FileType.File) {
        if (entry.name === '.gitignore') return;

        const fileDetail = await this.getFileContentWithLanguageId(entry.uri);
        if (fileDetail) {
          filesData.push(fileDetail);
        } else {
          this.logger.debug(`File ${entry.uri.fsPath} skipped (binary or read error).`);
        }
      }
    };

    try {
      await this._traverseDirectoryRecursive(folderUri, workspaceFolder.uri, filter.filter, processEntryForFolderContents);
      return { filesData, filterTypeApplied: filter.type };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in getFolderContentsForIPC for ${folderUri.fsPath}: ${errorMessage}`);
      return `Error getting contents for folder ${folderUri.fsPath}: ${errorMessage}`;
    }
  }

  /**
   * Recursively traverses a directory, collecting all file and folder entries that are not ignored.
   * Uses the unified traversal method to eliminate code duplication.
   * @param dirUri The URI of the directory to start traversal from.
   * @param baseWorkspaceFolder The root workspace folder for context and ignore path calculations.
   * @param filter The parsed ignore filter to apply.
   * @returns A promise that resolves to a flat array of all descendant directory entries.
   */
  private async _getDirectoryListingRecursive(
    dirUri: vscode.Uri,
    baseWorkspaceFolder: vscode.WorkspaceFolder,
    filter: Ignore
  ): Promise<CWDirectoryEntry[]> {
    const allEntries: CWDirectoryEntry[] = [];
    
    // Use the unified traversal method with a specific callback for directory listing
    const processEntryForDirectoryListing = async (entry: { uri: vscode.Uri; name: string; type: vscode.FileType; relativePath: string }) => {
      const isDirectory = entry.type === vscode.FileType.Directory;
      const uriString = entry.uri.toString();
      
      allEntries.push({
        name: entry.name,
        type: isDirectory ? 'folder' : 'file',
        uri: uriString,
        content_source_id: uriString,
        windowId: '' // Will be populated by ipcServer
      });
    };

    try {
      // Explicitly check if the root directory exists first to ensure proper error handling for getDirectoryListing
      await vscode.workspace.fs.readDirectory(dirUri);
      
      await this._traverseDirectoryRecursive(dirUri, baseWorkspaceFolder.uri, filter, processEntryForDirectoryListing);
      
      // Sort with files first, then folders (preserving original order)
      allEntries.sort((a, b) => {
        if (a.type !== 'folder' && b.type === 'folder') return -1;
        if (a.type === 'folder' && b.type !== 'folder') return 1;
        return a.name.localeCompare(b.name);
      });
      
      return allEntries;
    } catch (error) {
      this.logger.warn(`Error reading directory ${dirUri.fsPath} during recursive listing:`, error);
      throw error; // Re-throw the error to be caught by the top-level caller
    }
  }

  /**
   * Lists all non-ignored files and folders recursively within a directory.
   * @param folderToScanUri - The URI of the folder to list.
   * @param containingWorkspaceFolder - The workspace folder for filter context.
   * @param filter - The filter object containing ignore patterns and type.
   * @returns A Promise resolving to an object containing the directory entries and the filter type applied.
   * @sideeffect Reads from the file system.
   */
  async getDirectoryListing(
    folderToScanUri: vscode.Uri,
    containingWorkspaceFolder: vscode.WorkspaceFolder,
    filter: { filter: Ignore; type: FilterType }
  ): Promise<{ entries: CWDirectoryEntry[]; filterTypeApplied: FilterType }> {
    const entries: CWDirectoryEntry[] = [];

    try {
      // Call the recursive function to get all descendants
      const recursiveEntries = await this._getDirectoryListingRecursive(
        folderToScanUri,
        containingWorkspaceFolder,
        filter.filter
      );
      entries.push(...recursiveEntries);

      return { entries, filterTypeApplied: filter.type };
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        this.logger.warn(`Directory not found: ${folderToScanUri.fsPath}`);
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error reading directory ${folderToScanUri.fsPath}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Retrieves all relevant data for a given workspace folder, including file contents and file tree,
   * formatted for IPC.
   * @param workspaceFolder The VS Code workspace folder to retrieve data from.
   * @param filter - The filter object containing ignore patterns and type.
   * @returns A Promise that resolves to an object containing `filesData`, `fileTreeString`, `workspaceName`, `filterTypeApplied`, and `projectPath`, or an error string.
   */
  async getWorkspaceDataForIPC(
    workspaceFolder: vscode.WorkspaceFolder,
    filter: { filter: Ignore; type: FilterType }
  ): Promise<{ filesData: CWFileData[], fileTreeString: string, workspaceName: string, filterTypeApplied: FilterType, projectPath: string } | string> {

    const folderContentResult = await this.getFolderContentsForIPC(workspaceFolder.uri, workspaceFolder, filter);
    if (typeof folderContentResult === 'string') {
      return folderContentResult;
    }

    const fileTreeResult = await this.getFileTree(workspaceFolder, filter);
    if (typeof fileTreeResult === 'string') {
      return `Error generating file tree for workspace ${workspaceFolder.name}: ${fileTreeResult}`;
    }

    const projectPath = workspaceFolder.uri.fsPath.replace(/\\/g, '/');

    return {
      filesData: folderContentResult.filesData,
      fileTreeString: fileTreeResult.tree,
      workspaceName: workspaceFolder.name,
      filterTypeApplied: folderContentResult.filterTypeApplied,
      projectPath: projectPath
    };
  }
}

// Legacy exports for backward compatibility - these will be removed in a future version
const _instance = new FileSystemService();
export const getFileTree = _instance.getFileTree.bind(_instance);
export const getFileContentWithLanguageId = _instance.getFileContentWithLanguageId.bind(_instance);
export const getFolderContentsForIPC = _instance.getFolderContentsForIPC.bind(_instance);
export const getDirectoryListing = _instance.getDirectoryListing.bind(_instance);
export const getWorkspaceDataForIPC = _instance.getWorkspaceDataForIPC.bind(_instance);