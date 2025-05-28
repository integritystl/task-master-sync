/**
 * Tests for Push Sync Logic
 */

const { createPushSync } = require('../../src/sync/pushSyncLogic');
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

describe('Push Sync Logic', () => {
  // Test data
  const testTask = {
    id: '42',
    title: 'Test Task',
    description: 'This is a test task',
    status: 'in-progress',
    priority: 'high',
    dependencies: ['1', '2'],
    details: 'Implementation details here',
    testStrategy: 'Test strategy here'
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
    tasksFilePath: 'test-tasks.json',
    syncFilePath: 'test-sync-state.json',
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
      createItem: jest.fn().mockResolvedValue({ id: 'monday-item-123', name: 'Test Task' }),
      getItem: jest.fn().mockResolvedValue({ id: 'monday-item-123', name: 'Test Task' }),
      updateItemName: jest.fn().mockResolvedValue({ id: 'monday-item-123', name: 'Updated Task' }),
      updateItemColumnValues: jest.fn().mockResolvedValue({ id: 'monday-item-123', name: 'Test Task' }),
      getBoardGroups: jest.fn().mockResolvedValue([{ id: 'group123', title: 'Test Group' }]),
      flushBatch: jest.fn().mockResolvedValue(undefined)
    };
    
    createMondayClient.mockReturnValue(mockMondayClient);
    
    // Mock sync state manager
    mockStateManager = {
      updateSyncedTimestamp: jest.fn().mockResolvedValue(undefined),
      getMondayItemIdsForTask: jest.fn().mockResolvedValue([]),
      readSyncState: jest.fn().mockResolvedValue({ items: {} }),
      writeSyncState: jest.fn().mockResolvedValue(undefined)
    };
    
    createSyncStateManager.mockReturnValue(mockStateManager);
    
    // Mock taskMasterIO
    taskMasterIO.readTasks = jest.fn().mockResolvedValue([testTask]);
    taskMasterIO.createTaskMasterIO = jest.fn().mockReturnValue({
      readTasks: jest.fn().mockResolvedValue([testTask]),
      writeTasks: jest.fn().mockResolvedValue(undefined)
    });
  });
  
  describe('createPushSync', () => {
    test('throws error when required options are missing', () => {
      // The implementation checks for column mappings before API key
      expect(() => createPushSync({}, {})).toThrow('Monday.com column mappings are required');
      
      // Test column mappings validation
      const configWithColumnMappings = {
        column_mappings: testConfig.column_mappings
      };
      
      // With column mappings but no API key
      expect(() => createPushSync(configWithColumnMappings, {})).toThrow('Monday.com API key is required');
      
      // With column mappings and API key, but no board ID
      expect(() => createPushSync(configWithColumnMappings, { 
        mondayApiKey: 'key'
      })).toThrow('Monday.com board ID is required');
      
      // With column mappings, API key, board ID, but no group IDs
      expect(() => createPushSync(configWithColumnMappings, { 
        mondayApiKey: 'key', 
        mondayBoardId: 'board'
      })).toThrow('Monday.com group IDs array is required');
      
      // With column mappings, API key, board ID, but empty group IDs
      expect(() => createPushSync(configWithColumnMappings, { 
        mondayApiKey: 'key', 
        mondayBoardId: 'board',
        mondayGroupIds: []
      })).toThrow('Monday.com group IDs array is required');
      
      // Should not throw with all required options
      expect(() => createPushSync(configWithColumnMappings, { 
        mondayApiKey: 'key', 
        mondayBoardId: 'board',
        mondayGroupIds: ['group']
      })).not.toThrow();
    });
    
    test('initializes Monday client with correct options', () => {
      createPushSync(testConfig, testOptions);
      
      expect(createMondayClient).toHaveBeenCalledWith(expect.objectContaining({
        monday_api_key: testConfig.monday_api_key,
        apiToken: testConfig.monday_api_key,
        column_mappings: testConfig.column_mappings
      }));
    });
  });
  
  describe('mapTaskToColumnValues', () => {
    test('maps task fields to Monday.com column values', () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      const columnValues = pushSync.mapTaskToColumnValues(testTask);
      
      // Verify mapping
      expect(columnValues).toHaveProperty('text_mkraj7jy', '42');
      expect(columnValues).toHaveProperty('color_mkrat92y.label', 'in-progress');
      expect(columnValues).toHaveProperty('color_mkrav3bj.label', 'high');
      expect(columnValues).toHaveProperty('text_mkra1chv', '1, 2');
      
      // InfoBox is now handled by postTaskUpdates, not directly mapped
      expect(columnValues).not.toHaveProperty('long_text');
    });
    
    test('handles missing optional fields', () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      // Create minimal task with only required fields
      const minimalTask = {
        id: '42',
        title: 'Minimal Task'
      };
      
      const columnValues = pushSync.mapTaskToColumnValues(minimalTask);
      
      // Verify only task ID is mapped
      expect(columnValues).toHaveProperty('text_mkraj7jy', '42');
      expect(columnValues).not.toHaveProperty('color_mkrat92y');
      expect(columnValues).not.toHaveProperty('color_mkrav3bj');
      expect(columnValues).not.toHaveProperty('text_mkra1chv');
    });
    
    test('uses custom column mappings when provided', () => {
      // Create push sync with custom column mappings
      const customOptions = {
        ...testOptions,
        columnMappings: {
          taskId: 'custom_id',
          status: 'custom_status',
          priority: 'custom_priority',
          dependencies: 'custom_deps'
        }
      };
      
      const pushSync = createPushSync(testConfig, customOptions);
      
      const columnValues = pushSync.mapTaskToColumnValues(testTask);
      
      // Verify custom mapping
      expect(columnValues).toHaveProperty('custom_id', '42');
      expect(columnValues).toHaveProperty('custom_status.label', 'in-progress');
      expect(columnValues).toHaveProperty('custom_priority.label', 'high');
      expect(columnValues).toHaveProperty('custom_deps', '1, 2');
      
      // InfoBox is now handled by postTaskUpdates, not directly mapped
      expect(columnValues).not.toHaveProperty('custom_info');
    });
  });
  
  describe('createMondayItem', () => {
    test('creates Monday.com item for a task', async () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      const result = await pushSync.createMondayItem(testTask, 'group123');
      
      // Verify createItem was called with correct params
      expect(mockMondayClient.createItem).toHaveBeenCalledWith(
        testOptions.mondayBoardId,
        'group123',
        testTask.title,
        expect.objectContaining({
          text_mkraj7jy: '42',
          color_mkrat92y: { label: 'in-progress' },
          color_mkrav3bj: { label: 'high' },
          text_mkra1chv: '1, 2'
        })
      );
      
      // Verify sync state was updated
      expect(mockStateManager.updateSyncedTimestamp).toHaveBeenCalledWith(
        'monday-item-123',
        '42'
      );
      
      // Verify return value
      expect(result).toEqual({ id: 'monday-item-123', name: 'Test Task' });
    });
    
    test('handles dry run mode', async () => {
      const dryRunOptions = {
        ...testOptions,
        dryRun: true
      };
      
      const pushSync = createPushSync(testConfig, dryRunOptions);
      
      const result = await pushSync.createMondayItem(testTask, 'group123');
      
      // Verify createItem was NOT called
      expect(mockMondayClient.createItem).not.toHaveBeenCalled();
      
      // Verify sync state was NOT updated
      expect(mockStateManager.updateSyncedTimestamp).not.toHaveBeenCalled();
      
      // Verify return value contains dry run ID
      expect(result.id).toMatch(/dry-run-id-/);
      expect(result.name).toBe(testTask.title);
    });
  });
  
  describe('updateMondayItem', () => {
    test('updates existing Monday.com item for a task', async () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      const result = await pushSync.updateMondayItem(testTask, 'monday-item-123');
      
      // Verify getItem was called
      expect(mockMondayClient.getItem).toHaveBeenCalledWith('monday-item-123');
      
      // Verify updateItemColumnValues was called with correct params
      expect(mockMondayClient.updateItemColumnValues).toHaveBeenCalledWith(
        'monday-item-123',
        testOptions.mondayBoardId,
        expect.objectContaining({
          text_mkraj7jy: '42',
          color_mkrat92y: { label: 'in-progress' },
          color_mkrav3bj: { label: 'high' },
          text_mkra1chv: '1, 2'
        })
      );
      
      // Verify sync state was updated
      expect(mockStateManager.updateSyncedTimestamp).toHaveBeenCalledWith(
        'monday-item-123',
        '42'
      );
      
      // Verify return value
      expect(result).toEqual({ id: 'monday-item-123', name: 'Test Task' });
    });
    
    test('updates item name if changed', async () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      // Mock getItem to return different name
      mockMondayClient.getItem.mockResolvedValue({ 
        id: 'monday-item-123', 
        name: 'Different Name' 
      });
      
      await pushSync.updateMondayItem(testTask, 'monday-item-123');
      
      // Verify updateItemName was called
      expect(mockMondayClient.updateItemName).toHaveBeenCalledWith(
        'monday-item-123',
        testTask.title
      );
    });
    
    test('handles dry run mode', async () => {
      const dryRunOptions = {
        ...testOptions,
        dryRun: true
      };
      
      const pushSync = createPushSync(testConfig, dryRunOptions);
      
      const result = await pushSync.updateMondayItem(testTask, 'monday-item-123');
      
      // Verify API methods were NOT called
      expect(mockMondayClient.getItem).not.toHaveBeenCalled();
      expect(mockMondayClient.updateItemName).not.toHaveBeenCalled();
      expect(mockMondayClient.updateItemColumnValues).not.toHaveBeenCalled();
      
      // Verify sync state was NOT updated
      expect(mockStateManager.updateSyncedTimestamp).not.toHaveBeenCalled();
      
      // Verify return value
      expect(result).toEqual({
        id: 'monday-item-123',
        name: testTask.title
      });
    });
  });
  
  describe('syncTask', () => {
    test('creates new item if task does not exist in Monday.com', async () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      // Mock no existing Monday item IDs
      mockStateManager.getMondayItemIdsForTask.mockResolvedValue([]);
      
      // Provide valid group IDs
      const validGroupIds = ['group123'];
      
      const result = await pushSync.syncTask(testTask, validGroupIds);
      
      // Verify createMondayItem was called
      expect(mockMondayClient.createItem).toHaveBeenCalled();
      
      // Verify updateItemColumnValues was NOT called
      expect(mockMondayClient.updateItemColumnValues).not.toHaveBeenCalled();
      
      // Verify result structure
      expect(result).toHaveProperty('action', 'created');
      expect(result).toHaveProperty('mondayItemId', 'monday-item-123');
      expect(result).toHaveProperty('taskId', '42');
    });
    
    test('updates existing item if task exists in Monday.com', async () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      // Mock existing Monday item ID
      mockStateManager.getMondayItemIdsForTask.mockResolvedValue(['monday-item-123']);
      
      // Provide valid group IDs
      const validGroupIds = ['group123'];
      
      const result = await pushSync.syncTask(testTask, validGroupIds);
      
      // Verify createMondayItem was NOT called
      expect(mockMondayClient.createItem).not.toHaveBeenCalled();
      
      // Verify updateItemColumnValues was called
      expect(mockMondayClient.updateItemColumnValues).toHaveBeenCalled();
      
      // Verify result structure
      expect(result).toHaveProperty('action', 'updated');
      expect(result).toHaveProperty('mondayItemId', 'monday-item-123');
      expect(result).toHaveProperty('taskId', '42');
    });
  });
  
  describe('pushSync', () => {
    test('processes all tasks and returns results', async () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      // Set up task data
      const tasks = [
        { ...testTask, id: '1' },
        { ...testTask, id: '2' },
        { ...testTask, id: '3' }
      ];
      
      // Mock reading tasks
      taskMasterIO.readTasks.mockResolvedValue(tasks);
      
      // Mock getBoardGroups
      mockMondayClient.getBoardGroups.mockResolvedValue([
        { id: 'group123', title: 'Test Group' }
      ]);
      
      // Set up syncTask behavior for each task
      // First task is new, second task exists, third task causes error
      mockStateManager.getMondayItemIdsForTask
        .mockResolvedValueOnce([]) // First task (new)
        .mockResolvedValueOnce(['monday-item-456']) // Second task (existing)
        .mockRejectedValueOnce(new Error('Test error')); // Third task (error)
      
      // Mock createItem for the first task
      mockMondayClient.createItem.mockResolvedValueOnce({
        id: 'monday-item-123',
        name: 'Test Task 1'
      });
      
      // Mock updateItemColumnValues for the second task
      mockMondayClient.updateItemColumnValues.mockResolvedValueOnce({
        id: 'monday-item-456',
        name: 'Test Task 2'
      });
      
      // Mock getItem for the second task
      mockMondayClient.getItem.mockResolvedValueOnce({
        id: 'monday-item-456',
        name: 'Test Task 2'
      });
      
      const results = await pushSync.pushSync('tasks/tasks.json');
      
      // Verify results
      expect(results.created.length).toBe(1);
      expect(results.updated.length).toBe(1);
      expect(results.errors.length).toBe(1);
      
      // Verify specific results
      expect(results.created[0].taskId).toBe('1');
      expect(results.updated[0].taskId).toBe('2');
      expect(results.errors[0].taskId).toBe('3');
      
      // Verify getValidGroupIds was called
      expect(mockMondayClient.getBoardGroups).toHaveBeenCalled();
    });
    
    test('handles empty tasks list', async () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      // Mock empty tasks list
      taskMasterIO.readTasks.mockResolvedValue([]);
      
      // Mock getBoardGroups
      mockMondayClient.getBoardGroups.mockResolvedValue([
        { id: 'group123', title: 'Test Group' }
      ]);
      
      const results = await pushSync.pushSync('tasks/tasks.json');
      
      // Verify results
      expect(results.created.length).toBe(0);
      expect(results.updated.length).toBe(0);
      expect(results.errors.length).toBe(0);
      
      // Verify no processing happened
      expect(mockStateManager.getMondayItemIdsForTask).not.toHaveBeenCalled();
      expect(mockMondayClient.createItem).not.toHaveBeenCalled();
      expect(mockMondayClient.updateItemColumnValues).not.toHaveBeenCalled();
    });
    
    test('handles errors during task processing', async () => {
      const pushSync = createPushSync(testConfig, testOptions);
      
      // Mock task read error
      taskMasterIO.readTasks.mockRejectedValue(new Error('Failed to read tasks'));
      
      await expect(pushSync.pushSync('tasks/tasks.json')).rejects.toThrow('Failed to read tasks');
    });
    
    test('respects dry run mode', async () => {
      const dryRunOptions = {
        ...testOptions,
        dryRun: true
      };
      
      const pushSync = createPushSync(testConfig, dryRunOptions);
      
      // Mock empty tasks list
      taskMasterIO.readTasks.mockResolvedValue([]);
      
      // Mock getBoardGroups
      mockMondayClient.getBoardGroups.mockResolvedValue([
        { id: 'group123', title: 'Test Group' }
      ]);
      
      const results = await pushSync.pushSync('tasks/tasks.json', { dryRun: true });
      
      // Verify dryRun flag in results
      expect(results.dryRun).toBe(true);
    });
  });
}); 