/**
 * Tests for TaskMaster-Monday Sync CLI
 */

const fs = require('fs');
const cli = require('../../src/cli/cli');
const { createPushSync } = require('../../src/sync/pushSyncLogic');
const { createPullSync } = require('../../src/sync/pullSyncLogic');

// Mock dependencies
jest.mock('fs');
jest.mock('chalk', () => ({
  red: jest.fn(text => text),
  green: jest.fn(text => text),
  blue: jest.fn(text => text),
  yellow: jest.fn(text => text),
  dim: jest.fn(text => text),
  bold: jest.fn(text => text),
  cyan: jest.fn(text => text)
}));
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis()
  }));
});
jest.mock('../../src/sync/pushSyncLogic');
jest.mock('../../src/sync/pullSyncLogic');
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    level: 'info'
  }
}));

// Mock console.log and error
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

describe('CLI Module', () => {
  // Test data
  const validConfig = {
    monday_api_key: 'test-api-key',
    monday_board_id: 'board123',
    monday_group_ids: ['group123']
  };
  
  const pushSyncResults = {
    created: [
      { taskId: '1', mondayItemId: 'monday-1' }
    ],
    updated: [
      { taskId: '2', mondayItemId: 'monday-2' }
    ],
    errors: [
      { taskId: '3', error: 'Test error' }
    ],
    dryRun: false
  };
  
  const pullSyncResults = {
    newTasks: 1,
    updatedTasks: 1,
    conflicts: 1,
    newItems: [
      { id: '4', title: 'New Task' }
    ],
    updatedItems: [
      { id: '5', title: 'Updated Task' }
    ],
    conflictItems: [
      { 
        mondayTask: { id: '6', title: 'Conflict Task' },
        localTask: { id: '6', title: 'Local Task' }
      }
    ],
    dryRun: false
  };
  
  // Mock implementations
  let mockPushSync;
  let mockPullSync;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    
    // Mock file system
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
    
    // Mock push sync
    mockPushSync = {
      pushSync: jest.fn().mockResolvedValue(pushSyncResults)
    };
    createPushSync.mockReturnValue(mockPushSync);
    
    // Mock pull sync
    mockPullSync = {
      pullSync: jest.fn().mockResolvedValue(pullSyncResults)
    };
    createPullSync.mockReturnValue(mockPullSync);
  });
  
  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });
  
  describe('loadConfig', () => {
    test('loads and validates config file', () => {
      const config = cli.loadConfig('config.json');
      
      expect(fs.existsSync).toHaveBeenCalledWith('config.json');
      expect(fs.readFileSync).toHaveBeenCalledWith('config.json', 'utf8');
      expect(config).toEqual(validConfig);
    });
    
    test('exits when config file not found', () => {
      fs.existsSync.mockReturnValueOnce(false);
      
      cli.loadConfig('missing.json');
      
      expect(console.error).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
    
    test('exits when required fields are missing', () => {
      // Test missing API key
      fs.readFileSync.mockReturnValueOnce(JSON.stringify({
        monday_board_id: 'board123',
        monday_group_ids: ['group123']
      }));
      
      cli.loadConfig('invalid.json');
      
      expect(console.error).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
  
  describe('formatSyncResults', () => {
    test('formats push sync results', () => {
      const formatted = cli.formatSyncResults(pushSyncResults);
      
      expect(formatted).toContain('Created 1 items');
      expect(formatted).toContain('Updated 1 items');
      expect(formatted).toContain('Encountered 1 errors');
      expect(formatted).toContain('Summary: 1 created, 1 updated, 1 errors');
    });
    
    test('includes dry run message when appropriate', () => {
      const dryRunResults = { ...pushSyncResults, dryRun: true };
      const formatted = cli.formatSyncResults(dryRunResults);
      
      expect(formatted).toContain('This was a dry run');
    });
  });
  
  describe('formatPullResults', () => {
    test('formats pull sync results', () => {
      // Add orphanedTasks and orphanedTaskIds to the test results
      const resultsWithOrphaned = {
        ...pullSyncResults,
        orphanedTasks: 1,
        orphanedTaskIds: ['7']
      };
      
      const formatted = cli.formatPullResults(resultsWithOrphaned);
      
      expect(formatted).toContain('Found 1 new tasks');
      expect(formatted).toContain('Found 1 tasks with updates');
      expect(formatted).toContain('Found 1 potential conflicts');
      expect(formatted).toContain('Found 1 orphaned tasks');
      expect(formatted).toContain('Summary: 1 new, 1 updated, 1 orphaned, 1 conflicts');
    });
    
    test('includes dry run message when appropriate', () => {
      const dryRunResults = { ...pullSyncResults, dryRun: true };
      const formatted = cli.formatPullResults(dryRunResults);
      
      expect(formatted).toContain('This was a dry run');
    });
  });
  
  describe('runPushSync', () => {
    test('creates push sync with correct options', async () => {
      await cli.runPushSync({
        config: 'config.json',
        tasks: 'tasks.json',
        state: 'state.json',
        dryRun: true,
        verbose: true,
        deleteOrphaned: false
      });
      
      expect(createPushSync).toHaveBeenCalledWith(expect.objectContaining({
        mondayApiKey: 'test-api-key',
        tasksFilePath: expect.stringContaining('tasks.json'),
        syncFilePath: expect.stringContaining('state.json'),
        dryRun: true,
        deleteOrphaned: false,
        mondayBoardId: 'board123',
        mondayGroupIds: ['group123']
      }));
    });
    
    test('executes push sync and displays results', async () => {
      await cli.runPushSync({
        config: 'config.json',
        tasks: 'tasks.json'
      });
      
      expect(mockPushSync.pushSync).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
    });
    
    test('handles errors gracefully', async () => {
      mockPushSync.pushSync.mockRejectedValueOnce(new Error('Test error'));
      
      await cli.runPushSync({
        config: 'config.json',
        tasks: 'tasks.json'
      });
      
      expect(console.error).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
  
  describe('runPullSync', () => {
    test('creates pull sync with correct options', async () => {
      await cli.runPullSync({
        config: 'config.json',
        tasks: 'tasks.json',
        state: 'state.json',
        dryRun: true,
        verbose: true,
        force: true,
        skipConflicts: true,
        task: '123',
        group: 'custom_group',
        regenerate: false,
        removeOrphaned: false
      });
      
      // Check first parameter (config object)
      expect(createPullSync.mock.calls[0][0]).toMatchObject({
        monday_api_key: 'test-api-key',
        apiToken: 'test-api-key',
        monday_board_id: 'board123'
      });
      
      // Check second parameter (options object)
      expect(createPullSync.mock.calls[0][1]).toMatchObject({
        tasksFilePath: expect.stringContaining('tasks.json'),
        syncFilePath: expect.stringContaining('state.json'),
        dryRun: true,
        mondayBoardId: 'board123',
        mondayGroupIds: ['custom_group'],
        mondayApiKey: 'test-api-key'
      });
    });
    
    test('uses correct group IDs when group option is provided', async () => {
      await cli.runPullSync({
        config: 'config.json',
        tasks: 'tasks.json',
        group: 'custom_group'
      });
      
      // Check the second parameter (options)
      expect(createPullSync.mock.calls[0][1]).toMatchObject({
        mondayGroupIds: ['custom_group']
      });
    });
    
    test('passes all options to pullSync method', async () => {
      await cli.runPullSync({
        config: 'config.json',
        tasks: 'tasks.json',
        force: true,
        skipConflicts: true,
        task: '123',
        regenerate: false,
        removeOrphaned: false
      });
      
      expect(mockPullSync.pullSync).toHaveBeenCalledWith(expect.objectContaining({
        forceOverwrite: true,
        skipConflicts: true,
        specificTaskId: '123',
        regenerateTaskFiles: false,
        removeOrphaned: false
      }));
    });
    
    test('executes pull sync and displays results', async () => {
      await cli.runPullSync({
        config: 'config.json',
        tasks: 'tasks.json'
      });
      
      expect(mockPullSync.pullSync).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
    });
    
    test('handles errors gracefully', async () => {
      mockPullSync.pullSync.mockRejectedValueOnce(new Error('Test error'));
      
      await cli.runPullSync({
        config: 'config.json',
        tasks: 'tasks.json'
      });
      
      expect(console.error).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
  
  describe('showConfig', () => {
    test('displays configuration information', () => {
      cli.showConfig({
        config: 'config.json'
      });
      
      expect(console.log).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('board123'));
    });
    
    test('handles errors gracefully', () => {
      fs.readFileSync.mockImplementationOnce(() => {
        throw new Error('Read error');
      });
      
      cli.showConfig({
        config: 'config.json'
      });
      
      expect(console.error).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
}); 