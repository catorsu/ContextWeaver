/**
 * @file ceLogger.ts
 * @description Browser console logger implementation for the Chrome Extension.
 * @module ContextWeaver/CE
 */

import { ILoggerOutput, LogLevel } from '@contextweaver/shared';

/**
 * A logger output implementation that writes to the browser console.
 */
export class BrowserConsoleLogger implements ILoggerOutput {
    public log(level: LogLevel, message: string): void {
        switch (level) {
            case LogLevel.ERROR:
                console.error(message);
                break;
            case LogLevel.WARN:
                console.warn(message);
                break;
            case LogLevel.INFO:
                console.info(message);
                break;
            case LogLevel.DEBUG:
                console.log(message);
                break;
            case LogLevel.TRACE:
                console.trace(message);
                break;
        }
    }
}