/**
 * @file fileSystemService.ts
 * @description Provides services for accessing and processing file system data in the VS Code workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { TextDecoder } from 'util';
import ignore, { Ignore } from 'ignore';

// Default ignore patterns remain the same
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
  const pathToCheck = isDirectory && !normalizedRelativePath.endsWith('/') ? `${normalizedRelativePath}/` : normalizedRelativePath;

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
  const actualFilterType = gitignoreFilter !== null ? 'gitignore' : 'default';

  try {
    const internalTree = await generateFileTreeTextInternal(workspaceFolder.uri, workspaceFolder.uri, '', gitignoreFilter);
    const workspacePath = workspaceFolder.uri.fsPath.replace(/\\\\/g, '/'); // Ensure forward slashes for consistency
    // SRS 3.3.1: <file_tree>\nC:/project/SmartInfo\n...
    const formattedTree = `<file_tree>\n${workspacePath}\n${internalTree.trim()}\n</file_tree>`;

    console.log('[ContextWeaver FileSystemService] getFileTree: formattedTree to be sent:');
    // console.log(formattedTree); // Keep this commented out for brevity in logs unless debugging tree specifically

    return { tree: formattedTree, filterTypeApplied: actualFilterType };
  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Error in getFileTree for ${workspaceFolder.name}: ${error.message}`);
    return `Error generating file tree for ${workspaceFolder.name}: ${error.message}`;
  }
}

async function generateFileTreeTextInternal(dirUri: vscode.Uri, baseUri: vscode.Uri, prefix: string, gitignoreFilter: Ignore | null): Promise<string> {
  let treeString = '';
  try {
    let entries = await vscode.workspace.fs.readDirectory(dirUri);
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
 * @interface FileData
 * @description Structure for holding file content and metadata.
 */
interface FileData {
  fullPath: string;
  content: string;
  languageId: string;
}

/**
 * @interface DirectoryEntry
 * @description Structure for file and folder entries in a directory listing.
 */
export interface DirectoryEntry {
  name: string;
  type: 'file' | 'folder';
  uri: string; // Full URI string of the entry
  content_source_id: string; // Canonical ID, typically same as URI string
}

/**
 * @description Determines the language ID for a given file URI.
 * @param {vscode.Uri} fileUri - The URI of the file.
 * @returns {Promise<string>} The language ID (e.g., 'typescript', 'python'). Defaults to 'plaintext'.
 */
async function getLanguageId(fileUri: vscode.Uri): Promise<string> {
  try {
    // This is a more robust way if a document is open, but for general fs access,
    // we might need to rely on extensions or a mapping.
    // For simplicity, let's use a basic extension-to-languageId map.
    const extension = path.extname(fileUri.fsPath).toLowerCase();
    // This map should be expanded as needed.
    // Consider using vscode.languages.getLanguages() and then trying to find a match,
    // or a more comprehensive mime-type library if available in VSCE context.
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
 * @returns {Promise<FileData | null>} Object with fullPath, content, and languageId, or null if binary/error.
 * @sideeffect Reads from the file system.
 */
export async function getFileContentWithLanguageId(fileUri: vscode.Uri): Promise<FileData | null> {
  try {
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    // Basic binary check (presence of null byte)
    const sample = fileData.slice(0, 1024);
    if (sample.includes(0)) {
      console.log(`[ContextWeaver FileSystemService] Skipping binary file (null byte detected): ${fileUri.fsPath}`);
      return null;
    }

    const decoder = new TextDecoder('utf-8', { fatal: true }); // fatal:true throws on invalid UTF-8
    let content: string;
    try {
      content = decoder.decode(fileData);
      // Check for replacement character U+FFFD, which indicates decoding issues with non-UTF8 files
      if (content.includes('\\uFFFD')) {
        console.log(`[ContextWeaver FileSystemService] Skipping file with decoding errors (likely not UTF-8, or binary): ${fileUri.fsPath}`);
        return null;
      }
    } catch (decodeError: any) {
      console.log(`[ContextWeaver FileSystemService] Skipping binary file (decode error for ${fileUri.fsPath}): ${decodeError.message}`);
      return null;
    }

    const languageId = await getLanguageId(fileUri);
    const fullPath = fileUri.fsPath.replace(/\\/g, '/'); // Normalize path separators

    return {
      fullPath,
      content,
      languageId,
    };
  } catch (error: any) {
    // Handle file not found or other read errors specifically if needed
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      console.warn(`[ContextWeaver FileSystemService] File not found: ${fileUri.fsPath}`);
    } else {
      console.error(`[ContextWeaver FileSystemService] Error reading file ${fileUri.fsPath}: ${error.message}`);
    }
    return null; // Return null for any error to allow skipping the file
  }
}


/**
 * @description Retrieves structured data for all text files within a specified folder (and its subfolders)
 *              for IPC, to be formatted by the CE according to SRS 3.3.2.
 * @param {vscode.Uri} folderUri - The URI of the folder whose contents are to be read. This is the base for fullPath.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder (used for .gitignore parsing from workspace root).
 * @returns {Promise<{ filesData: FileData[], filterTypeApplied: 'gitignore' | 'default' } | string>} Object with filesData array or error string.
 */
export async function getFolderContentsForIPC(
  folderUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<{ filesData: FileData[], filterTypeApplied: 'gitignore' | 'default' } | string> {

  const filesData: FileData[] = [];
  const gitignoreFilter = await parseGitignore(workspaceFolder);
  const actualFilterType = gitignoreFilter !== null ? 'gitignore' : 'default';

  async function traverseAndProcess(currentUri: vscode.Uri): Promise<void> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(currentUri);
    } catch (error: any) {
      if (error.code === 'FileNotFound') { throw error; } // Let the top level catch this
      const errorDisplayPath = path.relative(folderUri.fsPath, currentUri.fsPath).replace(/\\/g, '/') || '.';
      console.error(`[ContextWeaver FileSystemService] Error reading directory ${currentUri.fsPath} for getFolderContentsForIPC: ${error.message}`);
      // Optionally, could add an error marker to filesData if needed, but SRS implies skipping.
      return;
    }

    entries.sort((a, b) => { // Sort to ensure consistent order
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
        if (name === '.gitignore') continue; // Skip .gitignore content itself

        const fileDetail = await getFileContentWithLanguageId(entryUri);
        if (fileDetail) {
          filesData.push(fileDetail);
        } else {
          // Binary file or read error, already logged by getFileContentWithLanguageId
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
 * @description Prepares data for the 'entire codebase' to be sent to CE.
 *              This involves getting all file contents and the file tree.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder to process.
 * @returns {Promise<{ filesData: FileData[], fileTreeString: string, workspaceName: string, filterTypeApplied: 'gitignore' | 'default', projectPath: string } | string>} Object with data or error string.
 */
/**
 * @description Lists files and folders in a directory, applying workspace filters.
 * @param {vscode.Uri} folderToScanUri - The URI of the folder to list.
 * @param {vscode.WorkspaceFolder} containingWorkspaceFolder - Workspace folder for filter context.
 * @returns {Promise<{ entries: DirectoryEntry[]; filterTypeApplied: 'gitignore' | 'default' | 'none' }>}
 * @sideeffect Reads from the file system.
 */
export async function getDirectoryListing(
  folderToScanUri: vscode.Uri,
  containingWorkspaceFolder: vscode.WorkspaceFolder
): Promise<{ entries: DirectoryEntry[]; filterTypeApplied: 'gitignore' | 'default' | 'none' }> {
  const gitignoreFilter = await parseGitignore(containingWorkspaceFolder);
  const filterTypeApplied = gitignoreFilter !== null ? 'gitignore' : 'default';
  const entries: DirectoryEntry[] = [];

  try {
    const dirEntries = await vscode.workspace.fs.readDirectory(folderToScanUri);
    
    // Sort entries (directories first, then alphabetically)
    dirEntries.sort((a, b) => {
      if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
      if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
      return a[0].localeCompare(b[0]);
    });

    for (const [name, type] of dirEntries) {
      const entryUri = vscode.Uri.joinPath(folderToScanUri, name);
      const relativePathForIgnoreCheck = path.relative(containingWorkspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\/g, '/');
      const isDirectory = type === vscode.FileType.Directory;

      const ignoreInfo = getPathIgnoreInfo(
        relativePathForIgnoreCheck,
        name,
        isDirectory,
        gitignoreFilter,
        IGNORE_PATTERNS_DEFAULT
      );

      if (!ignoreInfo.ignored) {
        const entryType = isDirectory ? 'folder' : 'file';
        const uriString = entryUri.toString();
        entries.push({
          name,
          type: entryType,
          uri: uriString,
          content_source_id: uriString
        });
      }
    }

    return { entries, filterTypeApplied };
  } catch (error: any) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      console.warn(`[ContextWeaver FileSystemService] Directory not found: ${folderToScanUri.fsPath}`);
      throw error; // Let ipcServer handle the error
    }
    console.error(`[ContextWeaver FileSystemService] Error reading directory ${folderToScanUri.fsPath}: ${error.message}`);
    throw error; // Let ipcServer handle the error
  }
}

export async function getWorkspaceDataForIPC(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<{ filesData: FileData[], fileTreeString: string, workspaceName: string, filterTypeApplied: 'gitignore' | 'default', projectPath: string } | string> {

  const folderContentResult = await getFolderContentsForIPC(workspaceFolder.uri, workspaceFolder);
  if (typeof folderContentResult === 'string') { // Error occurred
    return folderContentResult;
  }

  const fileTreeResult = await getFileTree(workspaceFolder);
  if (typeof fileTreeResult === 'string') { // Error occurred
    return `Error generating file tree for workspace ${workspaceFolder.name}: ${fileTreeResult}`;
  }

  const projectPath = workspaceFolder.uri.fsPath.replace(/\\/g, '/');

  return {
    filesData: folderContentResult.filesData,
    fileTreeString: fileTreeResult.tree, // This is already wrapped in <file_tree>
    workspaceName: workspaceFolder.name,
    filterTypeApplied: folderContentResult.filterTypeApplied,
    projectPath: projectPath
  };
}