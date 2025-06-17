/**
 * @file logger.ts
 * @description A simple, centralized, level-based logger for the ContextWeaver project.
 * @module ContextWeaver/Shared
 */

/**
 * Defines the available logging levels.
 * The levels are ordered by verbosity, from least to most verbose.
 */
export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4,
}

/**
 * Defines the contract for a logger output sink.
 * This allows different environments (VSCE vs. CE) to implement their own logging mechanisms.
 */
export interface ILoggerOutput {
    log(level: LogLevel, message: string): void;
}

/**
 * A default console logger output that writes to the standard console.
 * This can be used in environments where a simple console log is sufficient.
 */
class ConsoleLoggerOutput implements ILoggerOutput {
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
                // console.debug is often hidden by default, so using .log is more reliable for development.
                console.log(message);
                break;
            case LogLevel.TRACE:
                // console.trace adds a stack trace, which is useful.
                console.trace(message);
                break;
        }
    }
}

/**
 * A simple, centralized, level-based logger.
 */
export class Logger {
    private static _level: LogLevel = LogLevel.INFO;
    private static _output: ILoggerOutput = new ConsoleLoggerOutput();

    private readonly componentName: string;

    /**
     * Creates a new logger instance for a specific component.
     * @param componentName The name of the component, which will be included in log messages.
     */
    constructor(componentName: string) {
        this.componentName = componentName;
    }

    /**
     * Sets the global minimum log level.
     * Messages with a level lower than this will not be logged.
     * @param level The minimum log level to display.
     */
    public static setLevel(level: LogLevel): void {
        Logger._level = level;
    }

    /**
     * Sets the global output sink for all loggers.
     * @param output An object that implements the ILoggerOutput interface.
     */
    public static setOutput(output: ILoggerOutput): void {
        Logger._output = output;
    }

    /**
     * Formats the log message with a timestamp, level, and component name.
     * @param level The log level of the message.
     * @param message The main log message content.
     * @param args Optional additional arguments to log.
     * @returns The formatted log string.
     */
    private format(level: LogLevel, message: string, args: unknown[]): string {
        const timestamp = new Date().toISOString();
        const levelStr = LogLevel[level].padEnd(5, ' ');
        let formattedMessage = `[${timestamp}] [${levelStr}] [${this.componentName}] ${message}`;

        if (args.length > 0) {
            const formattedArgs = args.map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                    try {
                        // Use a replacer to handle circular references gracefully
                        return JSON.stringify(arg, this.getCircularReplacer());
                    } catch (e) {
                        return '[Unserializable Object]';
                    }
                }
                return String(arg);
            }).join(' ');
            formattedMessage += ` | ${formattedArgs}`;
        }

        return formattedMessage;
    }

    /**
     * Creates a replacer function for JSON.stringify to handle circular references.
     */
    private getCircularReplacer = () => {
        const seen = new WeakSet();
        return (_key: string, value: any) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                    return "[Circular Reference]";
                }
                seen.add(value);
            }
            return value;
        };
    };

    /**
     * Logs a message at the specified level.
     * @param level The log level.
     * @param message The message to log.
     * @param args Optional additional data to log.
     */
    private log(level: LogLevel, message: string, ...args: unknown[]): void {
        if (level <= Logger._level) {
            const formattedMessage = this.format(level, message, args);
            Logger._output.log(level, formattedMessage);
        }
    }

    /** Logs a TRACE level message. For highly detailed, verbose logging. */
    public trace(message: string, ...args: unknown[]): void {
        this.log(LogLevel.TRACE, message, ...args);
    }

    /** Logs a DEBUG level message. For development-time debugging. */
    public debug(message: string, ...args: unknown[]): void {
        this.log(LogLevel.DEBUG, message, ...args);
    }

    /** Logs an INFO level message. For major lifecycle events and operations. */
    public info(message: string, ...args: unknown[]): void {
        this.log(LogLevel.INFO, message, ...args);
    }

    /** Logs a WARN level message. For non-critical issues or potential problems. */
    public warn(message: string, ...args: unknown[]): void {
        this.log(LogLevel.WARN, message, ...args);
    }

    /** Logs an ERROR level message. For exceptions and critical failures. */
    public error(message: string, ...args: unknown[]): void {
        this.log(LogLevel.ERROR, message, ...args);
    }
}
