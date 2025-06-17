/**
 * @file searchService.ts
 * @description Provides search functionality for files and folders within the workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import path from 'path';
import ignore, { Ignore } from 'ignore';
import { parseGitignore, getPathIgnoreInfo } from './fileSystemService';
import { Logger } from '@contextweaver/shared';
import { WorkspaceService } from './workspaceService';
import { FilterType } from '@contextweaver/shared';

// Local type for search results without windowId (which is added later in ipcServer)
type LocalSearchResult = {
  path: string;
  name: string;
  type: 'file' | 'folder';
  uri: string;
  content_source_id: string;
  workspaceFolderUri: string;
  workspaceFolderName: string;
  relativePath: string;
  filterTypeApplied?: FilterType;
};


// Default ignore patterns (can be kept or potentially centralized if WorkspaceService provides them)
// Default patterns for files and folders to ignore during search operations.
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

/**
 * Provides search functionality for files and folders within the VS Code workspace.
 * It applies .gitignore rules and allows searching within specific or all trusted workspace folders.
 */
export class SearchService {
  private workspaceService: WorkspaceService;
  private readonly logger = new Logger('SearchService');

  /**
   * Creates an instance of SearchService.
   * @param workspaceService The WorkspaceService instance for accessing workspace information.
   */
  constructor(workspaceService: WorkspaceService) {
    this.workspaceService = workspaceService;
    this.logger.info('Initialized');
  }
 
  /**
   * Searches for files and folders within trusted workspace folders, applying ignore rules.
   * Assumes workspace trust and folder existence are pre-checked by the caller (IPCServer).
   * @param query - The search query string.
   * @param specificWorkspaceFolderUri - Optional. If provided, search only within this workspace folder.
   * @returns A promise that resolves to an array of search results.
   * @sideeffect Reads from the file system, including .gitignore files.
   */
  public async search(query: string, specificWorkspaceFolderUri?: vscode.Uri): Promise<LocalSearchResult[]> {
    if (!query || query.trim() === '') {
      return [];
    }

    const allResults: LocalSearchResult[] = [];
    const foldersToSearch: vscode.WorkspaceFolder[] = [];

    if (specificWorkspaceFolderUri) {
      const folder = this.workspaceService.getWorkspaceFolder(specificWorkspaceFolderUri);
      if (folder) {
        foldersToSearch.push(folder);
      } else {
        this.logger.warn(`Specified workspace folder for search not found: ${specificWorkspaceFolderUri.toString()}`);
        return [];
      }
    } else {
      const allWorkspaceFolders = this.workspaceService.getWorkspaceFolders();
      if (allWorkspaceFolders) {
        foldersToSearch.push(...allWorkspaceFolders);
      }
    }

    if (foldersToSearch.length === 0) {
      this.logger.warn('No workspace folders to search in.');
      return [];
    }

    this.logger.debug(`Searching for '${query}' in ${foldersToSearch.length} target folder(s).`);

    for (const folder of foldersToSearch) {
      this.logger.trace(`Searching in folder: ${folder.name} (${folder.uri.fsPath})`);
      try {
        const gitignoreFilter = await parseGitignore(folder);
        const defaultIgnoreFilter = ignore().add(LOCAL_IGNORE_PATTERNS_DEFAULT);
        const folderResults = await this.findInDirectoryRecursive(folder.uri, query, folder, gitignoreFilter, defaultIgnoreFilter);
        allResults.push(...folderResults);
      } catch (error: any) {
        this.logger.error(`Error searching in directory ${folder.uri.fsPath}: ${error.message}`, error);
      }
    }
    this.logger.info(`Found ${allResults.length} results for query '${query}' after filtering.`);
    return allResults;
  }
 
  /**
   * Recursively searches for files and folders within a directory that match the query.
   * Applies .gitignore and default ignore patterns.
   * @param dirUri The URI of the current directory to search.
   * @param query The search query string.
   * @param baseWorkspaceFolder The base workspace folder for relative path calculations and context.
   * @param gitignoreFilter The parsed .gitignore filter to apply.
   * @param defaultIgnoreFilter A pre-compiled 'ignore' instance with default patterns.
   * @returns A Promise that resolves to an array of search results found in the directory and its subdirectories.
   */
  private async findInDirectoryRecursive(
    dirUri: vscode.Uri,
    query: string,
    baseWorkspaceFolder: vscode.WorkspaceFolder,
    gitignoreFilter: Ignore | null,
    defaultIgnoreFilter: Ignore
  ): Promise<LocalSearchResult[]> {
    let results: LocalSearchResult[] = [];
    const lowerCaseQuery = query.toLowerCase();
 
    try {
      const entries = await vscode.workspace.fs.readDirectory(dirUri);
      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(dirUri, name);
        const relativePath = path.relative(baseWorkspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\/g, '/');
 
        const ignoreInfo = getPathIgnoreInfo(
          relativePath,
          (type === vscode.FileType.Directory),
          gitignoreFilter,
          defaultIgnoreFilter
        );
 
        if (ignoreInfo.ignored) {
          continue;
        }
 
        const itemMatchesQuery = name.toLowerCase().includes(lowerCaseQuery);
 
        if (itemMatchesQuery) {
          results.push({
            path: entryUri.fsPath,
            name: name,
            type: (type === vscode.FileType.Directory) ? 'folder' : 'file',
            uri: entryUri.toString(),
            content_source_id: entryUri.toString(),
            workspaceFolderUri: baseWorkspaceFolder.uri.toString(),
            workspaceFolderName: baseWorkspaceFolder.name,
            relativePath: relativePath,
            filterTypeApplied: ignoreInfo.filterSource
          });
        }
 
        if (type === vscode.FileType.Directory) {
          const subDirResults = await this.findInDirectoryRecursive(entryUri, query, baseWorkspaceFolder, gitignoreFilter, defaultIgnoreFilter);
          results = results.concat(subDirResults);
        }
      }
    } catch (error: any) {
      this.logger.warn(`Failed to read directory ${dirUri.fsPath}: ${error.message}`);
    }
    return results;
  }
}
