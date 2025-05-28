/**
 * @file searchService.ts
 * @description Provides search functionality for files and folders within the workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Ignore } from 'ignore'; 
import { parseGitignore } from './fileSystemService';

// Copied from fileSystemService.ts (IGNORE_PATTERNS_DEFAULT)
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
  workspaceFolderUri: string | null;
  workspaceFolderName: string | null;
  filterTypeApplied?: 'gitignore' | 'default';
}

export class SearchService {

  // Copied and adapted from fileSystemService.ts's getPathIgnoreInfo
  private static getPathIgnoreInfoInternal(
    relativePath: string,
    name: string,
    isDirectory: boolean,
    gitignoreFilter: Ignore | null,
    defaultIgnorePatterns: readonly string[]
  ): { ignored: boolean; filterTypeApplied: 'gitignore' | 'default' } {
    if (gitignoreFilter) {
      let pathToCheck = relativePath;
      // The 'ignore' library expects paths to not start with './' for its matching.
      // It also handles directory matching (e.g. 'node_modules/') correctly against 'node_modules'.
      if (pathToCheck.startsWith('./')) {
        pathToCheck = pathToCheck.substring(2);
      }
      
      if (gitignoreFilter.ignores(pathToCheck)) {
        // console.log(`[ContextWeaver SearchService] Ignoring (gitignore): '${pathToCheck}' (orig relPath: '${relativePath}')`);
        return { ignored: true, filterTypeApplied: 'gitignore' };
      }
      // The 'ignore' library itself handles directory patterns (ending with /) correctly.
      // No need for an explicit check with an added slash if the library is used as intended.
      return { ignored: false, filterTypeApplied: 'gitignore' };
    } else {
      // Default patterns logic
      for (const pattern of defaultIgnorePatterns) {
        const cleanPatternName = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;

        if (pattern.endsWith('/')) { // Directory pattern like 'node_modules/'
          if (isDirectory && (name === cleanPatternName || relativePath === cleanPatternName || relativePath.startsWith(cleanPatternName + '/'))) {
            // console.log(`[ContextWeaver SearchService] Ignoring (default pattern - dir): '${relativePath}' due to '${pattern}'`);
            return { ignored: true, filterTypeApplied: 'default' };
          }
        } else if (pattern.startsWith('*.')) { // Extension pattern like '*.log'
          if (!isDirectory && name.endsWith(pattern.substring(1))) {
            // console.log(`[ContextWeaver SearchService] Ignoring (default pattern - ext): '${relativePath}' due to '${pattern}'`);
            return { ignored: true, filterTypeApplied: 'default' };
          }
        } else { // Exact name pattern like '.DS_Store' or '.gitignore'
          if (name === pattern) {
            // console.log(`[ContextWeaver SearchService] Ignoring (default pattern - exact name): '${relativePath}' due to '${pattern}'`);
            return { ignored: true, filterTypeApplied: 'default' };
          }
        }
      }
      return { ignored: false, filterTypeApplied: 'default' };
    }
  }

  constructor() {
    console.log('[ContextWeaver SearchService] Initialized');
  }

  /**
   * @description Searches for files and folders within trusted workspace folders, applying .gitignore rules.
   * @param {string} query - The search query string.
   * @param {vscode.Uri} [workspaceFolderToSearch] - Optional. If provided, search only within this workspace folder. Otherwise, search all trusted workspace folders.
   * @returns {Promise<SearchResult[]>} A promise that resolves to an array of search results.
   * @sideeffect Reads from the file system, including .gitignore files.
   */
  public async search(query: string, workspaceFolderToSearch?: vscode.Uri): Promise<SearchResult[]> {
    if (!query || query.trim() === '') {
      return [];
    }

    const allResults: SearchResult[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      console.log('[ContextWeaver SearchService] No workspace folders open.');
      return [];
    }

    if (!vscode.workspace.isTrusted) {
      console.warn('[ContextWeaver SearchService] Workspace is not trusted. Aborting search.');
      return [];
    }

    const targetFolders: vscode.WorkspaceFolder[] = [];
    if (workspaceFolderToSearch) {
      const specificFolder = workspaceFolders.find(wf => wf.uri.toString() === workspaceFolderToSearch.toString());
      if (specificFolder) {
        targetFolders.push(specificFolder);
      } else {
        console.warn(`[ContextWeaver SearchService] Specified workspace folder URI not found: ${workspaceFolderToSearch.toString()}`);
        return [];
      }
    } else {
      targetFolders.push(...workspaceFolders);
    }
    
    // console.log(`[ContextWeaver SearchService] Searching for '${query}' in ${targetFolders.length} target folder(s).`);

    for (const folder of targetFolders) {
      // console.log(`[ContextWeaver SearchService] Searching in folder: ${folder.uri.fsPath}`);
      try {
        const gitignoreFilter = await parseGitignore(folder);
        const folderResults = await this.findInDirectoryRecursive(folder.uri, query, folder, gitignoreFilter);
        allResults.push(...folderResults);
      } catch (error: any) {
        console.error(`[ContextWeaver SearchService] Error searching in directory ${folder.uri.fsPath}:`, error);
      }
    }
    // console.log(`[ContextWeaver SearchService] Found ${allResults.length} results for query '${query}' after filtering.`);
    return allResults;
  }

  /**
   * @description Recursively finds files and folders matching the query within a directory, applying filters.
   * @param {vscode.Uri} dirUri - The URI of the directory to search.
   * @param {string} query - The search query string.
   * @param {vscode.WorkspaceFolder} baseWorkspaceFolder - The root workspace folder this search belongs to.
   * @param {Ignore | null} gitignoreFilter - The parsed .gitignore filter for the baseWorkspaceFolder.
   * @returns {Promise<SearchResult[]>} A promise that resolves to an array of search results.
   * @sideeffect Reads from the file system.
   */
  private async findInDirectoryRecursive(
    dirUri: vscode.Uri, 
    query: string, 
    baseWorkspaceFolder: vscode.WorkspaceFolder,
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
            content_source_id: entryUri.toString(),
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
    } catch (error: any) { // Catch errors from readDirectory, e.g. permission denied
      console.warn(`[ContextWeaver SearchService] Failed to read directory ${dirUri.fsPath}: ${error.message}`);
    }
    return results;
  }
}