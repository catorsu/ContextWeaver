/**
 * @file FilterService.ts
 * @description Implementation of filtering services for handling ignore patterns and workspace filtering.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import ignore, { Ignore } from 'ignore';
import { Logger, FilterType } from '@contextweaver/shared';
import { IFilterService } from '../ports/IFilterService';

const logger = new Logger('FilterService');

// Default patterns for files and folders to ignore during file system operations.
const IGNORE_PATTERNS_DEFAULT = [
  'node_modules/', '.git/', '.vscode/', 'dist/', 'build/', '*.log',
  '__pycache__/', '.DS_Store', '*.pyc', '*.pyo', '*.swp', '*.bak', '*.tmp',
  '*.zip', '*.tar.gz', '*.rar', '*.7z', '*.exe', '*.dll', '*.obj', '*.o',
  '*.a', '*.lib', '*.so', '*.dylib', '*.ncb', '*.sdf', '*.suo', '*.pdb',
  '*.idb', '*.class', '*.jar', '*.mp3', '*.wav', '*.ogg', '*.mp4', '*.avi',
  '*.mov', '*.wmv', '*.flv', '*.mkv', '*.webm', '*.jpg', '*.jpeg', '*.png',
  '*.gif', '*.bmp', '*.tiff', '*.ico', '*.pdf', '*.doc', '*.docx', '*.ppt',
  '*.pptx', '*.xls', '*.xlsx', '*.odt', '*.ods', '*.odp',
];

/**
 * Service implementation for creating and managing file filters for workspaces.
 */
export class FilterService implements IFilterService {

  /**
   * Creates a filter for the specified workspace folder.
   * Combines default ignore patterns with .gitignore rules if present.
   * @param workspaceFolder - The workspace folder to create filter for.
   * @returns A Promise resolving to an object containing the ignore filter and the filter type applied.
   */
  async createFilterForWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<{ filter: Ignore; type: FilterType }> {
    const gitignoreFilter = await this.parseGitignore(workspaceFolder);
    const defaultIgnoreFilter = ignore().add(IGNORE_PATTERNS_DEFAULT);
    
    let filterType: FilterType;
    
    if (gitignoreFilter) {
      // Create a combined filter by adding both default patterns and gitignore content
      const gitignoreUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
      try {
        const rawContent = await vscode.workspace.fs.readFile(gitignoreUri);
        const gitignoreContent = new TextDecoder('utf-8').decode(rawContent);
        const combinedFilter = ignore().add(IGNORE_PATTERNS_DEFAULT).add(gitignoreContent);
        filterType = 'gitignore';
        return { filter: combinedFilter, type: filterType };
      } catch {
        // Fall back to default if there's an error re-reading
        filterType = 'default';
        return { filter: defaultIgnoreFilter, type: filterType };
      }
    } else {
      filterType = 'default';
      return { filter: defaultIgnoreFilter, type: filterType };
    }
  }

  /**
   * Parses the .gitignore file from the root of the given workspace folder.
   * @param workspaceFolder - The workspace folder to parse .gitignore for.
   * @returns A Promise that resolves to an `Ignore` instance if .gitignore is found and parsed, otherwise null.
   * @sideeffect Reads .gitignore from the file system.
   */
  private async parseGitignore(workspaceFolder: vscode.WorkspaceFolder): Promise<Ignore | null> {
    const gitignoreUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
    try {
      const rawContent = await vscode.workspace.fs.readFile(gitignoreUri);
      const content = new TextDecoder('utf-8').decode(rawContent);
      if (content.trim() === '') {
        logger.debug(`.gitignore file found in ${workspaceFolder.name} but it is empty. Default patterns will still apply.`);
        return ignore(); // Return an empty ignore instance
      }
      const ig = ignore().add(content);
      logger.debug(`Parsed .gitignore for ${workspaceFolder.name}`);
      return ig;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        logger.info(`No .gitignore file found in ${workspaceFolder.name}. Default patterns will still apply.`);
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error reading or parsing .gitignore for ${workspaceFolder.name}: ${errorMessage}. Default patterns will still apply.`);
      }
      return null;
    }
  }
}