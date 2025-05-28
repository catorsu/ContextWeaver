/**
 * @file searchService.ts
 * @description Provides search functionality for files and folders within the workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Ignore } from 'ignore'; 
import { parseGitignore } from './fileSystemService'; // Assuming this is still needed for gitignore logic
import { WorkspaceService } from './workspaceService'; // Added

const LOG_PREFIX_SEARCH_SERVICE = '[ContextWeaver SearchService] ';

// Default ignore patterns (can be kept or potentially centralized if WorkspaceService provides them)
const LOCAL_IGNORE_PATTERNS_DEFAULT = [
  'node_modules/', '.git/', '.vscode/', 'dist/', 'build/', '*.log',
  '__pycache__/', '.DS_Store', '*.pyc', '*.pyo', '*.swp', '*.bak', '*.tmp',
  '.gitignore', 
  '*.zip', '*.tar.gz', '*.rar', '*.7z', '*.exe', '*.dll', '*.obj', '*.o',
  '*.a', '*.lib', '*.so', '*.dylib', '*.ncb', '*.sdf', '*.suo', '*.pdb',
  '*.idb', '*.class', '*.jar', '*.mp3', '*.wav', '*.ogg', '*.mp4', '*.avi',
  '*.mov', '*.wmv', '*.flv', '*.mkv', '*.webm', '*.jpg', '*.jpeg', '*.png',
  '*.gif', '*.bmp', '*.tiff', '*.ico', '*.pdf', '*.doc', '*.docx', '*.ppt',
  '*.pptx', '*.xls', '*.xlsx', '*.odt', '*.ods', '*.odp',
];

/**
 * @interface SearchResult
 * @description Defines the structure for a search result item.
 */
export interface SearchResult {
  path: string; 
  name: string; 
  type: 'file' | 'folder';
  uri: string; 
  content_source_id: string; 
  workspaceFolderUri: string; // Changed to non-nullable, should always be present
  workspaceFolderName: string; // Changed to non-nullable
  filterTypeApplied?: 'gitignore' | 'default';
}

export class SearchService {
  private outputChannel: vscode.OutputChannel;
  private workspaceService: WorkspaceService;

  constructor(outputChannel: vscode.OutputChannel, workspaceService: WorkspaceService) {
    this.outputChannel = outputChannel;
    this.workspaceService = workspaceService;
    this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + 'Initialized');
  }

  // getPathIgnoreInfoInternal can remain largely the same, or be moved to fileSystemService if fully duplicated
  private static getPathIgnoreInfoInternal(
    relativePath: string,
    name: string,
    isDirectory: boolean,
    gitignoreFilter: Ignore | null,
    defaultIgnorePatterns: readonly string[]
  ): { ignored: boolean; filterTypeApplied: 'gitignore' | 'default' } {
    if (gitignoreFilter) {
      let pathToCheck = relativePath;
      if (pathToCheck.startsWith('./')) {
        pathToCheck = pathToCheck.substring(2);
      }
      
      if (gitignoreFilter.ignores(pathToCheck)) {
        return { ignored: true, filterTypeApplied: 'gitignore' };
      }
      return { ignored: false, filterTypeApplied: 'gitignore' };
    } else {
      for (const pattern of defaultIgnorePatterns) {
        const cleanPatternName = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;

        if (pattern.endsWith('/')) { 
          if (isDirectory && (name === cleanPatternName || relativePath === cleanPatternName || relativePath.startsWith(cleanPatternName + '/'))) {
            return { ignored: true, filterTypeApplied: 'default' };
          }
        } else if (pattern.startsWith('*.')) { 
          if (!isDirectory && name.endsWith(pattern.substring(1))) {
            return { ignored: true, filterTypeApplied: 'default' };
          }
        } else { 
          if (name === pattern) {
            return { ignored: true, filterTypeApplied: 'default' };
          }
        }
      }
      return { ignored: false, filterTypeApplied: 'default' };
    }
  }


  /**
   * @description Searches for files and folders within trusted workspace folders, applying .gitignore rules.
   * Assumes workspace trust and existence of folders are pre-checked by the caller (IPCServer).
   * @param {string} query - The search query string.
   * @param {vscode.Uri} [specificWorkspaceFolderUri] - Optional. If provided, search only within this workspace folder. Otherwise, search all trusted workspace folders.
   * @returns {Promise<SearchResult[]>} A promise that resolves to an array of search results.
   * @sideeffect Reads from the file system, including .gitignore files.
   */
  public async search(query: string, specificWorkspaceFolderUri?: vscode.Uri): Promise<SearchResult[]> {
    if (!query || query.trim() === '') {
      return [];
    }

    const allResults: SearchResult[] = [];
    // Workspace trust and existence of folders are pre-checked by IPCServer using WorkspaceService.
    // We can directly use WorkspaceService here to get the folders to iterate over.
    
    const foldersToSearch: vscode.WorkspaceFolder[] = [];
    if (specificWorkspaceFolderUri) {
        const folder = this.workspaceService.getWorkspaceFolder(specificWorkspaceFolderUri);
        if (folder) {
            foldersToSearch.push(folder);
        } else {
            this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + `Warning: Specified workspace folder for search not found: ${specificWorkspaceFolderUri.toString()}`);
            return []; // Or throw an error to be handled by IPCServer
        }
    } else {
        const allWorkspaceFolders = this.workspaceService.getWorkspaceFolders();
        if (allWorkspaceFolders) {
            foldersToSearch.push(...allWorkspaceFolders);
        }
    }

    if (foldersToSearch.length === 0) {
        this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + 'No workspace folders to search in.');
        return [];
    }
    
    this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + `Searching for '${query}' in ${foldersToSearch.length} target folder(s).`);

    for (const folder of foldersToSearch) {
      // Ensure the folder itself is trusted (though overall workspace trust is primary gate)
      // This individual check might be redundant if ensureWorkspaceTrustedAndOpen covers all.
      // For now, relying on the pre-check in IPCServer.
      this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + `Searching in folder: ${folder.name} (${folder.uri.fsPath})`);
      try {
        const gitignoreFilter = await parseGitignore(folder); // parseGitignore is workspace folder specific
        const folderResults = await this.findInDirectoryRecursive(folder.uri, query, folder, gitignoreFilter);
        allResults.push(...folderResults);
      } catch (error: any) {
        this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + `Error searching in directory ${folder.uri.fsPath}: ${error.message}`);
        console.error(LOG_PREFIX_SEARCH_SERVICE + `Error searching in directory ${folder.uri.fsPath}:`, error);
      }
    }
    this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + `Found ${allResults.length} results for query '${query}' after filtering.`);
    return allResults;
  }

  private async findInDirectoryRecursive(
    dirUri: vscode.Uri, 
    query: string, 
    baseWorkspaceFolder: vscode.WorkspaceFolder, // This is the root for this particular search branch
    gitignoreFilter: Ignore | null
  ): Promise<SearchResult[]> {
    let results: SearchResult[] = [];
    const lowerCaseQuery = query.toLowerCase();

    try {
      const entries = await vscode.workspace.fs.readDirectory(dirUri);
      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(dirUri, name);
        const relativePath = path.relative(baseWorkspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\\\/g, '/');

        const ignoreInfo = SearchService.getPathIgnoreInfoInternal(
            relativePath, 
            name, 
            (type === vscode.FileType.Directory), 
            gitignoreFilter, 
            LOCAL_IGNORE_PATTERNS_DEFAULT
        );

        if (ignoreInfo.ignored) {
          continue; 
        }

        let itemMatchesQuery = name.toLowerCase().includes(lowerCaseQuery);

        if (itemMatchesQuery) {
          results.push({
            path: entryUri.fsPath,
            name: name,
            type: (type === vscode.FileType.Directory) ? 'folder' : 'file',
            uri: entryUri.toString(),
            content_source_id: entryUri.toString(), // Absolute URI is unique
            workspaceFolderUri: baseWorkspaceFolder.uri.toString(),
            workspaceFolderName: baseWorkspaceFolder.name,
            filterTypeApplied: ignoreInfo.filterTypeApplied
          });
        }

        if (type === vscode.FileType.Directory) {
          const subDirResults = await this.findInDirectoryRecursive(entryUri, query, baseWorkspaceFolder, gitignoreFilter);
          results = results.concat(subDirResults);
        }
      }
    } catch (error: any) { 
      this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + `Failed to read directory ${dirUri.fsPath}: ${error.message}`);
      // console.warn(`[ContextWeaver SearchService] Failed to read directory ${dirUri.fsPath}: ${error.message}`);
    }
    return results;
  }
}