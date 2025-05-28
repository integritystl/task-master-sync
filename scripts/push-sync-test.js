#!/usr/bin/env node

/**
 * Push Sync Test Script
 * 
 * This script demonstrates the one-way push sync functionality
 * from TaskMaster AI tasks to Monday.com.
 */

const { loadConfig } = require('../src/config/configParser');
const { createPushSync } = require('../src/sync/pushSyncLogic');
const { Logger } = require('../src/utils/logger');

// Configure Logger to output to console
Logger.info = console.log;
Logger.warn = console.warn;
Logger.error = console.error;
Logger.debug = console.debug;

/**
 * Runs the push sync test
 */
async function runPushSyncTest() {
  try {
    console.log('TaskMaster -> Monday.com Push Sync Test');
    console.log('=======================================');
    
    // Load config from sync-config.json
    console.log('\nLoading configuration...');
    const config = loadConfig('./sync-config.json');
    
    // Check for required config
    if (!config.monday_api_key) {
      throw new Error('Monday.com API key is missing from sync-config.json');
    }
    
    if (!config.monday_board_id) {
      throw new Error('Monday.com board ID is missing from sync-config.json');
    }
    
    if (!config.monday_group_ids || !Array.isArray(config.monday_group_ids) || config.monday_group_ids.length === 0) {
      console.warn('No Monday.com group IDs configured. Using default "things_to_do" group.');
      config.monday_group_ids = ['things_to_do'];
    }
    
    console.log(`Using Monday.com board ID: ${config.monday_board_id}`);
    console.log(`Using group IDs: ${config.monday_group_ids.join(', ')}`);
    
    // Parse command line args
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    
    if (dryRun) {
      console.log('\n⚠️ DRY RUN MODE - No changes will be made to Monday.com ⚠️');
    }
    
    // Create push sync instance
    const pushSync = createPushSync({
      mondayApiKey: config.monday_api_key,
      mondayBoardId: config.monday_board_id,
      mondayGroupIds: config.monday_group_ids,
      dryRun: dryRun,
      tasksFilePath: 'tasks/tasks.json',
      // Optional column mappings
      columnMappings: config.column_mappings || {}
    });
    
    // Run the sync
    console.log('\nStarting push sync...');
    const results = await pushSync.pushSync('tasks/tasks.json', { dryRun });
    
    // Display results
    console.log('\nSync completed successfully!');
    console.log(`Tasks created: ${results.created.length}`);
    console.log(`Tasks updated: ${results.updated.length}`);
    console.log(`Tasks failed: ${results.errors.length}`);
    
    if (dryRun) {
      console.log('\n⚠️ This was a dry run. No changes were made to Monday.com.');
      console.log('Run without --dry-run to perform actual changes.');
    } else if (results.created.length > 0 || results.updated.length > 0) {
      console.log('\n✅ Successfully synced TaskMaster tasks to Monday.com!');
      console.log(`Check your Monday.com board: https://monday.com/boards/${config.monday_board_id}`);
    } else {
      console.log('\n⚠️ No tasks were created or updated.');
    }
  } catch (error) {
    console.error('\n❌ Error running push sync:');
    console.error(error.message);
    process.exit(1);
  }
}

// Run the script
runPushSyncTest(); 