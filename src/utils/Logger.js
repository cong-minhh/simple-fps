// Logger.js - Configurable logging utility
// Replaces console.log with level-based logging that can be disabled in production

/**
 * Log levels
 */
export const LOG_LEVELS = {
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
};

/**
 * Detect if we're in production mode
 */
const IS_PRODUCTION = typeof process !== 'undefined'
    ? process.env.NODE_ENV === 'production'
    : window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');

/**
 * Logger singleton with configurable log level
 */
class LoggerClass {
    constructor() {
        // Default: show everything in dev, only errors in production
        this.level = IS_PRODUCTION ? LOG_LEVELS.ERROR : LOG_LEVELS.DEBUG;
        this.prefix = '[FPS]';
    }

    /**
     * Set the logging level
     * @param {number} level - One of LOG_LEVELS values
     */
    setLevel(level) {
        this.level = level;
    }

    /**
     * Set the prefix for all log messages
     * @param {string} prefix
     */
    setPrefix(prefix) {
        this.prefix = prefix;
    }

    /**
     * Format message with timestamp and prefix
     */
    _format(...args) {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
        return [`${this.prefix} [${timestamp}]`, ...args];
    }

    /**
     * Debug level logging - verbose information
     */
    debug(...args) {
        if (this.level >= LOG_LEVELS.DEBUG) {
            console.log(...this._format(...args));
        }
    }

    /**
     * Info level logging - general information
     */
    info(...args) {
        if (this.level >= LOG_LEVELS.INFO) {
            console.info(...this._format(...args));
        }
    }

    /**
     * Warning level logging - potential issues
     */
    warn(...args) {
        if (this.level >= LOG_LEVELS.WARN) {
            console.warn(...this._format(...args));
        }
    }

    /**
     * Error level logging - errors and failures
     */
    error(...args) {
        if (this.level >= LOG_LEVELS.ERROR) {
            console.error(...this._format(...args));
        }
    }

    /**
     * Always log regardless of level (for critical messages)
     */
    critical(...args) {
        console.error(...this._format('CRITICAL:', ...args));
    }

    /**
     * Group related logs
     */
    group(label) {
        if (this.level >= LOG_LEVELS.DEBUG) {
            console.group(`${this.prefix} ${label}`);
        }
    }

    groupEnd() {
        if (this.level >= LOG_LEVELS.DEBUG) {
            console.groupEnd();
        }
    }

    /**
     * Time a function execution
     */
    time(label) {
        if (this.level >= LOG_LEVELS.DEBUG) {
            console.time(`${this.prefix} ${label}`);
        }
    }

    timeEnd(label) {
        if (this.level >= LOG_LEVELS.DEBUG) {
            console.timeEnd(`${this.prefix} ${label}`);
        }
    }
}

// Export singleton instance
export const Logger = new LoggerClass();

// Also export the class for testing or custom instances
export { LoggerClass };
