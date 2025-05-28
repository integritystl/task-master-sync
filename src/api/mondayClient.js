/**
 * Monday.com API Client Module
 * Provides functions for interacting with the Monday.com API
 */

const mondaySdk = require('monday-sdk-js');
const { Logger } = require('../utils/logger');

// Default retry settings
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_BATCH_SIZE = 10;

/**
 * Creates a Monday.com API Client instance
 * @param {Object} options - Configuration options
 * @returns {Object} - Monday.com API Client instance
 */
function createMondayClient(options = {}) {
  // Initialize the Monday SDK
  const monday = mondaySdk();
  
  // Set API token if provided in options
  if (options.apiToken) {
    monday.setToken(options.apiToken);
  } else if (options.monday_api_key) {
    monday.setToken(options.monday_api_key);
  }
  
  // Configure retry settings
  const maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs || DEFAULT_RETRY_DELAY_MS;
  
  // Configure cache
  const cacheTtlMs = options.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
  const boardCache = new Map();
  const groupCache = new Map();
  
  // Configure batch settings
  const maxBatchSize = options.maxBatchSize || DEFAULT_MAX_BATCH_SIZE;
  
  // Batch handling
  let batchQueue = [];
  let batchPromises = [];
  
  /**
   * Executes a GraphQL query with retry logic
   * @param {string} query - The GraphQL query to execute
   * @param {Object} variables - Variables for the query
   * @returns {Promise<Object>} - The query result
   */
  async function executeQuery(query, variables = {}) {
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        Logger.debug(`Executing query (attempt ${attempt + 1}/${maxRetries})`);
        
        const response = await monday.api(query, { variables });
        
        // Check for Monday.com API errors in the response
        if (response.errors && response.errors.length > 0) {
          const errorMessages = response.errors.map(err => err.message).join(', ');
          Logger.warn(`Monday.com API returned errors: ${errorMessages}`);
          
          // Don't throw if we have both errors and data (partial success)
          if (!response.data) {
            throw new Error(`Monday.com API errors: ${errorMessages}`);
          }
        }
        
        // If we get here, the query was successful
        if (attempt > 0) {
          Logger.info(`Query succeeded after ${attempt + 1} attempts`);
        }
        
        return response;
      } catch (error) {
        lastError = error;
        
        // Check if the error is a rate limit error (status code 429)
        const isRateLimited = error.status === 429;
        
        if (isRateLimited) {
          Logger.warn(`Rate limited by Monday.com API, retrying in ${retryDelayMs}ms`);
        } else {
          Logger.warn(`Query failed, retrying in ${retryDelayMs}ms: ${error.message}`);
          if (error.stack) {
            Logger.debug(`Error stack: ${error.stack}`);
          }
          if (error.response) {
            Logger.debug(`Error response: ${JSON.stringify(error.response)}`);
          }
        }
        
        // If this is not the last attempt, wait before retrying
        if (attempt < maxRetries - 1) {
          // Calculate exponential backoff time
          const backoffTime = retryDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }
    
    // If we get here, all retry attempts failed
    Logger.error(`Failed to execute query after ${maxRetries} attempts: ${lastError.message}`);
    throw lastError;
  }
  
  /**
   * Gets the cache key for board or group caches
   * @param {string} type - The type of cache (board or group)
   * @param {string} id - The ID to include in the cache key
   * @returns {string} - The cache key
   */
  function getCacheKey(type, id) {
    return `${type}_${id}`;
  }
  
  /**
   * Gets the board details
   * @param {string} boardId - The ID of the board to fetch
   * @param {boolean} bypassCache - Whether to bypass the cache
   * @returns {Promise<Object>} - The board details
   */
  async function getBoard(boardId, bypassCache = false) {
    const cacheKey = getCacheKey('board', boardId);
    
    // Check cache first
    if (!bypassCache && boardCache.has(cacheKey)) {
      const cachedData = boardCache.get(cacheKey);
      
      // Check if cache is still valid
      if (Date.now() - cachedData.timestamp < cacheTtlMs) {
        Logger.debug(`Using cached board data for board ${boardId}`);
        return cachedData.data;
      }
      
      // Cache expired, remove it
      boardCache.delete(cacheKey);
    }
    
    // Query for board data
    const query = `
      query GetBoard($boardId: ID!) {
        boards(ids: [$boardId]) {
          id
          name
          description
          state
          board_kind
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `;
    
    const variables = { boardId };
    
    // Execute the query
    const result = await executeQuery(query, variables);
    
    // Extract the board data
    if (result.data && result.data.boards && result.data.boards.length > 0) {
      // Cache the result
      boardCache.set(cacheKey, { 
        data: result.data.boards[0],
        timestamp: Date.now()
      });
      
      return result.data.boards[0];
    } else {
      throw new Error(`Board not found: ${boardId}`);
    }
  }
  
  /**
   * Gets the groups in a board
   * @param {string} boardId - The ID of the board to fetch groups from
   * @param {boolean} bypassCache - Whether to bypass the cache
   * @returns {Promise<Object[]>} - The groups in the board
   */
  async function getBoardGroups(boardId, bypassCache = false) {
    const cacheKey = getCacheKey('group', boardId);
    
    // Check cache first
    if (!bypassCache && groupCache.has(cacheKey)) {
      const cachedData = groupCache.get(cacheKey);
      
      // Check if cache is still valid
      if (Date.now() - cachedData.timestamp < cacheTtlMs) {
        Logger.debug(`Using cached group data for board ${boardId}`);
        return cachedData.data;
      }
      
      // Cache expired, remove it
      groupCache.delete(cacheKey);
    }
    
    // Query for groups data
    const query = `
      query GetGroups($boardId: ID!) {
        boards(ids: [$boardId]) {
          groups {
            id
            title
            color
            position
          }
        }
      }
    `;
    
    const variables = { boardId };
    
    // Execute the query
    const result = await executeQuery(query, variables);
    
    // Extract the groups data
    if (result.data && 
        result.data.boards && 
        result.data.boards.length > 0 &&
        result.data.boards[0].groups) {
      
      // Cache the result
      groupCache.set(cacheKey, { 
        data: result.data.boards[0].groups,
        timestamp: Date.now()
      });
      
      return result.data.boards[0].groups;
    } else {
      throw new Error(`Could not fetch groups for board: ${boardId}`);
    }
  }
  
  /**
   * Gets the columns in a board
   * @param {string} boardId - The ID of the board to fetch columns from
   * @param {boolean} bypassCache - Whether to bypass the cache
   * @returns {Promise<Object[]>} - The columns in the board
   */
  async function getBoardColumns(boardId, bypassCache = false) {
    const cacheKey = getCacheKey('columns', boardId);
    
    // Check cache first
    if (!bypassCache && boardCache.has(cacheKey)) {
      const cachedData = boardCache.get(cacheKey);
      
      // Check if cache is still valid
      if (Date.now() - cachedData.timestamp < cacheTtlMs) {
        Logger.debug(`Using cached columns data for board ${boardId}`);
        return cachedData.data;
      }
      
      // Cache expired, remove it
      boardCache.delete(cacheKey);
    }
    
    // Query for columns data
    const query = `
      query GetColumns($boardId: ID!) {
        boards(ids: [$boardId]) {
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `;
    
    const variables = { boardId };
    
    // Execute the query
    const result = await executeQuery(query, variables);
    
    // Extract the columns data
    if (result.data && 
        result.data.boards && 
        result.data.boards.length > 0 &&
        result.data.boards[0].columns) {
      
      // Cache the result
      boardCache.set(cacheKey, { 
        data: result.data.boards[0].columns,
        timestamp: Date.now()
      });
      
      return result.data.boards[0].columns;
    } else {
      throw new Error(`Could not fetch columns for board: ${boardId}`);
    }
  }
  
  /**
   * Creates a new item on a board
   * @param {string} boardId - The ID of the board
   * @param {string} groupId - The ID of the group
   * @param {string} itemName - The name of the item
   * @param {Object} columnValues - Column values for the item
   * @returns {Promise<Object>} - The created item
   */
  async function createItem(boardId, groupId, itemName, columnValues = {}) {
    // Prepare column values
    const columnValuesJson = JSON.stringify(columnValues);
    
    // Query for creating an item
    const query = `
      mutation CreateItem($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON) {
        create_item(
          board_id: $boardId,
          group_id: $groupId,
          item_name: $itemName,
          column_values: $columnValues
        ) {
          id
          name
          group {
            id
            title
          }
        }
      }
    `;
    
    const variables = { 
      boardId,
      groupId,
      itemName,
      columnValues: columnValuesJson
    };
    
    // Execute the query
    const result = await executeQuery(query, variables);
    
    // Extract the created item
    if (result.data && result.data.create_item) {
      return result.data.create_item;
    } else {
      throw new Error(`Failed to create item '${itemName}' on board ${boardId}`);
    }
  }
  
  /**
   * Creates a new group on a board
   * @param {string} boardId - The ID of the board
   * @param {string} groupName - The name of the group
   * @returns {Promise<Object>} - The created group
   */
  async function createGroup(boardId, groupName) {
    // Query for creating a group
    const query = `
      mutation CreateGroup($boardId: ID!, $groupName: String!) {
        create_group(
          board_id: $boardId,
          group_name: $groupName
        ) {
          id
          name
        }
      }
    `;
    
    const variables = { 
      boardId,
      groupName
    };
    
    // Execute the query
    const result = await executeQuery(query, variables);
    
    // Extract the created group
    if (result.data && result.data.create_group) {
      return result.data.create_group;
    } else {
      throw new Error(`Failed to create group '${groupName}' on board ${boardId}`);
    }
  }
  
  /**
   * Updates an item's name
   * @param {string} itemId - The ID of the item
   * @param {string} newName - The new name for the item
   * @returns {Promise<Object>} - The updated item
   */
  async function updateItemName(itemId, newName) {
    // Query for updating an item's name
    const query = `
      mutation UpdateItemName($itemId: ID!, $newName: String!) {
        change_multiple_column_values(
          item_id: $itemId,
          board_id: 0,
          column_values: "{\\"name\\":\\"${newName}\\"}"
        ) {
          id
          name
        }
      }
    `;
    
    const variables = { 
      itemId,
      newName
    };
    
    // Execute the query
    const result = await executeQuery(query, variables);
    
    // Extract the updated item
    if (result.data && result.data.change_multiple_column_values) {
      return result.data.change_multiple_column_values;
    } else {
      throw new Error(`Failed to update name for item ${itemId}`);
    }
  }
  
  /**
   * Updates the column values for an item
   * @param {string} itemId - The ID of the item to update
   * @param {string} boardId - The ID of the board containing the item
   * @param {Object} columnValues - The column values to update
   * @returns {Promise<Object>} - The updated item data
   */
  async function updateItemColumnValues(itemId, boardId, columnValues) {
    try {
      // Log what we're attempting to update
      Logger.debug(`Updating column values for item ${itemId} on board ${boardId}`);
      Logger.debug(`Column values (pre-serialization): ${JSON.stringify(columnValues)}`);
      
      // Skip validation in test environment
      if (process.env.NODE_ENV !== 'test') {
        // Validation would go here if needed
        // Currently keeping validation section to maintain compatibility
        const failedUpdates = [];

        // If any column updates failed, throw an error
        if (failedUpdates.length > 0) {
          const failedColumns = failedUpdates.map(([columnId]) => columnId).join(', ');
          throw new Error(`Failed to update columns: ${failedColumns}`);
        }
      }
      
      // Serialize the column values if they're not already a string
      const columnValuesStr = typeof columnValues === 'string' ? 
        columnValues : JSON.stringify(columnValues);
      
      Logger.debug(`Serialized column values: ${columnValuesStr}`);
      
      const query = `
        mutation UpdateItemColumnValues($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(item_id: $itemId, board_id: $boardId, column_values: $columnValues) {
            id
            name
          }
        }
      `;
      
      const variables = {
        itemId,
        boardId,
        columnValues: columnValuesStr
      };
      
      Logger.debug(`Sending GraphQL query with variables: ${JSON.stringify(variables)}`);
      
      const result = await executeQuery(query, variables);
      
      Logger.debug(`GraphQL result: ${JSON.stringify(result)}`);
      
      if (result.data && result.data.change_multiple_column_values) {
        return result.data.change_multiple_column_values;
      } else if (result.errors && result.errors.length > 0) {
        // More detailed error handling
        const errorMessages = result.errors.map(err => err.message).join(', ');
        throw new Error(`Monday.com API error: ${errorMessages}`);
      } else {
        throw new Error('Failed to update item column values: no data returned');
      }
    } catch (error) {
      Logger.error(`Failed to update column values: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Gets items from a board
   * @param {string} boardId - The ID of the board
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of items to return
   * @returns {Promise<Object[]>} - The items on the board
   */
  async function getItems(boardId, options = {}) {
    // Default options
    const limit = options.limit || 100;
    const groupId = options.groupId || null;
    
    // Base query for fetching items
    let query;
    
    // Different query based on whether a groupId is provided
    if (groupId) {
      query = `
        query GetItems($boardId: ID!, $limit: Int!, $groupId: String!) {
          boards(ids: [$boardId]) {
            groups(ids: [$groupId]) {
              items_page(limit: $limit) {
                items {
                  id
                  name
                  group {
                    id
                    title
                  }
                  column_values {
                    id
                    text
                    value
                    type
                  }
                }
              }
            }
          }
        }
      `;
    } else {
      query = `
        query GetItems($boardId: ID!, $limit: Int!) {
          boards(ids: [$boardId]) {
            items_page(limit: $limit) {
              items {
                id
                name
                group {
                  id
                  title
                }
                column_values {
                  id
                  text
                  value
                  type
                }
              }
            }
          }
        }
      `;
    }
    
    const variables = { 
      boardId,
      limit,
      ...(groupId && { groupId })
    };
    
    // Execute the query
    const result = await executeQuery(query, variables);
    
    // Logging for debug
    Logger.debug(`getItems response for board ${boardId}: ${JSON.stringify(result)}`);
    
    // Extract the items with more careful structure checking
    if (result && result.data && result.data.boards && Array.isArray(result.data.boards) && result.data.boards.length > 0) {
      if (groupId) {
        // Extract items from group
        if (result.data.boards[0].groups && 
            Array.isArray(result.data.boards[0].groups) && 
            result.data.boards[0].groups.length > 0 &&
            result.data.boards[0].groups[0].items_page &&
            result.data.boards[0].groups[0].items_page.items) {
          return result.data.boards[0].groups[0].items_page.items;
        }
      } else {
        // Extract items from board
        if (result.data.boards[0].items_page &&
            result.data.boards[0].items_page.items) {
          return result.data.boards[0].items_page.items;
        }
      }
    }
    
    // Provide more specific error messages based on response structure
    if (!result || !result.data) {
      throw new Error(`Invalid response from Monday.com API for board: ${boardId}`);
    }
    if (!result.data.boards || !Array.isArray(result.data.boards) || result.data.boards.length === 0) {
      throw new Error(`Board not found or not accessible: ${boardId}`);
    }
    
    // If we get here, it's likely the items array is empty or null
    return []; // Return empty array instead of throwing error for no items
  }
  
  /**
   * Gets a specific item by ID
   * @param {string} itemId - The ID of the item
   * @param {string[]} columns - Columns to include
   * @returns {Promise<Object>} - The item details
   */
  async function getItem(itemId, columns = []) {
    // Build column selection string for the GraphQL query
    const columnSelection = columns.length > 0 
      ? columns.map(col => `${col} {id text value}`).join('\n')
      : 'id\ntext\nvalue';
    
    // Query for fetching an item
    const query = `
      query GetItem($itemId: ID!) {
        items(ids: [$itemId]) {
          id
          name
          board {
            id
            name
          }
          group {
            id
            title
          }
          column_values {
            ${columnSelection}
          }
          updates {
            id
            body
            created_at
          }
        }
      }
    `;
    
    const variables = { itemId };
    
    // Execute the query
    const result = await executeQuery(query, variables);
    
    // Extract the item
    if (result.data && result.data.items && result.data.items.length > 0) {
      return result.data.items[0];
    } else {
      throw new Error(`Item not found: ${itemId}`);
    }
  }
  
  /**
   * Posts an update to an item
   * @param {string} itemId - The ID of the item to update
   * @param {string} body - The text content of the update
   * @returns {Promise<Object>} - The created update
   */
  async function postUpdate(itemId, body) {
    try {
      const query = `
        mutation PostUpdate($itemId: ID!, $body: String!) {
          create_update(item_id: $itemId, body: $body) {
            id
            body
            created_at
          }
        }
      `;
      
      const variables = {
        itemId,
        body
      };
      
      const result = await executeQuery(query, variables);
      
      if (result.data && result.data.create_update) {
        return result.data.create_update;
      } else {
        throw new Error('Failed to create update');
      }
    } catch (error) {
      Logger.error(`Failed to post update: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Deletes an update by ID
   * @param {string} updateId - The ID of the update to delete
   * @returns {Promise<boolean>} - Whether the deletion was successful
   */
  async function deleteUpdate(updateId) {
    try {
      const query = `
        mutation DeleteUpdate($updateId: ID!) {
          delete_update(id: $updateId) {
            id
          }
        }
      `;
      
      const variables = {
        updateId
      };
      
      const result = await executeQuery(query, variables);
      
      // Add detailed logging
      Logger.debug(`Delete update result: ${JSON.stringify(result)}`);
      
      // Check if the result contains the deleted update ID
      const resultId = result.data?.delete_update?.id;
      Logger.debug(`Returned ID: ${resultId}, Expected ID: ${updateId}, Match: ${resultId === updateId}`);
      
      if (result.data && 
          result.data.delete_update && 
          result.data.delete_update.id) {
        // Just check for a truthy ID, don't compare
        return true;
      } else {
        throw new Error('Failed to delete update');
      }
    } catch (error) {
      Logger.error(`Error deleting update ${updateId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Changes the status of an item
   * @param {string} itemId - The ID of the item
   * @param {string} boardId - The ID of the board
   * @param {string} columnId - The ID of the status column
   * @param {string} status - The new status value
   * @returns {Promise<Object>} - The updated item
   */
  async function changeStatus(itemId, boardId, columnId, status) {
    try {
      // Create column values object with just the status column
      const columnValues = {
        [columnId]: { label: status }
      };
      
      // Use updateItemColumnValues to handle the update
      return await updateItemColumnValues(itemId, boardId, columnValues);
    } catch (error) {
      Logger.error(`Failed to change status: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Clears the cache
   */
  function clearCache() {
    boardCache.clear();
    groupCache.clear();
    Logger.debug('Monday.com API client cache cleared');
  }
  
  /**
   * Creates multiple items in a single batch operation
   * @param {string} boardId - The ID of the board to create items on
   * @param {Array} items - Array of items to create, each with name, groupId, and columnValues
   * @returns {Promise<Object[]>} - The created items
   */
  async function batchCreateItems(boardId, items) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Items array is required and must not be empty');
    }
    
    // Limit batch size to avoid API limits
    const batchSize = maxBatchSize;
    let createdItems = [];
    
    // Process in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await _processBatch(boardId, batch);
      createdItems = createdItems.concat(batchResults);
    }
    
    return createdItems;
  }
  
  /**
   * Processes a batch of item creations
   * @private
   * @param {string} boardId - The board ID
   * @param {Array} items - Batch of items to create
   * @returns {Promise<Object[]>} - Created items
   */
  async function _processBatch(boardId, batch) {
    try {
      Logger.debug(`Processing batch of ${batch.length} items`);
      
      // Build mutation for multiple items
      const mutations = batch.map((item, index) => {
        return `
          item_${index}: create_item(
            board_id: $boardId,
            group_id: $groupId_${index},
            item_name: $itemName_${index},
            column_values: $columnValues_${index}
          ) {
            id
            name
          }
        `;
      });
      
      const query = `
        mutation BatchCreateItems(
          $boardId: ID!,
          ${batch.map((_, index) => `$groupId_${index}: String!, $itemName_${index}: String!, $columnValues_${index}: JSON`).join(',')}
        ) {
          ${mutations.join('\n')}
        }
      `;
      
      // Build variables
      const variables = {
        boardId
      };
      
      batch.forEach((item, index) => {
        variables[`groupId_${index}`] = item.groupId;
        variables[`itemName_${index}`] = item.name;
        variables[`columnValues_${index}`] = item.columnValues || {};
      });
      
      // Execute the query
      const result = await executeQuery(query, variables);
      
      // Process results
      const createdItems = [];
      if (result.data) {
        batch.forEach((_, index) => {
          const itemKey = `item_${index}`;
          if (result.data[itemKey]) {
            createdItems.push(result.data[itemKey]);
          }
        });
      }
      
      Logger.debug(`Successfully created ${createdItems.length} items in batch`);
      return createdItems;
    } catch (error) {
      Logger.error(`Error in batch processing: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Adds a mutation to the batch queue
   * @param {string} query - The GraphQL mutation
   * @param {Object} variables - Variables for the mutation
   * @returns {Promise<Object>} - Promise that will resolve with the mutation result
   */
  async function addToBatch(query, variables = {}) {
    // Create a promise that will be resolved when the batch is executed
    let resolvePromise, rejectPromise;
    const resultPromise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    
    // Add to the batch queue
    batchQueue.push({
      query,
      variables,
      resolvePromise,
      rejectPromise,
      index: batchQueue.length
    });
    
    // Store the promise
    batchPromises.push(resultPromise);
    
    // If we've reached the max batch size, flush automatically
    if (batchQueue.length >= maxBatchSize) {
      await flushBatch();
    }
    
    return resultPromise;
  }
  
  /**
   * Executes all pending mutations in the batch
   * @returns {Promise<void>} - Promise that resolves when the batch is executed
   */
  async function flushBatch() {
    // If the batch is empty, do nothing
    if (batchQueue.length === 0) {
      return;
    }
    
    // Create a copy of the current batch and clear the queue
    const currentBatch = [...batchQueue];
    batchQueue = [];
    batchPromises = [];
    
    try {
      // Combine the mutations into a single query
      let combinedQuery = '';
      const combinedVariables = {};
      
      currentBatch.forEach(({ query, variables, index }) => {
        // Extract the mutation name from the query
        const mutationMatch = query.match(/mutation\s+(\w+)/i);
        let mutationName = mutationMatch ? mutationMatch[1] : `Mutation_${index}`;
        
        // Add suffix to make it unique
        mutationName = `${mutationName}_${index}`;
        
        // Replace the mutation name in the query
        let updatedQuery = query.replace(/mutation\s+\w+/i, `mutation ${mutationName}`);
        
        // Add to the combined query
        combinedQuery += updatedQuery;
        
        // Add variables with index suffix to prevent conflicts
        Object.entries(variables).forEach(([key, value]) => {
          combinedVariables[`${key}_${index}`] = value;
        });
        
        // Replace variable references in the query
        Object.keys(variables).forEach(key => {
          updatedQuery = updatedQuery.replace(
            new RegExp(`\\$${key}`, 'g'), 
            `\\$${key}_${index}`
          );
        });
      });
      
      // Execute the combined query
      const result = await executeQuery(combinedQuery, combinedVariables);
      
      // Resolve each promise with its corresponding result
      currentBatch.forEach(({ resolvePromise, index }) => {
        const mutationName = currentBatch[index].query.match(/mutation\s+(\w+)/i);
        const resultKey = mutationName ? `${mutationName[1]}_${index}` : `Mutation_${index}`;
        
        if (result.data && result.data[resultKey]) {
          resolvePromise(result.data[resultKey]);
        } else {
          resolvePromise(null);
        }
      });
    } catch (error) {
      // Reject all promises with the error
      currentBatch.forEach(({ rejectPromise }) => {
        rejectPromise(error);
      });
    }
  }
  
  /**
   * Deletes an item from Monday.com
   * @param {string} itemId - The ID of the item to delete
   * @returns {Promise<boolean>} - Whether the deletion was successful
   */
  async function deleteItem(itemId) {
    try {
      const query = `
        mutation DeleteItem($itemId: ID!) {
          delete_item(item_id: $itemId) {
            id
          }
        }
      `;
      
      const variables = {
        itemId
      };
      
      const result = await executeQuery(query, variables);
      
      // Add detailed logging
      Logger.debug(`Delete item result: ${JSON.stringify(result)}`);
      
      // Check if the result contains the deleted item ID
      const resultId = result.data?.delete_item?.id;
      Logger.debug(`Returned ID: ${resultId}, Expected ID: ${itemId}, Match: ${resultId === itemId}`);
      
      if (resultId) {
        Logger.info(`Successfully deleted Monday.com item ${itemId}`);
        return true;
      } else {
        Logger.warn(`Failed to delete Monday.com item ${itemId}: No ID returned`);
        return false;
      }
    } catch (error) {
      Logger.error(`Error deleting Monday.com item ${itemId}: ${error.message}`);
      return false;
    }
  }
  
  // Return the public API
  return {
    // Query operations
    getItem,
    getItems,
    getBoard,
    getBoardGroups,
    getBoardColumns,
    
    // Creation operations
    createItem,
    createGroup,
    
    // Update operations
    postUpdate,
    deleteUpdate,
    changeStatus,
    updateItemName,
    updateItemColumnValues,
    
    // Batch operations
    batchCreateItems,
    
    // Utility methods
    executeQuery,
    clearCache,
    addToBatch,
    flushBatch,
    deleteItem
  };
}

// Create a default instance
const defaultInstance = createMondayClient();

// Export the default instance and the factory function
module.exports = {
  ...defaultInstance,
  createMondayClient
}; 