/**
 * @file fileSystemService.ts
 * @description Provides services for accessing and processing file system data in the VS Code workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { TextDecoder } from 'util';
import ignore, { Ignore } from 'ignore';

const IGNORE_PATTERNS_DEFAULT = [
  'node_modules/', '.git/', '.vscode/', 'dist/', 'build/', '*.log',
  '__pycache__/', '.DS_Store', '*.pyc', '*.pyo', '*.swp', '*.bak', '*.tmp',
  '.gitignore', // Added .gitignore here
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
    if (content.trim() === '') { // Handle empty .gitignore
      console.log(`[ContextWeaver] .gitignore file found in ${workspaceFolder.name} but it is empty. Will use default ignore patterns for filtering.`);
      return null;
    }
    const ig = ignore().add(content);
    console.log(`[ContextWeaver] Parsed .gitignore for ${workspaceFolder.name}`);
    return ig;
  } catch (error: any) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      console.log(`[ContextWeaver] No .gitignore file found in ${workspaceFolder.name}. Will use default ignore patterns.`);
    } else {
      console.error(`[ContextWeaver] Error reading or parsing .gitignore for ${workspaceFolder.name}: ${error.message}. Will use default ignore patterns.`);
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
    // The 'ignore' library typically handles matching 'dir_name/' pattern against 'dir_name' path.
    // Explicitly testing with a trailing slash for directories if the first check fails.
    if (gitignoreFilter.ignores(pathToCheck)) {
      console.log(`[ContextWeaver] Ignoring (gitignore): '${pathToCheck}' (name: '${name}', isDir: ${isDirectory})`);
      return { ignored: true, filterTypeApplied: 'gitignore' };
    }
    if (isDirectory && !pathToCheck.endsWith('/')) {
      if (gitignoreFilter.ignores(pathToCheck + '/')) {
        console.log(`[ContextWeaver] Ignoring (gitignore with added slash): '${pathToCheck + '/'}' (name: '${name}', isDir: ${isDirectory})`);
        return { ignored: true, filterTypeApplied: 'gitignore' };
      }
    }
    return { ignored: false, filterTypeApplied: 'gitignore' };
  } else {
    // No .gitignore or it was empty/errored, use default patterns
    for (const pattern of defaultIgnorePatterns) {
      const cleanPatternName = pattern.replace(/\/$/, '');

      if (pattern.endsWith('/')) {
        if (isDirectory && (name === cleanPatternName || relativePath === cleanPatternName || relativePath.startsWith(cleanPatternName + '/'))) {
          console.log(`[ContextWeaver] Ignoring (default pattern - dir): '${relativePath}' due to '${pattern}'`);
          return { ignored: true, filterTypeApplied: 'default' };
        }
      } else if (pattern.startsWith('*.')) {
        if (!isDirectory && name.endsWith(pattern.substring(1))) {
          console.log(`[ContextWeaver] Ignoring (default pattern - ext): '${relativePath}' due to '${pattern}'`);
          return { ignored: true, filterTypeApplied: 'default' };
        }
      } else {
        if (name === pattern) {
          console.log(`[ContextWeaver] Ignoring (default pattern - exact name): '${relativePath}' due to '${pattern}'`);
          return { ignored: true, filterTypeApplied: 'default' };
        }
        if (relativePath === pattern && name === pattern) {
          console.log(`[ContextWeaver] Ignoring (default pattern - exact path): '${relativePath}' due to '${pattern}'`);
          return { ignored: true, filterTypeApplied: 'default' };
        }
      }
    }
    return { ignored: false, filterTypeApplied: 'default' };
  }
}

export async function getFileTree(workspaceFolder: vscode.WorkspaceFolder): Promise<{ tree: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  if (!vscode.workspace.isTrusted) {
    return 'Error: Workspace is not trusted. Cannot access file system.';
  }
  if (!workspaceFolder) {
    return 'Error: No workspace folder is open.';
  }

  const gitignoreFilter = await parseGitignore(workspaceFolder);
  const actualFilterType = gitignoreFilter ? 'gitignore' : 'default';

  const tree = await generateFileTreeText(workspaceFolder.uri, workspaceFolder.uri, '', gitignoreFilter);
  return { tree: `${workspaceFolder.name}\n${tree}`.trim(), filterTypeApplied: actualFilterType };
}

async function generateFileTreeText(dirUri: vscode.Uri, baseUri: vscode.Uri, prefix: string, gitignoreFilter: Ignore | null): Promise<string> {
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
      const relativePath = path.relative(baseUri.fsPath, entryUri.fsPath).replace(/\\/g, '/');

      const ignoreInfo = getPathIgnoreInfo(relativePath, name, (type === vscode.FileType.Directory), gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
      if (ignoreInfo.ignored) {
        continue;
      }

      const isLast = i === entries.length - 1;
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      const linePrefix = prefix + (isLast ? '└── ' : '├── ');

      treeString += `${linePrefix}${name}\n`;

      if (type === vscode.FileType.Directory) {
        treeString += await generateFileTreeText(entryUri, baseUri, newPrefix, gitignoreFilter);
      }
    }
  } catch (error: any) {
    console.error(`[ContextWeaver] Error reading directory ${dirUri.fsPath}: ${error.message}`);
    treeString += `${prefix}└── Error reading directory: ${path.basename(dirUri.fsPath)}\n`;
  }
  return treeString;
}

export async function getFileContent(fileUri: vscode.Uri): Promise<string | null> {
  if (!vscode.workspace.isTrusted) {
    console.warn(`[ContextWeaver] Workspace not trusted. Cannot access file: ${fileUri.fsPath}`);
    return 'Error: Workspace is not trusted. Cannot access file system.';
  }
  try {
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
      const content = decoder.decode(fileData);
      if (content.includes('\0\0\0')) {
        console.log(`[ContextWeaver] Skipping binary file (heuristic): ${fileUri.fsPath}`);
        return null;
      }
      return content;
    } catch (decodeError) {
      console.log(`[ContextWeaver] Skipping binary file (decode error): ${fileUri.fsPath}`);
      return null;
    }
  } catch (error: any) {
    console.error(`[ContextWeaver] Error reading file ${fileUri.fsPath}: ${error.message}`);
    return `Error reading file ${fileUri.fsPath}: ${error.message}`;
  }
}

export async function getFolderContents(
  folderUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<{ fileTree: string, concatenatedContent: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  if (!vscode.workspace.isTrusted) return 'Error: Workspace is not trusted. Cannot access file system.';
  if (!workspaceFolder) return 'Error: No workspace folder is open.';

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
        const relativeEntryPath = path.relative(workspaceFolder.uri.fsPath, entryUri.fsPath).replace(/\\/g, '/');

        const ignoreInfo = getPathIgnoreInfo(relativeEntryPath, name, (type === vscode.FileType.Directory), gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
        if (ignoreInfo.ignored) {
          continue;
        }

        if (type === vscode.FileType.File) {
          if (name === '.gitignore') {
            console.log(`[ContextWeaver] Skipping content of .gitignore file: ${relativeEntryPath}`);
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
            }
          }
        } else if (type === vscode.FileType.Directory) {
          await traverseAndProcess(entryUri);
        }
      }
    } catch (error: any) {
      console.error(`[ContextWeaver] Error processing directory ${currentUri.fsPath}: ${error.message}`);
      concatenatedContent += `Error processing directory ${currentUri.fsPath}: ${error.message}\n\n`;
    }
  }

  await traverseAndProcess(folderUri);
  const fileTree = await generateFileTreeText(folderUri, workspaceFolder.uri, '', gitignoreFilter);

  return {
    fileTree,
    concatenatedContent: concatenatedContent.trim(),
    filterTypeApplied: actualFilterType
  };
}

export async function getWorkspaceCodebaseContents(
  workspaceFolderUri: vscode.Uri
): Promise<{ fileTree: string, concatenatedContent: string, workspaceName: string, filterTypeApplied: 'gitignore' | 'default' } | string> {
  if (!vscode.workspace.isTrusted) return 'Error: Workspace is not trusted. Cannot access file system.';

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceFolderUri);
  if (!workspaceFolder) return `Error: Workspace folder with URI ${workspaceFolderUri.toString()} not found or not open.`;

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
        const relativeEntryPath = path.relative(workspaceFolder!.uri.fsPath, entryUri.fsPath).replace(/\\/g, '/');

        // For top-level items in the workspace root, relativeEntryPath might be just the name if currentUri is workspaceFolder.uri.
        // If currentUri is deeper, relativeEntryPath will be like 'subdir/name'.
        // The getPathIgnoreInfo function expects paths relative to where .gitignore is (workspace root).
        const ignoreInfo = getPathIgnoreInfo(relativeEntryPath, name, (type === vscode.FileType.Directory), gitignoreFilter, IGNORE_PATTERNS_DEFAULT);
        if (ignoreInfo.ignored) {
          continue;
        }

        if (type === vscode.FileType.File) {
          if (name === '.gitignore') {
            console.log(`[ContextWeaver] Skipping content of .gitignore file: ${relativeEntryPath}`);
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
            }
          }
        } else if (type === vscode.FileType.Directory) {
          await traverseAndProcess(entryUri);
        }
      }
    } catch (error: any) {
      console.error(`[ContextWeaver] Error processing directory ${currentUri.fsPath} for codebase: ${error.message}`);
    }
  }

  await traverseAndProcess(workspaceFolder.uri);
  const fileTree = await generateFileTreeText(workspaceFolder.uri, workspaceFolder.uri, '', gitignoreFilter);

  return {
    fileTree,
    concatenatedContent: concatenatedContent.trim(),
    workspaceName: workspaceFolder.name,
    filterTypeApplied: actualFilterType
  };
}