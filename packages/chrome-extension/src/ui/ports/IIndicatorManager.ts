/**
 * @file IIndicatorManager.ts
 * @description Interface for managing context indicators in the Chrome extension UI.
 * @module ContextWeaver/CE
 */

import { ContextBlockMetadata } from '@contextweaver/shared';

/**
 * Interface for managing context indicators that show active context blocks.
 * Handles rendering of indicators and setting up user interaction callbacks.
 */
export interface IIndicatorManager {
  /**
   * Sets the callback functions to be invoked when context indicators are interacted with.
   * @param onRemove The callback function that receives the unique block ID and block type of the indicator to be removed.
   * @param onClick The callback function that receives the unique block ID and label when an indicator is clicked.
   */
  setIndicatorCallbacks(
    onRemove: (uniqueBlockId: string, blockType: string) => void,
    onClick: (uniqueBlockId: string, label: string) => void
  ): void;

  /**
   * Renders or updates the context indicators above the target input element.
   * Each indicator represents an active context block (e.g., an inserted file).
   * @param activeContextBlocks A readonly array of ContextBlockMetadata objects for the active context blocks.
   * @param targetInputElement The HTML element (textarea or contenteditable) above which the indicators should be rendered.
   */
  renderContextIndicators(
    activeContextBlocks: Readonly<ContextBlockMetadata[]>,
    targetInputElement: HTMLElement | null
  ): void;
}