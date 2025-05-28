/**
 * @file fileSystemService.ts
 * @description Handles all interactions with the file system for the VS Code extension,
 * such as reading files, listing directories, and generating file tree structures.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path'; // Using path for basename, dirname if needed, but vscode.Uri is preferred

// Predefined basic exclusions (placeholder for full .gitignore logic)
const DEFAULT_EXCLUSIONS: string[] = [
  'node_modules',
  '.git',
  'venv',
  '.venv',
  'dist',
  'build',
  '__pycache__',
  '.DS_Store',
  '*.log', // Simple check, full globbing later
  // Add more common ones if necessary
];

export interface FileTreeResult {
  fileTreeString: string;
  rootPath: string;
  workspaceFolderName: string;
  actualWorkspaceFolderUri: vscode.Uri;
}

/**
 * @description Generates a textual representation of the file and folder hierarchy
 * for a given workspace folder.
 * @param {vscode.Uri | null} workspaceFolderUri - The URI of a specific workspace folder,
 * or null to use the first active one.
 * @returns {Promise<FileTreeResult | null>} A promise that resolves to an object containing the
 * file tree string and root path, or null if no suitable workspace folder is found or accessible.
 * @sideeffect Reads from the file system.
 */
export async function generateFileTree(
  workspaceFolderUri: vscode.Uri | null
): Promise<FileTreeResult | null> {
  console.log('[ContextWeaver FileSystemService] generateFileTree called with workspaceFolderUri:', workspaceFolderUri?.toString() ?? 'null');

  // Initial Log current workspace state
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    console.log('[ContextWeaver FileSystemService] Initial: vscode.workspace.workspaceFolders is undefined or empty.');
  } else {
    console.log('[ContextWeaver FileSystemService] Initial: Available workspace folders:');
    vscode.workspace.workspaceFolders.forEach(folder => {
      console.log(`  - Name: ${folder.name}, URI: ${folder.uri.toString()}`);
    });
  }
  console.log(`[ContextWeaver FileSystemService] Initial: vscode.workspace.isTrusted: ${vscode.workspace.isTrusted}`);

  let targetWorkspaceFolder: vscode.WorkspaceFolder | undefined;

  if (workspaceFolderUri) {
    targetWorkspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceFolderUri);
    console.log('[ContextWeaver FileSystemService] Attempting to get specific workspace folder for URI:', workspaceFolderUri.toString());
    console.log('[ContextWeaver FileSystemService] Result from getWorkspaceFolder:', targetWorkspaceFolder?.uri.toString() ?? 'undefined');
  } else {
    console.log('[ContextWeaver FileSystemService] workspaceFolderUri is null, attempting to use the first available workspace folder.');
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      targetWorkspaceFolder = vscode.workspace.workspaceFolders[0];
      console.log('[ContextWeaver FileSystemService] Using first workspace folder:', targetWorkspaceFolder?.uri.toString() ?? 'undefined');
    } else {
      console.log('[ContextWeaver FileSystemService] No workspace folders available to select as default (at selection point).');
    }
  }

  if (!targetWorkspaceFolder) {
    // Log workspace folders AGAIN right before failing
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      console.log('[ContextWeaver FileSystemService] Final Check: vscode.workspace.workspaceFolders is STILL undefined or empty before returning null.');
    } else {
      console.log('[ContextWeaver FileSystemService] Final Check: Workspace folders ARE available now, but target was not set. Folders:');
      vscode.workspace.workspaceFolders.forEach(folder => {
        console.log(`  - Name: ${folder.name}, URI: ${folder.uri.toString()}`);
      });
    }
    vscode.window.showErrorMessage('ContextWeaver: No suitable workspace folder found or specified.');
    console.log('[ContextWeaver FileSystemService] No targetWorkspaceFolder identified, returning null.');
    return null;
  }

  console.log(`[ContextWeaver FileSystemService] Selected target workspace folder: ${targetWorkspaceFolder.name} (${targetWorkspaceFolder.uri.toString()})`);

  if (!vscode.workspace.isTrusted) { // Re-check trust for the *selected* context, though global trust is usually sufficient
    vscode.window.showErrorMessage('ContextWeaver: Workspace is not trusted. Cannot access file system.');
    console.log('[ContextWeaver FileSystemService] Workspace is not trusted (checked after folder selection), returning null.');
    return null;
  }
  console.log('[ContextWeaver FileSystemService] Workspace is confirmed trusted for operation.');

  const rootUri = targetWorkspaceFolder.uri;
  const rootName = targetWorkspaceFolder.name;
  const treeLines: string[] = [];

  const displayRootPath = rootUri.fsPath.replace(/\\/g, '/');
  treeLines.push(displayRootPath);

  async function traverse(dirUri: vscode.Uri, indentPrefix: string): Promise<void> {
    try {
      let entries = await vscode.workspace.fs.readDirectory(dirUri);

      entries = entries.filter(([name, type]) => {
        if (DEFAULT_EXCLUSIONS.includes(name)) {
          return false;
        }
        if (name.endsWith('.log') && DEFAULT_EXCLUSIONS.includes('*.log')) {
          return false;
        }
        return true;
      });

      entries.sort(([nameA, typeA], [nameB, typeB]) => {
        if (typeA === vscode.FileType.Directory && typeB !== vscode.FileType.Directory) {
          return -1;
        }
        if (typeA !== vscode.FileType.Directory && typeB === vscode.FileType.Directory) {
          return 1;
        }
        return nameA.localeCompare(nameB);
      });

      for (let i = 0; i < entries.length; i++) {
        const [name, type] = entries[i];
        const isLast = i === entries.length - 1;
        const entryPrefix = isLast ? '└── ' : '├── ';
        treeLines.push(`${indentPrefix}${entryPrefix}${name}`);

        if (type === vscode.FileType.Directory) {
          const newIndentPrefix = indentPrefix + (isLast ? '    ' : '│   ');
          const childUri = vscode.Uri.joinPath(dirUri, name);
          await traverse(childUri, newIndentPrefix);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirUri.toString()}:`, error);
      treeLines.push(`${indentPrefix}└── [Error reading directory: ${path.basename(dirUri.fsPath)}]`);
    }
  }

  await traverse(rootUri, '');

  const fileTreeString = `<file_tree>\n${treeLines.join('\n')}\n</file_tree>`;

  return {
    fileTreeString,
    rootPath: displayRootPath,
    workspaceFolderName: rootName,
    actualWorkspaceFolderUri: rootUri,
  };
}

export interface FileContentResult {
  content: string | null;
  filePath: string;
  fileName: string;
  isBinary: boolean;
  error?: string;
  workspaceFolderUri?: string | null;
  workspaceFolderName?: string | null;
}

/**
 * @description Reads the content of a specified file. Silently skips binary files.
 * @param {string} filePathOrUri - The absolute path or URI string of the file to read.
 * @returns {Promise<FileContentResult>} A promise that resolves to an object containing
 * the file content or an error/status.
 * @sideeffect Reads from the file system.
 */
export async function readFileContent(
  filePathOrUri: string
): Promise<FileContentResult> {
  console.log(`[ContextWeaver FileSystemService] readFileContent called for: ${filePathOrUri}`);
  let fileUri: vscode.Uri;
  try {
    if (filePathOrUri.startsWith('file:///')) {
      fileUri = vscode.Uri.parse(filePathOrUri, true);
    } else {
      fileUri = vscode.Uri.file(filePathOrUri);
    }
  } catch (e: any) {
    console.error(`[ContextWeaver FileSystemService] Invalid file path or URI: ${filePathOrUri}`, e);
    return {
      content: null,
      filePath: filePathOrUri,
      fileName: path.basename(filePathOrUri),
      isBinary: false,
      error: `Invalid file path or URI: ${e.message}`,
    };
  }

  const fileName = path.basename(fileUri.fsPath);
  const owningWorkspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
  const workspaceFolderUri = owningWorkspaceFolder?.uri.toString() ?? null;
  const workspaceFolderName = owningWorkspaceFolder?.name ?? null;

  if (!vscode.workspace.isTrusted) {
    const msg = 'Workspace is not trusted. File content access restricted.';
    console.warn(`[ContextWeaver FileSystemService] ${msg} For file: ${fileUri.fsPath}`);
    return {
      content: null,
      filePath: fileUri.fsPath,
      fileName,
      isBinary: false,
      error: msg,
      workspaceFolderUri,
      workspaceFolderName,
    };
  }

  try {
    const stat = await vscode.workspace.fs.stat(fileUri);
    if (stat.type !== vscode.FileType.File) {
      const msg = 'Path does not point to a file.';
      console.warn(`[ContextWeaver FileSystemService] ${msg} Path: ${fileUri.fsPath}`);
      return {
        content: null,
        filePath: fileUri.fsPath,
        fileName,
        isBinary: false,
        error: msg,
        workspaceFolderUri,
        workspaceFolderName,
      };
    }

    const rawContent = await vscode.workspace.fs.readFile(fileUri);
    const knownBinaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.exe', '.dll', '.o', '.so', '.wasm', '.zip', '.gz', '.pdf', '.obj', '.bin'];
    const fileExtension = path.extname(fileName).toLowerCase();

    if (knownBinaryExtensions.includes(fileExtension)) {
      console.log(`[ContextWeaver FileSystemService] Detected known binary file extension, skipping content: ${fileUri.fsPath}`);
      return {
        content: null,
        filePath: fileUri.fsPath,
        fileName,
        isBinary: true,
        workspaceFolderUri,
        workspaceFolderName,
      };
    }

    try {
      const decodedContent = new TextDecoder('utf-8', { fatal: true }).decode(rawContent);
      console.log(`[ContextWeaver FileSystemService] Successfully read and decoded file: ${fileUri.fsPath}`);
      return {
        content: decodedContent,
        filePath: fileUri.fsPath,
        fileName,
        isBinary: false,
        workspaceFolderUri,
        workspaceFolderName,
      };
    } catch (decodingError: any) {
      console.warn(`[ContextWeaver FileSystemService] UTF-8 decoding failed for ${fileUri.fsPath}, treating as unreadable. Error: ${decodingError.message}`);
      return {
        content: null,
        filePath: fileUri.fsPath,
        fileName,
        isBinary: true,
        error: `File is not valid UTF-8 or contains unreadable characters.`,
        workspaceFolderUri,
        workspaceFolderName,
      };
    }

  } catch (error: any) {
    console.error(`[ContextWeaver FileSystemService] Error reading file ${fileUri.fsPath}:`, error);
    let errorMessage = `Error reading file: ${error.message}`;
    if (error instanceof vscode.FileSystemError) {
      if (error.code === 'FileNotFound') errorMessage = 'File not found.';
      else if (error.code === 'NoPermissions') errorMessage = 'Permission denied.';
    }
    return {
      content: null,
      filePath: fileUri.fsPath,
      fileName,
      isBinary: false,
      error: errorMessage,
      workspaceFolderUri,
      workspaceFolderName,
    };
  }
}

export interface FolderContentResult {
  concatenatedContent: string;
  fileTreeString: string;
  folderPath: string;
  folderName: string;
  error?: string;
  workspaceFolderUri?: string | null;
  workspaceFolderName?: string | null;
}

interface FileInfo {
  path: string;
  name: string;
  content?: string;
  languageId?: string;
}

/**
 * @description Reads and concatenates content of all text files within a specified folder
 * and its subfolders, respecting default exclusions. Also generates a file tree for the folder.
 * @param {string} folderPathOrUri - The absolute path or URI string of the folder.
 * @returns {Promise<FolderContentResult | null>} A promise that resolves to an object containing
 * the concatenated content and file tree, or null if an error occurs.
 * @sideeffect Reads from the file system.
 */
export async function getFolderContents(
  folderPathOrUri: string
): Promise<FolderContentResult | null> {
  console.log(`[ContextWeaver FileSystemService] getFolderContents called for: ${folderPathOrUri}`);
  let folderUri: vscode.Uri;
  try {
    if (folderPathOrUri.startsWith('file:///')) {
      folderUri = vscode.Uri.parse(folderPathOrUri, true);
    } else {
      folderUri = vscode.Uri.file(folderPathOrUri);
    }
  } catch (e: any) {
    console.error(`[ContextWeaver FileSystemService] Invalid folder path or URI: ${folderPathOrUri}`, e);
    return {
      concatenatedContent: '',
      fileTreeString: '',
      folderPath: folderPathOrUri,
      folderName: path.basename(folderPathOrUri),
      error: `Invalid folder path or URI: ${e.message}`,
      workspaceFolderUri: null,
      workspaceFolderName: null,
    };
  }

  const folderName = path.basename(folderUri.fsPath);
  const owningWorkspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);

  if (!vscode.workspace.isTrusted) {
    const msg = 'Workspace is not trusted. Folder content access restricted.';
    console.warn(`[ContextWeaver FileSystemService] ${msg} For folder: ${folderUri.fsPath}`);
    return {
      concatenatedContent: '',
      fileTreeString: '',
      folderPath: folderUri.fsPath,
      folderName,
      error: msg,
      workspaceFolderUri: owningWorkspaceFolder?.uri.toString() ?? null,
      workspaceFolderName: owningWorkspaceFolder?.name ?? null,
    };
  }

  try {
    const stat = await vscode.workspace.fs.stat(folderUri);
    if (stat.type !== vscode.FileType.Directory) {
      const msg = 'Path does not point to a directory.';
      console.warn(`[ContextWeaver FileSystemService] ${msg} Path: ${folderUri.fsPath}`);
      return {
        concatenatedContent: '',
        fileTreeString: '',
        folderPath: folderUri.fsPath,
        folderName,
        error: msg,
        workspaceFolderUri: owningWorkspaceFolder?.uri.toString() ?? null,
        workspaceFolderName: owningWorkspaceFolder?.name ?? null,
      };
    }
  } catch (e: any) {
    console.error(`[ContextWeaver FileSystemService] Error stating folder ${folderUri.fsPath}:`, e);
    return {
      concatenatedContent: '',
      fileTreeString: '',
      folderPath: folderUri.fsPath,
      folderName,
      error: `Error accessing folder: ${e.message}`,
      workspaceFolderUri: owningWorkspaceFolder?.uri.toString() ?? null,
      workspaceFolderName: owningWorkspaceFolder?.name ?? null,
    };
  }

  const collectedFileInfos: FileInfo[] = [];
  const treeLines: string[] = [folderName];

  async function collectFilesAndBuildTreeRecursive(currentDirUri: vscode.Uri, indentPrefix: string): Promise<void> {
    let entries;
    try {
      entries = await vscode.workspace.fs.readDirectory(currentDirUri);
    } catch (e: any) {
      console.error(`[ContextWeaver FileSystemService] Error reading directory ${currentDirUri.fsPath} in getFolderContents:`, e);
      treeLines.push(`${indentPrefix}└── [Error reading directory: ${path.basename(currentDirUri.fsPath)}]`);
      return; // Return void, as declared
    }

    entries = entries.filter(([name, _type]) => {
      if (DEFAULT_EXCLUSIONS.includes(name)) return false;
      if (name.endsWith('.log') && DEFAULT_EXCLUSIONS.includes('*.log')) return false;
      return true;
    });

    entries.sort(([nameA, typeA], [nameB, typeB]) => {
      if (typeA === vscode.FileType.Directory && typeB !== vscode.FileType.Directory) return -1;
      if (typeA !== vscode.FileType.Directory && typeB === vscode.FileType.Directory) return 1;
      return nameA.localeCompare(nameB);
    });

    for (let i = 0; i < entries.length; i++) {
      const [name, type] = entries[i];
      const entryUri = vscode.Uri.joinPath(currentDirUri, name);

      const isLast = i === entries.length - 1;
      const entryPrefix = isLast ? '└── ' : '├── ';
      treeLines.push(`${indentPrefix}${entryPrefix}${name}`);

      if (type === vscode.FileType.File) {
        const fileData = await readFileContent(entryUri.toString());
        if (!fileData.isBinary && fileData.content !== null) {
          let langId = path.extname(name).substring(1).toLowerCase();
          if (langId === 'js') langId = 'javascript';
          else if (langId === 'py') langId = 'python';
          else if (langId === 'md') langId = 'markdown';
          else if (langId === 'json') langId = 'json';
          else if (langId === 'ts') langId = 'typescript';
          else if (!langId) langId = 'plaintext';

          collectedFileInfos.push({
            path: entryUri.fsPath,
            name: name,
            content: fileData.content,
            languageId: langId,
          });
        }
      } else if (type === vscode.FileType.Directory) {
        const newIndentPrefix = indentPrefix + (isLast ? '    ' : '│   ');
        await collectFilesAndBuildTreeRecursive(entryUri, newIndentPrefix);
      }
    }
  }

  await collectFilesAndBuildTreeRecursive(folderUri, '');

  let concatenatedFileContentsString = '';
  for (const fileInfo of collectedFileInfos) {
    const displayPath = fileInfo.path.replace(/\\/g, '/');
    concatenatedFileContentsString += `file: ${displayPath}\n\`\`\`${fileInfo.languageId || ''}\n${fileInfo.content}\n\`\`\`\n\n`;
  }
  concatenatedFileContentsString = concatenatedFileContentsString.trimEnd();

  const folderTreeString = `<file_tree>\n${treeLines.join('\n')}\n</file_tree>`;
  const fileContentsBlock = `<file_contents>\n${concatenatedFileContentsString}\n</file_contents>`;

  const fullContentForLlm = `${folderTreeString}\n\n${fileContentsBlock}`;

  return {
    concatenatedContent: fullContentForLlm,
    fileTreeString: folderTreeString,
    folderPath: folderUri.fsPath,
    folderName: folderName,
    workspaceFolderUri: owningWorkspaceFolder?.uri.toString() ?? null,
    workspaceFolderName: owningWorkspaceFolder?.name ?? null,
  };
}