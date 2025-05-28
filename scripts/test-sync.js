/**
 * Manual test script for bidirectional sync between TaskMaster and Monday.com
 * 
 * This script demonstrates both push and pull sync functionality, including the
 * automatic recreation of items deleted in either system.
 */

const path = require('path');
const fs = require('fs');
const { createPushSync } = require('../src/sync/pushSyncLogic');
const { createPullSync } = require('../src/sync/pullSyncLogic');
const { Logger } = require('../src/utils/logger');

// Set logger to debug level
Logger.level = 'debug';

// Configuration
const configPath = path.resolve(__dirname, '../sync-config.json');
const tasksPath = path.resolve(__dirname, '../tasks/tasks.json');
const statePath = path.resolve(__dirname, '../.taskmaster_sync_state.json');

// Load configuration
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Ensure API key is available
const apiKey = config.monday_api_key || process.env.MONDAY_API_KEY;
if (!apiKey) {
  console.error('Error: Monday.com API key is required in config file or MONDAY_API_KEY environment variable');
  process.exit(1);
}

// Ensure config has necessary fields
if (!config.monday_board_id) {
  console.error('Error: Monday.com board ID is required in config file');
  process.exit(1);
}

if (!config.monday_group_ids || !Array.isArray(config.monday_group_ids) || config.monday_group_ids.length === 0) {
  console.error('Error: Monday.com group IDs array is required in config file');
  process.exit(1);
}

// Create sync instances with the tasksPath included in the options
const pushSync = createPushSync(config, {
  mondayApiKey: apiKey,
  dryRun: false,
  tasksPath: tasksPath,
  mondayBoardId: config.monday_board_id,
  mondayGroupIds: config.monday_group_ids,
  columnMappings: config.column_mappings
});

const pullSync = createPullSync(config, {
  mondayApiKey: apiKey,
  dryRun: false,
  syncFilePath: statePath,
  tasksFilePath: tasksPath,
  mondayBoardId: config.monday_board_id,
  mondayGroupIds: config.monday_group_ids,
  columnMappings: config.column_mappings
});

// Test functions
async function testPushSync() {
  console.log('\n===== Testing Push Sync (TaskMaster → Monday) =====\n');
  
  // Read current tasks
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  console.log(`Found ${tasks.tasks.length} tasks to sync`);
  
  // Pick a task to test with
  const testTask = tasks.tasks.find(t => t.id === 7);
  if (testTask) {
    console.log(`Using task ${testTask.id} (${testTask.title}) for testing`);
    console.log(`Monday item ID: ${testTask.monday_item_id || 'Not yet synced'}`);
  }

  // Run push sync - pass the options object rather than the tasksPath directly
  console.log('\nRunning push sync...');
  const results = await pushSync.pushSync({
    dryRun: false,
    deleteOrphaned: true,
    tasksPath: tasksPath
  });
  
  console.log('\nPush sync results:');
  console.log(`- Created: ${results.created.length}`);
  console.log(`- Updated: ${results.updated.length}`);
  console.log(`- Recreated: ${results.recreated.length}`);
  console.log(`- Deleted: ${results.deleted.length}`);
  console.log(`- Errors: ${results.errors.length}`);
  
  return results;
}

async function testPullSync() {
  console.log('\n===== Testing Pull Sync (Monday → TaskMaster) =====\n');
  
  // Run pull sync with standard settings
  console.log('Running pull sync...');
  const results = await pullSync.pullSync({
    dryRun: false,
    forceOverwrite: false,
    skipConflicts: false,
    regenerateTaskFiles: true,
    removeOrphaned: true,
    recreateMissingTasks: true,
    tasksFilePath: tasksPath
  });
  
  console.log('\nPull sync results:');
  console.log(`- New tasks: ${results.newTasks}`);
  console.log(`- Updated tasks: ${results.updatedTasks}`);
  console.log(`- Recreated tasks: ${results.recreated}`);
  console.log(`- Orphaned tasks: ${results.orphanedTasks}`);
  console.log(`- Conflicts: ${results.conflicts}`);
  
  return results;
}

// Run the tests
async function runTests() {
  try {
    // Test push sync
    await testPushSync();
    
    // Test pull sync
    await testPullSync();
    
    console.log('\n===== All tests completed =====\n');
  } catch (error) {
    console.error(`Error running tests: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests
runTests(); 