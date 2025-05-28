/**
 * Test Item Details
 * 
 * This script tests fetching detailed item information from Monday.com
 */

const { createMondayClient } = require('../src/api/mondayClient');
const { loadConfig } = require('../src/config/configParser');

async function testItemDetails() {
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
    
    // Fetch some items
    console.log('Fetching items...');
    const items = await client.getItems(config.monday_board_id, { limit: 1 });
    if (!items || items.length === 0) {
      console.error('No items found on the board');
      return;
    }
    
    const itemId = items[0].id;
    console.log(`Using item ID: ${itemId}`);
    
    // Simpler query to get item details
    const query = `
      query {
        items (ids: [${itemId}]) {
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
    `;
    
    console.log('Fetching item details...');
    const result = await client.executeQuery(query);
    
    if (result.data && result.data.items && result.data.items.length > 0) {
      const item = result.data.items[0];
      console.log('✅ Successfully fetched item details');
      console.log('Item Name:', item.name);
      console.log('Column Values:');
      
      item.column_values.forEach(column => {
        console.log(`- ${column.id} (${column.type}): ${column.text}`);
        if (column.value) {
          try {
            const parsedValue = JSON.parse(column.value);
            console.log(`  Raw value: ${JSON.stringify(parsedValue, null, 2)}`);
          } catch (e) {
            console.log(`  Raw value: ${column.value}`);
          }
        }
      });
    } else {
      console.log('❌ Failed to fetch item details');
      console.log(JSON.stringify(result, null, 2));
    }
    
    console.log('\nTest completed.');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testItemDetails(); 