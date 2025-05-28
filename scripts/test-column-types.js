/**
 * Test Column Types
 * 
 * This script tests different column types in Monday.com to determine the correct format
 */

const { createMondayClient } = require('../src/api/mondayClient');
const { loadConfig } = require('../src/config/configParser');

async function testColumnTypes() {
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
      console.error('No items found on the board');
      return;
    }
    
    const itemId = items[0].id;
    console.log(`Using item ID: ${itemId}`);
    
    const query = `
      mutation ChangeColumnValue($itemId: ID!, $boardId: ID!, $columnId: String!, $value: JSON!) {
        change_column_value(item_id: $itemId, board_id: $boardId, column_id: $columnId, value: $value) {
          id
          name
        }
      }
    `;
    
    // Test text column - format 1 (string)
    console.log('\nTesting Text Column Format 1 (string):');
    try {
      const result = await client.executeQuery(query, {
        itemId,
        boardId: config.monday_board_id,
        columnId: 'text_mkraj7jy',
        value: JSON.stringify("5")
      });
      
      console.log('Response:', JSON.stringify(result, null, 2));
      console.log(result.data && result.data.change_column_value ? '✅ Success' : '❌ Failed');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
    
    // Test text column - format 2 (object with text)
    console.log('\nTesting Text Column Format 2 (object with text):');
    try {
      const result = await client.executeQuery(query, {
        itemId,
        boardId: config.monday_board_id,
        columnId: 'text_mkraj7jy',
        value: JSON.stringify({ text: "5" })
      });
      
      console.log('Response:', JSON.stringify(result, null, 2));
      console.log(result.data && result.data.change_column_value ? '✅ Success' : '❌ Failed');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
    
    // Test long_text column - format 1 (string)
    console.log('\nTesting Long Text Column Format 1 (string):');
    try {
      const result = await client.executeQuery(query, {
        itemId,
        boardId: config.monday_board_id,
        columnId: 'long_text',
        value: JSON.stringify("This is a test long text")
      });
      
      console.log('Response:', JSON.stringify(result, null, 2));
      console.log(result.data && result.data.change_column_value ? '✅ Success' : '❌ Failed');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
    
    // Test long_text column - format 2 (object with text)
    console.log('\nTesting Long Text Column Format 2 (object with text):');
    try {
      const result = await client.executeQuery(query, {
        itemId,
        boardId: config.monday_board_id,
        columnId: 'long_text',
        value: JSON.stringify({ text: "This is a test long text" })
      });
      
      console.log('Response:', JSON.stringify(result, null, 2));
      console.log(result.data && result.data.change_column_value ? '✅ Success' : '❌ Failed');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
    
    console.log('\nTest completed.');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testColumnTypes(); 