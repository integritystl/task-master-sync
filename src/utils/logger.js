/**
 * Logger utility for TaskMaster-Monday Sync
 * Simple wrapper around console methods with colored output
 */

let chalk;
let chalkPromise;

// Lazy load chalk using dynamic import
const getChalk = () => {
  if (!chalkPromise) {
    chalkPromise = (async () => {
      try {
        chalk = (await import('chalk')).default;
        return chalk;
        // eslint-disable-next-line no-unused-vars
      } catch (error) {
        console.warn('[LOGGER] Could not load chalk for colored output, falling back to plain text');
        // Return a mock chalk object with identity functions
        return {
          blue: (text) => text,
          green: (text) => text,
          yellow: (text) => text,
          red: (text) => text,
          gray: (text) => text
        };
      }
    })();
  }
  return chalkPromise;
};

// Synchronous fallback colors using ANSI codes
const colors = {
  blue: (text) => chalk ? chalk.blue(text) : `\x1b[34m${text}\x1b[0m`,
  green: (text) => chalk ? chalk.green(text) : `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => chalk ? chalk.yellow(text) : `\x1b[33m${text}\x1b[0m`,
  red: (text) => chalk ? chalk.red(text) : `\x1b[31m${text}\x1b[0m`,
  gray: (text) => chalk ? chalk.gray(text) : `\x1b[90m${text}\x1b[0m`
};

/**
 * Log levels
 * @enum {string}
 */
const LogLevel = {
  INFO: 'info',
  SUCCESS: 'success',
  WARN: 'warn',
  ERROR: 'error',
  DEBUG: 'debug'
};

/**
 * Simple logger with colored output
 */
class Logger {
  /**
   * Log an informational message (synchronous)
   * @param {string} message - The message to log
   */
  info(message) {
    console.log(colors.blue(`[INFO] ${message}`));
  }

  /**
   * Log an informational message (asynchronous with full chalk support)
   * @param {string} message - The message to log
   */
  async infoAsync(message) {
    const chalkInstance = await getChalk();
    console.log(chalkInstance.blue(`[INFO] ${message}`));
  }

  /**
   * Log a success message (synchronous)
   * @param {string} message - The message to log
   */
  success(message) {
    console.log(colors.green(`[SUCCESS] ${message}`));
  }

  /**
   * Log a success message (asynchronous with full chalk support)
   * @param {string} message - The message to log
   */
  async successAsync(message) {
    const chalkInstance = await getChalk();
    console.log(chalkInstance.green(`[SUCCESS] ${message}`));
  }

  /**
   * Log a warning message (synchronous)
   * @param {string} message - The message to log
   */
  warn(message) {
    console.log(colors.yellow(`[WARNING] ${message}`));
  }

  /**
   * Log a warning message (asynchronous with full chalk support)
   * @param {string} message - The message to log
   */
  async warnAsync(message) {
    const chalkInstance = await getChalk();
    console.log(chalkInstance.yellow(`[WARNING] ${message}`));
  }

  /**
   * Log an error message (synchronous)
   * @param {string} message - The message to log
   * @param {Error} [error] - Optional error object
   */
  error(message, error) {
    console.error(colors.red(`[ERROR] ${message}`));
    if (error) {
      console.error(colors.red(error.stack || error.message || error));
    }
  }

  /**
   * Log an error message (asynchronous with full chalk support)
   * @param {string} message - The message to log
   * @param {Error} [error] - Optional error object
   */
  async errorAsync(message, error) {
    const chalkInstance = await getChalk();
    console.error(chalkInstance.red(`[ERROR] ${message}`));
    if (error) {
      console.error(chalkInstance.red(error.stack || error.message || error));
    }
  }

  /**
   * Log a debug message (synchronous, only in development)
   * @param {string} message - The message to log
   * @param {any} [data] - Optional data to log
   */
  debug(message, data) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(colors.gray(`[DEBUG] ${message}`));
      if (data !== undefined) {
        console.log(colors.gray(typeof data === 'object' ? JSON.stringify(data, null, 2) : data));
      }
    }
  }

  /**
   * Log a debug message (asynchronous with full chalk support, only in development)
   * @param {string} message - The message to log
   * @param {any} [data] - Optional data to log
   */
  async debugAsync(message, data) {
    if (process.env.NODE_ENV !== 'production') {
      const chalkInstance = await getChalk();
      console.log(chalkInstance.gray(`[DEBUG] ${message}`));
      if (data !== undefined) {
        console.log(chalkInstance.gray(typeof data === 'object' ? JSON.stringify(data, null, 2) : data));
      }
    }
  }
}

module.exports = {
  Logger: new Logger(),
  LogLevel
}; 