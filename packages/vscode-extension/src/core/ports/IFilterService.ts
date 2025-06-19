/**
 * @file IFilterService.ts
 * @description Interface for filtering services that handle ignore patterns and workspace filtering.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { Ignore } from 'ignore';
import { FilterType } from '@contextweaver/shared';

/**
 * Service interface for creating and managing file filters for workspaces.
 * Provides functionality to create ignore filters based on .gitignore and default patterns.
 */
export interface IFilterService {
  /**
   * Creates a filter for the specified workspace folder.
   * Combines default ignore patterns with .gitignore rules if present.
   * @param workspaceFolder - The workspace folder to create filter for.
   * @returns A Promise resolving to an object containing the ignore filter and the filter type applied.
   */
  createFilterForWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<{ filter: Ignore; type: FilterType }>;
}