/**
 * Logger utility for TaskMaster-Monday Sync
 * Simple wrapper around console methods with colored output
 */

const chalk = require('chalk');

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
   * Log an informational message
   * @param {string} message - The message to log
   */
  info(message) {
    console.log(chalk.blue(`[INFO] ${message}`));
  }

  /**
   * Log a success message
   * @param {string} message - The message to log
   */
  success(message) {
    console.log(chalk.green(`[SUCCESS] ${message}`));
  }

  /**
   * Log a warning message
   * @param {string} message - The message to log
   */
  warn(message) {
    console.log(chalk.yellow(`[WARNING] ${message}`));
  }

  /**
   * Log an error message
   * @param {string} message - The message to log
   * @param {Error} [error] - Optional error object
   */
  error(message, error) {
    console.error(chalk.red(`[ERROR] ${message}`));
    if (error) {
      console.error(chalk.red(error.stack || error.message || error));
    }
  }

  /**
   * Log a debug message (only in development)
   * @param {string} message - The message to log
   * @param {any} [data] - Optional data to log
   */
  debug(message, data) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(chalk.gray(`[DEBUG] ${message}`));
      if (data !== undefined) {
        console.log(chalk.gray(typeof data === 'object' ? JSON.stringify(data, null, 2) : data));
      }
    }
  }
}

module.exports = {
  Logger: new Logger(),
  LogLevel
}; 