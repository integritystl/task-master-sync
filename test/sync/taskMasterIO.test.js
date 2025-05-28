/**
 * Tests for TaskMaster IO Module
 */

// Mock dependencies before requiring the module
jest.mock('fs-extra');
jest.mock('path');
jest.mock('os');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid')
}));

// Import mocks
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Configure mock implementations
path.join.mockImplementation((dir, file) => `${dir}/${file}`);
path.dirname.mockImplementation((filePath) => filePath.substring(0, filePath.lastIndexOf('/')));
path.isAbsolute.mockImplementation((path) => path.startsWith('/'));
os.tmpdir.mockReturnValue('/tmp');

// Import module after mocks are set up
const { createTaskMasterIO } = require('../../src/sync/taskMasterIO');

describe('TaskMaster IO Module', () => {
  let taskMasterIO;
  const mockTasksPath = '/mock/path/tasks.json';
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    process.cwd = jest.fn(() => '/mock/path');
    
    // Create a fresh TaskMaster IO instance for each test
    taskMasterIO = createTaskMasterIO();
  });

  describe('readTasks', () => {
    test('should read tasks from file successfully', async () => {
      // Setup mock data for tasks array
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Setup mocks
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // Call function
      const tasks = await taskMasterIO.readTasks(mockTasksPath);
      
      // Assertions
      expect(fs.readFile).toHaveBeenCalledWith(mockTasksPath, 'utf8');
      expect(tasks).toEqual(mockTasks);
    });
    
    test('should read tasks from file with wrapper object', async () => {
      // Setup mock data for nested tasks structure
      const mockTasksData = {
        tasks: [
          { id: '1', title: 'Task 1' },
          { id: '2', title: 'Task 2' }
        ]
      };
      
      // Setup mocks
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasksData));
      
      // Call function
      const tasks = await taskMasterIO.readTasks(mockTasksPath);
      
      // Assertions
      expect(fs.readFile).toHaveBeenCalledWith(mockTasksPath, 'utf8');
      expect(tasks).toEqual(mockTasksData.tasks);
    });
    
    test('should return empty array if file does not exist', async () => {
      // Setup mock with ENOENT error
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fs.readFile.mockRejectedValueOnce(error);
      
      // Call function
      const tasks = await taskMasterIO.readTasks(mockTasksPath);
      
      // Assertions
      expect(tasks).toEqual([]);
      expect(fs.readFile).toHaveBeenCalledWith(mockTasksPath, 'utf8');
    });
    
    test('should throw error if JSON is invalid', async () => {
      // Setup mocks
      fs.readFile.mockResolvedValueOnce('invalid json');
      
      // Call function and expect error
      await expect(taskMasterIO.readTasks(mockTasksPath)).rejects.toThrow('Error parsing tasks JSON');
    });
    
    test('should throw error if tasks is not an array', async () => {
      // Setup mocks
      fs.readFile.mockResolvedValueOnce('{"notAnArray": true}');
      
      // Call function and expect error
      await expect(taskMasterIO.readTasks(mockTasksPath)).rejects.toThrow('Tasks data is not an array');
    });
    
    test('should use cache if data was recently read', async () => {
      // Setup mock data
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Setup mocks for first call
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // First call to establish cache
      await taskMasterIO.readTasks(mockTasksPath);
      
      // Clear mocks to verify second call doesn't use them
      jest.clearAllMocks();
      
      // Second call (should use cache)
      const cachedTasks = await taskMasterIO.readTasks(mockTasksPath);
      
      // Assertions
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(cachedTasks).toEqual(mockTasks);
    });
    
    test('should bypass cache if requested', async () => {
      // Setup mock data for first call
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Setup mocks for first call
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // First call to establish cache
      await taskMasterIO.readTasks(mockTasksPath);
      
      // Clear mocks to verify second call uses them again
      jest.clearAllMocks();
      
      // Setup mock data for second call
      const updatedMockTasks = [
        { id: '1', title: 'Updated Task 1' },
        { id: '2', title: 'Updated Task 2' }
      ];
      
      // Setup mocks for second call
      fs.readFile.mockResolvedValueOnce(JSON.stringify(updatedMockTasks));
      
      // Second call with bypass cache
      const freshTasks = await taskMasterIO.readTasks(mockTasksPath, true);
      
      // Assertions
      expect(fs.readFile).toHaveBeenCalledWith(mockTasksPath, 'utf8');
      expect(freshTasks).toEqual(updatedMockTasks);
    });
    
    test('should clear cache when clearCache method is called', async () => {
      // Setup mock data for first call
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Setup mocks for first call
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // First call to establish cache
      await taskMasterIO.readTasks(mockTasksPath);
      
      // Clear mocks to verify second call uses them again
      jest.clearAllMocks();
      
      // Manually clear cache
      taskMasterIO.clearCache();
      
      // Setup mock data for second call
      const updatedMockTasks = [
        { id: '1', title: 'Updated Task 1' },
        { id: '2', title: 'Updated Task 2' }
      ];
      
      // Setup mocks for second call
      fs.readFile.mockResolvedValueOnce(JSON.stringify(updatedMockTasks));
      
      // Second call after cache cleared
      const freshTasks = await taskMasterIO.readTasks(mockTasksPath);
      
      // Assertions
      expect(fs.readFile).toHaveBeenCalledWith(mockTasksPath, 'utf8');
      expect(freshTasks).toEqual(updatedMockTasks);
    });
  });

  describe('writeTasks', () => {
    test('should write tasks to file successfully', async () => {
      // Mock data
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Setup mocks
      const tempFilePath = '/tmp/taskmaster-tasks-mock-uuid.json';
      fs.readFile.mockRejectedValueOnce(new Error('File not found')); // For original format check
      fs.writeFile.mockResolvedValueOnce();
      fs.ensureDir.mockResolvedValueOnce();
      fs.move.mockResolvedValueOnce();
      
      // Call function
      await taskMasterIO.writeTasks(mockTasksPath, mockTasks);
      
      // Assertions
      expect(fs.writeFile).toHaveBeenCalledWith(
        tempFilePath, 
        JSON.stringify(mockTasks, null, 2),
        'utf8'
      );
      expect(fs.ensureDir).toHaveBeenCalledWith('/mock/path');
      expect(fs.move).toHaveBeenCalledWith(
        tempFilePath,
        mockTasksPath,
        { overwrite: true }
      );
    });
    
    test('should preserve wrapper object format when writing', async () => {
      // Mock data
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Original file has wrapper object
      const originalData = {
        tasks: [{ id: '1', title: 'Old Task' }],
        version: '1.0.0'
      };
      
      // Setup mocks
      const tempFilePath = '/tmp/taskmaster-tasks-mock-uuid.json';
      fs.readFile.mockResolvedValueOnce(JSON.stringify(originalData));
      fs.writeFile.mockResolvedValueOnce();
      fs.ensureDir.mockResolvedValueOnce();
      fs.move.mockResolvedValueOnce();
      
      // Call function
      await taskMasterIO.writeTasks(mockTasksPath, mockTasks);
      
      // Assertions - should preserve the wrapper object format
      expect(fs.writeFile).toHaveBeenCalledWith(
        tempFilePath, 
        JSON.stringify({ ...originalData, tasks: mockTasks }, null, 2),
        'utf8'
      );
    });
    
    test('should throw error if tasks is not an array', async () => {
      // Call function with invalid data
      await expect(taskMasterIO.writeTasks(mockTasksPath, { notAnArray: true }))
        .rejects.toThrow('Tasks must be an array');
    });
    
    test('should clean up temp file if write fails', async () => {
      // Mock data
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Setup mocks for failure scenario
      const tempFilePath = '/tmp/taskmaster-tasks-mock-uuid.json';
      fs.readFile.mockRejectedValueOnce(new Error('File not found')); // For original format check
      fs.writeFile.mockResolvedValueOnce();
      fs.ensureDir.mockResolvedValueOnce();
      fs.move.mockRejectedValueOnce(new Error('Move failed'));
      fs.unlink.mockResolvedValueOnce();
      
      // Call function and expect error
      await expect(taskMasterIO.writeTasks(mockTasksPath, mockTasks))
        .rejects.toThrow('Error writing tasks file: Move failed');
      
      // Verify cleanup attempt
      expect(fs.unlink).toHaveBeenCalledWith(tempFilePath);
    });
  });
  
  describe('getTaskById', () => {
    test('should return task if found', async () => {
      // Setup mock data
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Mock readTasks to return the test data
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // Call function
      const task = await taskMasterIO.getTaskById('2');
      
      // Assertions
      expect(task).toEqual({ id: '2', title: 'Task 2' });
    });

    test('should return null if task not found', async () => {
      // Setup mock data
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Mock readTasks to return the test data
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // Call function
      const task = await taskMasterIO.getTaskById('3');
      
      // Assertions
      expect(task).toBeNull();
    });
  });

  describe('updateTaskById', () => {
    test('should update task and return updated task', async () => {
      // Setup mock data
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Mock readTasks to return the test data
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // Setup mocks for writeTasks
      const tempFilePath = '/tmp/taskmaster-tasks-mock-uuid.json';
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks)); // For original format check
      fs.writeFile.mockResolvedValueOnce();
      fs.ensureDir.mockResolvedValueOnce();
      fs.move.mockResolvedValueOnce();
      
      // Call function
      const updatedTask = await taskMasterIO.updateTaskById('2', { title: 'Updated Task 2', status: 'done' });
      
      // Expected updated tasks array
      const expectedTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Updated Task 2', status: 'done' }
      ];
      
      // Assertions
      expect(updatedTask).toEqual({ id: '2', title: 'Updated Task 2', status: 'done' });
      expect(fs.writeFile).toHaveBeenCalledWith(
        tempFilePath,
        JSON.stringify(expectedTasks, null, 2),
        'utf8'
      );
    });

    test('should return null if task not found', async () => {
      // Setup mock data
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Mock readTasks to return the test data
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // Call function
      const updatedTask = await taskMasterIO.updateTaskById('3', { title: 'Updated Task 3' });
      
      // Assertions
      expect(updatedTask).toBeNull();
      // writeTasks should not be called
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('addMondayItemIdToTask', () => {
    test('should add Monday item ID to task', async () => {
      // Setup mock data
      const mockTasks = [
        { id: '1', title: 'Task 1' },
        { id: '2', title: 'Task 2' }
      ];
      
      // Mock updateTaskById
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // Setup mocks for writeTasks
      const tempFilePath = '/tmp/taskmaster-tasks-mock-uuid.json';
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks)); // For original format check
      fs.writeFile.mockResolvedValueOnce();
      fs.ensureDir.mockResolvedValueOnce();
      fs.move.mockResolvedValueOnce();
      
      // Call function
      const updatedTask = await taskMasterIO.addMondayItemIdToTask('2', 'monday-123');
      
      // Assertions
      expect(updatedTask).toEqual({ id: '2', title: 'Task 2', monday_item_id: 'monday-123' });
    });
  });

  describe('getTasksWithMondayItemId', () => {
    test('should return tasks with Monday item ID', async () => {
      // Setup mock data
      const mockTasks = [
        { id: '1', title: 'Task 1', monday_item_id: 'monday-123' },
        { id: '2', title: 'Task 2' },
        { id: '3', title: 'Task 3', monday_item_id: 'monday-456' }
      ];
      
      // Mock readTasks to return the test data
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // Call function
      const tasks = await taskMasterIO.getTasksWithMondayItemId();
      
      // Assertions
      expect(tasks).toEqual([
        { id: '1', title: 'Task 1', monday_item_id: 'monday-123' },
        { id: '3', title: 'Task 3', monday_item_id: 'monday-456' }
      ]);
    });
  });

  describe('getTasksWithoutMondayItemId', () => {
    test('should return tasks without Monday item ID', async () => {
      // Setup mock data
      const mockTasks = [
        { id: '1', title: 'Task 1', monday_item_id: 'monday-123' },
        { id: '2', title: 'Task 2' },
        { id: '3', title: 'Task 3', monday_item_id: 'monday-456' }
      ];
      
      // Mock readTasks to return the test data
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockTasks));
      
      // Call function
      const tasks = await taskMasterIO.getTasksWithoutMondayItemId();
      
      // Assertions
      expect(tasks).toEqual([
        { id: '2', title: 'Task 2' }
      ]);
    });
  });
}); 