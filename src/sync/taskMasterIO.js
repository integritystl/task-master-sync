/**
 * TaskMaster IO Module
 * Handles reading from and writing to the tasks.json file
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a new TaskMaster IO instance
 * @param {Object} options - Configuration options
 * @returns {Object} - TaskMaster IO module instance
 */
function createTaskMasterIO(options = {}) {
  // Default path to tasks.json file
  const DEFAULT_TASKS_PATH = 'tasks/tasks.json';

  // Cache for tasks data to avoid frequent disk reads
  let tasksCache = new Map();
  const CACHE_TTL = options.cacheTTL || 5000; // 5 seconds TTL for cache
  const CACHE_TTL_MS = CACHE_TTL * 1000; // Convert TTL to milliseconds

  /**
   * Gets the absolute path to the tasks.json file
   * @param {string} tasksPath - Optional custom path to tasks.json file
   * @returns {string} - Absolute path to tasks.json file
   */
  function getTasksFilePath(tasksPath = DEFAULT_TASKS_PATH) {
    return path.isAbsolute(tasksPath) 
      ? tasksPath 
      : path.join(process.cwd(), tasksPath);
  }

  /**
   * Reads tasks from the tasks.json file
   * @param {string|Object} filePathOrTasks - Path to the tasks.json file or object containing tasks
   * @param {boolean} bypassCache - Whether to bypass the cache
   * @returns {Promise<Array|Object>} - Array of tasks or object with tasks property
   */
  async function readTasks(filePathOrTasks, bypassCache = false) {
    // If filePathOrTasks is an object with a tasks property, return it directly
    if (filePathOrTasks && typeof filePathOrTasks === 'object' && 'tasks' in filePathOrTasks) {
      return filePathOrTasks.tasks;
    }
    
    // If no path provided, use default
    const filePath = filePathOrTasks || getTasksFilePath();
    
    // Check cache first if not bypassing
    if (!bypassCache && tasksCache.has(filePath)) {
      const cachedData = tasksCache.get(filePath);
      
      // Check if cache is still valid
      if (Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
        return cachedData.tasks;
      }
      
      // Cache expired, remove it
      tasksCache.delete(filePath);
    }
    
    try {
      // Read and parse the tasks file
      const data = await fs.readFile(filePath, 'utf8');
      let parsedData;
      
      try {
        parsedData = JSON.parse(data);
      } catch (error) {
        throw new Error(`Error parsing tasks JSON: ${error.message}`);
      }
      
      // Check if the data has a tasks array property
      if (parsedData && typeof parsedData === 'object' && Array.isArray(parsedData.tasks)) {
        // Use the tasks array
        const tasks = parsedData.tasks;
        
        // Cache the tasks
        tasksCache.set(filePath, {
          tasks,
          timestamp: Date.now()
        });
        
        return tasks;
      } else if (parsedData && Array.isArray(parsedData)) {
        // If it's already an array, use it directly
        const tasks = parsedData;
        
        // Cache the tasks
        tasksCache.set(filePath, {
          tasks,
          timestamp: Date.now()
        });
        
        return tasks;
      } else {
        throw new Error('Tasks data is not an array');
      }
    } catch (error) {
      // If the file doesn't exist, return an empty array
      if (error.code === 'ENOENT') {
        return [];
      }
      
      // Rethrow with a more descriptive message
      throw new Error(`Error reading tasks file: ${error.message}`);
    }
  }

  /**
   * Writes tasks to the tasks.json file
   * @param {string|Object} filePathOrTasks - Path to the tasks.json file or object with tasks property
   * @param {Array|undefined} tasksArray - Array of tasks to write (not needed if filePathOrTasks is an object with tasks)
   * @returns {Promise<void>}
   */
  async function writeTasks(filePathOrTasks, tasksArray) {
    let filePath;
    let tasks;
    
    // Handle different parameter scenarios
    if (typeof filePathOrTasks === 'string') {
      // First param is a file path, second is the tasks array
      filePath = filePathOrTasks;
      tasks = tasksArray;
    } else if (filePathOrTasks && typeof filePathOrTasks === 'object') {
      // First param is an object with a tasks property
      filePath = getTasksFilePath();
      
      if ('tasks' in filePathOrTasks && Array.isArray(filePathOrTasks.tasks)) {
        tasks = filePathOrTasks.tasks;
      } else if (Array.isArray(filePathOrTasks)) {
        tasks = filePathOrTasks;
      } else {
        throw new Error('Invalid tasks data: expected array or object with tasks array');
      }
    } else {
      throw new Error('Invalid parameters: expected file path or tasks object');
    }
    
    if (!Array.isArray(tasks)) {
      throw new Error('Tasks must be an array');
    }
    
    // Create a temporary file to write to (for atomic writes)
    const tempFilePath = path.join(os.tmpdir(), `taskmaster-tasks-${uuidv4()}.json`);
    
    try {
      // Determine if we need to wrap tasks in an object
      let fileContent;
      
      // Check if the original file exists and has the wrapper object format
      try {
        const existingData = await fs.readFile(filePath, 'utf8');
        const parsedData = JSON.parse(existingData);
        
        // If the original file has a tasks property, keep the same format
        if (parsedData && typeof parsedData === 'object' && 'tasks' in parsedData) {
          // Preserve the structure but update the tasks array
          fileContent = JSON.stringify({ ...parsedData, tasks }, null, 2);
        } else {
          // No wrapper object in the original file, write the array directly
          fileContent = JSON.stringify(tasks, null, 2);
        }
        // eslint-disable-next-line no-unused-vars
      } catch (error) {
        // If the file doesn't exist or has invalid JSON, default to array format
        fileContent = JSON.stringify(tasks, null, 2);
      }
      
      // Write to the temporary file
      await fs.writeFile(tempFilePath, fileContent, 'utf8');
      
      // Create the directory if it doesn't exist
      const dir = path.dirname(filePath);
      await fs.ensureDir(dir);
      
      // Move the temporary file to the actual file (atomic operation)
      await fs.move(tempFilePath, filePath, { overwrite: true });
      
      // Update cache
      tasksCache.set(filePath, {
        tasks,
        timestamp: Date.now()
      });
    } catch (error) {
      // Clean up temporary file if it exists
      try {
        await fs.unlink(tempFilePath);
        // eslint-disable-next-line no-unused-vars
      } catch (unlinkError) {
        // Ignore errors from unlink
      }
      
      throw new Error(`Error writing tasks file: ${error.message}`);
    }
  }

  /**
   * Gets a specific task by ID
   * @param {string|number} taskId - ID of the task to get
   * @param {string} tasksPath - Optional custom path to tasks.json file
   * @returns {Promise<Object|null>} - Task object or null if not found
   */
  async function getTaskById(taskId, tasksPath = DEFAULT_TASKS_PATH) {
    const tasks = await readTasks(getTasksFilePath(tasksPath));
    
    // Convert taskId to string for comparison
    const id = String(taskId);
    
    return tasks.find(task => String(task.id) === id) || null;
  }

  /**
   * Updates a specific task by ID
   * @param {string|number} taskId - ID of the task to update
   * @param {Object} updates - Object with fields to update
   * @param {string} tasksPath - Optional custom path to tasks.json file
   * @returns {Promise<Object|null>} - Updated task or null if not found
   */
  async function updateTaskById(taskId, updates, tasksPath = DEFAULT_TASKS_PATH) {
    const tasks = await readTasks(getTasksFilePath(tasksPath));
    
    // Convert taskId to string for comparison
    const id = String(taskId);
    
    // Find task index
    const taskIndex = tasks.findIndex(task => String(task.id) === id);
    
    if (taskIndex === -1) {
      return null;
    }
    
    // Update task
    const updatedTask = { ...tasks[taskIndex], ...updates };
    tasks[taskIndex] = updatedTask;
    
    // Write updated tasks back to file
    await writeTasks(getTasksFilePath(tasksPath), tasks);
    
    return updatedTask;
  }

  /**
   * Adds a Monday.com item ID to a task
   * @param {string|number} taskId - ID of the task to update
   * @param {string} mondayItemId - Monday.com item ID to add
   * @param {string} tasksPath - Optional custom path to tasks.json file
   * @returns {Promise<Object|null>} - Updated task or null if not found
   */
  async function addMondayItemIdToTask(taskId, mondayItemId, tasksPath = DEFAULT_TASKS_PATH) {
    return updateTaskById(taskId, { monday_item_id: mondayItemId }, tasksPath);
  }

  /**
   * Gets tasks that have a Monday.com item ID
   * @param {string} tasksPath - Optional custom path to tasks.json file
   * @returns {Promise<Array>} - Array of tasks with Monday.com item IDs
   */
  async function getTasksWithMondayItemId(tasksPath = DEFAULT_TASKS_PATH) {
    const tasks = await readTasks(getTasksFilePath(tasksPath));
    return tasks.filter(task => task.monday_item_id);
  }

  /**
   * Gets tasks that don't have a Monday.com item ID
   * @param {string} tasksPath - Optional custom path to tasks.json file
   * @returns {Promise<Array>} - Array of tasks without Monday.com item IDs
   */
  async function getTasksWithoutMondayItemId(tasksPath = DEFAULT_TASKS_PATH) {
    const tasks = await readTasks(getTasksFilePath(tasksPath));
    return tasks.filter(task => !task.monday_item_id);
  }

  /**
   * Clears the cache, forcing next read to pull from disk
   */
  function clearCache() {
    tasksCache.clear();
  }

  // Return public API
  return {
    readTasks,
    writeTasks,
    getTaskById,
    updateTaskById,
    addMondayItemIdToTask,
    getTasksWithMondayItemId,
    getTasksWithoutMondayItemId,
    clearCache,
    DEFAULT_TASKS_PATH
  };
}

// Create a default instance
const defaultInstance = createTaskMasterIO();

// Export the default instance and the factory function
module.exports = {
  ...defaultInstance,
  createTaskMasterIO
}; 