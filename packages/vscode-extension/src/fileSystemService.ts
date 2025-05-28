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

interface FileTreeResult {
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

  // The first line is the root path, normalized to forward slashes
  // uri.path already uses forward slashes and includes the leading slash.
  // For display like "C:/project/MyProject", we might want to remove leading slash if not a UNC path.
  // However, the SRS example "C:/project/SmartInfo" implies it's fine.
  // Let's use uri.fsPath for the initial display and then format it.
  // For consistency with the SRS example, we'll format fsPath.
  const displayRootPath = rootUri.fsPath.replace(/\\/g, '/'); // Normalize to forward slashes for display
  treeLines.push(displayRootPath);

  /**
   * @description Recursively traverses a directory to build the file tree.
   * @param {vscode.Uri} dirUri - The URI of the directory to traverse.
   * @param {string} indentPrefix - The prefix string for the current indentation level.
   * @returns {Promise<void>}
   * @sideeffect Reads directory contents from the file system.
   */
  async function traverse(dirUri: vscode.Uri, indentPrefix: string): Promise<void> {
    try {
      let entries = await vscode.workspace.fs.readDirectory(dirUri);

      // Filter out excluded entries
      entries = entries.filter(([name, type]) => {
        if (DEFAULT_EXCLUSIONS.includes(name)) {
          return false;
        }
        if (name.endsWith('.log') && DEFAULT_EXCLUSIONS.includes('*.log')) { // Simple check for *.log
          return false;
        }
        // Add more sophisticated glob matching here when integrating full filterService
        return true;
      });

      // Sort entries: folders first, then files, then alphabetically
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

  const fileTreeString = `<file_tree>\\n${treeLines.join('\\n')}\\n</file_tree>`;

  return {
    fileTreeString,
    rootPath: displayRootPath, // The path displayed as the root of the tree
    workspaceFolderName: rootName,
    actualWorkspaceFolderUri: rootUri,
  };
}

// (At the end of the file, after the generateFileTree function and its interface)

export interface FileContentResult {
  content: string | null;
  filePath: string; // Normalized path for identification
  fileName: string; // For label
  isBinary: boolean;
  error?: string; // Optional error message if reading failed beyond binary skip
  workspaceFolderUri?: string | null; // URI string
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
    // Check if it's already a URI string, otherwise assume it's a file path
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

  const fileName = path.basename(fileUri.fsPath); // Use path.basename for simple name extraction

  // Determine owning workspace folder
  const owningWorkspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
  const workspaceFolderUri = owningWorkspaceFolder?.uri.toString() ?? null;
  const workspaceFolderName = owningWorkspaceFolder?.name ?? null;

  // Workspace Trust check (though individual file reads might be allowed in untrusted workspaces if they are open)
  // For consistency with other operations, we'll check global trust.
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

    // FR-VSCE-002: "Binary files shall be silently skipped."
    // We will rely on TextDecoder failing for non-UTF-8 files.
    // Optionally, add a list of known binary extensions for a faster path.
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

    // Attempt to decode as UTF-8
    try {
      const decodedContent = new TextDecoder('utf-8', { fatal: true }).decode(rawContent);
      console.log(`[ContextWeaver FileSystemService] Successfully read and decoded file: ${fileUri.fsPath}`);
      return {
        content: decodedContent,
        filePath: fileUri.fsPath, // fsPath is fine for internal use here
        fileName,
        isBinary: false,
        workspaceFolderUri,
        workspaceFolderName,
      };
    } catch (decodingError: any) {
      // If UTF-8 decoding fails, treat as binary/unreadable
      console.warn(`[ContextWeaver FileSystemService] UTF-8 decoding failed for ${fileUri.fsPath}, treating as unreadable. Error: ${decodingError.message}`);
      return {
        content: null,
        filePath: fileUri.fsPath,
        fileName,
        isBinary: true, // Mark as binary due to decoding failure
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
      isBinary: false, // Could be other errors than binary
      error: errorMessage,
      workspaceFolderUri,
      workspaceFolderName,
    };
  }
}