/**
 * Configuration parser for TaskMaster-Monday Sync
 * Loads and validates the sync-config.json file
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const env = require('./env');
const { Logger } = require('../utils/logger');

const readFileAsync = promisify(fs.readFile);
const existsAsync = promisify(fs.exists);

// Default column mappings for Monday.com
const DEFAULT_COLUMN_MAPPINGS = {
  taskId: 'text_mkraj7jy',
  status: 'color_mkrat92y',
  priority: 'color_mkrav3bj',
  dependencies: 'text_mkra1chv',
  complexity: 'color_mkrar5f7',
  description: 'long_text_mkrby17a',
  details: 'long_text_mkrbszdp',
  testStrategy: 'long_text_mkrbazct'
};

// Default status mappings (TaskMaster status → Monday.com status)
const DEFAULT_STATUS_MAPPINGS = {
  'pending': 'pending',
  'in-progress': 'in-progress',
  'done': 'done',
};

// Default priority mappings (TaskMaster priority → Monday.com priority)
const DEFAULT_PRIORITY_MAPPINGS = {
  'high': 'high',
  'medium': 'medium',
  'low': 'low'
};

/**
 * Load and validate the configuration from sync-config.json
 * @returns {Object} The validated configuration object
 * @throws {Error} If the configuration is invalid or cannot be loaded
 */
async function loadConfigAsync() {
  try {
    const configPath = path.join(process.cwd(), 'sync-config.json');
    
    // Check if the file exists
    const exists = await existsAsync(configPath);
    if (!exists) {
      Logger.warn(`Configuration file not found at ${configPath}. Using environment variables as fallback.`);
      return buildConfigFromEnv();
    }
    
    // Read and parse the file
    const configData = await readFileAsync(configPath, 'utf8');
    let config;
    
    try {
      config = JSON.parse(configData);
    } catch (error) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    
    // Apply fallbacks from environment variables
    config = applyEnvFallbacks(config);
    
    // Apply default mappings
    config = applyDefaultMappings(config);
    
    // Validate required fields
    validateConfig(config);
    
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      Logger.warn('Configuration file not found. Using environment variables as fallback.');
      return buildConfigFromEnv();
    } else if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Synchronous version of loadConfigAsync for cases where async is not suitable
 * @returns {Object} The validated configuration object
 * @throws {Error} If the configuration is invalid or cannot be loaded
 */
function loadConfig() {
  try {
    const configPath = path.join(process.cwd(), 'sync-config.json');
    
    // Check if the file exists
    if (!fs.existsSync(configPath)) {
      Logger.warn(`Configuration file not found at ${configPath}. Using environment variables as fallback.`);
      return buildConfigFromEnv();
    }
    
    // Read and parse the file
    const configData = fs.readFileSync(configPath, 'utf8');
    let config;
    
    try {
      config = JSON.parse(configData);
    } catch (error) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    
    // Apply fallbacks from environment variables
    config = applyEnvFallbacks(config);
    
    // Apply default mappings
    config = applyDefaultMappings(config);
    
    // Validate required fields
    validateConfig(config);
    
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      Logger.warn('Configuration file not found. Using environment variables as fallback.');
      return buildConfigFromEnv();
    } else if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Apply environment variable fallbacks to configuration
 * @param {Object} config - The configuration object from the file
 * @returns {Object} The configuration with fallbacks applied
 */
function applyEnvFallbacks(config) {
  return {
    ...config,
    monday_api_key: config.monday_api_key || env.MONDAY_API_KEY
  };
}

/**
 * Apply default mappings for column IDs and status/priority values
 * @param {Object} config - The configuration object
 * @returns {Object} The configuration with default mappings applied
 */
function applyDefaultMappings(config) {
  return {
    ...config,
    column_mappings: {
      ...DEFAULT_COLUMN_MAPPINGS,
      ...(config.column_mappings || {})
    },
    status_mappings: {
      ...DEFAULT_STATUS_MAPPINGS,
      ...(config.status_mappings || {})
    },
    priority_mappings: {
      ...DEFAULT_PRIORITY_MAPPINGS,
      ...(config.priority_mappings || {})
    }
  };
}

/**
 * Build a configuration object from environment variables
 * @returns {Object} The configuration object
 */
function buildConfigFromEnv() {
  return {
    monday_board_id: env.MONDAY_BOARD_ID,
    monday_group_ids: env.MONDAY_GROUP_IDS ? JSON.parse(env.MONDAY_GROUP_IDS) : [],
    monday_api_key: env.MONDAY_API_KEY,
    developer_id: env.DEVELOPER_ID || 'env-default',
    column_mappings: DEFAULT_COLUMN_MAPPINGS,
    status_mappings: DEFAULT_STATUS_MAPPINGS,
    priority_mappings: DEFAULT_PRIORITY_MAPPINGS
  };
}

/**
 * Validate that the configuration has all required fields
 * @param {Object} config - The configuration object to validate
 * @throws {Error} If any required field is missing or invalid
 */
function validateConfig(config) {
  if (!config.monday_board_id) {
    throw new Error('monday_board_id is required in the configuration');
  }
  
  if (!Array.isArray(config.monday_group_ids) || config.monday_group_ids.length === 0) {
    throw new Error('monday_group_ids must be a non-empty array in the configuration');
  }
  
  if (!config.monday_api_key) {
    throw new Error('monday_api_key is required in the configuration');
  }
  
  if (!config.developer_id) {
    throw new Error('developer_id is required in the configuration');
  }
  
  // No validation for mappings as defaults are applied
}

module.exports = {
  loadConfig,
  loadConfigAsync,
  validateConfig,
  applyEnvFallbacks,
  buildConfigFromEnv,
  DEFAULT_COLUMN_MAPPINGS,
  DEFAULT_STATUS_MAPPINGS,
  DEFAULT_PRIORITY_MAPPINGS
}; 