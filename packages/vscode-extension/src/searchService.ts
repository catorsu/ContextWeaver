/**
 * @file searchService.ts
 * @description Provides search functionality for files and folders within the workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import path from 'path';
import { Ignore } from 'ignore';
import { Logger } from '@contextweaver/shared';
import { WorkspaceService } from './workspaceService';
import { FilterType } from '@contextweaver/shared';
import { IFilterService } from './core/ports/IFilterService';

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



/**
 * Provides search functionality for files and folders within the VS Code workspace.
 * It applies .gitignore rules and allows searching within specific or all trusted workspace folders.
 */
export class SearchService {
  private workspaceService: WorkspaceService;
  private filterService: IFilterService;
  private readonly logger = new Logger('SearchService');

  /**
   * Creates an instance of SearchService.
   * @param workspaceService The WorkspaceService instance for accessing workspace information.
   * @param filterService The FilterService instance for creating workspace filters.
   */
  constructor(workspaceService: WorkspaceService, filterService: IFilterService) {
    this.workspaceService = workspaceService;
    this.filterService = filterService;
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
        const { filter: combinedFilter, type: filterType } = await this.filterService.createFilterForWorkspace(folder);
        const folderResults = await this.findInDirectoryRecursive(folder.uri, query, folder, combinedFilter, filterType);
        allResults.push(...folderResults);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error searching in directory ${folder.uri.fsPath}: ${errorMessage}`, error);
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
    filter: Ignore,
    filterType: FilterType
  ): Promise<LocalSearchResult[]> {
    let results: LocalSearchResult[] = [];
    const lowerCaseQuery = query.toLowerCase();
 
    try {
      const entries = await vscode.workspace.fs.readDirectory(dirUri);
      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(dirUri, name);
        const relativePath = path.relative(baseWorkspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\/g, '/');
 
        const pathToCheck = (type === vscode.FileType.Directory && !relativePath.endsWith('/')) ? `${relativePath}/` : relativePath;
        const isIgnored = filter.ignores(pathToCheck);
 
        if (isIgnored) {
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
            filterTypeApplied: filterType
          });
        }
 
        if (type === vscode.FileType.Directory) {
          const subDirResults = await this.findInDirectoryRecursive(entryUri, query, baseWorkspaceFolder, filter, filterType);
          results = results.concat(subDirResults);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to read directory ${dirUri.fsPath}: ${errorMessage}`);
    }
    return results;
  }
}
