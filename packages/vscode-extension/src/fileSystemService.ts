/**
 * @file fileSystemService.ts
 * @description Provides services for accessing and processing file system data in the VS Code workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { TextDecoder } from 'util';
import ignore, { Ignore } from 'ignore'; // Import 'ignore' as a default export and 'Ignore' as a type
import { Logger } from '@contextweaver/shared';
import {
  FileData as CWFileData,
  DirectoryEntry as CWDirectoryEntry,
  FilterType
} from '@contextweaver/shared';

// Default patterns for files and folders to ignore during file system operations.
const logger = new Logger('FileSystemService');

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
 * Parses the .gitignore file from the root of the given workspace folder.
 * @param workspaceFolder - The workspace folder to parse .gitignore for.
 * @returns A Promise that resolves to an `Ignore` instance if .gitignore is found and parsed, otherwise null.
 * @sideeffect Reads .gitignore from the file system.
 */
export async function parseGitignore(workspaceFolder: vscode.WorkspaceFolder): Promise<Ignore | null> {
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
  } catch (error: any) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      logger.info(`No .gitignore file found in ${workspaceFolder.name}. Default patterns will still apply.`);
    } else {
      logger.error(`Error reading or parsing .gitignore for ${workspaceFolder.name}: ${error.message}. Default patterns will still apply.`);
    }
    return null;
  }
}

/**
 * @description Helper function to check if a path should be ignored using the 'ignore' library for both default and gitignore rules.
 * @param {string} relativePath - Path relative to the workspace root.
 * @param {boolean} isDirectory - True if the entry is a directory.
 * @param {Ignore | null} gitignoreFilter - Parsed .gitignore filter. Can be null.
 * @param {Ignore} defaultIgnoreFilter - A pre-compiled 'ignore' instance with default patterns.
 * @returns An object indicating if the path is ignored and by which rule set.
 */
export function getPathIgnoreInfo(
  relativePath: string,
  isDirectory: boolean,
  gitignoreFilter: Ignore | null,
  defaultIgnoreFilter: Ignore
): { ignored: boolean; filterSource: 'default' | 'gitignore' | 'none' } {
  // Normalize to use forward slashes and ensure directory patterns end with a slash
  const normalizedRelativePath = relativePath.replace(/\\/g, '/');
  const pathToCheck = isDirectory && !normalizedRelativePath.endsWith('/') ? `${normalizedRelativePath}/` : normalizedRelativePath;

  if (defaultIgnoreFilter.ignores(pathToCheck)) {
    return { ignored: true, filterSource: 'default' };
  }

  if (gitignoreFilter && gitignoreFilter.ignores(pathToCheck)) {
    return { ignored: true, filterSource: 'gitignore' };
  }
  return { ignored: false, filterSource: 'none' };
}


/**
 * Generates a textual representation of the file and folder hierarchy for a given workspace folder.
 * Assumes `workspaceFolder` is valid and trusted.
 * @param workspaceFolder - The workspace folder to generate the tree for.
 * @returns A Promise resolving to an object with the tree string and filter type, or an error string on failure.
 */
export async function getFileTree(workspaceFolder: vscode.WorkspaceFolder): Promise<{ tree: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  const gitignoreFilter = await parseGitignore(workspaceFolder);
  const defaultIgnoreFilter = ignore().add(IGNORE_PATTERNS_DEFAULT);
  const actualFilterType: 'gitignore' | 'default' = gitignoreFilter !== null ? 'gitignore' : 'default';

  try {
    const internalTree = await generateFileTreeTextInternal(workspaceFolder.uri, workspaceFolder.uri, '', gitignoreFilter, defaultIgnoreFilter);
    const workspacePath = workspaceFolder.uri.fsPath.replace(/\\\\/g, '/'); // Ensure forward slashes for consistency
    // The content is the workspace path followed by the generated tree. The wrapper tag will be added by the client.
    const rawTreeContent = `${workspacePath}\n${internalTree.trim()}`;

    logger.trace('getFileTree: raw tree content to be sent:', rawTreeContent);

    return { tree: rawTreeContent, filterTypeApplied: actualFilterType };
  } catch (error: any) {
    logger.error(`Error in getFileTree for ${workspaceFolder.name}: ${error.message}`);
    return `Error generating file tree for ${workspaceFolder.name}: ${error.message}`;
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
  gitignoreFilter: Ignore | null,
  defaultIgnoreFilter: Ignore): Promise<string> {
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
      const ignoreInfo = getPathIgnoreInfo(relativePathForIgnoreCheck, (type === vscode.FileType.Directory), gitignoreFilter, defaultIgnoreFilter);

      if (!ignoreInfo.ignored) {
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
        const subdirContent = await generateFileTreeTextInternal(entryUri, baseUri, newPrefix, gitignoreFilter, defaultIgnoreFilter);
        if (subdirContent) { // Only add if there's content (avoids empty prefixes for fully ignored subdirs)
          treeString += subdirContent;
        }
      }
    }
  } catch (error: any) {
    if (error.code === 'FileNotFound') {
      logger.warn(`Directory not found during tree generation: ${dirUri.fsPath}`);
      return ''; // Return empty string if directory not found, prevents error propagation
    }
    logger.error(`Error reading directory ${dirUri.fsPath}: ${error.message}`);
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
    } catch (decodeError: any) {
      logger.debug(`Skipping binary file (decode error for ${fileUri.fsPath}): ${decodeError.message}`);
      return null;
    }

    const languageId = await getLanguageId(fileUri);
    const fullPath = fileUri.fsPath.replace(/\\/g, '/');

    return {
      fullPath,
      content,
      languageId,
    };
  } catch (error: any) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      logger.warn(`File not found: ${fileUri.fsPath}`);
      // Re-throw the specific error so the caller can distinguish between "not found" and other read errors.
      throw error;
    } else {
      logger.error(`Error reading file ${fileUri.fsPath}: ${error.message}`);
    }
    return null; // For other errors (e.g., permission denied), returning null is still a safe fallback.
  }
}


/**
 * Retrieves structured data for all text files within a specified folder and its subfolders.
 * The data is prepared for IPC to be formatted by the Chrome Extension.
 * @param folderUri - The URI of the folder whose contents are to be read.
 * @param workspaceFolder - The workspace folder context for applying ignore rules.
 * @returns A Promise resolving to an object with an array of file data, or an error string on failure.
 */
export async function getFolderContentsForIPC(
  folderUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<{ filesData: CWFileData[], filterTypeApplied: 'gitignore' | 'default' } | string> {

  const filesData: CWFileData[] = [];
  const gitignoreFilter = await parseGitignore(workspaceFolder);
  const defaultIgnoreFilter = ignore().add(IGNORE_PATTERNS_DEFAULT);
  const actualFilterType: 'gitignore' | 'default' = gitignoreFilter !== null ? 'gitignore' : 'default';

  async function traverseAndProcess(currentUri: vscode.Uri): Promise<void> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(currentUri);
    } catch (error: any) {
      if (error.code === 'FileNotFound') { throw error; }
      const errorDisplayPath = path.relative(folderUri.fsPath, currentUri.fsPath).replace(/\\/g, '/') || '.';
      logger.error(`Error reading directory ${errorDisplayPath} for getFolderContentsForIPC: ${error.message}`);
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
      const ignoreInfo = getPathIgnoreInfo(relativePathForIgnoreCheck, isDirectory, gitignoreFilter, defaultIgnoreFilter);

      if (ignoreInfo.ignored) continue;

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
    return { filesData, filterTypeApplied: actualFilterType };
  } catch (error: any) {
    logger.error(`Error in getFolderContentsForIPC for ${folderUri.fsPath}: ${error.message}`);
    return `Error getting contents for folder ${folderUri.fsPath}: ${error.message}`;
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
  gitignoreFilter: Ignore | null,
  defaultIgnoreFilter: Ignore
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

    const ignoreInfo = getPathIgnoreInfo(relativePath, isDirectory, gitignoreFilter, defaultIgnoreFilter);

    if (ignoreInfo.ignored) {
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
      const subEntries = await getDirectoryListingRecursive(entryUri, baseWorkspaceFolder, gitignoreFilter, defaultIgnoreFilter);
      allEntries.push(...subEntries);
    }
  }
  return allEntries;
}

/**
 * Lists all non-ignored files and folders recursively within a directory.
 * @param folderToScanUri - The URI of the folder to list.
 * @param containingWorkspaceFolder - The workspace folder for filter context.
 * @returns A Promise resolving to an object containing the directory entries and the filter type applied.
 * @sideeffect Reads from the file system.
 */
export async function getDirectoryListing(
  folderToScanUri: vscode.Uri,
  containingWorkspaceFolder: vscode.WorkspaceFolder
): Promise<{ entries: CWDirectoryEntry[]; filterTypeApplied: FilterType }> {
  const defaultIgnoreFilter = ignore().add(IGNORE_PATTERNS_DEFAULT);
  const gitignoreFilter = await parseGitignore(containingWorkspaceFolder);
  const filterTypeApplied: FilterType = gitignoreFilter !== null ? 'gitignore' : 'default';
  const entries: CWDirectoryEntry[] = [];

  try {
    // Call the recursive function to get all descendants
    const recursiveEntries = await getDirectoryListingRecursive(
      folderToScanUri,
      containingWorkspaceFolder,
      gitignoreFilter,
      defaultIgnoreFilter
    );
    entries.push(...recursiveEntries);

    return { entries, filterTypeApplied };
  } catch (error: any) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      logger.warn(`Directory not found: ${folderToScanUri.fsPath}`);
      throw error;
    }
    logger.error(`Error reading directory ${folderToScanUri.fsPath}: ${error.message}`);
    throw error;
  }
}

/**
 * Retrieves all relevant data for a given workspace folder, including file contents and file tree,
 * formatted for IPC.
 * @param workspaceFolder The VS Code workspace folder to retrieve data from.
 * @returns A Promise that resolves to an object containing `filesData`, `fileTreeString`, `workspaceName`, `filterTypeApplied`, and `projectPath`, or an error string.
 */
export async function getWorkspaceDataForIPC(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<{ filesData: CWFileData[], fileTreeString: string, workspaceName: string, filterTypeApplied: 'gitignore' | 'default', projectPath: string } | string> {

  const folderContentResult = await getFolderContentsForIPC(workspaceFolder.uri, workspaceFolder);
  if (typeof folderContentResult === 'string') {
    return folderContentResult;
  }

  const fileTreeResult = await getFileTree(workspaceFolder);
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
