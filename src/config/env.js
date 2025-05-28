/**
 * Environment configuration for TaskMaster-Monday Sync
 * Loads environment variables from .env file
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(process.cwd(), '.env') });

/**
 * Environment variables
 * @type {Object}
 */
const env = {
  // Monday.com configuration
  MONDAY_API_KEY: process.env.MONDAY_API_KEY,
  MONDAY_BOARD_ID: process.env.MONDAY_BOARD_ID,
  MONDAY_GROUP_IDS: process.env.MONDAY_GROUP_IDS, // JSON string array
  DEVELOPER_ID: process.env.DEVELOPER_ID,
  
  // Environment (development, production)
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Log level (debug, info, warn, error)
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

module.exports = env; 