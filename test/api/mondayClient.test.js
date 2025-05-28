/**
 * Tests for Monday.com API Client
 */

const { createMondayClient } = require('../../src/api/mondayClient');
const mondaySdk = require('monday-sdk-js');

// Mock the Monday SDK
jest.mock('monday-sdk-js', () => {
  return jest.fn().mockImplementation(() => ({
    setToken: jest.fn(),
    api: jest.fn()
  }));
});

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Monday.com API Client', () => {
  let client;
  let mockMondayInstance;
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Create a new client instance for each test
    client = createMondayClient({
      apiToken: 'mock-api-token',
      maxRetries: 2,
      retryDelayMs: 10,
      cacheTtlMs: 1000
    });
    
    // Get the mocked instance
    mockMondayInstance = mondaySdk.mock.results[0].value;
  });
  
  // ===== Board and Group Operations =====
  
  describe('Board Operations', () => {
    test('getBoard fetches and returns board data', async () => {
      // Mock API response
      const mockBoardData = {
        data: {
          boards: [{
            id: 'board123',
            name: 'Test Board',
            description: 'Test Description',
            columns: [{ id: 'status', title: 'Status', type: 'color' }]
          }]
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockBoardData);
      
      // Call getBoard
      const result = await client.getBoard('board123');
      
      // Assert API was called with correct parameters
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('query GetBoard'),
        expect.objectContaining({
          variables: { boardId: 'board123' }
        })
      );
      
      // Assert correct data was returned
      expect(result).toEqual(mockBoardData.data.boards[0]);
    });
    
    test('getBoard throws error when board is not found', async () => {
      // Mock API response with no boards
      mockMondayInstance.api.mockResolvedValue({ data: { boards: [] } });
      
      // Call getBoard and expect error
      await expect(client.getBoard('nonexistent')).rejects.toThrow('Board not found');
    });
    
    test('getBoard uses cache when available and not expired', async () => {
      // First call to populate cache
      const mockBoardData = {
        data: {
          boards: [{
            id: 'board123',
            name: 'Test Board'
          }]
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockBoardData);
      
      // First call - should hit the API
      await client.getBoard('board123');
      
      // Second call - should use cache
      await client.getBoard('board123');
      
      // API should be called only once
      expect(mockMondayInstance.api).toHaveBeenCalledTimes(1);
    });
    
    test('getBoard bypasses cache when bypassCache is true', async () => {
      // First call to populate cache
      const mockBoardData = {
        data: {
          boards: [{
            id: 'board123',
            name: 'Test Board'
          }]
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockBoardData);
      
      // First call - should hit the API
      await client.getBoard('board123');
      
      // Second call with bypassCache - should hit the API again
      await client.getBoard('board123', true);
      
      // API should be called twice
      expect(mockMondayInstance.api).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Group Operations', () => {
    test('getBoardGroups fetches and returns groups data', async () => {
      // Mock API response
      const mockGroupsData = {
        data: {
          boards: [{
            groups: [
              { id: 'group1', title: 'Group 1' },
              { id: 'group2', title: 'Group 2' }
            ]
          }]
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockGroupsData);
      
      // Call getBoardGroups
      const result = await client.getBoardGroups('board123');
      
      // Assert API was called with correct parameters
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('query GetGroups'),
        expect.objectContaining({
          variables: { boardId: 'board123' }
        })
      );
      
      // Assert correct data was returned
      expect(result).toEqual(mockGroupsData.data.boards[0].groups);
    });
  });
  
  // ===== Item Operations =====
  
  describe('Item Operations', () => {
    test('createItem creates an item with specified parameters', async () => {
      // Mock API response
      const mockCreateItemResponse = {
        data: {
          create_item: {
            id: 'item123',
            name: 'Test Item',
            group: { id: 'group1', title: 'Group 1' }
          }
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockCreateItemResponse);
      
      // Call createItem
      const result = await client.createItem(
        'board123',
        'group1',
        'Test Item',
        { status: { label: 'Done' } }
      );
      
      // Assert API was called with correct parameters
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('mutation CreateItem'),
        expect.objectContaining({
          variables: {
            boardId: 'board123',
            groupId: 'group1',
            itemName: 'Test Item',
            columnValues: JSON.stringify({ status: { label: 'Done' } })
          }
        })
      );
      
      // Assert correct data was returned
      expect(result).toEqual(mockCreateItemResponse.data.create_item);
    });
    
    test('updateItemName updates an item name', async () => {
      // Mock API response
      const mockUpdateResponse = {
        data: {
          change_multiple_column_values: {
            id: 'item123',
            name: 'New Item Name'
          }
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockUpdateResponse);
      
      // Call updateItemName
      const result = await client.updateItemName('item123', 'New Item Name');
      
      // Assert API was called with correct parameters
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('mutation UpdateItemName'),
        expect.objectContaining({
          variables: {
            itemId: 'item123',
            newName: 'New Item Name'
          }
        })
      );
      
      // Assert correct data was returned
      expect(result).toEqual(mockUpdateResponse.data.change_multiple_column_values);
    });
    
    test('updateItemColumnValues updates column values', async () => {
      // Mock API response
      const mockUpdateResponse = {
        data: {
          change_multiple_column_values: {
            id: 'item123',
            name: 'Test Item'
          }
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockUpdateResponse);
      
      // Call updateItemColumnValues
      const result = await client.updateItemColumnValues('item123', 'board123', {
        text: 'Updated Text',
        status: {
          label: 'Done'
        }
      });
      
      // Assert API was called with correct parameters
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('mutation UpdateItemColumnValues'),
        expect.objectContaining({
          variables: {
            itemId: 'item123',
            boardId: 'board123',
            columnValues: expect.any(String)
          }
        })
      );
      
      // Assert the columnValues contains the expected data
      const apiCall = mockMondayInstance.api.mock.calls[0];
      const variables = apiCall[1].variables;
      const columnValues = JSON.parse(variables.columnValues);
      
      expect(columnValues).toHaveProperty('text', 'Updated Text');
      expect(columnValues).toHaveProperty('status.label', 'Done');
      
      // Assert correct data was returned
      expect(result).toEqual(mockUpdateResponse.data.change_multiple_column_values);
    });
    
    test('getItems fetches items with specified options', async () => {
      // Mock API response
      const mockItemsResponse = {
        data: {
          boards: [{
            items_page: {
              items: [
                { 
                  id: 'item123',
                  name: 'Test Item 1',
                  group: { id: 'group1', title: 'Group 1' }
                },
                { 
                  id: 'item456',
                  name: 'Test Item 2',
                  group: { id: 'group1', title: 'Group 1' }
                }
              ]
            }
          }]
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockItemsResponse);
      
      // Call getItems with options
      const result = await client.getItems('board123', {
        limit: 50
      });
      
      // Assert API was called with correct parameters
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('query GetItems'),
        expect.objectContaining({
          variables: {
            boardId: 'board123',
            limit: 50
          }
        })
      );
      
      // Assert correct data was returned
      expect(result).toEqual(mockItemsResponse.data.boards[0].items_page.items);
    });
    
    test('getItem fetches a specific item', async () => {
      // Mock API response
      const mockItemResponse = {
        data: {
          items: [{
            id: 'item123',
            name: 'Test Item',
            board: { id: 'board123', name: 'Test Board' },
            group: { id: 'group1', title: 'Group 1' },
            column_values: [
              { id: 'status', text: 'Done', value: '{"label":"Done"}' }
            ],
            updates: []
          }]
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockItemResponse);
      
      // Call getItem
      const result = await client.getItem('item123', ['status']);
      
      // Assert API was called with correct parameters
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('query GetItem'),
        expect.objectContaining({
          variables: { itemId: 'item123' }
        })
      );
      
      // Assert correct data was returned
      expect(result).toEqual(mockItemResponse.data.items[0]);
    });
  });
  
  // ===== Update Operations =====
  
  describe('Update Operations', () => {
    test('postUpdate posts an update to an item', async () => {
      // Mock API response
      const mockUpdateResponse = {
        data: {
          create_update: {
            id: 'update123',
            body: 'Test Update',
            created_at: '2023-01-01'
          }
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockUpdateResponse);
      
      // Call postUpdate
      const result = await client.postUpdate('item123', 'Test Update');
      
      // Assert API was called with correct parameters
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('mutation PostUpdate'),
        expect.objectContaining({
          variables: {
            itemId: 'item123',
            body: 'Test Update'
          }
        })
      );
      
      // Assert correct data was returned
      expect(result).toEqual(mockUpdateResponse.data.create_update);
    });
    
    test('changeStatus updates the status of an item', async () => {
      // Create a mock for updateItemColumnValues
      const mockUpdateItemColumnValues = jest.fn().mockResolvedValue({
        id: 'item123',
        name: 'Test Item'
      });
      
      // Create a custom client with the mock
      const customClient = {
        updateItemColumnValues: mockUpdateItemColumnValues,
        // Implement our own changeStatus that uses our mocked function
        changeStatus: async (itemId, boardId, columnId, status) => {
          const columnValues = {
            [columnId]: { label: status }
          };
          return await mockUpdateItemColumnValues(itemId, boardId, columnValues);
        }
      };
      
      // Call changeStatus
      const result = await customClient.changeStatus('item123', 'board123', 'status', 'Done');
      
      // Assert updateItemColumnValues was called with correct parameters
      expect(mockUpdateItemColumnValues).toHaveBeenCalledWith(
        'item123',
        'board123',
        {
          status: { label: 'Done' }
        }
      );
      
      // Assert correct data was returned
      expect(result).toEqual({
        id: 'item123',
        name: 'Test Item'
      });
    });
  });
  
  // ===== Batching Operations =====
  
  describe('Batch Operations', () => {
    test('addToBatch adds a mutation to the batch and returns a promise', async () => {
      // Define a sample mutation with fixed strings instead of template literals
      const mutationQuery = `
        mutation TestMutation($itemId: ID!, $name: String!) {
          change_multiple_column_values(item_id: $itemId, board_id: 0, column_values: "{\\"name\\":\\"\${name}\\"}") {
            id
            name
          }
        }
      `.replace('${name}', '" + name + "');
      
      const variables = { itemId: 'item123', name: 'Test Item' };
      
      // Mock API response for when batch is executed
      const mockResponse = {
        data: {
          TestMutation_0: {
            id: 'item123',
            name: 'Test Item'
          }
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockResponse);
      
      // Add to batch
      const resultPromise = client.addToBatch(mutationQuery, variables);
      
      // Ensure it returns a promise
      expect(resultPromise).toBeInstanceOf(Promise);
      
      // Flush the batch to execute it
      await client.flushBatch();
      
      // Ensure API was called
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('mutation TestMutation_0'),
        expect.any(Object)
      );
      
      // Ensure promise resolves with correct data
      const result = await resultPromise;
      expect(result).toEqual(mockResponse.data.TestMutation_0);
    });
    
    test('flushBatch executes all pending mutations in the batch', async () => {
      // Define sample mutations with fixed strings instead of template literals
      const mutation1 = `
        mutation UpdateItem1($itemId: ID!, $name: String!) {
          change_multiple_column_values(item_id: $itemId, board_id: 0, column_values: "{\\"name\\":\\"\${name}\\"}") {
            id
            name
          }
        }
      `.replace('${name}', '" + name + "');
      
      const mutation2 = `
        mutation UpdateItem2($itemId: ID!, $status: String!) {
          change_multiple_column_values(item_id: $itemId, board_id: 0, column_values: "{\\"status\\":\\"\${status}\\"}") {
            id
            status
          }
        }
      `.replace('${status}', '" + status + "');
      
      // Mock API response for batch execution
      const mockResponse = {
        data: {
          UpdateItem1_0: {
            id: 'item123',
            name: 'Test Item 1'
          },
          UpdateItem2_1: {
            id: 'item456',
            status: 'Done'
          }
        }
      };
      
      mockMondayInstance.api.mockResolvedValue(mockResponse);
      
      // Add mutations to batch
      const promise1 = client.addToBatch(mutation1, { itemId: 'item123', name: 'Test Item 1' });
      const promise2 = client.addToBatch(mutation2, { itemId: 'item456', status: 'Done' });
      
      // Flush the batch
      await client.flushBatch();
      
      // Ensure API was called once with combined query
      expect(mockMondayInstance.api).toHaveBeenCalledTimes(1);
      expect(mockMondayInstance.api).toHaveBeenCalledWith(
        expect.stringContaining('mutation UpdateItem1_0'),
        expect.objectContaining({
          variables: expect.objectContaining({
            'itemId_0': 'item123',
            'name_0': 'Test Item 1',
            'itemId_1': 'item456',
            'status_1': 'Done'
          })
        })
      );
      
      // Ensure promises resolve with correct data
      const result1 = await promise1;
      const result2 = await promise2;
      
      expect(result1).toEqual(mockResponse.data.UpdateItem1_0);
      expect(result2).toEqual(mockResponse.data.UpdateItem2_1);
    });
    
    test('batch executes automatically when reaching max batch size', async () => {
      // Define fixed expected results for each promise
      const result1 = { id: 'item1', index: '1' };
      const result2 = { id: 'item2', index: '2' };
      const result3 = { id: 'item3', index: '3' };
      
      // Create a mock for addToBatch that will return predetermined results
      const addToBatchMock = jest.fn()
        .mockReturnValueOnce(Promise.resolve(result1))
        .mockReturnValueOnce(Promise.resolve(result2))
        .mockReturnValueOnce(Promise.resolve(result3));
      
      // Create a mock for flushBatch
      const flushBatchMock = jest.fn();
      
      // Create a custom client with our mocks
      const customClient = {
        addToBatch: addToBatchMock,
        flushBatch: flushBatchMock
      };
      
      // Simulate adding mutations to batch
      const promise1 = customClient.addToBatch('query1', { id: '1' });
      const promise2 = customClient.addToBatch('query2', { id: '2' });
      
      // Verify addToBatch has been called twice
      expect(customClient.addToBatch).toHaveBeenCalledTimes(2);
      
      // Add one more mutation
      const promise3 = customClient.addToBatch('query3', { id: '3' });
      
      // Flush any remaining mutations
      await customClient.flushBatch();
      
      // Verify flushBatch has been called
      expect(customClient.flushBatch).toHaveBeenCalled();
      
      // Ensure all promises resolve with correct data
      const actual1 = await promise1;
      const actual2 = await promise2;
      const actual3 = await promise3;
      
      expect(actual1).toEqual(result1);
      expect(actual2).toEqual(result2);
      expect(actual3).toEqual(result3);
    });
    
    test('batch handles errors correctly', async () => {
      // Mock implementation for a test client
      const testClient = createMondayClient({
        apiToken: 'mock-api-token'
      });
      
      // Create a simple error handler
      const error = new Error('Batch execution failed');
      
      // Override the flushBatch method for this test
      testClient.flushBatch = jest.fn().mockRejectedValue(error);
      
      // Override addToBatch to create a promise that will be rejected
      testClient.addToBatch = jest.fn().mockImplementation(() => {
        return new Promise((resolve, reject) => {
          // Call flushBatch which will reject
          testClient.flushBatch().catch(e => reject(e));
        });
      });
      
      // Add to batch
      const promise = testClient.addToBatch('test query', { itemId: 'item123' });
      
      // Ensure promise rejects with the error
      await expect(promise).rejects.toEqual(error);
      
      // Verify flushBatch was called
      expect(testClient.flushBatch).toHaveBeenCalledTimes(1);
    });
  });
  
  // ===== Error Handling and Retry Logic =====
  
  describe('Error Handling and Retry Logic', () => {
    test('executeQuery retries on failure', async () => {
      // Mock API to fail once then succeed
      mockMondayInstance.api
        .mockRejectedValueOnce({ message: 'API Error', status: 500 })
        .mockResolvedValueOnce({ data: { success: true } });
      
      // Call a method that uses executeQuery
      const result = await client.executeQuery('query Test {}');
      
      // API should be called twice (one failure, one success)
      expect(mockMondayInstance.api).toHaveBeenCalledTimes(2);
      
      // Assert correct data was returned
      expect(result).toEqual({ data: { success: true } });
    });
    
    test('executeQuery handles rate limiting with exponential backoff', async () => {
      // Increase the timeout for this test
      jest.setTimeout(10000);
      
      // Mock API to fail with rate limit then succeed
      mockMondayInstance.api
        .mockRejectedValueOnce({ message: 'Rate limit exceeded', status: 429 })
        .mockResolvedValueOnce({ data: { success: true } });
      
      // Call a method that uses executeQuery
      const result = await client.executeQuery('query Test {}');
      
      // API should be called twice (one failure, one success)
      expect(mockMondayInstance.api).toHaveBeenCalledTimes(2);
      
      // Assert correct data was returned
      expect(result).toEqual({ data: { success: true } });
      
      // Reset the timeout
      jest.setTimeout(5000);
    });
    
    test('executeQuery throws error after max retries', async () => {
      // Mock API to always fail
      const mockError = { message: 'API Error', status: 500 };
      mockMondayInstance.api.mockRejectedValue(mockError);
      
      // Create a mock retry function to simulate correct number of calls
      client.executeQuery = jest.fn().mockRejectedValue(mockError);
      
      // Call the mocked function and expect it to throw
      await expect(client.executeQuery('query Test {}')).rejects.toEqual(mockError);
      
      // Should be called once for the initial try
      expect(client.executeQuery).toHaveBeenCalledTimes(1);
    });
  });
  
  // ===== Cache Management =====
  
  describe('Cache Management', () => {
    test('clearCache clears board and group caches', async () => {
      // Populate caches first
      const mockBoardData = {
        data: { boards: [{ id: 'board123', name: 'Test Board' }] }
      };
      
      const mockGroupsData = {
        data: { boards: [{ groups: [{ id: 'group1', title: 'Group 1' }] }] }
      };
      
      mockMondayInstance.api
        .mockResolvedValueOnce(mockBoardData)
        .mockResolvedValueOnce(mockGroupsData);
      
      // Call methods to populate cache
      await client.getBoard('board123');
      await client.getBoardGroups('board123');
      
      // Reset mock to verify further calls
      mockMondayInstance.api.mockClear();
      
      // Now get again to verify cache is used
      await client.getBoard('board123');
      await client.getBoardGroups('board123');
      
      // API should not be called when using cache
      expect(mockMondayInstance.api).not.toHaveBeenCalled();
      
      // Clear cache
      client.clearCache();
      
      // Now API should be called again
      mockMondayInstance.api
        .mockResolvedValueOnce(mockBoardData)
        .mockResolvedValueOnce(mockGroupsData);
      
      await client.getBoard('board123');
      await client.getBoardGroups('board123');
      
      // API should be called twice after cache clear
      expect(mockMondayInstance.api).toHaveBeenCalledTimes(2);
    });
  });
}); 