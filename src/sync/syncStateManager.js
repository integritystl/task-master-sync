/**
 * Sync State Manager Module
 * 
 * Manages the local sync state, tracking Monday.com item IDs and timestamps.
 * Uses atomic write operations and file locking to prevent data corruption.
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { Logger } = require('../utils/logger');

// Constants
const DEFAULT_SYNC_FILE = '.taskmaster_sync_state.json';
const DEFAULT_LOCK_TIMEOUT_MS = 5000; // 5 seconds

// Track locks with a memory map
const activeLocks = new Map();

/**
 * Creates a sync state manager instance
 * @param {Object} options - Configuration options
 * @returns {Object} - Sync state manager instance
 */
function createSyncStateManager(options = {}) {
  // Configure paths
  const syncFilePath = options.syncFilePath || DEFAULT_SYNC_FILE;
  const lockTimeoutMs = options.lockTimeoutMs || DEFAULT_LOCK_TIMEOUT_MS;
  
  // In-memory cache of the sync state
  let syncStateCache = null;
  let cacheTimestamp = null;
  
  /**
   * Generate a lock file path for a given file
   * @param {string} filePath - Path to the original file
   * @returns {string} - Path to the lock file
   */
  function getLockFilePath(filePath) {
    return `${filePath}.lock`;
  }
  
  /**
   * Acquires a file lock with timeout
   * @param {string} filePath - Path to the file to lock
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<string>} - Lock ID if successful
   */
  async function acquireLock(filePath, timeoutMs = lockTimeoutMs) {
    const lockFilePath = getLockFilePath(filePath);
    const lockId = uuidv4();
    const startTime = Date.now();
    
    // Try to acquire the lock
    let attempts = 0;
    const maxAttempts = 1000; // Prevent infinite loops
    
    while (attempts < maxAttempts) {
      attempts++;
      try {
        // Check if we already have a lock in memory
        if (activeLocks.has(filePath)) {
          const existingLock = activeLocks.get(filePath);
          if (existingLock.id === lockId) {
            // We already have this lock
            return lockId;
          }
        }
        
        // Try to create the lock file
        await fs.writeFile(lockFilePath, lockId, { flag: 'wx' });
        
        // Successfully created the lock file
        Logger.debug(`Acquired lock for ${filePath} with ID ${lockId}`);
        
        // Store the lock in memory
        activeLocks.set(filePath, {
          id: lockId,
          timestamp: Date.now()
        });
        
        return lockId;
      } catch (error) {
        // Check if the error is because the lock file already exists
        if (error.code !== 'EEXIST') {
          throw error;
        }
        
        // Check if we've timed out
        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Failed to acquire lock for ${filePath} after ${timeoutMs}ms`);
        }
        
        // Check if the lock is stale
        try {
          const stats = await fs.stat(lockFilePath);
          const lockAge = Date.now() - stats.mtimeMs;
          
          if (lockAge > timeoutMs) {
            // Stale lock, remove it
            Logger.warn(`Removing stale lock for ${filePath} (age: ${lockAge}ms)`);
            await fs.unlink(lockFilePath);
            continue;
          }
        } catch (statError) {
          // If the file doesn't exist, someone else might have removed it
          if (statError.code === 'ENOENT') {
            continue;
          }
          throw statError;
        }
        
        // Wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  
  /**
   * Releases a file lock
   * @param {string} filePath - Path to the file
   * @param {string} lockId - Lock ID to release
   * @returns {Promise<boolean>} - True if the lock was released
   */
  async function releaseLock(filePath, lockId) {
    const lockFilePath = getLockFilePath(filePath);
    
    // Check if we have the lock in memory
    if (activeLocks.has(filePath)) {
      const existingLock = activeLocks.get(filePath);
      
      // Only release if the lock ID matches
      if (existingLock.id !== lockId) {
        Logger.warn(`Attempted to release lock ${lockId} for ${filePath}, but we have lock ${existingLock.id}`);
        return false;
      }
      
      // Remove from memory
      activeLocks.delete(filePath);
    }
    
    try {
      // Check if the lock file exists and contains our lock ID
      let lockFileContent;
      try {
        lockFileContent = await fs.readFile(lockFilePath, 'utf8');
      } catch (readError) {
        if (readError.code === 'ENOENT') {
          // Lock file already gone
          return true;
        }
        throw readError;
      }
      
      // Verify the lock ID
      if (lockFileContent !== lockId) {
        Logger.warn(`Lock file ${lockFilePath} contains ID ${lockFileContent}, expected ${lockId}`);
        return false;
      }
      
      // Remove the lock file
      await fs.unlink(lockFilePath);
      Logger.debug(`Released lock for ${filePath} with ID ${lockId}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to release lock for ${filePath}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Reads the sync state from file
   * @param {boolean} bypassCache - Whether to bypass the cache
   * @returns {Promise<Object>} - The sync state
   */
  async function readSyncState(bypassCache = false) {
    // Check cache first if not bypassing
    if (!bypassCache && syncStateCache && cacheTimestamp) {
      const cacheAge = Date.now() - cacheTimestamp;
      if (cacheAge < 5000) { // Cache valid for 5 seconds
        Logger.debug('Using cached sync state');
        return syncStateCache;
      }
    }
    
    // Acquire a lock for reading
    const lockId = await acquireLock(syncFilePath);
    
    try {
      // Check if the file exists
      if (!fs.existsSync(syncFilePath)) {
        // Create a new sync state
        const newSyncState = getEmptySyncState();
        
        // Write it to disk
        await writeSyncState(newSyncState);
        
        // Release the lock
        await releaseLock(syncFilePath, lockId);
        
        return newSyncState;
      }
      
      // Read the file
      const data = fs.readFileSync(syncFilePath, 'utf8');
      
      // Parse the JSON
      const syncState = JSON.parse(data);
      
      // Release the lock
      await releaseLock(syncFilePath, lockId);
      
      // Ensure the sync state has the expected structure
      if (!syncState.taskMasterToMonday) syncState.taskMasterToMonday = {};
      if (!syncState.mondayToTaskMaster) syncState.mondayToTaskMaster = {};
      if (!syncState.taskMappings) syncState.taskMappings = [];
      
      // Update cache
      syncStateCache = syncState;
      cacheTimestamp = Date.now();
      
      return syncState;
    } catch (error) {
      // Release the lock if it was acquired
      try {
        await releaseLock(syncFilePath, lockId);
      } catch (unlockError) {
        // Ignore unlock errors
      }
      
      Logger.error(`Error reading sync state: ${error.message}`);
      
      // Return an empty sync state
      return getEmptySyncState();
    }
  }
  
  /**
   * Writes the sync state to file
   * @param {Object} syncState - The sync state to write
   * @returns {Promise<void>}
   */
  async function writeSyncState(syncState) {
    if (!syncState || typeof syncState !== 'object') {
      throw new Error('Invalid sync state');
    }
    
    // Ensure the structure is valid
    if (!syncState.items || typeof syncState.items !== 'object') {
      syncState.items = {};
    }
    
    // Always update the lastSync timestamp
    syncState.lastSync = Date.now();
    
    // Acquire a lock for writing
    const lockId = await acquireLock(syncFilePath);
    
    try {
      // Create a temporary file to write to (for atomic writes)
      const tempFilePath = path.join(os.tmpdir(), `taskmaster-sync-${uuidv4()}.json`);
      
      try {
        // Write to the temporary file
        await fs.writeFile(tempFilePath, JSON.stringify(syncState, null, 2), 'utf8');
        
        // Move the temporary file to the actual file (atomic operation)
        await fs.move(tempFilePath, syncFilePath, { overwrite: true });
        
        // Update cache
        syncStateCache = syncState;
        cacheTimestamp = Date.now();
        
        Logger.debug('Sync state written successfully');
      } catch (error) {
        // Clean up temporary file if it exists
        try {
          await fs.unlink(tempFilePath);
        } catch (unlinkError) {
          // Ignore errors from unlink
        }
        
        throw error;
      }
    } finally {
      // Release the lock
      await releaseLock(syncFilePath, lockId);
    }
  }
  
  /**
   * Creates an empty sync state
   * @returns {Object} - An empty sync state
   */
  function getEmptySyncState() {
    return {
      version: '1.0',
      lastSync: null,
      taskMappings: [],
      mondayToTaskMaster: {},
      taskMasterToMonday: {},
      items: {} // For backward compatibility
    };
  }
  
  /**
   * Gets the last synced timestamp for a Monday.com item
   * @param {string} mondayItemId - The Monday.com item ID
   * @returns {Promise<number|null>} - The timestamp or null if not found
   */
  async function getLastSyncedTimestamp(mondayItemId) {
    const syncState = await readSyncState();
    
    // For backward compatibility with old tests
    if (syncState.items && syncState.items[mondayItemId]) {
      return syncState.items[mondayItemId].timestamp;
    }
    
    // New implementation with taskMappings
    const taskMapping = syncState.taskMappings.find(
      mapping => mapping.mondayItemId === String(mondayItemId)
    );
    
    if (taskMapping && taskMapping.timestamp) {
      return taskMapping.timestamp;
    }
    
    return null;
  }
  
  /**
   * Updates the synced timestamp for a Monday.com item
   * @param {string} mondayItemId - The Monday.com item ID
   * @param {string} taskmasterTaskId - The TaskMaster task ID
   * @param {number} timestamp - The sync timestamp
   * @returns {Promise<void>}
   */
  async function updateSyncedTimestamp(mondayItemId, taskmasterTaskId, timestamp = Date.now()) {
    const syncState = await readSyncState();
    
    // For backward compatibility with old tests
    if (!syncState.items) {
      syncState.items = {};
    }
    
    syncState.items[mondayItemId] = {
      taskmasterTaskId,
      timestamp
    };
    
    // New implementation with taskMappings
    const existingMapping = syncState.taskMappings.find(
      mapping => mapping.mondayItemId === String(mondayItemId)
    );
    
    if (existingMapping) {
      existingMapping.taskmasterTaskId = String(taskmasterTaskId);
      existingMapping.timestamp = timestamp;
    } else {
      syncState.taskMappings.push({
        mondayItemId: String(mondayItemId),
        taskmasterTaskId: String(taskmasterTaskId),
        timestamp
      });
    }
    
    // Update bidirectional mappings
    syncState.mondayToTaskMaster[mondayItemId] = taskmasterTaskId;
    
    if (!syncState.taskMasterToMonday[taskmasterTaskId]) {
      syncState.taskMasterToMonday[taskmasterTaskId] = [];
    }
    
    if (!syncState.taskMasterToMonday[taskmasterTaskId].includes(mondayItemId)) {
      syncState.taskMasterToMonday[taskmasterTaskId].push(mondayItemId);
    }
    
    await writeSyncState(syncState);
  }
  
  /**
   * Removes a synced item from the sync state
   * @param {string} mondayItemId - The Monday.com item ID
   * @returns {Promise<boolean>} - Whether the item was removed
   */
  async function removeSyncedItem(mondayItemId) {
    const syncState = await readSyncState();
    
    // For backward compatibility with old tests
    let itemExisted = false;
    if (syncState.items && syncState.items[mondayItemId]) {
      const taskmasterTaskId = syncState.items[mondayItemId].taskmasterTaskId;
      delete syncState.items[mondayItemId];
      itemExisted = true;
      
      // Also clean up the bidirectional mappings
      if (syncState.mondayToTaskMaster && syncState.mondayToTaskMaster[mondayItemId]) {
        delete syncState.mondayToTaskMaster[mondayItemId];
      }
      
      if (taskmasterTaskId && 
          syncState.taskMasterToMonday && 
          syncState.taskMasterToMonday[taskmasterTaskId]) {
        const index = syncState.taskMasterToMonday[taskmasterTaskId].indexOf(mondayItemId);
        if (index !== -1) {
          syncState.taskMasterToMonday[taskmasterTaskId].splice(index, 1);
          
          // Clean up empty arrays
          if (syncState.taskMasterToMonday[taskmasterTaskId].length === 0) {
            delete syncState.taskMasterToMonday[taskmasterTaskId];
          }
        }
      }
    }
    
    // New implementation with taskMappings
    const mappingIndex = syncState.taskMappings.findIndex(
      mapping => mapping.mondayItemId === String(mondayItemId)
    );
    
    if (mappingIndex !== -1) {
      syncState.taskMappings.splice(mappingIndex, 1);
      itemExisted = true;
    }
    
    if (itemExisted) {
      await writeSyncState(syncState);
      return true;
    }
    
    return false;
  }
  
  /**
   * Gets all synced Monday.com item IDs
   * @returns {Promise<string[]>} - Array of Monday.com item IDs
   */
  async function getAllSyncedItemIds() {
    const syncState = await readSyncState();
    
    // For backward compatibility with old tests
    if (syncState.items) {
      const oldIds = Object.keys(syncState.items);
      if (oldIds.length > 0) {
        return oldIds;
      }
    }
    
    // New implementation with taskMappings
    return syncState.taskMappings.map(mapping => mapping.mondayItemId);
  }
  
  /**
   * Gets all synced items
   * @returns {Promise<Object>} - Object mapping Monday.com item IDs to TaskMaster task IDs
   */
  async function getAllSyncedItems() {
    const syncState = await readSyncState();
    
    // For backward compatibility with old tests
    if (syncState.items) {
      const oldItems = {};
      Object.entries(syncState.items).forEach(([mondayItemId, data]) => {
        oldItems[mondayItemId] = data.taskmasterTaskId;
      });
      
      if (Object.keys(oldItems).length > 0) {
        return oldItems;
      }
    }
    
    // New implementation with taskMappings
    const items = {};
    syncState.taskMappings.forEach(mapping => {
      items[mapping.mondayItemId] = mapping.taskmasterTaskId;
    });
    
    return items;
  }
  
  /**
   * Gets the TaskMaster task ID for a Monday.com item
   * @param {string} mondayItemId - The Monday.com item ID
   * @returns {Promise<string|null>} - The TaskMaster task ID or null if not found
   */
  async function getTaskmasterTaskId(mondayItemId) {
    const syncState = await readSyncState();
    
    // For backward compatibility with old tests
    if (syncState.items && syncState.items[mondayItemId]) {
      return syncState.items[mondayItemId].taskmasterTaskId;
    }
    
    // New implementation with mondayToTaskMaster
    if (syncState.mondayToTaskMaster && syncState.mondayToTaskMaster[mondayItemId]) {
      return syncState.mondayToTaskMaster[mondayItemId];
    }
    
    return null;
  }
  
  /**
   * Gets the Monday.com item IDs for a TaskMaster task
   * @param {string} taskmasterTaskId - The TaskMaster task ID
   * @returns {Promise<string[]>} - Array of Monday.com item IDs
   */
  async function getMondayItemIdsForTask(taskmasterTaskId) {
    const syncState = await readSyncState();
    
    // For backward compatibility with old tests
    if (syncState.items) {
      const oldItems = [];
      Object.entries(syncState.items).forEach(([mondayItemId, data]) => {
        if (data.taskmasterTaskId === taskmasterTaskId) {
          oldItems.push(mondayItemId);
        }
      });
      
      if (oldItems.length > 0) {
        return oldItems;
      }
    }
    
    // New implementation with taskMasterToMonday
    if (syncState.taskMasterToMonday && syncState.taskMasterToMonday[taskmasterTaskId]) {
      return syncState.taskMasterToMonday[taskmasterTaskId];
    }
    
    return [];
  }
  
  /**
   * Cleans up old entries from the sync state
   * @param {number} maxAgeMs - Max age in milliseconds (default: 30 days)
   * @returns {Promise<number>} - Number of entries removed
   */
  async function cleanupOldEntries(maxAgeMs = 30 * 24 * 60 * 60 * 1000) { // Default 30 days
    const syncState = await readSyncState();
    const now = Date.now();
    let count = 0;
    
    // For backward compatibility with old tests - clean up items
    if (syncState.items) {
      const itemsToRemove = [];
      
      // Find old items
      Object.entries(syncState.items).forEach(([mondayItemId, data]) => {
        if (now - data.timestamp > maxAgeMs) {
          itemsToRemove.push(mondayItemId);
        }
      });
      
      // Remove old items
      itemsToRemove.forEach(mondayItemId => {
        delete syncState.items[mondayItemId];
        count++;
      });
    }
    
    // Clean up taskMappings
    const mappingsToRemove = [];
    
    syncState.taskMappings.forEach((mapping, index) => {
      if (mapping.timestamp && now - mapping.timestamp > maxAgeMs) {
        mappingsToRemove.push(index);
      }
    });
    
    // Remove in reverse order to avoid index shifting
    mappingsToRemove.reverse().forEach(index => {
      const mapping = syncState.taskMappings[index];
      
      // Also clean up bidirectional mappings
      if (mapping.mondayItemId && syncState.mondayToTaskMaster[mapping.mondayItemId]) {
        delete syncState.mondayToTaskMaster[mapping.mondayItemId];
      }
      
      if (mapping.taskmasterTaskId && 
          syncState.taskMasterToMonday[mapping.taskmasterTaskId]) {
        const mondayIds = syncState.taskMasterToMonday[mapping.taskmasterTaskId];
        const mondayIndex = mondayIds.indexOf(mapping.mondayItemId);
        
        if (mondayIndex !== -1) {
          mondayIds.splice(mondayIndex, 1);
          
          // Clean up empty arrays
          if (mondayIds.length === 0) {
            delete syncState.taskMasterToMonday[mapping.taskmasterTaskId];
          }
        }
      }
      
      syncState.taskMappings.splice(index, 1);
      count++;
    });
    
    if (count > 0) {
      await writeSyncState(syncState);
    }
    
    return count;
  }
  
  /**
   * Clears the in-memory cache
   */
  function clearCache() {
    syncStateCache = null;
    cacheTimestamp = null;
  }
  
  /**
   * Gets the time of the last sync
   * @returns {Promise<number|null>} - Timestamp of the last sync or null
   */
  async function getLastSyncTime() {
    const syncState = await readSyncState();
    return syncState.lastSync;
  }
  
  /**
   * Gets the update ID for a specific task and Monday.com item
   * @param {string} taskId - The TaskMaster task ID
   * @param {string} mondayItemId - The Monday.com item ID
   * @returns {Promise<string|null>} - The update ID or null if not found
   */
  async function getUpdateIdForTask(taskId, mondayItemId) {
    const syncState = await readSyncState();
    
    // If no task mappings exist, return null
    if (!syncState.taskMappings || !Array.isArray(syncState.taskMappings)) {
      return null;
    }
    
    // Find the task mapping
    const taskMapping = syncState.taskMappings.find(
      mapping => mapping.taskId === String(taskId) && mapping.mondayItemId === String(mondayItemId)
    );
    
    if (taskMapping && taskMapping.mondayUpdateId) {
      return taskMapping.mondayUpdateId;
    }
    
    return null;
  }
  
  /**
   * Stores the update ID for a specific task and Monday.com item
   * @param {string} taskId - The TaskMaster task ID
   * @param {string} mondayItemId - The Monday.com item ID
   * @param {string} updateId - The Monday.com update ID
   * @returns {Promise<void>}
   */
  async function storeUpdateIdForTask(taskId, mondayItemId, updateId) {
    const syncState = await readSyncState();
    
    // Ensure taskMappings exists
    if (!syncState.taskMappings) {
      syncState.taskMappings = [];
    }
    
    // Find the task mapping
    const taskMapping = syncState.taskMappings.find(
      mapping => mapping.taskId === String(taskId) && mapping.mondayItemId === String(mondayItemId)
    );
    
    if (taskMapping) {
      // Update existing mapping
      taskMapping.mondayUpdateId = String(updateId);
      taskMapping.lastSynced = new Date().toISOString();
    } else {
      // Create new mapping
      syncState.taskMappings.push({
        taskId: String(taskId),
        mondayItemId: String(mondayItemId),
        mondayUpdateId: String(updateId),
        lastSynced: new Date().toISOString()
      });
    }
    
    await writeSyncState(syncState);
  }
  
  /**
   * Removes the update ID for a specific task and Monday.com item
   * @param {string} taskId - The TaskMaster task ID
   * @param {string} mondayItemId - The Monday.com item ID
   * @returns {Promise<boolean>} - True if the update ID was removed
   */
  async function removeUpdateIdForTask(taskId, mondayItemId) {
    const syncState = await readSyncState();
    
    // If no task mappings exist, return false
    if (!syncState.taskMappings || !Array.isArray(syncState.taskMappings)) {
      return false;
    }
    
    // Find the task mapping
    const taskMappingIndex = syncState.taskMappings.findIndex(
      mapping => mapping.taskId === String(taskId) && mapping.mondayItemId === String(mondayItemId)
    );
    
    if (taskMappingIndex !== -1) {
      // Update existing mapping
      if (syncState.taskMappings[taskMappingIndex].mondayUpdateId) {
        delete syncState.taskMappings[taskMappingIndex].mondayUpdateId;
        syncState.taskMappings[taskMappingIndex].lastSynced = new Date().toISOString();
        await writeSyncState(syncState);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Removes a Monday.com item from the sync state
   * @param {string} mondayItemId - The Monday.com item ID to remove
   * @returns {Promise<boolean>} - Whether the item was removed
   */
  async function removeMondayItem(mondayItemId) {
    if (!mondayItemId) {
      throw new Error('Monday item ID is required');
    }
    
    Logger.debug(`Removing Monday.com item ${mondayItemId} from sync state`);
    
    // Get the current sync state
    const syncState = await readSyncState();
    
    // Check if the item exists in the sync state
    if (!syncState.items || !syncState.items[mondayItemId]) {
      Logger.warn(`Monday.com item ${mondayItemId} not found in sync state`);
      return false;
    }
    
    // Store the task ID before removing the item
    const taskId = syncState.items[mondayItemId].taskmasterTaskId;
    
    // Remove from items section
    delete syncState.items[mondayItemId];
    
    // Remove from mondayToTaskMaster section
    if (syncState.mondayToTaskMaster && syncState.mondayToTaskMaster[mondayItemId]) {
      delete syncState.mondayToTaskMaster[mondayItemId];
    }
    
    // Remove from taskMasterToMonday section
    if (syncState.taskMasterToMonday && taskId && syncState.taskMasterToMonday[taskId]) {
      const index = syncState.taskMasterToMonday[taskId].indexOf(mondayItemId);
      if (index !== -1) {
        syncState.taskMasterToMonday[taskId].splice(index, 1);
        
        // If there are no more Monday items for this task, remove the entry
        if (syncState.taskMasterToMonday[taskId].length === 0) {
          delete syncState.taskMasterToMonday[taskId];
        }
      }
    }
    
    // Remove from taskMappings section
    if (syncState.taskMappings) {
      const index = syncState.taskMappings.findIndex(mapping => mapping.mondayItemId === mondayItemId);
      if (index !== -1) {
        syncState.taskMappings.splice(index, 1);
      }
    }
    
    // Write updated sync state
    await writeSyncState(syncState);
    
    Logger.info(`Removed Monday.com item ${mondayItemId} (linked to task ${taskId}) from sync state`);
    return true;
  }
  
  /**
   * Removes a local task from the sync state
   * @param {string} taskId - The task ID to remove
   * @returns {Promise<string|null>} - The Monday.com item ID that was removed, or null if not found
   */
  async function removeLocalTask(taskId) {
    if (!taskId) {
      throw new Error('Task ID is required');
    }
    
    Logger.debug(`Removing local task ${taskId} from sync state`);
    
    // Get the current sync state
    const syncState = await readSyncState();
    
    if (!syncState.items) {
      Logger.warn(`No items found in sync state`);
      return null;
    }
    
    // Find the Monday item ID for this task
    let mondayItemId = null;
    
    // Loop through all items to find the one matching the task ID
    for (const [itemId, item] of Object.entries(syncState.items)) {
      if (item.taskId === taskId) {
        mondayItemId = itemId;
        break;
      }
    }
    
    // If no Monday item was found, return null
    if (!mondayItemId) {
      Logger.warn(`No Monday.com item found for task ${taskId}`);
      return null;
    }
    
    // Remove the item from the sync state
    delete syncState.items[mondayItemId];
    
    // Save the updated sync state
    await writeSyncState(syncState);
    
    Logger.info(`Removed task ${taskId} (linked to Monday.com item ${mondayItemId}) from sync state`);
    return mondayItemId;
  }

  // Return the public API
  return {
    readSyncState,
    writeSyncState,
    getLastSyncedTimestamp,
    updateSyncedTimestamp,
    removeSyncedItem,
    getAllSyncedItemIds,
    getAllSyncedItems,
    getTaskmasterTaskId,
    getMondayItemIdsForTask,
    cleanupOldEntries,
    getLastSyncTime,
    clearCache,
    getUpdateIdForTask,
    storeUpdateIdForTask,
    removeUpdateIdForTask,
    removeMondayItem,
    getEmptySyncState,
    removeLocalTask
  };
}

// Create a default instance
const defaultInstance = createSyncStateManager();

// Export the default instance and the factory function
module.exports = {
  ...defaultInstance,
  createSyncStateManager
}; 