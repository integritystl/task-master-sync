#!/usr/bin/env node

/**
 * TaskMaster-Monday Sync
 * Main entry point for the synchronization tool
 */

// This file will primarily be used to export the main modules
// The actual CLI implementation is in ./cli/index.js

const { loadConfig } = require('./config/configParser');
const taskMasterIO = require('./sync/taskMasterIO');
const mondayClient = require('./api/mondayClient');
const syncStateManager = require('./sync/syncStateManager');
const { createPushSync } = require('./sync/pushSyncLogic');
const { createPullSync } = require('./sync/pullSyncLogic');
const { resolveTaskIdFromMondayItem } = require('./sync/taskIdResolver');
const logger = require('./utils/logger');

/**
 * Core functionality for programmatic usage
 */
const taskmasterMondaySync = {
  // Configuration
  loadConfig,
  
  // Core clients
  taskMasterIO,
  mondayClient,
  syncStateManager,
  
  // Sync logic
  push: {
    createPushSync,
    runPushSync: async (options = {}) => {
      const config = options.config ? loadConfig(options.config) : loadConfig();
      const pushSync = createPushSync(config, options);
      return pushSync.execute();
    }
  },
  
  pull: {
    createPullSync,
    runPullSync: async (options = {}) => {
      const config = options.config ? loadConfig(options.config) : loadConfig();
      const pullSync = createPullSync(config, options);
      return pullSync.execute();
    },
    resolveTaskIdFromMondayItem
  },
  
  // Utilities
  logger
};

module.exports = taskmasterMondaySync; 