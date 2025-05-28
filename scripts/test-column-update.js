/**
 * Test Column Update Script
 * 
 * This script tests updating individual column values on Monday.com items
 */

const { createMondayClient } = require('../src/api/mondayClient');
const { loadConfig } = require('../src/config/configParser');

async function testColumnUpdate() {
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
    
    // Fetch a sample item
    const items = await client.getItems(config.monday_board_id, { limit: 1 });
    if (!items || items.length === 0) {
      console.log('❌ No items found to test');
      return;
    }
    
    const itemId = items[0].id;
    console.log(`Using item ID: ${itemId}`);
    
    // Try updating only the Task ID column
    console.log('\nTesting Task ID column update:');
    
    const taskIdColumnId = 'text_mkraj7jy';
    const taskIdValue = "99"; // Plain string value
    
    // Define the GraphQL query
    const query = `
      mutation ChangeColumnValue($itemId: ID!, $boardId: ID!, $columnId: String!, $value: JSON!) {
        change_column_value(item_id: $itemId, board_id: $boardId, column_id: $columnId, value: $value) {
          id
          name
        }
      }
    `;
    
    console.log(`Updating taskId column ${taskIdColumnId} with value: "${taskIdValue}"`);
    
    try {
      const result = await client.executeQuery(query, {
        itemId: itemId,
        boardId: config.monday_board_id,
        columnId: taskIdColumnId,
        value: JSON.stringify(taskIdValue)
      });
      
      console.log('Response:', JSON.stringify(result, null, 2));
      
      if (result.data && result.data.change_column_value) {
        console.log('✅ Successfully updated taskId column');
      } else {
        console.log('❌ Failed to update taskId column');
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.log('❌ Error updating taskId column:', error.message);
      if (error.response) {
        console.log('Error response:', JSON.stringify(error.response, null, 2));
      }
    }
    
    console.log('\nTest completed.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testColumnUpdate(); 