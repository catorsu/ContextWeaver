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
      console.log(`[ContextWeaver FileSystemService] .gitignore file found in ${workspaceFolder.name} but it is empty. Will use default ignore patterns for filtering.`);
      return null;
    }
    const ig = ignore().add(content);
    console.log(`[ContextWeaver FileSystemService] Parsed .gitignore for ${workspaceFolder.name}`);
    return ig;
  } catch (error: any) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      console.log(`[ContextWeaver FileSystemService] No .gitignore file found in ${workspaceFolder.name}. Will use default ignore patterns.`);
    } else {
      console.error(`[ContextWeaver FileSystemService] Error reading or parsing .gitignore for ${workspaceFolder.name}: ${error.message}. Will use default ignore patterns.`);
    }
    return null;
  }
}

/**
 * @description Helper function to check if a path should be ignored based on gitignore or default patterns.
 * @param {string} relativePath - Path relative to the workspace root (e.g., 'src/file.ts', 'node_modules').
 * @param {string} name - The base name of the file or folder (e.g., 'file.ts', 'node_modules').
 * @param {boolean} isDirectory - True if the entry is a directory.
 * @param {Ignore | null} gitignoreFilter - Parsed .gitignore filter.
 * @param {readonly string[]} defaultIgnorePatterns - Default patterns.
 * @returns {{ ignored: boolean; filterTypeApplied: 'gitignore' | 'default' }}
 */
function getPathIgnoreInfo(
  relativePath: string,
  name: string,
  isDirectory: boolean,
  gitignoreFilter: Ignore | null,
  defaultIgnorePatterns: readonly string[]
): { ignored: boolean; filterTypeApplied: 'gitignore' | 'default' } {
  if (gitignoreFilter) {
    let pathToCheck = relativePath;
    // Normalize path: remove leading './' if present, as 'ignore' library might expect paths without it
    // or to ensure consistency with how patterns are written in .gitignore files.
    if (pathToCheck.startsWith('./')) {
      pathToCheck = pathToCheck.substring(2);
    }

    const isIgnored = gitignoreFilter.ignores(pathToCheck) || (isDirectory && !pathToCheck.endsWith('/') && gitignoreFilter.ignores(pathToCheck + '/'));
    if (isIgnored) {
      console.log(`[ContextWeaver FileSystemService] Ignoring (gitignore): '${pathToCheck}' (name: '${name}', isDir: ${isDirectory})`);
    }
    return { ignored: isIgnored, filterTypeApplied: 'gitignore' };
  } else {
    for (const pattern of defaultIgnorePatterns) {
      const cleanPatternName = pattern.replace(/\/$/, '');

      if (pattern.endsWith('/')) {
        if (isDirectory && (name === cleanPatternName || relativePath === cleanPatternName || relativePath.startsWith(cleanPatternName + '/'))) {
          console.log(`[ContextWeaver FileSystemService] Ignoring (default pattern - dir): '${relativePath}' due to '${pattern}'`);
          return { ignored: true, filterTypeApplied: 'default' };
        }
      } else if (pattern.startsWith('*.')) {
        if (!isDirectory && name.endsWith(pattern.substring(1))) {
          console.log(`[ContextWeaver FileSystemService] Ignoring (default pattern - ext): '${relativePath}' due to '${pattern}'`);
          return { ignored: true, filterTypeApplied: 'default' };
        }
      } else {
        if (name === pattern) {
          console.log(`[ContextWeaver FileSystemService] Ignoring (default pattern - exact name): '${relativePath}' due to '${pattern}'`);
          return { ignored: true, filterTypeApplied: 'default' };
        }
        if (relativePath === pattern && name === pattern) { // Check for exact relative path match
          console.log(`[ContextWeaver FileSystemService] Ignoring (default pattern - exact path): '${relativePath}' due to '${pattern}'`);
          return { ignored: true, filterTypeApplied: 'default' };
        }
      }
    }
    return { ignored: false, filterTypeApplied: 'default' };
  }
}

/**
 * @description Generates a textual representation of the file and folder hierarchy for a given workspace folder.
 * Assumes workspaceFolder is valid and trusted.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder to generate the tree for.
 * @returns {Promise<{ tree: string, filterTypeApplied: 'gitignore' | 'default' } | string>} Object with tree string and filter type, or an error string.
 */
export async function getFileTree(workspaceFolder: vscode.WorkspaceFolder): Promise<{ tree: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  // Trust and existence of workspaceFolder is pre-checked by the caller (ipcServer)
  const gitignoreFilter = await parseGitignore(workspaceFolder);
  const actualFilterType = gitignoreFilter ? 'gitignore' : 'default';

  try {
    const tree = await generateFileTreeTextInternal(workspaceFolder.uri, workspaceFolder.uri, '', gitignoreFilter);
    return { tree: `${workspaceFolder.name}\n${tree}`.trim(), filterTypeApplied: actualFilterType };
  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Error in getFileTree for ${workspaceFolder.name}: ${error.message}`);
    return `Error generating file tree for ${workspaceFolder.name}: ${error.message}`;
  }
}

async function generateFileTreeTextInternal(dirUri: vscode.Uri, baseUri: vscode.Uri, prefix: string, gitignoreFilter: Ignore | null): Promise<string> {
  let treeString = '';
  try {
    let entries = await vscode.workspace.fs.readDirectory(dirUri);
    entries = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
    
    // Process files and directories separately to maintain tree format and consistency
    const dirs = entries.filter(([_, type]) => type === vscode.FileType.Directory);
    const files = entries.filter(([_, type]) => type === vscode.FileType.File);
    entries = [...dirs, ...files];

    // Track the last unfiltered entry for correct last-item markers
    let lastUnfilteredIndex = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      const [name, type] = entries[i];
      const entryUri = vscode.Uri.joinPath(dirUri, name);
      const relativePath = path.relative(baseUri.fsPath, entryUri.fsPath).replace(/\\\\/g, '/');
      const ignoreInfo = getPathIgnoreInfo(relativePath, name, (type === vscode.FileType.Directory), gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
      if (!ignoreInfo.ignored) {
        lastUnfilteredIndex = i;
        break;
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const [name, type] = entries[i];
      const entryUri = vscode.Uri.joinPath(dirUri, name);
      const relativePath = path.relative(baseUri.fsPath, entryUri.fsPath).replace(/\\\\/g, '/');

      const ignoreInfo = getPathIgnoreInfo(relativePath, name, (type === vscode.FileType.Directory), gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
      if (ignoreInfo.ignored) {
        continue;
      }

      const isLast = (i === lastUnfilteredIndex);
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      const linePrefix = prefix + (isLast ? '└── ' : '├── ');

      treeString += `${linePrefix}${name}\n`;

      if (type === vscode.FileType.Directory) {
        const subdirContent = await generateFileTreeTextInternal(entryUri, baseUri, newPrefix, gitignoreFilter);
        if (subdirContent) {
          treeString += subdirContent;
        }
      }
    }
  } catch (error: any) {
    if (error.code === 'FileNotFound') {
      throw error; // Re-throw FileNotFound to preserve it
    }
    console.error(`[ContextWeaver FileSystemService] Error reading directory ${dirUri.fsPath}: ${error.message}`);
    treeString += `${prefix}\u2514\u2500\u2500 Error reading directory: ${path.basename(dirUri.fsPath)}\\n`; // Return error in tree structure
  }
  return treeString;
}

/**
 * @description Reads and provides the full UTF-8 text content of any specified file.
 * Assumes workspace is trusted.
 * @param {vscode.Uri} fileUri - The URI of the file to read.
 * @returns {Promise<string | null>} The file content as a string, null if binary, or an error string.
 */
export async function getFileContent(fileUri: vscode.Uri): Promise<string | null> {
  // Trust is pre-checked by the caller (ipcServer)
  try {
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    const decoder = new TextDecoder('utf-8', { fatal: true }); // fatal: true will throw on invalid UTF-8
    try {
      const content = decoder.decode(fileData);
      // A more robust binary check might be needed, but this heuristic can catch some common cases.
      // Checking for multiple null bytes is a common heuristic.
      // Corrected check for actual null character and Unicode replacement character
      if (content.includes('\0\0\0') || content.includes('\uFFFD')) {
        console.log(`[ContextWeaver FileSystemService] Skipping binary file (heuristic or decode error): ${fileUri.fsPath}`);
        return null;
      }
      return content;
    } catch (decodeError: any) { // Catch decoding errors specifically
      console.log(`[ContextWeaver FileSystemService] Skipping binary file (decode error for ${fileUri.fsPath}): ${decodeError.message}`);
      return null;
    }
  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Error reading file ${fileUri.fsPath}: ${error.message}`);
    // Return an error string that can be identified by the caller
    return `Error: Reading file ${fileUri.fsPath} failed: ${error.message}`;
  }
}

/**
 * @description Reads and concatenates the content of all text files within a specified folder (and its subfolders).\n * Assumes workspaceFolder is valid and trusted.
 * @param {vscode.Uri} folderUri - The URI of the folder.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder containing the target folder.
 * @returns {Promise<{ tree: string, filterTypeApplied: 'gitignore' | 'default' } | string>} Object with data or error string.
 */
export async function getFolderContents(
  folderUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<{ tree: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  // Trust and existence of workspaceFolder is pre-checked by the caller (ipcServer)
  let concatenatedContent = '';
  const gitignoreFilter = await parseGitignore(workspaceFolder);
  let filterTypeApplied: 'gitignore' | 'default' = gitignoreFilter ? 'gitignore' : 'default';

  async function traverseAndProcess(currentUri: vscode.Uri): Promise<void> {
    let entries: [string, vscode.FileType][];
    
    try {
      entries = await vscode.workspace.fs.readDirectory(currentUri);
    } catch (error: any) {
      if (error.code === 'FileNotFound') {
        throw error; // Re-throw to preserve FileNotFound error type
      }
      console.error(`[ContextWeaver FileSystemService] Error reading directory ${currentUri.fsPath} for getFolderContents: ${error.message}`);
      concatenatedContent += `Error reading directory ${path.basename(currentUri.fsPath)}: ${error.message}\n\n`;
      return; // Skip this directory but continue with others
    }

    entries = [...entries].sort((a, b) => a[0].localeCompare(b[0]));

    // Process files and directories separately to maintain content order
    const files = entries.filter(([_, type]) => type === vscode.FileType.File);
    const dirs = entries.filter(([_, type]) => type === vscode.FileType.Directory);

    // Process files for content first
    for (const [name, type] of files) {
      const entryUri = vscode.Uri.joinPath(currentUri, name);
      const relativeEntryPath = path.relative(workspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\\\/g, '/');

      const ignoreInfo = getPathIgnoreInfo(relativeEntryPath, name, false, gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
      if (ignoreInfo.ignored) {
        continue;
      }

      if (name === '.gitignore') {
        console.log(`[ContextWeaver FileSystemService] Skipping content of .gitignore file: ${relativeEntryPath}`);
      } else {
        const fileContent = await getFileContent(entryUri);
        if (fileContent && !fileContent.startsWith('Error:')) {
          let langId = 'text';
          const ext = path.extname(name);
          if (ext) {
            const langMap: { [key: string]: string } = {
              '.js': 'javascript', '.ts': 'typescript', '.py': 'python', '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.cs': 'csharp',
              '.go': 'go', '.rb': 'ruby', '.php': 'php', '.html': 'html', '.css': 'css', '.json': 'json', '.xml': 'xml', '.md': 'markdown'
            };
            langId = langMap[ext.toLowerCase()] || 'text';
          }
          concatenatedContent += `file: ${relativeEntryPath}\n\`\`\`${langId}\n${fileContent}\n\`\`\`\n\n`;
        } else if (fileContent === null) {
          // Binary file, already logged by getFileContent
        } else {
          // Error reading file, log it or append error message to concatenatedContent
          console.warn(`[ContextWeaver FileSystemService] Skipping content of ${relativeEntryPath} due to read error: ${fileContent}`);
        }
      }
    }

    // Then process directories for recursive content
    for (const [name, type] of dirs) {
      const entryUri = vscode.Uri.joinPath(currentUri, name);
      const relativeEntryPath = path.relative(workspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\\\/g, '/');
      
      const ignoreInfo = getPathIgnoreInfo(relativeEntryPath, name, true, gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
      if (!ignoreInfo.ignored) {
        await traverseAndProcess(entryUri);
      }
    }
  }

  try {
    try {
      await traverseAndProcess(folderUri);
      let fileTree = await generateFileTreeTextInternal(folderUri, workspaceFolder.uri, '', gitignoreFilter);
      fileTree = fileTree.trim();
      concatenatedContent = concatenatedContent.trim();

      return {
        tree: fileTree,
        filterTypeApplied
      };
    } catch (error: any) {
      if (error.code === 'FileNotFound') {
        throw error; // Re-throw to preserve FileNotFound error type
      }
      // Otherwise try to return the tree with error nodes and any partial content
      let fileTree = `└── Error reading directory: ${path.basename(folderUri.fsPath)}\n`;
      fileTree = fileTree.trim();
      concatenatedContent = concatenatedContent.trim();

      return {
        tree: fileTree,
        filterTypeApplied
      };
    }
  } catch (error: any) {
    // Only convert to error string for non-existent target folder
    return `Error getting contents for folder ${folderUri.fsPath}: ${error.message}`;
  }
}

/**
 * @description Reads and concatenates the content of all text files within a specified workspace folder.
 * Assumes workspaceFolder is valid and trusted.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder to process.
 * @returns {Promise<{ tree: string, workspaceName: string, filterTypeApplied: 'gitignore' | 'default' } | string>} Object with data or error string.
 */
export async function getWorkspaceCodebaseContents(
  workspaceFolder: vscode.WorkspaceFolder // Changed to accept WorkspaceFolder directly
): Promise<{ tree: string, workspaceName: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  const result = await getFolderContents(workspaceFolder.uri, workspaceFolder);

  if (typeof result === 'string') {
    return result;
  }

  return {
    tree: result.tree,
    workspaceName: workspaceFolder.name,
    filterTypeApplied: result.filterTypeApplied
  };
}