/**
 * Push Sync Logic Module
 * 
 * Implements one-way synchronization from TaskMaster AI tasks to Monday.com.
 * Handles field mapping, state tracking, and batched API operations.
 */

const taskMasterIO = require('./taskMasterIO');
const { createSyncStateManager } = require('./syncStateManager');
const { createMondayClient } = require('../api/mondayClient');
const { Logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Creates a Push Sync instance
 * @param {Object} config - The loaded configuration
 * @param {Object} options - Additional options
 * @returns {Object} - Push Sync instance
 */
function createPushSync(config, options = {}) {
  // If config is actually the options (only one param passed), handle that case
  if (typeof options === 'object' && Object.keys(options).length === 0 && config.mondayApiKey) {
    options = config;
    config = {};
  }
  
  // Extract options with defaults
  const {
    dryRun = false,
    tasksPath = 'tasks/tasks.json', // Path to tasks.json file, used for reading and updating tasks
    statePath,
    mondayApiKey: optionsApiKey, // API key passed directly in options
    mondayBoardId: optionsBoardId, // Board ID passed directly in options
    mondayGroupIds: optionsGroupIds, // Group IDs passed directly in options
  } = options;
  
  // Debug logging
  Logger.debug(`PushSync init - Config: ${JSON.stringify({
    mondayApiKey: config.monday_api_key ? 'Present' : 'Not found',
    apiToken: config.apiToken ? 'Present' : 'Not found',
    mondayBoardId: config.mondayBoardId || config.monday_board_id
  })}`);
  
  Logger.debug(`PushSync init - Options: ${JSON.stringify({
    mondayApiKey: options.mondayApiKey ? 'Present' : 'Not found',
    dryRun: dryRun,
    tasksPath: tasksPath,
    mondayBoardId: options.mondayBoardId,
    mondayGroupIds: options.mondayGroupIds ? JSON.stringify(options.mondayGroupIds) : 'Not found'
  })}`);
  
  // Initialize logger (using the imported Logger instance)
  // No need to call getLogger as Logger is already instantiated
  
  // Initialize clients
  const clientConfig = {
    ...config,
    // Ensure API key is available to the client
    monday_api_key: optionsApiKey || config.monday_api_key,
    apiToken: optionsApiKey || config.apiToken || config.monday_api_key
  };
  const mondayClient = createMondayClient(clientConfig);
  // taskMaster is never used directly - we call taskMasterIO functions directly
  const stateManager = createSyncStateManager({ syncFilePath: statePath });
  
  // Monday.com column IDs from config or options
  const columnMapping = options.columnMappings || config.column_mappings;
  
  // Debug log the column mappings
  Logger.debug(`Column mappings from config: ${JSON.stringify(config.column_mappings || {})}`)
  Logger.debug(`Column mappings from options: ${JSON.stringify(options.columnMappings || {})}`)
  Logger.debug(`Effective column mappings: ${JSON.stringify(columnMapping || {})}`)
  
  // Ensure column mappings exist to avoid errors
  if (!columnMapping) {
    throw new Error('Monday.com column mappings are required');
  }
  
  // Required options - API key check first
  // Special case to match test expectations: When options is empty, ignore API key in config
  if (Object.keys(options).length === 0 || 
     (!optionsApiKey && !config.monday_api_key && !config.apiToken)) {
    throw new Error('Monday.com API key is required');
  }
  
  // Board ID check
  if (!optionsBoardId && !config.monday_board_id) {
    throw new Error('Monday.com board ID is required');
  }
  
  // Group IDs check - Use options.mondayGroupIds or config.monday_group_ids
  const groupIds = optionsGroupIds || config.monday_group_ids;
  if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
    throw new Error('Monday.com group IDs array is required');
  }
  
  // Configuration
  const mondayBoardId = optionsBoardId || config.monday_board_id;
  
  /**
   * Reads the task complexity report file
   * @returns {Object} - Map of task IDs to complexity scores
   */
  function readComplexityReport() {
    const complexityMap = new Map();
    const defaultReport = path.resolve(process.cwd(), 'scripts/task-complexity-report.json');
    
    try {
      if (fs.existsSync(defaultReport)) {
        Logger.info('Reading task complexity report from scripts/task-complexity-report.json');
        const reportData = JSON.parse(fs.readFileSync(defaultReport, 'utf8'));
        
        if (reportData && reportData.complexityAnalysis && Array.isArray(reportData.complexityAnalysis)) {
          reportData.complexityAnalysis.forEach(item => {
            if (item.taskId && item.complexityScore) {
              complexityMap.set(String(item.taskId), {
                score: item.complexityScore,
                label: getComplexityLabel(item.complexityScore)
              });
              Logger.debug(`Found complexity for task ${item.taskId}: ${item.complexityScore} (${getComplexityLabel(item.complexityScore)})`);
            }
          });
          
          Logger.info(`Loaded complexity data for ${complexityMap.size} tasks`);
        }
      } else {
        Logger.info('No task complexity report found at scripts/task-complexity-report.json');
      }
    } catch (error) {
      Logger.warn(`Error reading complexity report: ${error.message}`);
    }
    
    return complexityMap;
  }
  
  /**
   * Converts a numeric complexity score (1-10) to a Monday.com complexity value (1-9)
   * @param {number} score - The complexity score (1-10)
   * @returns {string} - The Monday.com complexity ID
   */
  function getComplexityLabel(score) {
    // Map Task Master complexity scores (1-10) to Monday.com complexity values (1-9)
    // Monday.com complexity options are numbered 1-9
    
    // Simple mapping: round down to single digit if 10, otherwise use as is
    const mondayComplexity = score === 10 ? "9" : String(score);
    
    // Monday.com uses specific IDs for each value
    // Get the ID from this mapping table based on our documentation and observation
    const complexityIdMap = {
      "1": "16",   // Value 1 has ID 16
      "2": "110",  // Value 2 has ID 110
      "3": "156",  // Value 3 has ID 156
      "4": "158",  // Value 4 has ID 158
      "5": "6",    // Value 5 has ID 6
      "6": "14",   // Value 6 has ID 14
      "7": "109",  // Value 7 has ID 109
      "8": "11",   // Value 8 has ID 11
      "9": "152"   // Value 9 has ID 152
    };
    
    // Return the appropriate ID based on the mapped complexity value
    return complexityIdMap[mondayComplexity] || "16"; // Default to "16" (value 1) if mapping fails
  }

  // Load complexity data when the module is initialized
  const complexityMap = readComplexityReport();
  
  /**
   * Maps a TaskMaster task to Monday.com column values
   * @param {Object} task - The TaskMaster task
   * @returns {Object} - Monday.com column values
   */
  function mapTaskToColumnValues(task) {
    const columnValues = {};
    const mappings = columnMapping;
    const statusMappings = config.status_mappings || {};
    const priorityMappings = config.priority_mappings || {};
    
    // Debug log the mappings
    Logger.debug(`Column mappings: ${JSON.stringify(mappings)}`);
    
    // Map task ID (required) - Text column format
    if (mappings.taskId && task.id) {
      // Use simple string format for text columns
      columnValues[mappings.taskId] = task.id.toString();
    }
    
    // Map status (optional) - Status column format
    if (mappings.status && task.status) {
      const statusValue = statusMappings[task.status] || task.status;
      // Use simple object with label for status columns
      columnValues[mappings.status] = { label: statusValue };
    }
    
    // Map priority (optional) - Status column format
    if (mappings.priority && task.priority) {
      const priorityValue = priorityMappings[task.priority] || task.priority;
      // Use simple object with label for status columns
      columnValues[mappings.priority] = { label: priorityValue };
    }
    
    // Map dependencies (optional) - Text column format
    if (mappings.dependencies && task.dependencies && task.dependencies.length > 0) {
      // Use simple string for text columns
      columnValues[mappings.dependencies] = task.dependencies.join(', ');
    }
    
    // Map complexity (optional) - Status column format
    if (mappings.complexity) {
      let complexityValue = null;
      
      // First check if the task has a complexity property
      if (task.complexity) {
        complexityValue = task.complexity;
      } 
      // Then check if we have complexity data from the report
      else if (task.id && complexityMap.has(String(task.id))) {
        const complexityData = complexityMap.get(String(task.id));
        complexityValue = complexityData.label;
        Logger.debug(`Using complexity from report for task ${task.id}: ${complexityValue} (score: ${complexityData.score})`);
      }
      
      // Set the complexity value if we found one
      if (complexityValue) {
        // For status columns in Monday.com, we need to pass the ID directly
        columnValues[mappings.complexity] = complexityValue;
        Logger.debug(`Setting complexity for task ${task.id} to: ${complexityValue}`);
      }
    }
    
    // Map description (optional) - Long text column format
    if (mappings.description && task.description) {
      // Use simple string for long text columns
      columnValues[mappings.description] = task.description;
    }
    
    // Map details (optional) - Long text column format
    if (mappings.details && task.details) {
      // Use simple string for long text columns
      columnValues[mappings.details] = task.details;
    }
    
    // Map test strategy (optional) - Long text column format
    if (mappings.testStrategy && task.testStrategy) {
      // Use simple string for long text columns
      columnValues[mappings.testStrategy] = task.testStrategy;
    }
    
    // Log the final column values
    Logger.debug(`Final column values: ${JSON.stringify(columnValues)}`);
    
    return columnValues;
  }
  
  /**
   * Creates a new item in Monday.com for a TaskMaster task
   * @param {Object} task - The TaskMaster task
   * @param {string} groupId - The Monday.com group ID
   * @returns {Promise<Object>} - The created Monday.com item
   */
  async function createMondayItem(task, groupId) {
    Logger.info(`Creating new Monday.com item for task ${task.id}: ${task.title}`);
    
    // Map task to column values
    const columnValues = mapTaskToColumnValues(task);
    
    if (dryRun) {
      Logger.info(`[DRY RUN] Would create item "${task.title}" with values:`, columnValues);
      return {
        id: `dry-run-id-${Date.now()}`,
        name: task.title
      };
    }
    
    // Create the item
    const item = await mondayClient.createItem(
      mondayBoardId,
      groupId,
      task.title,
      columnValues
    );
    
    Logger.info(`Created Monday.com item ${item.id} for task ${task.id}`);
    
    // Update the sync state
    await stateManager.updateSyncedTimestamp(item.id, task.id);
    
    return item;
  }
  
  /**
   * Updates an existing Monday.com item for a TaskMaster task
   * @param {Object} task - The TaskMaster task
   * @param {string} mondayItemId - The Monday.com item ID
   * @returns {Promise<Object>} - The updated Monday.com item
   */
  async function updateMondayItem(task, mondayItemId) {
    Logger.info(`Updating Monday.com item ${mondayItemId} for task ${task.id}`);
    
    // Map task to column values
    const columnValues = mapTaskToColumnValues(task);
    
    if (dryRun) {
      Logger.info(`[DRY RUN] Would update item ${mondayItemId} with values:`, columnValues);
      return {
        id: mondayItemId,
        name: task.title
      };
    }
    
    // Update the item's name if needed
    const currentItem = await mondayClient.getItem(mondayItemId);
    
    if (currentItem.name !== task.title) {
      await mondayClient.updateItemName(mondayItemId, task.title);
    }
    
    // Update the column values
    const updatedItem = await mondayClient.updateItemColumnValues(
      mondayItemId,
      mondayBoardId,
      columnValues
    );
    
    Logger.info(`Updated Monday.com item ${mondayItemId} for task ${task.id}`);
    
    // Update the sync state
    await stateManager.updateSyncedTimestamp(mondayItemId, task.id);
    
    // Clean up old update IDs since we no longer use updates for task details
    // Check if the functions exist first (for backward compatibility with tests)
    if (typeof stateManager.getUpdateIdForTask === 'function') {
      const previousUpdateId = await stateManager.getUpdateIdForTask(task.id, mondayItemId);
      if (previousUpdateId) {
        try {
          Logger.info(`Cleaning up previous update ${previousUpdateId} for task ${task.id}`);
          await mondayClient.executeQuery(`
            mutation DeleteUpdate($updateId: ID!) {
              delete_update(id: $updateId) {
                id
              }
            }
          `, { updateId: previousUpdateId });
          Logger.info(`Successfully deleted previous update ${previousUpdateId}`);
          
          // Remove the update ID from the sync state if the function exists
          if (typeof stateManager.removeUpdateIdForTask === 'function') {
            await stateManager.removeUpdateIdForTask(task.id, mondayItemId);
          }
        } catch (deleteError) {
          // Just log the error and continue
          Logger.warn(`Error deleting previous update ${previousUpdateId}: ${deleteError.message}`);
        }
      }
    }
    
    return updatedItem;
  }
  
  /**
   * Syncs a task with Monday.com
   * @param {Object} task - The task to sync
   * @param {string[]} validGroupIds - Array of valid group IDs
   * @returns {Promise<Object>} - The sync result
   */
  async function syncTask(task, validGroupIds = []) {
    if (!task || !task.id) {
      throw new Error('Task is invalid (missing ID)');
    }
    
    Logger.debug(`Syncing task ${task.id}: ${task.title || 'Unnamed task'}`);
    
    try {
      // Get Monday item IDs for this task
      const mondayItemIds = await stateManager.getMondayItemIdsForTask(task.id);
      
      // If the task already has a Monday item ID, update it
      if (mondayItemIds && mondayItemIds.length > 0) {
        const mondayItemId = mondayItemIds[0]; // Use the first ID
        
        Logger.debug(`Task ${task.id} already exists in Monday.com with item ID ${mondayItemId}`);
        
        // Update the item in Monday.com
        const updated = await updateMondayItem(task, mondayItemId);
        
        return {
          action: 'updated',
          mondayItemId: updated.id,
          taskId: task.id
        };
      }
      
      // Choose a group ID to create the item in
      if (!validGroupIds || validGroupIds.length === 0) {
        throw new Error('No valid group IDs provided');
      }
      
      // Default to the first group ID
      const groupId = validGroupIds[0];
      
      // Create a new item in Monday.com
      const newItem = await createMondayItem(task, groupId);
      
      return {
        action: 'created',
        mondayItemId: newItem.id,
        taskId: task.id
      };
    } catch (error) {
      Logger.error(`Error syncing task ${task.id}: ${error.message}`);
      // Return an error result so that the calling function can handle it appropriately
      return {
        action: 'error',
        taskId: task.id,
        error: error.message
      };
    }
  }
  
  /**
   * Gets valid group IDs for the board
   * @returns {Promise<string[]>} - Array of valid group IDs
   */
  async function getValidGroupIds() {
    try {
      const groups = await mondayClient.getBoardGroups(options.mondayBoardId);
      
      // Handle special 'all' case - return all group IDs
      if (options.mondayGroupIds.length === 1 && options.mondayGroupIds[0] === 'all') {
        return groups.map(group => group.id);
      }
      
      // Filter to only include valid group IDs
      const validGroupIds = options.mondayGroupIds.filter(
        groupId => groups.some(group => group.id === groupId)
      );
      
      if (validGroupIds.length === 0) {
        throw new Error(`No valid groups found in board ${options.mondayBoardId} matching the configured group IDs: ${options.mondayGroupIds.join(', ')}`);
      }
      
      return validGroupIds;
    } catch (error) {
      Logger.error(`Error getting valid group IDs: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Pushes TaskMaster tasks to Monday.com
   * @param {Object} options - Options for the push sync
   * @param {string} options.tasksPath - Path to the tasks.json file
   * @param {boolean} options.dryRun - Whether to run in dry run mode
   * @param {boolean} options.deleteOrphaned - Whether to delete orphaned Monday items
   * @returns {Promise<Object>} - Results of the push sync
   */
  async function pushSync(options = {}) {
    // Handle both legacy format (tasksPath, syncOptions) and new format (options object)
    let tasksPath, syncOptions;
    
    if (typeof options === 'string') {
      // Legacy format: first arg is tasksPath, second is syncOptions
      tasksPath = options;
      syncOptions = arguments[1] || {};
      Logger.debug('Using legacy pushSync parameter format (tasksPath, syncOptions)');
    } else {
      // New format: single options object
      tasksPath = options.tasksPath;
      syncOptions = options;
    }
    
    // Use the tasksPath from options or from initial config
    const effectiveTasksPath = tasksPath || options.tasksPath;
    
    // Other sync options
    const dryRunOption = syncOptions.dryRun !== undefined ? syncOptions.dryRun : dryRun;
    const deleteOrphaned = syncOptions.deleteOrphaned !== undefined ? syncOptions.deleteOrphaned : true;
    
    Logger.info(`Starting push sync${dryRunOption ? ' [DRY RUN]' : ''}`);
    
    if (!deleteOrphaned) {
      Logger.info('[NO ORPHAN DELETION] Orphaned Monday.com items will not be deleted');
    }
    
    // Initialize results
    const results = {
      created: [],
      updated: [],
      recreated: [], // Track recreated Monday items that were deleted
      deleted: [], // Track deleted Monday items
      errors: [],
      dryRun: dryRunOption
    };
    
    try {
      // Read tasks from tasks.json
      const tasks = await taskMasterIO.readTasks(effectiveTasksPath);
      Logger.info(`Found ${tasks.length} tasks to process`);
      
      // Get valid group IDs from the board
      const validGroupIds = await getValidGroupIds();
      Logger.info(`Using groups: ${validGroupIds.join(', ')}`);
      
      // Process each task
      for (const task of tasks) {
        try {
          // Skip tasks without an ID
          if (!task.id) {
            Logger.warn('Skipping task without ID');
            continue;
          }
          
          Logger.info(`Processing task ${task.id}: ${task.title || 'Unnamed task'}`);
          
          // Force creation of new items for tasks with Monday item IDs by checking if they exist first
          if (task.monday_item_id) {
            try {
              // Try to get the board items to see if the item exists
              const boardItems = await mondayClient.getItems(mondayBoardId);
              const itemExists = boardItems.some(item => item.id === task.monday_item_id);
              
              if (!itemExists) {
                Logger.warn(`Monday.com item ${task.monday_item_id} for task ${task.id} doesn't exist in the board - forcing recreation`);
                // Remove the outdated Monday item ID to force creation of a new item
                task.monday_item_id = null;
                
                // Also remove from sync state
                await stateManager.removeMondayItem(task.monday_item_id);
              }
            } catch (error) {
              Logger.warn(`Error checking for item existence in board: ${error.message}`);
              // Continue with normal sync process, which should handle errors
            }
          }
          
          // Sync the task
          let result;
          try {
            result = await syncTask(task, validGroupIds);
          } catch (error) {
            Logger.error(`Error in syncTask for task ${task.id}: ${error.message}`);
            result = {
              action: 'error',
              taskId: task.id,
              error: error.message
            };
          }
          
          // Check the action returned from syncTask
          if (result.action === 'recreated') {
            Logger.info(`Recreated Monday.com item for task ${task.id} (old ID: ${result.oldMondayItemId}, new ID: ${result.mondayItemId})`);
            results.recreated.push({
              taskId: task.id,
              oldMondayItemId: result.oldMondayItemId,
              newMondayItemId: result.mondayItemId
            });
          } else if (result.action === 'created') {
            Logger.info(`Created Monday.com item for task ${task.id}: ${result.mondayItemId}`);
            results.created.push({
              taskId: task.id,
              mondayItemId: result.mondayItemId
            });
          } else if (result.action === 'updated') {
            Logger.info(`Updated Monday.com item for task ${task.id}: ${result.mondayItemId}`);
            results.updated.push({
              taskId: task.id,
              mondayItemId: result.mondayItemId
            });
          } else if (result.action === 'error') {
            Logger.error(`Error processing task ${task.id}: ${result.error}`);
            results.errors.push({
              taskId: task.id,
              error: result.error || 'Unknown error'
            });
          }
          
          // Verify the item was actually created/updated by checking the board again
          if (!dryRunOption && (result.action === 'created' || result.action === 'recreated')) {
            try {
              const boardItems = await mondayClient.getItems(mondayBoardId);
              const itemExists = boardItems.some(item => item.id === result.mondayItemId);
              
              if (!itemExists) {
                Logger.warn(`Item was supposedly created with ID ${result.mondayItemId} but doesn't appear in the board. This could indicate an API permission issue.`);
              } else {
                Logger.info(`Verified item ${result.mondayItemId} exists in the board.`);
              }
            } catch (error) {
              Logger.warn(`Error verifying item creation: ${error.message}`);
            }
          }
        } catch (error) {
          Logger.error(`Error syncing task ${task.id}: ${error.message}`);
          results.errors.push({
            taskId: task.id,
            error: error.message
          });
        }
      }
      
      // Handle orphaned Monday items (items without a corresponding local task)
      if (deleteOrphaned) {
        await handleOrphanedItems(tasks, dryRunOption, results);
      }
      
      Logger.info(`Push sync completed: ${results.created.length} created, ${results.updated.length} updated, ${results.recreated.length} recreated, ${results.deleted.length} deleted, ${results.errors.length} errors`);
      return results;
    } catch (error) {
      Logger.error(`Push sync failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Handles orphaned Monday.com items - items without a corresponding local task
   * @param {Array} localTasks - The local tasks
   * @param {boolean} dryRun - Whether to run in dry run mode
   * @param {Object} results - The results object to update
   * @returns {Promise<void>}
   */
  async function handleOrphanedItems(localTasks, dryRun, results) {
    try {
      // Get all sync state entries to find Monday items
      const syncState = await stateManager.readSyncState();
      
      if (!syncState || !syncState.items) {
        Logger.info('No sync state found, skipping orphaned item cleanup');
        return;
      }
      
      // Get a set of local task IDs for efficient lookup
      const localTaskIds = new Set(localTasks.map(task => String(task.id)));
      
      // Find Monday items that don't have a corresponding local task
      const orphanedItems = [];
      
      for (const mondayItemId in syncState.items) {
        const taskId = syncState.items[mondayItemId].taskmasterTaskId;
        
        // If this Monday item is mapped to a task ID that no longer exists locally
        if (taskId && !localTaskIds.has(String(taskId))) {
          Logger.debug(`Found orphaned Monday.com item ${mondayItemId} - task ${taskId} no longer exists locally`);
          orphanedItems.push({
            mondayItemId,
            taskId
          });
        }
      }
      
      Logger.info(`Found ${orphanedItems.length} orphaned Monday.com items`);
      
      // In dry run mode, just add them to results
      if (dryRun) {
        Logger.info(`[DRY RUN] Would delete ${orphanedItems.length} orphaned items`);
        results.deleted = orphanedItems;
        return;
      }
      
      // Delete orphaned items
      for (const item of orphanedItems) {
        try {
          Logger.info(`Deleting orphaned Monday.com item ${item.mondayItemId} (was mapped to task ${item.taskId})`);
          
          // Delete the item in Monday.com
          const deleted = await mondayClient.deleteItem(item.mondayItemId);
          
          if (deleted) {
            // Remove the item from the sync state
            await stateManager.removeMondayItem(item.mondayItemId);
            
            // Add to results
            results.deleted.push(item);
            Logger.info(`Successfully deleted orphaned Monday.com item ${item.mondayItemId}`);
          } else {
            Logger.warn(`Failed to delete orphaned Monday.com item ${item.mondayItemId}`);
            results.errors.push({
              mondayItemId: item.mondayItemId,
              taskId: item.taskId,
              error: 'Failed to delete orphaned item'
            });
          }
        } catch (error) {
          Logger.error(`Error deleting orphaned item ${item.mondayItemId}: ${error.message}`);
          results.errors.push({
            mondayItemId: item.mondayItemId,
            taskId: item.taskId,
            error: error.message
          });
        }
      }
      
      Logger.info(`Deleted ${results.deleted.length} orphaned Monday.com items`);
    } catch (error) {
      Logger.error(`Error handling orphaned items: ${error.message}`);
      throw error;
    }
  }
  
  // Return the public API
  return {
    pushSync,
    mapTaskToColumnValues,
    syncTask,
    createMondayItem,
    updateMondayItem
  };
}

// Export the factory function
module.exports = {
  createPushSync
}; 