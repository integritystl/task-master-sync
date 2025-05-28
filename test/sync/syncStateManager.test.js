/**
 * Tests for the Sync State Manager
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { createSyncStateManager } = require('../../src/sync/syncStateManager');

// Create a temporary test file path
const TEST_SYNC_FILE = path.join(os.tmpdir(), `test-sync-state-${Date.now()}.json`);

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Sync State Manager', () => {
  let syncStateManager;
  
  beforeEach(() => {
    // Create a new instance for each test with the test file path
    syncStateManager = createSyncStateManager({
      syncFilePath: TEST_SYNC_FILE,
      lockTimeoutMs: 1000
    });
  });
  
  afterEach(async () => {
    // Clean up the test file after each test
    try {
      await fs.unlink(TEST_SYNC_FILE);
    } catch (error) {
      // Ignore file not found errors
      if (error.code !== 'ENOENT') {
        console.error('Error cleaning up test file:', error);
      }
    }
    
    // Also clean up any lock files
    try {
      await fs.unlink(`${TEST_SYNC_FILE}.lock`);
    } catch (error) {
      // Ignore file not found errors
      if (error.code !== 'ENOENT') {
        console.error('Error cleaning up lock file:', error);
      }
    }
  });
  
  describe('readSyncState', () => {
    test('should return empty sync state for new file', async () => {
      const syncState = await syncStateManager.readSyncState();
      
      expect(syncState).toEqual({
        version: '1.0',
        lastSync: null,
        taskMappings: [],
        mondayToTaskMaster: {},
        taskMasterToMonday: {},
        items: {}
      });
    });
    
    test('should read existing sync state', async () => {
      // Create a test sync state file
      const testSyncState = {
        version: '1.0',
        items: {
          'monday-123': {
            taskmasterTaskId: '42',
            timestamp: 1620000000000
          }
        },
        lastSync: 1620000000000,
        taskMappings: [],
        mondayToTaskMaster: {},
        taskMasterToMonday: {}
      };
      
      await fs.writeFile(TEST_SYNC_FILE, JSON.stringify(testSyncState));
      
      // Read the sync state
      const syncState = await syncStateManager.readSyncState();
      
      expect(syncState).toEqual(testSyncState);
    });
    
    test('should handle invalid JSON', async () => {
      // Create an invalid JSON file
      await fs.writeFile(TEST_SYNC_FILE, 'invalid JSON');
      
      // Should not throw, but return empty state
      const syncState = await syncStateManager.readSyncState();
      expect(syncState).toEqual({
        version: '1.0',
        lastSync: null,
        taskMappings: [],
        mondayToTaskMaster: {},
        taskMasterToMonday: {},
        items: {}
      });
    });
    
    test('should use cache if available', async () => {
      // Create a test sync state file
      const testSyncState = {
        version: '1.0',
        items: {
          'monday-123': {
            taskmasterTaskId: '42',
            timestamp: 1620000000000
          }
        },
        lastSync: 1620000000000,
        taskMappings: [],
        mondayToTaskMaster: {},
        taskMasterToMonday: {}
      };
      
      await fs.writeFile(TEST_SYNC_FILE, JSON.stringify(testSyncState));
      
      // Read the sync state once to populate the cache
      await syncStateManager.readSyncState();
      
      // Modify the file directly
      const modifiedSyncState = {
        version: '1.0',
        items: {
          'monday-456': {
            taskmasterTaskId: '43',
            timestamp: 1620000000001
          }
        },
        lastSync: 1620000000001,
        taskMappings: [],
        mondayToTaskMaster: {},
        taskMasterToMonday: {}
      };
      
      await fs.writeFile(TEST_SYNC_FILE, JSON.stringify(modifiedSyncState));
      
      // Read again - should use cache
      const cachedSyncState = await syncStateManager.readSyncState();
      
      // Should match the original, not the modified version
      expect(cachedSyncState).toEqual(testSyncState);
      
      // Now bypass cache - should get the modified version
      const bypassedSyncState = await syncStateManager.readSyncState(true);
      
      expect(bypassedSyncState).toEqual(modifiedSyncState);
    });
  });
  
  describe('writeSyncState', () => {
    test('should write sync state to file', async () => {
      const testSyncState = {
        items: {
          'monday-123': {
            taskmasterTaskId: '42',
            timestamp: 1620000000000
          }
        },
        lastSync: null // Will be set by the write function
      };
      
      // Write the sync state
      await syncStateManager.writeSyncState(testSyncState);
      
      // Read the file directly
      const fileContent = await fs.readFile(TEST_SYNC_FILE, 'utf8');
      const parsedSyncState = JSON.parse(fileContent);
      
      // Check that items were preserved
      expect(parsedSyncState.items).toEqual(testSyncState.items);
      
      // Check that lastSync was set
      expect(parsedSyncState.lastSync).toBeDefined();
      expect(typeof parsedSyncState.lastSync).toBe('number');
    });
    
    test('should throw error for invalid sync state', async () => {
      await expect(syncStateManager.writeSyncState(null)).rejects.toThrow('Invalid sync state');
      await expect(syncStateManager.writeSyncState('string')).rejects.toThrow('Invalid sync state');
      await expect(syncStateManager.writeSyncState(123)).rejects.toThrow('Invalid sync state');
    });
    
    test('should ensure valid structure', async () => {
      // Missing items property
      const invalidSyncState = {
        lastSync: 1620000000000
      };
      
      // Should still work by adding items
      await syncStateManager.writeSyncState(invalidSyncState);
      
      // Read back and verify
      const syncState = await syncStateManager.readSyncState(true);
      
      expect(syncState.items).toEqual({});
      expect(syncState.lastSync).toBeDefined();
    });
  });
  
  describe('Item operations', () => {
    test('should update and get synced timestamp', async () => {
      const mondayItemId = 'monday-123';
      const taskmasterTaskId = '42';
      const timestamp = 1620000000000;
      
      // Initially should be null
      const initialTimestamp = await syncStateManager.getLastSyncedTimestamp(mondayItemId);
      expect(initialTimestamp).toBeNull();
      
      // Update the timestamp
      await syncStateManager.updateSyncedTimestamp(mondayItemId, taskmasterTaskId, timestamp);
      
      // Now should be set
      const updatedTimestamp = await syncStateManager.getLastSyncedTimestamp(mondayItemId);
      expect(updatedTimestamp).toBe(timestamp);
      
      // Get the TaskMaster task ID
      const retrievedTaskId = await syncStateManager.getTaskmasterTaskId(mondayItemId);
      expect(retrievedTaskId).toBe(taskmasterTaskId);
    });
    
    test('should remove synced item', async () => {
      const mondayItemId = 'monday-123';
      const taskmasterTaskId = '42';
      
      // Add an item
      await syncStateManager.updateSyncedTimestamp(mondayItemId, taskmasterTaskId);
      
      // Verify it exists
      expect(await syncStateManager.getLastSyncedTimestamp(mondayItemId)).not.toBeNull();
      
      // Remove it
      const removeResult = await syncStateManager.removeSyncedItem(mondayItemId);
      expect(removeResult).toBe(true);
      
      // Verify it's gone
      expect(await syncStateManager.getLastSyncedTimestamp(mondayItemId)).toBeNull();
      
      // Removing again should return false
      const secondRemoveResult = await syncStateManager.removeSyncedItem(mondayItemId);
      expect(secondRemoveResult).toBe(false);
    });
    
    test('should get all synced item IDs', async () => {
      // Add a few items
      await syncStateManager.updateSyncedTimestamp('monday-123', '42');
      await syncStateManager.updateSyncedTimestamp('monday-456', '43');
      await syncStateManager.updateSyncedTimestamp('monday-789', '44');
      
      // Get all IDs
      const itemIds = await syncStateManager.getAllSyncedItemIds();
      
      expect(itemIds).toHaveLength(3);
      expect(itemIds).toContain('monday-123');
      expect(itemIds).toContain('monday-456');
      expect(itemIds).toContain('monday-789');
    });
    
    test('should get all synced items', async () => {
      // Add a few items
      await syncStateManager.updateSyncedTimestamp('monday-123', '42');
      await syncStateManager.updateSyncedTimestamp('monday-456', '43');
      
      // Get all items
      const items = await syncStateManager.getAllSyncedItems();
      
      expect(Object.keys(items)).toHaveLength(2);
      expect(items['monday-123']).toBe('42');
      expect(items['monday-456']).toBe('43');
    });
    
    test('should get Monday item IDs for a TaskMaster task ID', async () => {
      // Add multiple items with the same TaskMaster task ID
      await syncStateManager.updateSyncedTimestamp('monday-123', '42');
      await syncStateManager.updateSyncedTimestamp('monday-456', '42');
      await syncStateManager.updateSyncedTimestamp('monday-789', '43');
      
      // Get items for task ID 42
      const itemIds = await syncStateManager.getMondayItemIdsForTask('42');
      
      expect(itemIds).toHaveLength(2);
      expect(itemIds).toContain('monday-123');
      expect(itemIds).toContain('monday-456');
      expect(itemIds).not.toContain('monday-789');
    });
    
    test('should clean up old entries', async () => {
      // Add an old item and a new item
      const now = Date.now();
      const oldTimestamp = now - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      const newTimestamp = now - (1 * 24 * 60 * 60 * 1000);  // 1 day ago
      
      await syncStateManager.updateSyncedTimestamp('monday-old', '42', oldTimestamp);
      await syncStateManager.updateSyncedTimestamp('monday-new', '43', newTimestamp);
      
      // Set max age to 30 days
      const maxAge = 30 * 24 * 60 * 60 * 1000;
      
      // Clean up old entries
      const removedCount = await syncStateManager.cleanupOldEntries(maxAge);
      
      // Expect 2 entries to be removed (1 from items, 1 from taskMappings)
      expect(removedCount).toBe(2);
      
      // Verify only the old item was removed
      expect(await syncStateManager.getLastSyncedTimestamp('monday-old')).toBeNull();
      expect(await syncStateManager.getLastSyncedTimestamp('monday-new')).not.toBeNull();
    });
  });
  
  describe('Cache management', () => {
    test('should clear cache', async () => {
      // Create a sync state file
      const initialSyncState = {
        version: '1.0',
        lastSync: 1620000000000,
        items: {
          'monday-123': {
            taskmasterTaskId: '42',
            timestamp: 1620000000000
          },
          'monday-456': {
            taskmasterTaskId: '43',
            timestamp: 1620000000001
          }
        },
        taskMappings: [],
        mondayToTaskMaster: {},
        taskMasterToMonday: {}
      };
      
      await fs.writeFile(TEST_SYNC_FILE, JSON.stringify(initialSyncState, null, 2));
      
      // Read the sync state (this caches it)
      await syncStateManager.readSyncState();
      
      // Modify the file directly
      const modifiedSyncState = {
        version: '1.0',
        lastSync: 1620000000001,
        items: {
          'monday-456': {
            taskmasterTaskId: '43',
            timestamp: 1620000000001
          }
        },
        taskMappings: [],
        mondayToTaskMaster: {},
        taskMasterToMonday: {}
      };
      
      await fs.writeFile(TEST_SYNC_FILE, JSON.stringify(modifiedSyncState, null, 2));
      
      // Read the sync state again (this should use the cache)
      let syncState = await syncStateManager.readSyncState();
      expect(syncState).not.toEqual(modifiedSyncState);
      
      // Clear the cache
      syncStateManager.clearCache();
      
      // Read the sync state again (this should read from disk)
      syncState = await syncStateManager.readSyncState();
      
      expect(syncState).toEqual(modifiedSyncState);
    });
  });
  
  describe('Last sync time', () => {
    test('should get last sync time', async () => {
      // Initially should be null
      const initialTime = await syncStateManager.getLastSyncTime();
      expect(initialTime).toBeNull();
      
      // Write something to update lastSync
      await syncStateManager.updateSyncedTimestamp('monday-123', '42');
      
      // Now should be set
      const lastSyncTime = await syncStateManager.getLastSyncTime();
      expect(lastSyncTime).toBeDefined();
      expect(typeof lastSyncTime).toBe('number');
    });
  });
}); 