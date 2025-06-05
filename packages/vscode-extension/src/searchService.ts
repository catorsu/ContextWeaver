/**
 * @file searchService.ts
 * @description Provides search functionality for files and folders within the workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Ignore } from 'ignore';
import { parseGitignore } from './fileSystemService';
import { WorkspaceService } from './workspaceService';
import { SearchResult as CWSearchResult, FilterType } from '@contextweaver/shared';

const LOG_PREFIX_SEARCH_SERVICE = '[ContextWeaver SearchService] ';

// Default ignore patterns (can be kept or potentially centralized if WorkspaceService provides them)
const LOCAL_IGNORE_PATTERNS_DEFAULT = [
  'node_modules/', '.git/', '.vscode/', 'dist/', 'dist_test/', 'build/', '*.log',
  '__pycache__/', '.DS_Store', '*.pyc', '*.pyo', '*.swp', '*.bak', '*.tmp',
  '.gitignore',
  '*.zip', '*.tar.gz', '*.rar', '*.7z', '*.exe', '*.dll', '*.obj', '*.o',
  '*.a', '*.lib', '*.so', '*.dylib', '*.ncb', '*.sdf', '*.suo', '*.pdb',
  '*.idb', '*.class', '*.jar', '*.mp3', '*.wav', '*.ogg', '*.mp4', '*.avi',
  '*.mov', '*.wmv', '*.flv', '*.mkv', '*.webm', '*.jpg', '*.jpeg', '*.png',
  '*.gif', '*.bmp', '*.tiff', '*.ico', '*.pdf', '*.doc', '*.docx', '*.ppt',
  '*.pptx', '*.xls', '*.xlsx', '*.odt', '*.ods', '*.odp',
];

export class SearchService {
  private outputChannel: vscode.OutputChannel;
  private workspaceService: WorkspaceService;

  constructor(outputChannel: vscode.OutputChannel, workspaceService: WorkspaceService) {
    this.outputChannel = outputChannel;
    this.workspaceService = workspaceService;
    this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + 'Initialized');
  }

  private static getPathIgnoreInfoInternal(
    relativePath: string,
    name: string,
    isDirectory: boolean,
    gitignoreFilter: Ignore | null,
    defaultIgnorePatterns: readonly string[]
  ): { ignored: boolean; filterTypeApplied: FilterType } { // Changed to FilterType
    if (gitignoreFilter) {
      let pathToCheck = relativePath;
      if (pathToCheck.startsWith('./')) {
        pathToCheck = pathToCheck.substring(2);
      }

      // For directories, check with and without trailing slash for comprehensive matching by 'ignore'
      const isGitignored = gitignoreFilter.ignores(pathToCheck) ||
        (isDirectory && !pathToCheck.endsWith('/') && gitignoreFilter.ignores(pathToCheck + '/'));

      if (isGitignored) {
        return { ignored: true, filterTypeApplied: 'gitignore' };
      }
      return { ignored: false, filterTypeApplied: 'gitignore' }; // If gitignoreFilter exists, it's the source even if not ignored
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
      return { ignored: false, filterTypeApplied: 'default' }; // If no gitignore, default is the source
    }
  }


  /**
   * @description Searches for files and folders within trusted workspace folders, applying .gitignore rules.
   * Assumes workspace trust and existence of folders are pre-checked by the caller (IPCServer).
   * @param {string} query - The search query string.
   * @param {vscode.Uri} [specificWorkspaceFolderUri] - Optional. If provided, search only within this workspace folder. Otherwise, search all trusted workspace folders.
   * @returns {Promise<CWSearchResult[]>} A promise that resolves to an array of search results.
   * @sideeffect Reads from the file system, including .gitignore files.
   */
  public async search(query: string, specificWorkspaceFolderUri?: vscode.Uri): Promise<CWSearchResult[]> {
    if (!query || query.trim() === '') {
      return [];
    }

    const allResults: CWSearchResult[] = [];
    const foldersToSearch: vscode.WorkspaceFolder[] = [];

    if (specificWorkspaceFolderUri) {
      const folder = this.workspaceService.getWorkspaceFolder(specificWorkspaceFolderUri);
      if (folder) {
        foldersToSearch.push(folder);
      } else {
        this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + `Warning: Specified workspace folder for search not found: ${specificWorkspaceFolderUri.toString()}`);
        return [];
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
      this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + `Searching in folder: ${folder.name} (${folder.uri.fsPath})`);
      try {
        const gitignoreFilter = await parseGitignore(folder);
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
    baseWorkspaceFolder: vscode.WorkspaceFolder,
    gitignoreFilter: Ignore | null
  ): Promise<CWSearchResult[]> {
    let results: CWSearchResult[] = [];
    const lowerCaseQuery = query.toLowerCase();

    try {
      const entries = await vscode.workspace.fs.readDirectory(dirUri);
      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(dirUri, name);
        const relativePath = path.relative(baseWorkspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\/g, '/');

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
    } catch (error: any) {
      this.outputChannel.appendLine(LOG_PREFIX_SEARCH_SERVICE + `Failed to read directory ${dirUri.fsPath}: ${error.message}`);
    }
    return results;
  }
}