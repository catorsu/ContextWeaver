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
  '.gitignore',
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
    if (gitignoreFilter.ignores(pathToCheck)) {
      console.log(`[ContextWeaver FileSystemService] Ignoring (gitignore): '${pathToCheck}' (name: '${name}', isDir: ${isDirectory})`);
      return { ignored: true, filterTypeApplied: 'gitignore' };
    }
    if (isDirectory && !pathToCheck.endsWith('/')) {
      if (gitignoreFilter.ignores(pathToCheck + '/')) {
        console.log(`[ContextWeaver FileSystemService] Ignoring (gitignore with added slash): '${pathToCheck + '/'}' (name: '${name}', isDir: ${isDirectory})`);
        return { ignored: true, filterTypeApplied: 'gitignore' };
      }
    }
    return { ignored: false, filterTypeApplied: 'gitignore' };
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
    return { tree: `${workspaceFolder.name}\\n${tree}`.trim(), filterTypeApplied: actualFilterType };
  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Error in getFileTree for ${workspaceFolder.name}: ${error.message}`);
    return `Error generating file tree for ${workspaceFolder.name}: ${error.message}`;
  }
}

async function generateFileTreeTextInternal(dirUri: vscode.Uri, baseUri: vscode.Uri, prefix: string, gitignoreFilter: Ignore | null): Promise<string> {
  let treeString = '';
  try {
    const entries = await vscode.workspace.fs.readDirectory(dirUri);
    entries.sort((a, b) => {
      if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
      if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
      return a[0].localeCompare(b[0]);
    });

    for (let i = 0; i < entries.length; i++) {
      const [name, type] = entries[i];
      const entryUri = vscode.Uri.joinPath(dirUri, name);
      // Use toURI().toString() for consistent path separator for relative path calculation with ignore library
      const relativePath = path.relative(baseUri.fsPath, entryUri.fsPath).replace(/\\\\/g, '/');


      const ignoreInfo = getPathIgnoreInfo(relativePath, name, (type === vscode.FileType.Directory), gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
      if (ignoreInfo.ignored) {
        continue;
      }

      const isLast = i === entries.length - 1;
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      const linePrefix = prefix + (isLast ? '└── ' : '├── ');

      treeString += `${linePrefix}${name}\\n`;

      if (type === vscode.FileType.Directory) {
        treeString += await generateFileTreeTextInternal(entryUri, baseUri, newPrefix, gitignoreFilter);
      }
    }
  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Error reading directory ${dirUri.fsPath}: ${error.message}`);
    treeString += `${prefix}└── Error reading directory: ${path.basename(dirUri.fsPath)}\\n`;
    // Propagate error to be handled by the caller
    throw new Error(`Failed to read directory ${dirUri.fsPath}: ${error.message}`);
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
      if (content.includes('\\0\\0\\0') || content.includes('\\uFFFD')) { // U+FFFD is replacement character
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
 * @description Reads and concatenates the content of all text files within a specified folder (and its subfolders).
 * Assumes workspaceFolder is valid and trusted.
 * @param {vscode.Uri} folderUri - The URI of the folder.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder containing the target folder.
 * @returns {Promise<{ fileTree: string, concatenatedContent: string, filterTypeApplied: 'gitignore' | 'default' } | string>} Object with data or error string.
 */
export async function getFolderContents(
  folderUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<{ fileTree: string, concatenatedContent: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  // Trust and existence of workspaceFolder is pre-checked by the caller (ipcServer)
  let concatenatedContent = '';
  const gitignoreFilter = await parseGitignore(workspaceFolder);
  const actualFilterType = gitignoreFilter ? 'gitignore' : 'default';

  async function traverseAndProcess(currentUri: vscode.Uri): Promise<void> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(currentUri);
      entries.sort((a, b) => {
        if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
        if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
        return a[0].localeCompare(b[0]);
      });

      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(currentUri, name);
        const relativeEntryPath = path.relative(workspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\\\/g, '/');

        const ignoreInfo = getPathIgnoreInfo(relativeEntryPath, name, (type === vscode.FileType.Directory), gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
        if (ignoreInfo.ignored) {
          continue;
        }

        if (type === vscode.FileType.File) {
          if (name === '.gitignore') {
            console.log(`[ContextWeaver FileSystemService] Skipping content of .gitignore file: ${relativeEntryPath}`);
          } else {
            const fileContent = await getFileContent(entryUri); // getFileContent now returns null for binary or error string
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
              concatenatedContent += `file: ${relativeEntryPath}\\n\\` + `\`\`${langId}\\n${fileContent}\\n\\` + `\`\`\\n\\n`;
            } else if (fileContent === null) {
              // Binary file, already logged by getFileContent
            } else {
              // Error reading file, log it or append error message to concatenatedContent
              console.warn(`[ContextWeaver FileSystemService] Skipping content of ${relativeEntryPath} due to read error: ${fileContent}`);
              // Optionally append error to concatenatedContent if needed:
              // concatenatedContent += `Error reading file ${relativeEntryPath}: ${fileContent}\\n\\n`;
            }
          }
        } else if (type === vscode.FileType.Directory) {
          await traverseAndProcess(entryUri);
        }
      }
    } catch (error: any) {
      console.error(`[ContextWeaver FileSystemService] Error processing directory ${currentUri.fsPath} for getFolderContents: ${error.message}`);
      // Decide if this error should be part of concatenatedContent or throw
      concatenatedContent += `Error processing directory ${path.basename(currentUri.fsPath)}: ${error.message}\\n\\n`;
    }
  }

  try {
    await traverseAndProcess(folderUri);
    const fileTree = await generateFileTreeTextInternal(folderUri, workspaceFolder.uri, '', gitignoreFilter);

    return {
      fileTree,
      concatenatedContent: concatenatedContent.trim(),
      filterTypeApplied: actualFilterType
    };
  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Top-level error in getFolderContents for ${folderUri.fsPath}: ${error.message}`);
    return `Error getting contents for folder ${folderUri.fsPath}: ${error.message}`;
  }
}

/**
 * @description Reads and concatenates the content of all text files within a specified workspace folder.
 * Assumes workspaceFolder is valid and trusted.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder to process.
 * @returns {Promise<{ fileTree: string, concatenatedContent: string, workspaceName: string, filterTypeApplied: 'gitignore' | 'default' } | string>} Object with data or error string.
 */
export async function getWorkspaceCodebaseContents(
  workspaceFolder: vscode.WorkspaceFolder // Changed to accept WorkspaceFolder directly
): Promise<{ fileTree: string, concatenatedContent: string, workspaceName: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  // Trust and existence of workspaceFolder is pre-checked by the caller (ipcServer)
  let concatenatedContent = '';
  const gitignoreFilter = await parseGitignore(workspaceFolder);
  const actualFilterType = gitignoreFilter ? 'gitignore' : 'default';

  async function traverseAndProcess(currentUri: vscode.Uri): Promise<void> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(currentUri);
      entries.sort((a, b) => {
        if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
        if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
        return a[0].localeCompare(b[0]);
      });

      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(currentUri, name);
        const relativeEntryPath = path.relative(workspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\\\/g, '/');

        const ignoreInfo = getPathIgnoreInfo(relativeEntryPath, name, (type === vscode.FileType.Directory), gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
        if (ignoreInfo.ignored) {
          continue;
        }

        if (type === vscode.FileType.File) {
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
              concatenatedContent += `file: ${relativeEntryPath}\\n\\` + `\`\`${langId}\\n${fileContent}\\n\\` + `\`\`\\n\\n`;
            } else if (fileContent === null) {
              // Binary file, already logged
            } else {
              console.warn(`[ContextWeaver FileSystemService] Skipping content of ${relativeEntryPath} for codebase due to read error: ${fileContent}`);
            }
          }
        } else if (type === vscode.FileType.Directory) {
          await traverseAndProcess(entryUri);
        }
      }
    } catch (error: any) {
      console.error(`[ContextWeaver FileSystemService] Error processing directory ${currentUri.fsPath} for getWorkspaceCodebaseContents: ${error.message}`);
      // Optionally append error to concatenatedContent or throw
      concatenatedContent += `Error processing directory ${path.basename(currentUri.fsPath)} for codebase: ${error.message}\\n\\n`;
    }
  }

  try {
    await traverseAndProcess(workspaceFolder.uri);
    const fileTree = await generateFileTreeTextInternal(workspaceFolder.uri, workspaceFolder.uri, '', gitignoreFilter);

    return {
      fileTree,
      concatenatedContent: concatenatedContent.trim(),
      workspaceName: workspaceFolder.name,
      filterTypeApplied: actualFilterType
    };
  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Top-level error in getWorkspaceCodebaseContents for ${workspaceFolder.name}: ${error.message}`);
    return `Error getting contents for workspace ${workspaceFolder.name}: ${error.message}`;
  }
}