/**
 * @file fileSystemService.ts
 * @description Provides services for accessing and processing file system data in the VS Code workspace.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as fs from 'fs'; // This seems unused, consider removing if not needed elsewhere.
import * as path from 'path';
import { TextDecoder } from 'util';

const IGNORE_PATTERNS_DEFAULT = [
  'node_modules/',
  '.git/',
  '.vscode/',
  'dist/',
  'build/',
  '*.log',
  '__pycache__/',
  '.DS_Store',
  '*.pyc',
  '*.pyo',
  '*.swp',
  '*.bak',
  '*.tmp',
  '*.zip',
  '*.tar.gz',
  '*.rar',
  '*.7z',
  '*.exe',
  '*.dll',
  '*.obj',
  '*.o',
  '*.a',
  '*.lib',
  '*.so',
  '*.dylib',
  '*.ncb',
  '*.sdf',
  '*.suo',
  '*.pdb',
  '*.idb',
  '*.class',
  '*.jar',
  '*.mp3',
  '*.wav',
  '*.ogg',
  '*.mp4',
  '*.avi',
  '*.mov',
  '*.wmv',
  '*.flv',
  '*.mkv',
  '*.webm',
  '*.jpg',
  '*.jpeg',
  '*.png',
  '*.gif',
  '*.bmp',
  '*.tiff',
  '*.ico',
  '*.pdf',
  '*.doc',
  '*.docx',
  '*.ppt',
  '*.pptx',
  '*.xls',
  '*.xlsx',
  '*.odt',
  '*.ods',
  '*.odp',
];

/**
 * @description Generates a textual representation of the file and folder hierarchy for a given workspace folder.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder to analyze.
 * @returns {Promise<string>} A string representing the file tree, or an error message if the workspace is untrusted or not open.
 * @sideeffect Reads from the file system.
 */
export async function getFileTree(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
  if (!vscode.workspace.isTrusted) {
    return 'Error: Workspace is not trusted. Cannot access file system.';
  }
  if (!workspaceFolder) {
    return 'Error: No workspace folder is open.';
  }

  const tree = await generateFileTreeText(workspaceFolder.uri, workspaceFolder.uri, '');
  return `${workspaceFolder.name}\\n${tree}`.trim();
}

/**
 * @description Recursively generates the file tree string for a given directory URI.
 * @param {vscode.Uri} dirUri - The URI of the directory to traverse.
 * @param {vscode.Uri} baseUri - The base URI of the workspace folder, used for relative path calculations.
 * @param {string} prefix - The prefix string for formatting the tree structure.
 * @returns {Promise<string>} A string representing the file tree for the directory.
 * @sideeffect Reads from the file system.
 */
async function generateFileTreeText(dirUri: vscode.Uri, baseUri: vscode.Uri, prefix: string): Promise<string> {
  let treeString = '';
  try {
    const entries = await vscode.workspace.fs.readDirectory(dirUri);
    // Sort entries: folders first, then files, then alphabetically
    entries.sort((a, b) => {
      if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) {
        return -1;
      }
      if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) {
        return 1;
      }
      return a[0].localeCompare(b[0]);
    });

    for (let i = 0; i < entries.length; i++) {
      const [name, type] = entries[i];
      const entryUri = vscode.Uri.joinPath(dirUri, name);
      const isLast = i === entries.length - 1;
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      const linePrefix = prefix + (isLast ? '└── ' : '├── ');

      // TODO: FR-VSCE-005 Integrate full .gitignore parsing
      // For now, skip common problematic directories/files using IGNORE_PATTERNS_DEFAULT
      if (IGNORE_PATTERNS_DEFAULT.some(pattern => name.includes(pattern.replace(/\//g, '')))) {
        continue;
      }

      treeString += `${linePrefix}${name}\\n`;

      if (type === vscode.FileType.Directory) {
        treeString += await generateFileTreeText(entryUri, baseUri, newPrefix);
      }
    }
  } catch (error: any) {
    console.error(`[ContextWeaver] Error reading directory ${dirUri.fsPath}: ${error.message}`);
    treeString += `${prefix}└── Error reading directory: ${path.basename(dirUri.fsPath)}\\n`;
  }
  return treeString;
}

/**
 * @description Reads the content of a specified file.
 * @param {vscode.Uri} fileUri - The URI of the file to read.
 * @returns {Promise<string | null>} The file content as a string, or null if binary or error.
 * @sideeffect Reads from the file system.
 */
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
      if (content.includes('\\0\\0\\0')) {
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

/**
 * @description Reads and concatenates the content of all text files within a specified folder and its subfolders.
 * @param {vscode.Uri} folderUri - The URI of the folder to process.
 * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder context.
 * @returns {Promise<{ fileTree: string, concatenatedContent: string } | string>} An object with file tree and content, or an error string.
 * @sideeffect Reads from the file system.
 */
export async function getFolderContents(folderUri: vscode.Uri, workspaceFolder: vscode.WorkspaceFolder): Promise<{ fileTree: string, concatenatedContent: string } | string> {
  if (!vscode.workspace.isTrusted) {
    return 'Error: Workspace is not trusted. Cannot access file system.';
  }
  if (!workspaceFolder) {
    return 'Error: No workspace folder is open.';
  }

  let concatenatedContent = '';

  async function traverseAndProcess(currentUri: vscode.Uri, currentRelativePathPrefix: string): Promise<void> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(currentUri);
      entries.sort((a, b) => {
        if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
        if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
        return a[0].localeCompare(b[0]);
      });

      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(currentUri, name);
        const relativeEntryPath = path.join(currentRelativePathPrefix, name).replace(/\\\\/g, '/');

        // TODO: FR-VSCE-005 Integrate full .gitignore parsing
        if (IGNORE_PATTERNS_DEFAULT.some(pattern => name.includes(pattern.replace(/\//g, '')) || relativeEntryPath.includes(pattern))) {
          continue;
        }

        if (type === vscode.FileType.File) {
          const fileContent = await getFileContent(entryUri);
          if (fileContent && !fileContent.startsWith('Error:')) {
            // TODO: Determine actual language ID for markdown block
            // For now, use a generic 'text' or try to infer from extension
            let langId = 'text';
            const ext = path.extname(name);
            if (ext) {
              // A simple map, can be expanded
              const langMap: { [key: string]: string } = {
                '.js': 'javascript', '.ts': 'typescript', '.py': 'python',
                '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.cs': 'csharp',
                '.go': 'go', '.rb': 'ruby', '.php': 'php', '.html': 'html',
                '.css': 'css', '.json': 'json', '.xml': 'xml', '.md': 'markdown'
              };
              langId = langMap[ext.toLowerCase()] || 'text';
            }
            concatenatedContent += `file: ${relativeEntryPath}\\n\`\`\`${langId}\\n${fileContent}\\n\`\`\`\\n\\n`;
          }
        } else if (type === vscode.FileType.Directory) {
          await traverseAndProcess(entryUri, relativeEntryPath);
        }
      }
    } catch (error: any) {
      console.error(`[ContextWeaver] Error processing directory ${currentUri.fsPath}: ${error.message}`);
      concatenatedContent += `Error processing directory ${currentUri.fsPath}: ${error.message}\\n\\n`;
    }
  }

  await traverseAndProcess(folderUri, ''); // Start with an empty relative path prefix for the top-level folder
  const fileTree = await generateFileTreeText(folderUri, workspaceFolder.uri, '');

  return {
    fileTree,
    concatenatedContent: concatenatedContent.trim(),
  };
}

/**
 * @description Reads and concatenates the content of all text files within a specified workspace folder.
 * @param {vscode.Uri} workspaceFolderUri - The URI of the workspace folder to process.
 * @returns {Promise<{ fileTree: string, concatenatedContent: string, workspaceName: string } | string>} An object with file tree, content, and workspace name, or an error string.
 * @sideeffect Reads from the file system.
 */
export async function getWorkspaceCodebaseContents(workspaceFolderUri: vscode.Uri): Promise<{ fileTree: string, concatenatedContent: string, workspaceName: string } | string> {
  if (!vscode.workspace.isTrusted) {
    return 'Error: Workspace is not trusted. Cannot access file system.';
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceFolderUri);
  if (!workspaceFolder) {
    return `Error: Workspace folder with URI ${workspaceFolderUri.toString()} not found or not open.`;
  }

  let concatenatedContent = '';

  // Re-using and adapting the recursive traversal logic from getFolderContents
  async function traverseAndProcess(currentUri: vscode.Uri, currentRelativePathPrefix: string): Promise<void> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(currentUri);
      entries.sort((a, b) => {
        if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
        if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
        return a[0].localeCompare(b[0]);
      });

      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(currentUri, name);
        // For codebase content, relative path is from the workspace folder root
        const relativeEntryPath = path.relative(workspaceFolder!.uri.fsPath, entryUri.fsPath).replace(/\\\\/g, '/');

        // TODO: FR-VSCE-005 Integrate full .gitignore parsing
        // Using IGNORE_PATTERNS_DEFAULT for now.
        // Check against both simple name and relative path for patterns like 'dist/' or 'node_modules/'
        let ignore = false;
        for (const pattern of IGNORE_PATTERNS_DEFAULT) {
          if (pattern.endsWith('/') && relativeEntryPath.startsWith(pattern.slice(0, -1))) { // Folder pattern
            ignore = true;
            break;
          } else if (name === pattern || relativeEntryPath === pattern) { // File pattern or exact folder match
            ignore = true;
            break;
          } else if (pattern.startsWith('*') && name.endsWith(pattern.substring(1))) { // Wildcard suffix
            ignore = true;
            break;
          }
        }
        if (ignore) {
          console.log(`[ContextWeaver] Ignoring (default pattern): ${relativeEntryPath}`);
          continue;
        }


        if (type === vscode.FileType.File) {
          const fileContent = await getFileContent(entryUri);
          if (fileContent && !fileContent.startsWith('Error:')) {
            let langId = 'text';
            const ext = path.extname(name);
            if (ext) {
              const langMap: { [key: string]: string } = {
                '.js': 'javascript', '.ts': 'typescript', '.py': 'python',
                '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.cs': 'csharp',
                '.go': 'go', '.rb': 'ruby', '.php': 'php', '.html': 'html',
                '.css': 'css', '.json': 'json', '.xml': 'xml', '.md': 'markdown'
              };
              langId = langMap[ext.toLowerCase()] || 'text';
            }
            concatenatedContent += `file: ${relativeEntryPath}\\n\`\`\`${langId}\\n${fileContent}\\n\`\`\`\\n\\n`;
          }
        } else if (type === vscode.FileType.Directory) {
          // For codebase content, the relative path prefix is built from the workspace root
          // The currentRelativePathPrefix is not directly used here for building the next prefix,
          // as relativeEntryPath already gives the full path relative to workspace root.
          // We pass relativeEntryPath to maintain context if needed for deeper filtering logic,
          // but for IGNORE_PATTERNS_DEFAULT, relativeEntryPath is sufficient.
          await traverseAndProcess(entryUri, relativeEntryPath);
        }
      }
    } catch (error: any) {
      console.error(`[ContextWeaver] Error processing directory ${currentUri.fsPath} for codebase: ${error.message}`);
      // Avoid adding this error to concatenated content for entire codebase, just log it.
    }
  }

  // Start traversal from the root of the workspace folder.
  await traverseAndProcess(workspaceFolder.uri, ''); // Initial relative path prefix is empty for the root
  const fileTree = await generateFileTreeText(workspaceFolder.uri, workspaceFolder.uri, '');

  return {
    fileTree,
    concatenatedContent: concatenatedContent.trim(),
    workspaceName: workspaceFolder.name,
  };
}