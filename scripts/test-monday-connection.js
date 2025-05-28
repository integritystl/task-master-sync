/**
 * Test Monday.com Connection
 * 
 * This script tests the connection to Monday.com using the configured API key
 * and board ID from sync-config.json.
 */

const { createMondayClient } = require('../src/api/mondayClient');
const { loadConfig } = require('../src/config/configParser');

async function testConnection() {
  try {
    console.log('Loading config...');
    const config = loadConfig('./sync-config.json');
    console.log(`Using board ID: ${config.monday_board_id}`);
    
    // Create a client with the API key from config
    console.log('Creating Monday.com client...');
    const client = createMondayClient({ 
      apiToken: config.monday_api_key,
      maxRetries: 2
    });
    
    // Test fetching board details
    console.log(`\nTEST 1: Fetching board details for board ID: ${config.monday_board_id}...`);
    try {
      const query = `
        query GetBoard($boardId: ID!) {
          boards(ids: [$boardId]) {
            name
            description
            columns {
              id
              title
              type
            }
          }
        }
      `;
      
      const result = await client.executeQuery(query, { boardId: config.monday_board_id });
      
      if (result.data && result.data.boards && result.data.boards[0]) {
        console.log('✅ Successfully connected to Monday.com!');
        const board = result.data.boards[0];
        console.log('Board details:');
        console.log(`- Name: ${board.name}`);
        console.log(`- Description: ${board.description || 'No description'}`);
        console.log(`- Columns: ${board.columns.length}`);
        
        console.log('\nAll columns with IDs for mapping:');
        board.columns.forEach((column, index) => {
          console.log(`${index + 1}. ${column.title} (ID: ${column.id}, Type: ${column.type})`);
        });
      } else {
        console.log('❌ Failed to fetch board details');
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.log('❌ Error fetching board details:', error.message);
      throw error;
    }
    
    // Test fetching board groups
    console.log('\nTEST 2: Fetching board groups...');
    try {
      const groups = await client.getBoardGroups(config.monday_board_id);
      console.log('✅ Successfully fetched groups!');
      console.log('Groups:');
      groups.forEach((group, index) => {
        console.log(`${index + 1}. ${group.title} (ID: ${group.id})`);
      });
    } catch (error) {
      console.log('❌ Error fetching board groups:', error.message);
      throw error;
    }
    
    // Test creating an item
    console.log('\nTEST 3: Creating a test item...');
    try {
      // Use the first group found
      const groups = await client.getBoardGroups(config.monday_board_id);
      const groupId = groups[0].id;
      console.log(`Using group: ${groups[0].title} (${groupId})`);
      
      // Uncomment to actually create items
      /*
      const newItem = await client.createItem(
        config.monday_board_id,
        groupId,
        'Test Item from Connection Test',
        { text: 'TEST' }
      );
      console.log('✅ Successfully created test item!');
      console.log(`Item ID: ${newItem.id}, Name: ${newItem.name}`);
      */
      console.log('⚠️ Item creation skipped - uncomment code in the script to enable');
    } catch (error) {
      console.log('❌ Error creating test item:', error.message);
    }
    
    // Get items using direct query (this works based on our previous test)
    console.log('\nTEST 4: Fetching items using direct query...');
    try {
      const query = `
        query GetItems($boardId: ID!) {
          boards(ids: [$boardId]) {
            items_page {
              items {
                id
                name
                group {
                  id
                  title
                }
                column_values {
                  id
                  title
                  text
                  value
                  type
                }
              }
            }
          }
        }
      `;
      
      const result = await client.executeQuery(query, { boardId: config.monday_board_id });
      
      console.log('Raw response structure:');
      console.log(JSON.stringify(result, null, 2));
      
      if (result.data && 
          result.data.boards && 
          result.data.boards[0] && 
          result.data.boards[0].items_page &&
          result.data.boards[0].items_page.items) {
        
        const items = result.data.boards[0].items_page.items;
        console.log('✅ Successfully fetched items!');
        console.log(`Found ${items.length} items on the board.`);
        
        console.log('\nSample items:');
        for (let i = 0; i < Math.min(5, items.length); i++) {
          console.log(`${i + 1}. ${items[i].name} (ID: ${items[i].id}, Group: ${items[i].group.title})`);
        }
        
        // Display column values for the first item to help with mapping
        if (items.length > 0) {
          console.log('\nExample column values for first item:');
          items[0].column_values.forEach(cv => {
            console.log(`- ${cv.title} (ID: ${cv.id}, Type: ${cv.type}, Value: ${cv.text || cv.value || 'N/A'})`);
          });
        }
      } else {
        console.log('❌ Failed to fetch items');
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.log('❌ Error fetching items:', error.message);
    }
    
    // Test the fixed getItems method
    console.log('\nTEST 5: Testing fixed getItems method...');
    try {
      const items = await client.getItems(config.monday_board_id, { limit: 10 });
      console.log('✅ Successfully fetched items using getItems method!');
      console.log(`Found ${items.length} items on the board.`);
      
      console.log('\nSample items:');
      for (let i = 0; i < Math.min(5, items.length); i++) {
        console.log(`${i + 1}. ${items[i].name} (ID: ${items[i].id}, Group: ${items[i].group.title})`);
      }
    } catch (error) {
      console.log('❌ Error testing getItems method:', error.message);
    }
    
    // Test updating column values for an item
    console.log('\nTEST 6: Testing column value update...');
    try {
      const items = await client.getItems(config.monday_board_id, { limit: 1 });
      if (items && items.length > 0) {
        const itemId = items[0].id;
        console.log(`Using item ID: ${itemId}`);
        
        // Try to update the Task ID column value
        const query = `
          mutation UpdateColumnValue($itemId: ID!, $boardId: ID!, $columnId: String!, $value: JSON!) {
            change_column_value(item_id: $itemId, board_id: $boardId, column_id: $columnId, value: $value) {
              id
              name
            }
          }
        `;
        
        // Test with text column first
        const textColumnId = 'text_mkraj7jy';
        const textValue = '99';
        
        console.log(`Updating column ${textColumnId} with value ${textValue}`);
        
        try {
          const result = await client.executeQuery(query, {
            itemId: itemId,
            boardId: config.monday_board_id,
            columnId: textColumnId,
            value: JSON.stringify(textValue)
          });
          
          console.log('Response:', JSON.stringify(result, null, 2));
          
          if (result.data && result.data.change_column_value) {
            console.log('✅ Successfully updated text column value');
          } else {
            console.log('❌ Failed to update text column value');
            console.log(JSON.stringify(result, null, 2));
          }
        } catch (error) {
          console.log('❌ Error updating text column:', error.message);
          if (error.response) {
            console.log('Error response:', JSON.stringify(error.response, null, 2));
          }
        }
        
        // Test with status column
        const statusColumnId = 'color_mkrat92y';
        const statusValue = { label: 'done' };
        
        console.log(`\nUpdating status column ${statusColumnId} with value:`, JSON.stringify(statusValue));
        
        try {
          const result = await client.executeQuery(query, {
            itemId: itemId,
            boardId: config.monday_board_id,
            columnId: statusColumnId,
            value: JSON.stringify(statusValue)
          });
          
          console.log('Response:', JSON.stringify(result, null, 2));
          
          if (result.data && result.data.change_column_value) {
            console.log('✅ Successfully updated status column value');
          } else {
            console.log('❌ Failed to update status column value');
            console.log(JSON.stringify(result, null, 2));
          }
        } catch (error) {
          console.log('❌ Error updating status column:', error.message);
          if (error.response) {
            console.log('Error response:', JSON.stringify(error.response, null, 2));
          }
        }
        
        // Test with priority column
        const priorityColumnId = 'color_mkrav3bj';
        const priorityValue = { label: 'high' };
        
        console.log(`\nUpdating priority column ${priorityColumnId} with value:`, JSON.stringify(priorityValue));
        
        try {
          const result = await client.executeQuery(query, {
            itemId: itemId,
            boardId: config.monday_board_id,
            columnId: priorityColumnId,
            value: JSON.stringify(priorityValue)
          });
          
          console.log('Response:', JSON.stringify(result, null, 2));
          
          if (result.data && result.data.change_column_value) {
            console.log('✅ Successfully updated priority column value');
          } else {
            console.log('❌ Failed to update priority column value');
            console.log(JSON.stringify(result, null, 2));
          }
        } catch (error) {
          console.log('❌ Error updating priority column:', error.message);
          if (error.response) {
            console.log('Error response:', JSON.stringify(error.response, null, 2));
          }
        }
        
        // Test with complexity column
        const complexityColumnId = 'color_mkrar5f7';
        const complexityValue = { index: "1" }; // Using index directly (1 corresponds to "16" per API error)
        
        console.log(`\nUpdating complexity column ${complexityColumnId} with value:`, JSON.stringify(complexityValue));
        
        try {
          const result = await client.executeQuery(query, {
            itemId: itemId,
            boardId: config.monday_board_id,
            columnId: complexityColumnId,
            value: JSON.stringify(complexityValue)
          });
          
          console.log('Response:', JSON.stringify(result, null, 2));
          
          if (result.data && result.data.change_column_value) {
            console.log('✅ Successfully updated complexity column value');
          } else {
            console.log('❌ Failed to update complexity column value');
            console.log(JSON.stringify(result, null, 2));
          }
        } catch (error) {
          console.log('❌ Error updating complexity column:', error.message);
          if (error.response) {
            console.log('Error response:', JSON.stringify(error.response, null, 2));
          }
        }
      } else {
        console.log('⚠️ No items found to test update');
      }
    } catch (error) {
      console.log('❌ Error in column update test:', error.message);
    }
    
    // Test fetching item column values
    console.log('\nTEST 7: Fetching detailed item information...');
    try {
      const items = await client.getItems(config.monday_board_id, { limit: 1 });
      if (items && items.length > 0) {
        const itemId = items[0].id;
        console.log(`Using item ID: ${itemId}`);
        
        const query = `
          query GetItemDetails($boardId: ID!, $itemId: ID!) {
            boards(ids: [$boardId]) {
              items(ids: [$itemId]) {
                id
                name
                column_values {
                  id
                  type
                  text
                  value
                }
              }
            }
          }
        `;
        
        const result = await client.executeQuery(query, {
          itemId,
          boardId: config.monday_board_id
        });
        
        if (result.data && result.data.boards && result.data.boards[0] && result.data.boards[0].items) {
          const item = result.data.boards[0].items[0];
          console.log('✅ Successfully fetched item details');
          console.log('Item Name:', item.name);
          console.log('Column Values:');
          
          item.column_values.forEach(column => {
            console.log(`- ${column.id} (${column.type}): ${column.text}`);
            console.log(`  Raw value: ${column.value}`);
          });
        } else {
          console.log('❌ Failed to fetch item details');
          console.log(JSON.stringify(result, null, 2));
        }
      }
    } catch (error) {
      console.error('❌ Error fetching item details:', error.message);
    }
    
    console.log('\nTEST 8: Checking for long text columns...');
    try {
      const query = `
        query GetColumnTypes($boardId: ID!) {
          boards(ids: [$boardId]) {
            columns {
              id
              title
              type
            }
          }
        }
      `;
      
      const result = await client.executeQuery(query, { boardId: config.monday_board_id });
      
      if (result.data && result.data.boards && result.data.boards[0]) {
        const columns = result.data.boards[0].columns;
        const longTextColumns = columns.filter(col => col.type === 'long-text');
        
        console.log(`Found ${longTextColumns.length} long-text columns:`);
        longTextColumns.forEach(col => {
          console.log(`- ${col.title} (${col.id})`);
        });
      }
    } catch (error) {
      console.error('Error fetching long text columns:', error);
    }
    
    console.log('\n✅ Connection test completed successfully!');
    console.log('Your Monday.com API key and board ID are valid and working.');
    console.log('You can now proceed with the implementation of Task 5.');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testConnection(); 