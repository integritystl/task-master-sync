/**
 * Test script for bidirectional recreation of deleted items
 * 
 * This script demonstrates:
 * 1. Push Sync: Recreation of Monday items that were deleted but still exist in local tasks
 * 2. Pull Sync: Recreation of local tasks that exist in Monday but were deleted locally
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

// Create test tasks to work with
const testTasks = {
  tasks: [
    {
      id: 101,
      title: "Test Task for Recreation",
      description: "This is a test task to demonstrate recreation functionality",
      status: "pending",
      priority: "high",
      details: "This task will be used to test recreation when an item is deleted in Monday",
      testStrategy: "Verify that the task is correctly recreated in Monday when its Monday item is deleted",
      dependencies: []
    },
    {
      id: 102,
      title: "Another Test Task",
      description: "This is another test task for demonstration",
      status: "pending",
      priority: "medium",
      details: "This task will be used to test recreation when a task is deleted locally",
      testStrategy: "Verify that the task is correctly recreated locally when deleted from tasks.json",
      dependencies: []
    }
  ]
};

// Load configuration
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Ensure API key is available
const apiKey = config.monday_api_key || process.env.MONDAY_API_KEY;
if (!apiKey) {
  console.error('Error: Monday.com API key is required in config file or MONDAY_API_KEY environment variable');
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
async function initializeTestData() {
  console.log('\n===== Initializing Test Data =====\n');
  
  // Write test tasks to tasks.json
  console.log(`Writing ${testTasks.tasks.length} test tasks to ${tasksPath}`);
  fs.writeFileSync(tasksPath, JSON.stringify(testTasks, null, 2));
  
  // Run push sync to create Monday items for the test tasks
  console.log('\nRunning initial push sync to create Monday items...');
  const pushResults = await pushSync.pushSync({
    dryRun: false,
    deleteOrphaned: true,
    tasksPath: tasksPath
  });
  
  console.log('\nInitial push sync results:');
  console.log(`- Created: ${pushResults.created.length}`);
  console.log(`- Updated: ${pushResults.updated.length}`);
  console.log(`- Recreated: ${pushResults.recreated.length}`);
  console.log(`- Deleted: ${pushResults.deleted.length}`);
  console.log(`- Errors: ${pushResults.errors.length}`);
  
  return pushResults;
}

async function testPushSyncRecreation() {
  console.log('\n===== Testing Push Sync Recreation (Monday Item Deleted) =====\n');
  
  // Read current tasks
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  
  // Find a task with a Monday item ID
  const testTask = tasks.tasks.find(t => t.monday_item_id);
  if (!testTask) {
    console.log('No tasks with Monday item IDs found. Run a standard push sync first.');
    return;
  }
  
  console.log(`Found task ${testTask.id} (${testTask.title}) with Monday item ID ${testTask.monday_item_id}`);
  
  // Simulate deletion of Monday item by manually updating the task's Monday item ID
  // We're not actually deleting the item, but when push sync runs, it will check if the item exists
  // and automatically recreate it if it doesn't
  console.log(`\nSimulating deletion of Monday item ${testTask.monday_item_id}...`);
  console.log('Changing the task\'s Monday item ID to an invalid value.');
  
  const oldMondayItemId = testTask.monday_item_id;
  const invalidMondayItemId = 'deleted-' + Date.now();
  
  // Update the task's Monday item ID
  const taskIndex = tasks.tasks.findIndex(t => t.id === testTask.id);
  tasks.tasks[taskIndex].monday_item_id = invalidMondayItemId;
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
  
  console.log(`Updated task ${testTask.id} Monday item ID to: ${invalidMondayItemId}`);
  
  // Run push sync, which should detect the invalid ID and recreate the item
  console.log('\nRunning push sync, which should detect the invalid ID and recreate the item...');
  const pushResults = await pushSync.pushSync({
    dryRun: false,
    deleteOrphaned: true,
    tasksPath: tasksPath
  });
  
  console.log('\nPush sync results:');
  console.log(`- Created: ${pushResults.created.length}`);
  console.log(`- Updated: ${pushResults.updated.length}`);
  console.log(`- Recreated: ${pushResults.recreated.length}`);
  console.log(`- Deleted: ${pushResults.deleted.length}`);
  console.log(`- Errors: ${pushResults.errors.length}`);
  
  // Check if the item was recreated
  if (pushResults.recreated.length > 0) {
    const recreatedItem = pushResults.recreated.find(item => item.taskId === testTask.id);
    if (recreatedItem) {
      console.log(`\nSuccess! Monday item was recreated:`);
      console.log(`- Task ID: ${recreatedItem.taskId}`);
      console.log(`- Old Monday Item ID: ${recreatedItem.oldMondayItemId}`);
      console.log(`- New Monday Item ID: ${recreatedItem.newMondayItemId}`);
    }
  }
  
  return pushResults;
}

async function testPullSyncRecreation() {
  console.log('\n===== Testing Pull Sync Recreation (Local Task Deleted) =====\n');
  
  // Read current tasks
  let tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  const originalTaskCount = tasks.tasks.length;
  
  // Find a task with a Monday item ID to delete locally
  const testTask = tasks.tasks.find(t => t.monday_item_id);
  if (!testTask) {
    console.log('No tasks with Monday item IDs found. Run a standard push sync first.');
    return;
  }
  
  console.log(`Found task ${testTask.id} (${testTask.title}) with Monday item ID ${testTask.monday_item_id}`);
  
  // Backup the task for later verification
  const deletedTask = { ...testTask };
  
  // Delete the task locally
  console.log(`\nDeleting task ${testTask.id} locally...`);
  tasks.tasks = tasks.tasks.filter(t => t.id !== testTask.id);
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
  
  // Verify task was deleted
  tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  console.log(`Tasks before: ${originalTaskCount}, Tasks after: ${tasks.tasks.length}`);
  
  // Run pull sync, which should detect the missing task and recreate it
  console.log('\nRunning pull sync, which should detect the missing task and recreate it...');
  const pullResults = await pullSync.pullSync({
    dryRun: false,
    forceOverwrite: false,
    skipConflicts: false,
    regenerateTaskFiles: true,
    removeOrphaned: true,
    recreateMissingTasks: true,
    tasksFilePath: tasksPath
  });
  
  console.log('\nPull sync results:');
  console.log(`- New tasks: ${pullResults.newTasks}`);
  console.log(`- Updated tasks: ${pullResults.updatedTasks}`);
  console.log(`- Recreated tasks: ${pullResults.recreated}`);
  console.log(`- Orphaned tasks: ${pullResults.orphanedTasks}`);
  console.log(`- Conflicts: ${pullResults.conflicts}`);
  
  // Verify the task was recreated
  if (pullResults.recreated > 0) {
    const recreatedItems = pullResults.recreatedItems || [];
    const recreatedItem = recreatedItems.find(item => String(item.id) === String(deletedTask.id));
    
    if (recreatedItem) {
      console.log(`\nSuccess! Task was recreated:`);
      console.log(`- Task ID: ${recreatedItem.id}`);
      console.log(`- Title: ${recreatedItem.title}`);
      console.log(`- Monday Item ID: ${recreatedItem.monday_item_id}`);
    } else {
      console.log('\nTask was not recreated. Check the recreated items:');
      console.log(recreatedItems);
    }
  } else {
    console.log('\nNo tasks were recreated. Pull sync did not detect the missing task.');
  }
  
  return pullResults;
}

// Run the tests
async function runTests() {
  try {
    // Initialize test data
    await initializeTestData();
    
    // Test push sync recreation
    await testPushSyncRecreation();
    
    // Test pull sync recreation
    await testPullSyncRecreation();
    
    console.log('\n===== All recreation tests completed =====\n');
  } catch (error) {
    console.error(`Error running tests: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests
runTests(); 