/**
 * @file fileSystemService.ts
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
const logger = new Logger('FileSystemService');




/**
 * Generates a textual representation of the file and folder hierarchy for a given workspace folder.
 * Assumes `workspaceFolder` is valid and trusted.
 * @param workspaceFolder - The workspace folder to generate the tree for.
 * @param filter - The filter object containing ignore patterns and type.
 * @returns A Promise resolving to an object with the tree string and filter type, or an error string on failure.
 */
export async function getFileTree(workspaceFolder: vscode.WorkspaceFolder, filter: { filter: Ignore; type: FilterType }): Promise<{ tree: string, filterTypeApplied: FilterType } | string> {
  try {
    const internalTree = await generateFileTreeTextInternal(workspaceFolder.uri, workspaceFolder.uri, '', filter.filter);
    const workspacePath = workspaceFolder.uri.fsPath.replace(/\\\\/g, '/'); // Ensure forward slashes for consistency
    // The content is the workspace path followed by the generated tree. The wrapper tag will be added by the client.
    const rawTreeContent = `${workspacePath}\n${internalTree.trim()}`;

    logger.trace('getFileTree: raw tree content to be sent:', rawTreeContent);

    return { tree: rawTreeContent, filterTypeApplied: filter.type };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in getFileTree for ${workspaceFolder.name}: ${errorMessage}`);
    return `Error generating file tree for ${workspaceFolder.name}: ${errorMessage}`;
  }
}

/**
 * Recursively generates the textual representation of a directory's file and folder hierarchy.
 * @param dirUri The URI of the current directory being processed.
 * @param baseUri The base URI of the workspace folder, used for calculating relative paths for ignore checks.
 * @param prefix The current prefix string for tree formatting (e.g., '├── ', '│   ').
 * @param gitignoreFilter The parsed .gitignore filter to apply.
 * @returns A Promise that resolves to the formatted string representation of the directory's contents.
 */
async function generateFileTreeTextInternal(
  dirUri: vscode.Uri,
  baseUri: vscode.Uri,
  prefix: string,
  filter: Ignore): Promise<string> {
  let treeString = '';
  try {
    const entries = await vscode.workspace.fs.readDirectory(dirUri);
    entries.sort((a, b) => {
      if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
      if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
      return a[0].localeCompare(b[0]);
    });

    const filteredEntries = [];
    for (const [name, type] of entries) {
      const entryUri = vscode.Uri.joinPath(dirUri, name);
      const relativePathForIgnoreCheck = path.relative(baseUri.fsPath, entryUri.fsPath).replace(/\\/g, '/');
      const pathToCheck = (type === vscode.FileType.Directory && !relativePathForIgnoreCheck.endsWith('/')) ? `${relativePathForIgnoreCheck}/` : relativePathForIgnoreCheck;
      const isIgnored = filter.ignores(pathToCheck);

      if (!isIgnored) {
        filteredEntries.push([name, type, entryUri] as [string, vscode.FileType, vscode.Uri]);
      }
    }

    for (let i = 0; i < filteredEntries.length; i++) {
      const [name, type, entryUri] = filteredEntries[i];
      const isLast = (i === filteredEntries.length - 1);
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      const linePrefix = prefix + (isLast ? '└── ' : '├── ');
      treeString += `${linePrefix}${name}\n`;

      if (type === vscode.FileType.Directory) {
        const subdirContent = await generateFileTreeTextInternal(entryUri, baseUri, newPrefix, filter);
        if (subdirContent) { // Only add if there's content (avoids empty prefixes for fully ignored subdirs)
          treeString += subdirContent;
        }
      }
    }
  } catch (error) {
    const errorCode = error instanceof vscode.FileSystemError ? error.code : undefined;
    if (errorCode === 'FileNotFound') {
      logger.warn(`Directory not found during tree generation: ${dirUri.fsPath}`);
      return ''; // Return empty string if directory not found, prevents error propagation
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error reading directory ${dirUri.fsPath}: ${errorMessage}`);
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
async function getLanguageId(fileUri: vscode.Uri): Promise<string> {
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
    logger.warn(`Could not determine language for ${fileUri.fsPath}, defaulting to plaintext. Error: ${e}`);
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
export async function getFileContentWithLanguageId(fileUri: vscode.Uri): Promise<CWFileData | null> {
  try {
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    const sample = fileData.slice(0, 1024);
    if (sample.includes(0)) {
      logger.debug(`Skipping binary file (null byte detected): ${fileUri.fsPath}`);
      return null;
    }

    const decoder = new TextDecoder('utf-8', { fatal: true });
    let content: string;
    try {
      content = decoder.decode(fileData);
      if (content.includes('\\uFFFD')) {
        logger.debug(`Skipping file with decoding errors (likely not UTF-8, or binary): ${fileUri.fsPath}`);
        return null;
      }
    } catch (decodeError) {
      const errorMessage = decodeError instanceof Error ? decodeError.message : String(decodeError);
      logger.debug(`Skipping binary file (decode error for ${fileUri.fsPath}): ${errorMessage}`);
      return null;
    }

    const languageId = await getLanguageId(fileUri);
    const fullPath = fileUri.fsPath.replace(/\\/g, '/');

    return {
      fullPath,
      content,
      languageId,
    };
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      logger.warn(`File not found: ${fileUri.fsPath}`);
      // Re-throw the specific error so the caller can distinguish between "not found" and other read errors.
      throw error;
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error reading file ${fileUri.fsPath}: ${errorMessage}`);
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
export async function getFolderContentsForIPC(
  folderUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder,
  filter: { filter: Ignore; type: FilterType }
): Promise<{ filesData: CWFileData[], filterTypeApplied: FilterType } | string> {

  const filesData: CWFileData[] = [];

  async function traverseAndProcess(currentUri: vscode.Uri): Promise<void> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(currentUri);
    } catch (error) {
      const errorCode = error instanceof vscode.FileSystemError ? error.code : undefined;
      if (errorCode === 'FileNotFound') { throw error; }
      const errorDisplayPath = path.relative(folderUri.fsPath, currentUri.fsPath).replace(/\\/g, '/') || '.';
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error reading directory ${errorDisplayPath} for getFolderContentsForIPC: ${errorMessage}`);
      return;
    }

    entries.sort((a, b) => {
      if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
      if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
      return a[0].localeCompare(b[0]);
    });

    for (const [name, type] of entries) {
      const entryUri = vscode.Uri.joinPath(currentUri, name);
      const relativePathForIgnoreCheck = path.relative(workspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\/g, '/');
      const isDirectory = type === vscode.FileType.Directory;
      const pathToCheck = isDirectory && !relativePathForIgnoreCheck.endsWith('/') ? `${relativePathForIgnoreCheck}/` : relativePathForIgnoreCheck;
      const isIgnored = filter.filter.ignores(pathToCheck);

      if (isIgnored) continue;

      if (isDirectory) {
        await traverseAndProcess(entryUri);
      } else if (type === vscode.FileType.File) {
        if (name === '.gitignore') continue;

        const fileDetail = await getFileContentWithLanguageId(entryUri);
        if (fileDetail) {
          filesData.push(fileDetail);
        } else {
          logger.debug(`File ${entryUri.fsPath} skipped (binary or read error).`);
        }
      }
    }
  }

  try {
    await traverseAndProcess(folderUri);
    return { filesData, filterTypeApplied: filter.type };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in getFolderContentsForIPC for ${folderUri.fsPath}: ${errorMessage}`);
    return `Error getting contents for folder ${folderUri.fsPath}: ${errorMessage}`;
  }
}

/**
 * Recursively traverses a directory, collecting all file and folder entries that are not ignored.
 * @param dirUri The URI of the directory to start traversal from.
 * @param baseWorkspaceFolder The root workspace folder for context and ignore path calculations.
 * @param gitignoreFilter The parsed ignore filter to apply.
 * @returns A promise that resolves to a flat array of all descendant directory entries.
 */
async function getDirectoryListingRecursive(
  dirUri: vscode.Uri,
  baseWorkspaceFolder: vscode.WorkspaceFolder,
  filter: Ignore
): Promise<CWDirectoryEntry[]> {
  const allEntries: CWDirectoryEntry[] = [];
  let dirEntries: [string, vscode.FileType][];

  try {
    dirEntries = await vscode.workspace.fs.readDirectory(dirUri);
  } catch (error) {
    logger.warn(`Error reading directory ${dirUri.fsPath} during recursive listing:`, error);
    throw error; // Re-throw the error to be caught by the top-level caller
  }

  for (const [name, type] of dirEntries) {
    const entryUri = vscode.Uri.joinPath(dirUri, name);
    const relativePath = path.relative(baseWorkspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\/g, '/');
    const isDirectory = type === vscode.FileType.Directory;

    const pathToCheck = isDirectory && !relativePath.endsWith('/') ? `${relativePath}/` : relativePath;
    const isIgnored = filter.ignores(pathToCheck);

    if (isIgnored) {
      continue;
    }

    const uriString = entryUri.toString();
    allEntries.push({
      name,
      type: isDirectory ? 'folder' : 'file',
      uri: uriString,
      content_source_id: uriString,
      windowId: '' // Will be populated by ipcServer
    });

    if (isDirectory) {
      const subEntries = await getDirectoryListingRecursive(entryUri, baseWorkspaceFolder, filter);
      allEntries.push(...subEntries);
    }
  }
  return allEntries;
}

/**
 * Lists all non-ignored files and folders recursively within a directory.
 * @param folderToScanUri - The URI of the folder to list.
 * @param containingWorkspaceFolder - The workspace folder for filter context.
 * @param filter - The filter object containing ignore patterns and type.
 * @returns A Promise resolving to an object containing the directory entries and the filter type applied.
 * @sideeffect Reads from the file system.
 */
export async function getDirectoryListing(
  folderToScanUri: vscode.Uri,
  containingWorkspaceFolder: vscode.WorkspaceFolder,
  filter: { filter: Ignore; type: FilterType }
): Promise<{ entries: CWDirectoryEntry[]; filterTypeApplied: FilterType }> {
  const entries: CWDirectoryEntry[] = [];

  try {
    // Call the recursive function to get all descendants
    const recursiveEntries = await getDirectoryListingRecursive(
      folderToScanUri,
      containingWorkspaceFolder,
      filter.filter
    );
    entries.push(...recursiveEntries);

    return { entries, filterTypeApplied: filter.type };
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      logger.warn(`Directory not found: ${folderToScanUri.fsPath}`);
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error reading directory ${folderToScanUri.fsPath}: ${errorMessage}`);
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
export async function getWorkspaceDataForIPC(
  workspaceFolder: vscode.WorkspaceFolder,
  filter: { filter: Ignore; type: FilterType }
): Promise<{ filesData: CWFileData[], fileTreeString: string, workspaceName: string, filterTypeApplied: FilterType, projectPath: string } | string> {

  const folderContentResult = await getFolderContentsForIPC(workspaceFolder.uri, workspaceFolder, filter);
  if (typeof folderContentResult === 'string') {
    return folderContentResult;
  }

  const fileTreeResult = await getFileTree(workspaceFolder, filter);
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
