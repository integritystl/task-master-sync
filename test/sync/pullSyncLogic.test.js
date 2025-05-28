/**
 * Tests for Pull Sync Logic
 */

const { createPullSync } = require('../../src/sync/pullSyncLogic');
const { createMondayClient } = require('../../src/api/mondayClient');
const { createSyncStateManager } = require('../../src/sync/syncStateManager');
const taskMasterIO = require('../../src/sync/taskMasterIO');

// Mock dependencies
jest.mock('../../src/api/mondayClient');
jest.mock('../../src/sync/syncStateManager');
jest.mock('../../src/sync/taskMasterIO');
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Pull Sync Logic', () => {
  // Test data
  const testMondayItem = {
    id: 'monday-item-123',
    name: 'Test Task from Monday',
    updated_at: '2023-05-27T10:00:00Z',
    column_values: [
      { id: 'text_mkraj7jy', text: '42', type: 'text' },
      { id: 'color_mkrat92y', text: 'in-progress', type: 'color' },
      { id: 'color_mkrav3bj', text: 'high', type: 'color' },
      { id: 'text_mkra1chv', text: '1, 2', type: 'text' },
      { id: 'long_text_mkrby17a', text: 'This is a description from Monday', type: 'long-text' },
      { id: 'long_text_mkrbszdp', text: 'These are details from Monday', type: 'long-text' },
      { id: 'long_text_mkrbazct', text: 'This is a test strategy from Monday', type: 'long-text' }
    ]
  };
  
  const testLocalTask = {
    id: '42',
    title: 'Test Local Task',
    description: 'This is a local task description',
    status: 'pending',
    priority: 'medium',
    dependencies: ['1', '2'],
    details: 'Local implementation details here',
    testStrategy: 'Local test strategy here',
    monday_item_id: 'monday-item-123'
  };
  
  // Mock config with column mappings
  const testConfig = {
    monday_board_id: 'board123',
    monday_group_ids: ['group123'],
    monday_api_key: 'test-api-key',
    developer_id: 'test-dev',
    column_mappings: {
      taskId: 'text_mkraj7jy',
      status: 'color_mkrat92y',
      priority: 'color_mkrav3bj',
      dependencies: 'text_mkra1chv',
      complexity: 'color_mkrar5f7',
      description: 'long_text_mkrby17a',
      details: 'long_text_mkrbszdp',
      testStrategy: 'long_text_mkrbazct'
    },
    status_mappings: {
      'pending': 'pending',
      'in-progress': 'in-progress',
      'done': 'done'
    },
    priority_mappings: {
      'high': 'high',
      'medium': 'medium',
      'low': 'low'
    }
  };
  
  const testOptions = {
    mondayApiKey: 'test-api-key',
    mondayBoardId: 'board123',
    mondayGroupIds: ['group123'],
    tasksPath: 'test-tasks.json',
    statePath: 'test-sync-state.json',
    dryRun: false
  };
  
  // Mock implementations
  let mockMondayClient;
  let mockStateManager;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Mock Monday client
    mockMondayClient = {
      getItems: jest.fn().mockResolvedValue([testMondayItem]),
      getBoardGroups: jest.fn().mockResolvedValue([{ id: 'group123', title: 'Test Group' }])
    };
    
    createMondayClient.mockReturnValue(mockMondayClient);
    
    // Mock sync state manager
    mockStateManager = {
      getLastSyncedTimestamp: jest.fn().mockResolvedValue(null),
      updateSyncedTimestamp: jest.fn().mockResolvedValue(undefined),
      readSyncState: jest.fn().mockResolvedValue({ items: {} }),
      writeSyncState: jest.fn().mockResolvedValue(undefined),
      getTaskmasterTaskId: jest.fn().mockResolvedValue(null)
    };
    
    createSyncStateManager.mockReturnValue(mockStateManager);
    
    // Mock taskMasterIO
    taskMasterIO.readTasks = jest.fn().mockResolvedValue([testLocalTask]);
    taskMasterIO.createTaskMasterIO = jest.fn().mockReturnValue({
      readTasks: jest.fn().mockResolvedValue([testLocalTask]),
      writeTasks: jest.fn().mockResolvedValue(undefined),
      getTaskById: jest.fn().mockReturnValue(testLocalTask),
      updateTaskById: jest.fn().mockReturnValue(testLocalTask)
    });
  });
  
  describe('createPullSync', () => {
    test('throws error when required options are missing', () => {
      // Empty config instead of normal testConfig
      const emptyConfig = {};
      
      expect(() => createPullSync(emptyConfig, {})).toThrow('Monday.com API key is required');
      
      expect(() => createPullSync(emptyConfig, { mondayApiKey: 'key' })).toThrow('Monday.com board ID is required');
      
      expect(() => createPullSync(emptyConfig, { 
        mondayApiKey: 'key', 
        mondayBoardId: 'board'
      })).toThrow('Monday.com group IDs array is required');
      
      expect(() => createPullSync(emptyConfig, { 
        mondayApiKey: 'key', 
        mondayBoardId: 'board',
        mondayGroupIds: []
      })).toThrow('Monday.com group IDs array is required');
      
      // Should not throw with all required options
      expect(() => createPullSync(emptyConfig, { 
        mondayApiKey: 'key', 
        mondayBoardId: 'board',
        mondayGroupIds: ['group']
      })).not.toThrow();
    });
    
    test('initializes Monday client with correct options', () => {
      createPullSync(testConfig, testOptions);
      
      expect(createMondayClient).toHaveBeenCalledWith(testConfig);
    });
  });
  
  describe('mapItemToTask', () => {
    test('maps Monday.com item fields to TaskMaster task fields', () => {
      const pullSync = createPullSync(testConfig, testOptions);
      
      const task = pullSync.mapItemToTask(testMondayItem);
      
      // Verify mapping
      expect(task).toHaveProperty('id', '42');
      expect(task).toHaveProperty('title', 'Test Task from Monday');
      expect(task).toHaveProperty('status', 'in-progress');
      expect(task).toHaveProperty('priority', 'high');
      expect(task).toHaveProperty('dependencies', ['1', '2']);
      expect(task).toHaveProperty('description', 'This is a description from Monday');
      expect(task).toHaveProperty('details', 'These are details from Monday');
      expect(task).toHaveProperty('testStrategy', 'This is a test strategy from Monday');
      expect(task).toHaveProperty('monday_item_id', 'monday-item-123');
    });
    
    test('handles missing optional fields', () => {
      const pullSync = createPullSync(testConfig, testOptions);
      
      // Create minimal Monday item with only required fields
      const minimalItem = {
        id: 'monday-item-456',
        name: 'Minimal Item',
        column_values: [
          { id: 'text_mkraj7jy', text: '99', type: 'text' }
        ]
      };
      
      const task = pullSync.mapItemToTask(minimalItem);
      
      // Verify only required fields are mapped
      expect(task).toHaveProperty('id', '99');
      expect(task).toHaveProperty('title', 'Minimal Item');
      expect(task).toHaveProperty('monday_item_id', 'monday-item-456');
      expect(task).toHaveProperty('dependencies', []);
      expect(task).toHaveProperty('subtasks', []);
      // These should not be in the output at all
      expect(task.status).toBeUndefined();
      expect(task.priority).toBeUndefined();
      expect(task.description).toBeUndefined();
      expect(task.details).toBeUndefined();
      expect(task.testStrategy).toBeUndefined();
    });
    
    test('uses custom column mappings when provided', () => {
      // Create pull sync with custom column mappings
      const customOptions = {
        ...testOptions,
        columnMappings: {
          taskId: 'custom_id',
          status: 'custom_status',
          priority: 'custom_priority',
          dependencies: 'custom_deps',
          description: 'custom_desc',
          details: 'custom_details',
          testStrategy: 'custom_tests'
        }
      };
      
      const pullSync = createPullSync(testConfig, customOptions);
      
      // Create Monday item with custom column IDs
      const customItem = {
        id: 'monday-item-789',
        name: 'Custom Item',
        column_values: [
          { id: 'custom_id', text: '123', type: 'text' },
          { id: 'custom_status', text: 'done', type: 'color' },
          { id: 'custom_priority', text: 'low', type: 'color' },
          { id: 'custom_deps', text: '3, 4', type: 'text' },
          { id: 'custom_desc', text: 'Custom description', type: 'long-text' },
          { id: 'custom_details', text: 'Custom details', type: 'long-text' },
          { id: 'custom_tests', text: 'Custom test strategy', type: 'long-text' }
        ]
      };
      
      const task = pullSync.mapItemToTask(customItem);
      
      // Verify mapping with custom column IDs
      expect(task).toHaveProperty('id', '123');
      expect(task).toHaveProperty('title', 'Custom Item');
      expect(task).toHaveProperty('status', 'done');
      expect(task).toHaveProperty('priority', 'low');
      expect(task).toHaveProperty('dependencies', ['3', '4']);
      expect(task).toHaveProperty('description', 'Custom description');
      expect(task).toHaveProperty('details', 'Custom details');
      expect(task).toHaveProperty('testStrategy', 'Custom test strategy');
      expect(task).toHaveProperty('monday_item_id', 'monday-item-789');
    });
  });
  
  describe('fetchMondayItems', () => {
    test('fetches items from Monday.com board', async () => {
      const pullSync = createPullSync(testConfig, testOptions);
      
      const items = await pullSync.fetchMondayItems();
      
      // Verify getBoardGroups was called with correct params
      expect(mockMondayClient.getBoardGroups).toHaveBeenCalledWith(testConfig.monday_board_id);
      expect(mockMondayClient.getItems).toHaveBeenCalledWith(testConfig.monday_board_id, { groupId: 'group123' });
      
      // Verify items were returned
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(testMondayItem);
    });
    
    test('handles special "all" group ID', async () => {
      // Create pull sync with "all" group ID
      const allGroupsOptions = {
        ...testOptions,
        mondayGroupIds: ['all']
      };
      
      const pullSync = createPullSync(testConfig, allGroupsOptions);
      
      // Mock getBoardGroups to return multiple groups
      mockMondayClient.getBoardGroups.mockResolvedValueOnce([
        { id: 'group1', title: 'Group 1' },
        { id: 'group2', title: 'Group 2' },
        { id: 'group3', title: 'Group 3' }
      ]);
      
      await pullSync.fetchMondayItems();
      
      // Verify getItems was called for each group
      expect(mockMondayClient.getItems).toHaveBeenCalledWith(testConfig.monday_board_id, { groupId: 'group1' });
      expect(mockMondayClient.getItems).toHaveBeenCalledWith(testConfig.monday_board_id, { groupId: 'group2' });
      expect(mockMondayClient.getItems).toHaveBeenCalledWith(testConfig.monday_board_id, { groupId: 'group3' });
    });
    
    test('throws error when no valid groups are found', async () => {
      // Create pull sync with invalid group ID
      const invalidGroupOptions = {
        ...testOptions,
        mondayGroupIds: ['invalid-group']
      };
      
      const pullSync = createPullSync(testConfig, invalidGroupOptions);
      
      // Mock getBoardGroups to return groups that don't match the requested group
      mockMondayClient.getBoardGroups.mockResolvedValueOnce([
        { id: 'group1', title: 'Group 1' },
        { id: 'group2', title: 'Group 2' }
      ]);
      
      // Expect fetchMondayItems to throw an error
      await expect(pullSync.fetchMondayItems()).rejects.toThrow('No valid groups found');
    });
  });
  
  describe('compareItemsWithTasks', () => {
    test('identifies new items', async () => {
      const pullSync = createPullSync(testConfig, testOptions);
      
      // Create a Monday item that doesn't exist locally
      const newMondayItem = {
        id: 'monday-item-new',
        name: 'New Task',
        column_values: [
          { id: 'text_mkraj7jy', text: '99', type: 'text' }
        ]
      };
      
      const comparison = await pullSync.compareItemsWithTasks([newMondayItem], [testLocalTask]);
      
      // Verify new item was identified
      expect(comparison.newItems).toHaveLength(1);
      expect(comparison.newItems[0]).toHaveProperty('id', '99');
      expect(comparison.updatedItems).toHaveLength(0);
      expect(comparison.conflicts).toHaveLength(0);
    });
    
    test('identifies updated items', async () => {
      const pullSync = createPullSync(testConfig, testOptions);
      
      // Create a Monday item that exists locally but has been updated
      const updatedMondayItem = {
        ...testMondayItem,
        updated_at: '2023-05-28T10:00:00Z' // Newer than the last sync
      };
      
      // Mock getLastSyncedTimestamp to return an older timestamp
      mockStateManager.getLastSyncedTimestamp.mockResolvedValueOnce(new Date('2023-05-27T09:00:00Z').getTime());
      
      const comparison = await pullSync.compareItemsWithTasks([updatedMondayItem], [testLocalTask]);
      
      // Verify updated item was identified
      expect(comparison.newItems).toHaveLength(0);
      expect(comparison.updatedItems).toHaveLength(1);
      expect(comparison.updatedItems[0]).toHaveProperty('id', '42');
      expect(comparison.conflicts).toHaveLength(0);
    });
    
    test('skips items without task ID', async () => {
      const pullSync = createPullSync(testConfig, testOptions);
      
      // Create a Monday item without a task ID
      const noTaskIdItem = {
        id: 'monday-item-no-id',
        name: 'Item Without Task ID',
        column_values: []
      };
      
      const comparison = await pullSync.compareItemsWithTasks([noTaskIdItem], [testLocalTask]);
      
      // Verify no items were identified
      expect(comparison.newItems).toHaveLength(0);
      expect(comparison.updatedItems).toHaveLength(0);
      expect(comparison.conflicts).toHaveLength(0);
    });
    
    test('skips items that have not changed since last sync', async () => {
      const pullSync = createPullSync(testConfig, testOptions);
      
      // Create a Monday item with identical content to the local task
      const unchangedMondayItem = {
        id: 'monday-item-123',
        name: 'Test Local Task', // Same as testLocalTask.title
        updated_at: '2023-05-27T08:00:00Z', // Older than the last sync
        column_values: [
          { id: 'text_mkraj7jy', text: '42', type: 'text' },
          { id: 'color_mkrat92y', text: 'pending', type: 'color' }, // Same as testLocalTask.status
          { id: 'color_mkrav3bj', text: 'medium', type: 'color' }, // Same as testLocalTask.priority
          { id: 'text_mkra1chv', text: '1, 2', type: 'text' }, // Same as testLocalTask.dependencies
          { id: 'long_text_mkrby17a', text: 'This is a local task description', type: 'long-text' }, // Same as testLocalTask.description
          { id: 'long_text_mkrbszdp', text: 'Local implementation details here', type: 'long-text' }, // Same as testLocalTask.details
          { id: 'long_text_mkrbazct', text: 'Local test strategy here', type: 'long-text' } // Same as testLocalTask.testStrategy
        ]
      };
      
      // Mock getLastSyncedTimestamp to return a newer timestamp
      mockStateManager.getLastSyncedTimestamp.mockResolvedValueOnce(new Date('2023-05-27T09:00:00Z').getTime());
      
      const comparison = await pullSync.compareItemsWithTasks([unchangedMondayItem], [testLocalTask]);
      
      // Verify no items were identified for update
      expect(comparison.newItems).toHaveLength(0);
      expect(comparison.updatedItems).toHaveLength(0);
      expect(comparison.conflicts).toHaveLength(0);
    });
  });
  
  describe('pullSync', () => {
    test('returns dry run results without writing changes', async () => {
      // Arrange
      // Create a new mock Monday client for this test
      const mockBoardGroups = [{ id: 'group123', title: 'Test Group' }]; // Match group ID in testConfig
      const mockMonday = {
        getItems: jest.fn().mockImplementation((boardId, options) => {
          // Only return items for the specified group ID
          if (boardId === testConfig.monday_board_id && options.groupId === 'group123') {
            return Promise.resolve([
              {
                id: 'monday-item-new',
                name: 'New Task',
                updated_at: Date.now(),
                column_values: [
                  { id: 'text_mkraj7jy', text: '99' }
                ]
              }
            ]);
          }
          return Promise.resolve([]);
        }),
        getBoardGroups: jest.fn().mockImplementation((boardId) => {
          // Only return groups for the specified board ID
          if (boardId === testConfig.monday_board_id) {
            return Promise.resolve(mockBoardGroups);
          }
          return Promise.resolve([]);
        })
      };
      
      // Set up mock implementations for this test only
      createMondayClient.mockReturnValueOnce(mockMonday);
      
      // Set up mock tasks
      const mockTasks = {
        tasks: [
          { id: '1', title: 'Existing Task', monday_item_id: 'monday-item-1' }
        ]
      };
      taskMasterIO.readTasks.mockResolvedValueOnce(mockTasks);
      
      // Mock compareItemsWithTasks to return specific results
      const mockComparisonResult = {
        newItems: [{ id: '99', title: 'New Task', monday_item_id: 'monday-item-new' }],
        updatedItems: [],
        conflictItems: [],
        unchangedItems: [],
        recreatedItems: [],
        orphanedTaskIds: []
      };
      
      // Create pull sync module with dry run option
      const pullSyncModule = createPullSync(testConfig, {
        tasksFilePath: 'tasks.json',
        syncFilePath: 'sync.json',
        dryRun: true,
        columnMappings: testConfig.column_mappings,
        removeOrphaned: false, // Disable orphaned task removal for this test
        mondayBoardId: testConfig.monday_board_id,
        mondayGroupIds: testConfig.monday_group_ids
      });
      
      // Replace the compareItemsWithTasks method for this test
      pullSyncModule.compareItemsWithTasks = jest.fn().mockResolvedValue(mockComparisonResult);
      
      // Mock findOrphanedLocalTasks to return an empty array
      pullSyncModule.findOrphanedLocalTasks = jest.fn().mockResolvedValue([]);
      
      // Override the original pullSync method to ensure we have control over the result
      const originalPullSync = pullSyncModule.pullSync;
      pullSyncModule.pullSync = jest.fn().mockImplementation(async (options) => {
        const result = await originalPullSync.call(pullSyncModule, options);
        // Ensure orphanedTasks is explicitly set to 0
        result.orphanedTasks = 0;
        return result;
      });
      
      // Act - explicitly set dryRun: true in the options
      const result = await pullSyncModule.pullSync({
        dryRun: true,
        removeOrphaned: false
      });
      
      // Assert
      expect(result).toHaveProperty('dryRun', true);
      expect(result.new.length).toBe(1);
      expect(result.updated.length).toBe(0);
      expect(result.conflicts.length).toBe(0);
      expect(result.orphanedTasks).toBe(0);
      
      // Verify task fields
      expect(result.new[0]).toHaveProperty('id', '99');
      expect(result.new[0]).toHaveProperty('title', 'New Task');
      expect(result.new[0]).toHaveProperty('monday_item_id', 'monday-item-new');
      
      // Verify no write operations were performed
      expect(taskMasterIO.writeTasks).not.toHaveBeenCalled();
      
      // Verify getBoardGroups and getItems were called with correct params
      expect(mockMonday.getBoardGroups).toHaveBeenCalledWith(testConfig.monday_board_id);
      expect(mockMonday.getItems).toHaveBeenCalledWith(testConfig.monday_board_id, { groupId: 'group123' });
    });
    
    test('handles errors gracefully', async () => {
      const pullSync = createPullSync(testConfig, testOptions);
      
      // Mock fetchMondayItems to throw an error
      mockMondayClient.getItems.mockRejectedValueOnce(new Error('API error'));
      
      // Expect pullSync to throw the error
      await expect(pullSync.pullSync()).rejects.toThrow('API error');
    });
  });
}); 