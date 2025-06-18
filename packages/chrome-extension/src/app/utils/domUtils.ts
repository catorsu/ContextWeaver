/**
 * Debounces a function, delaying its execution until after a specified wait time has passed since the last invocation.
 * @param func The function to debounce.
 * @param waitFor The number of milliseconds to wait after the last call before invoking the function.
 * @returns A new debounced function that returns a Promise resolving with the result of the original function.
 */
export function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> =>
        new Promise(resolve => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                // If func returns a Promise, await it before resolving the outer Promise
                Promise.resolve(func(...args)).then(resolve);
            }, waitFor);
        });
}

/**
 * Defines a common structure for items that can be grouped by workspace.
 */
export interface WorkspaceGroupable {
    workspaceFolderUri?: string | null;
    workspaceFolderName?: string | null;
    [key: string]: any;
}

/**
 * Represents a group of workspace items, typically used for displaying search results or files grouped by their workspace.
 */
export interface GroupedWorkspaceItems<T extends WorkspaceGroupable> {
    name: string;
    items: T[];
}

/**
 * Groups a list of items by their associated workspace.
 * @param items An array of items that implement the WorkspaceGroupable interface.
 * @returns A Map where keys are workspace URIs (or 'unknown_workspace') and values are GroupedWorkspaceItems.
 */
export function groupItemsByWorkspace<T extends WorkspaceGroupable>(
    items: T[]
): Map<string, GroupedWorkspaceItems<T>> {
    const grouped = new Map<string, GroupedWorkspaceItems<T>>();
    if (!items || items.length === 0) {
        return grouped;
    }

    for (const item of items) {
        const key = item.workspaceFolderUri || 'unknown_workspace';
        const name = item.workspaceFolderName || (item.workspaceFolderUri ? `Workspace (${item.workspaceFolderUri.substring(item.workspaceFolderUri.lastIndexOf('/') + 1)})` : 'Unknown Workspace');

        if (!grouped.has(key)) {
            grouped.set(key, { name, items: [] });
        }
        grouped.get(key)!.items.push(item);
    }
    return grouped;
}


/**
 * Defines a common structure for items that can be grouped by window.
 */
export interface WindowGroupable {
    windowId?: string;
    [key: string]: any;
}

/**
 * Represents a group of window items, typically used for displaying search results or files grouped by their VS Code window.
 */
export interface GroupedWindowItems<T extends WindowGroupable> {
    name: string;
    items: T[];
}

/**
 * Groups a list of items by their associated VS Code window.
 * @param items An array of items that implement the WindowGroupable interface.
 * @returns A Map where keys are window IDs (or 'unknown_window') and values are GroupedWindowItems.
 */
export function groupItemsByWindow<T extends WindowGroupable>(
    items: T[]
): Map<string, GroupedWindowItems<T>> {
    const grouped = new Map<string, GroupedWindowItems<T>>();
    if (!items || items.length === 0) {
        return grouped;
    }

    for (const item of items) {
        const key = item.windowId || 'unknown_window';
        const name = item.windowId ? `Window: ${item.windowId.substring(0, 8)}` : 'Unknown Window';

        if (!grouped.has(key)) {
            grouped.set(key, { name, items: [] });
        }
        grouped.get(key)!.items.push(item);
    }
    return grouped;
}
