/**
 * @file fileSystemService.ts
 * @description Provides services for accessing and processing file system data in the VS Code workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { TextDecoder } from 'util';
import ignore, { Ignore } from 'ignore';
import {
  FileData as CWFileData,
  DirectoryEntry as CWDirectoryEntry,
  FilterType
} from '@contextweaver/shared';

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
 * @description Parses the .gitignore file from the root of the given workspace folder.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder to parse .gitignore for.
 * @returns {Promise<Ignore | null>} An Ignore instance if .gitignore is found and parsed, otherwise null.
 * @sideeffect Reads .gitignore from the file system.
 */
export async function parseGitignore(workspaceFolder: vscode.WorkspaceFolder): Promise<Ignore | null> {
  const gitignoreUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
  try {
    const rawContent = await vscode.workspace.fs.readFile(gitignoreUri);
    const content = new TextDecoder('utf-8').decode(rawContent);
    if (content.trim() === '') {
      console.log(`[ContextWeaver FileSystemService] .gitignore file found in ${workspaceFolder.name} but it is empty. Default patterns will still apply.`);
      return ignore(); // Return an empty ignore instance
    }
    const ig = ignore().add(content);
    console.log(`[ContextWeaver FileSystemService] Parsed .gitignore for ${workspaceFolder.name}`);
    return ig;
  } catch (error: any) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      console.log(`[ContextWeaver FileSystemService] No .gitignore file found in ${workspaceFolder.name}. Default patterns will apply.`);
    } else {
      console.error(`[ContextWeaver FileSystemService] Error reading or parsing .gitignore for ${workspaceFolder.name}: ${error.message}. Default patterns will still apply.`);
    }
    return null;
  }
}

/**
 * @description Helper function to check if a path should be ignored.
 * Default patterns are always checked. If a .gitignore filter is provided, it's checked afterwards.
 * @param {string} relativePath - Path relative to the workspace root.
 * @param {string} name - The base name of the file or folder.
 * @param {boolean} isDirectory - True if the entry is a directory.
 * @param {Ignore | null} gitignoreFilter - Parsed .gitignore filter. Can be an empty filter.
 * @param {readonly string[]} defaultIgnorePatterns - Default patterns.
 * @returns {{ ignored: boolean; filterSource: 'default' | 'gitignore' | 'none' }}
 *           'filterSource' indicates what caused the ignore, or 'none' if not ignored.
 */
function getPathIgnoreInfo(
  relativePath: string,
  name: string,
  isDirectory: boolean,
  gitignoreFilter: Ignore | null,
  defaultIgnorePatterns: readonly string[]
): { ignored: boolean; filterSource: 'default' | 'gitignore' | 'none' } {
  // Normalize to use forward slashes and ensure directory patterns end with a slash
  const normalizedRelativePath = relativePath.replace(/\\/g, '/');

  for (const pattern of defaultIgnorePatterns) {
    const isDirPattern = pattern.endsWith('/');
    const cleanPattern = isDirPattern ? pattern.slice(0, -1) : pattern;

    if (isDirPattern) { // Pattern targets a directory
      if (isDirectory && (name === cleanPattern || normalizedRelativePath === cleanPattern || normalizedRelativePath.startsWith(cleanPattern + '/'))) {
        return { ignored: true, filterSource: 'default' };
      }
    } else if (pattern.startsWith('*.')) { // Pattern targets an extension
      if (!isDirectory && name.endsWith(pattern.substring(1))) {
        return { ignored: true, filterSource: 'default' };
      }
    } else { // Pattern targets a specific file/folder name
      if (name === pattern) {
        return { ignored: true, filterSource: 'default' };
      }
    }
  }

  if (gitignoreFilter) {
    // The 'ignore' library expects paths relative to the .gitignore file (workspace root)
    // It handles directory matching (e.g. `dist/` vs `dist`) internally.
    let gitignorePath = normalizedRelativePath;
    if (gitignorePath.startsWith('./')) {
      gitignorePath = gitignorePath.substring(2);
    }
    // For directories, check with and without trailing slash for comprehensive matching by 'ignore'
    const isGitignored = gitignoreFilter.ignores(gitignorePath) ||
      (isDirectory && !gitignorePath.endsWith('/') && gitignoreFilter.ignores(gitignorePath + '/'));
    if (isGitignored) {
      return { ignored: true, filterSource: 'gitignore' };
    }
  }
  return { ignored: false, filterSource: 'none' };
}


/**
 * @description Generates a textual representation of the file and folder hierarchy for a given workspace folder.
 * Assumes workspaceFolder is valid and trusted.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder to generate the tree for.
 * @returns {Promise<{ tree: string, filterTypeApplied: 'gitignore' | 'default' } | string>} Object with tree string and filter type, or an error string.
 */
export async function getFileTree(workspaceFolder: vscode.WorkspaceFolder): Promise<{ tree: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  const gitignoreFilter = await parseGitignore(workspaceFolder);
  const actualFilterType: 'gitignore' | 'default' = gitignoreFilter !== null ? 'gitignore' : 'default';

  try {
    const internalTree = await generateFileTreeTextInternal(workspaceFolder.uri, workspaceFolder.uri, '', gitignoreFilter);
    const workspacePath = workspaceFolder.uri.fsPath.replace(/\\\\/g, '/'); // Ensure forward slashes for consistency
    // The content is the workspace path followed by the generated tree. The wrapper tag will be added by the client.
    const rawTreeContent = `${workspacePath}\n${internalTree.trim()}`;

    console.log('[ContextWeaver FileSystemService] getFileTree: raw tree content to be sent:');
    // console.log(rawTreeContent);

    return { tree: rawTreeContent, filterTypeApplied: actualFilterType };
  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Error in getFileTree for ${workspaceFolder.name}: ${error.message}`);
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
async function generateFileTreeTextInternal(dirUri: vscode.Uri, baseUri: vscode.Uri, prefix: string, gitignoreFilter: Ignore | null): Promise<string> {
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
      const ignoreInfo = getPathIgnoreInfo(relativePathForIgnoreCheck, name, (type === vscode.FileType.Directory), gitignoreFilter, IGNORE_PATTERNS_DEFAULT);

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
        const subdirContent = await generateFileTreeTextInternal(entryUri, baseUri, newPrefix, gitignoreFilter);
        if (subdirContent) { // Only add if there's content (avoids empty prefixes for fully ignored subdirs)
          treeString += subdirContent;
        }
      }
    }
  } catch (error: any) {
    if (error.code === 'FileNotFound') {
      console.warn(`[ContextWeaver FileSystemService] Directory not found during tree generation: ${dirUri.fsPath}`);
      return ''; // Return empty string if directory not found, prevents error propagation
    }
    console.error(`[ContextWeaver FileSystemService] Error reading directory ${dirUri.fsPath}: ${error.message}`);
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
    console.warn(`[ContextWeaver FileSystemService] Could not determine language for ${fileUri.fsPath}, defaulting to plaintext. Error: ${e}`);
    return 'plaintext';
  }
}


/**
 * @description Reads the content and determines language ID of a file.
 * @param {vscode.Uri} fileUri - The URI of the file to read.
 * @returns {Promise<CWFileData | null>} Object with fullPath, content, and languageId, or null if binary/error.
 * @sideeffect Reads from the file system.
 */
export async function getFileContentWithLanguageId(fileUri: vscode.Uri): Promise<CWFileData | null> {
  try {
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    const sample = fileData.slice(0, 1024);
    if (sample.includes(0)) {
      console.log(`[ContextWeaver FileSystemService] Skipping binary file (null byte detected): ${fileUri.fsPath}`);
      return null;
    }

    const decoder = new TextDecoder('utf-8', { fatal: true });
    let content: string;
    try {
      content = decoder.decode(fileData);
      if (content.includes('\\uFFFD')) {
        console.log(`[ContextWeaver FileSystemService] Skipping file with decoding errors (likely not UTF-8, or binary): ${fileUri.fsPath}`);
        return null;
      }
    } catch (decodeError: any) {
      console.log(`[ContextWeaver FileSystemService] Skipping binary file (decode error for ${fileUri.fsPath}): ${decodeError.message}`);
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
      console.warn(`[ContextWeaver FileSystemService] File not found: ${fileUri.fsPath}`);
    } else {
      console.error(`[ContextWeaver FileSystemService] Error reading file ${fileUri.fsPath}: ${error.message}`);
    }
    return null;
  }
}


/**
 * @description Retrieves structured data for all text files within a specified folder (and its subfolders)
 *              for IPC, to be formatted by the CE according to SRS 3.3.2.
 * @param {vscode.Uri} folderUri - The URI of the folder whose contents are to be read. This is the base for fullPath.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder (used for .gitignore parsing from workspace root).
 * @returns {Promise<{ filesData: CWFileData[], filterTypeApplied: 'gitignore' | 'default' } | string>} Object with filesData array or error string.
 */
export async function getFolderContentsForIPC(
  folderUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<{ filesData: CWFileData[], filterTypeApplied: 'gitignore' | 'default' } | string> {

  const filesData: CWFileData[] = [];
  const gitignoreFilter = await parseGitignore(workspaceFolder);
  const actualFilterType: 'gitignore' | 'default' = gitignoreFilter !== null ? 'gitignore' : 'default';

  async function traverseAndProcess(currentUri: vscode.Uri): Promise<void> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(currentUri);
    } catch (error: any) {
      if (error.code === 'FileNotFound') { throw error; }
      const errorDisplayPath = path.relative(folderUri.fsPath, currentUri.fsPath).replace(/\\/g, '/') || '.';
      console.error(`[ContextWeaver FileSystemService] Error reading directory ${errorDisplayPath} for getFolderContentsForIPC: ${error.message}`);
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
      const ignoreInfo = getPathIgnoreInfo(relativePathForIgnoreCheck, name, isDirectory, gitignoreFilter, IGNORE_PATTERNS_DEFAULT);

      if (ignoreInfo.ignored) continue;

      if (isDirectory) {
        await traverseAndProcess(entryUri);
      } else if (type === vscode.FileType.File) {
        if (name === '.gitignore') continue;

        const fileDetail = await getFileContentWithLanguageId(entryUri);
        if (fileDetail) {
          filesData.push(fileDetail);
        } else {
          console.log(`[ContextWeaver FileSystemService] File ${entryUri.fsPath} skipped (binary or read error).`);
        }
      }
    }
  }

  try {
    await traverseAndProcess(folderUri);
    return { filesData, filterTypeApplied: actualFilterType };
  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Error in getFolderContentsForIPC for ${folderUri.fsPath}: ${error.message}`);
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
  gitignoreFilter: Ignore | null
): Promise<CWDirectoryEntry[]> {
  const allEntries: CWDirectoryEntry[] = [];
  let dirEntries: [string, vscode.FileType][];

  try {
    dirEntries = await vscode.workspace.fs.readDirectory(dirUri);
  } catch (error) {
    console.warn(`[ContextWeaver FileSystemService] Could not read directory ${dirUri.fsPath} during recursive listing:`, error);
    return []; // Return empty array if a directory is unreadable, skipping it
  }

  for (const [name, type] of dirEntries) {
    const entryUri = vscode.Uri.joinPath(dirUri, name);
    const relativePath = path.relative(baseWorkspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\/g, '/');
    const isDirectory = type === vscode.FileType.Directory;

    const ignoreInfo = getPathIgnoreInfo(relativePath, name, isDirectory, gitignoreFilter, IGNORE_PATTERNS_DEFAULT);

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
      const subEntries = await getDirectoryListingRecursive(entryUri, baseWorkspaceFolder, gitignoreFilter);
      allEntries.push(...subEntries);
    }
  }
  return allEntries;
}

/**
 * @description Lists files and folders in a directory, applying workspace filters.
 * @param {vscode.Uri} folderToScanUri - The URI of the folder to list.
 * @param {vscode.WorkspaceFolder} containingWorkspaceFolder - Workspace folder for filter context.
 * @returns {Promise<{ entries: CWDirectoryEntry[]; filterTypeApplied: FilterType }>}
 * @sideeffect Reads from the file system.
 */
export async function getDirectoryListing(
  folderToScanUri: vscode.Uri,
  containingWorkspaceFolder: vscode.WorkspaceFolder
): Promise<{ entries: CWDirectoryEntry[]; filterTypeApplied: FilterType }> {
  const gitignoreFilter = await parseGitignore(containingWorkspaceFolder);
  const filterTypeApplied: FilterType = gitignoreFilter !== null ? 'gitignore' : 'default';
  const entries: CWDirectoryEntry[] = [];
  
  try {
    // Call the recursive function to get all descendants
    const recursiveEntries = await getDirectoryListingRecursive(
      folderToScanUri,
      containingWorkspaceFolder,
      gitignoreFilter
    );
    entries.push(...recursiveEntries);

    return { entries, filterTypeApplied };
  } catch (error: any) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      console.warn(`[ContextWeaver FileSystemService] Directory not found: ${folderToScanUri.fsPath}`);
      throw error;
    }
    console.error(`[ContextWeaver FileSystemService] Error reading directory ${folderToScanUri.fsPath}: ${error.message}`);
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
