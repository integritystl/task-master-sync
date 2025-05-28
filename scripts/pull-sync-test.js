#!/usr/bin/env node

/**
 * Pull Sync Test Script
 * 
 * This script tests the pull sync functionality from Monday.com to TaskMaster.
 * It's useful for checking if the pull sync is working correctly.
 */

// Import required modules
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { createPullSync } = require('../src/sync/pullSyncLogic');
const configParser = require('../src/config/configParser');

console.log(chalk.bold('Monday.com -> TaskMaster Pull Sync Test'));
console.log(chalk.bold('=======================================\n'));

// Load configuration
console.log('Loading configuration...');
const configPath = path.join(__dirname, '..', 'sync-config.json');
let config;

try {
  config = configParser.loadConfig(configPath);
} catch (error) {
  console.error(chalk.red(`Error loading config: ${error.message}`));
  process.exit(1);
}

console.log(`Using Monday.com board ID: ${config.monday_board_id}`);
console.log(`Using group IDs: ${config.monday_group_ids.join(', ') || 'all'}\n`);

// Set up paths
const tasksPath = path.join(__dirname, '..', 'tasks', 'tasks.json');
const syncStatePath = path.join(__dirname, '..', '.taskmaster_sync_state.json');

// Create pull sync instance
const pullSync = createPullSync({
  mondayApiKey: config.monday_api_key,
  mondayBoardId: config.monday_board_id,
  mondayGroupIds: config.monday_group_ids || ['all'],
  tasksFilePath: tasksPath,
  syncFilePath: syncStatePath,
  dryRun: true, // Always use dry run for testing
  assignTaskIds: true // Enable automatic task ID assignment for testing
});

// Run the pull sync
console.log('Starting pull sync test (dry run mode)...');

async function runPullSync() {
  try {
    const results = await pullSync.pullSync({ dryRun: true });
    
    console.log(chalk.green('\nPull sync test completed successfully!'));
    console.log(chalk.bold('\nResults Summary:'));
    console.log(`New tasks found: ${results.newTasks}`);
    console.log(`Tasks with updates: ${results.updatedTasks}`);
    console.log(`Potential conflicts: ${results.conflicts}`);
    
    // Show details for new tasks
    if (results.newTasks > 0) {
      console.log(chalk.bold('\nNew Tasks:'));
      results.newItems.forEach(task => {
        console.log(`- Task ID: ${task.id}, Title: ${task.title}`);
      });
    }
    
    // Show details for updated tasks
    if (results.updatedTasks > 0) {
      console.log(chalk.bold('\nUpdated Tasks:'));
      results.updatedItems.forEach(task => {
        console.log(`- Task ID: ${task.id}, Title: ${task.title}`);
      });
    }
    
    // Show details for conflicts
    if (results.conflicts > 0) {
      console.log(chalk.bold('\nConflicts:'));
      results.conflictItems.forEach(conflict => {
        console.log(`- Task ID: ${conflict.mondayTask.id}, Title: ${conflict.mondayTask.title}`);
      });
    }
    
    console.log(chalk.yellow('\nNote: This was a dry run - no changes were made to tasks.json'));
    console.log(chalk.bold('\n✅ Pull sync is functioning correctly!'));
    
  } catch (error) {
    console.error(chalk.red(`\nError during pull sync: ${error.message}`));
    if (error.stack) {
      console.error(chalk.dim(error.stack));
    }
    process.exit(1);
  }
}

runPullSync(); 