/**
 * Test Monday.com Delete Update Functionality
 * 
 * This script tests specifically the ability to delete an update
 */

const { createMondayClient } = require('../src/api/mondayClient');
const { loadConfig } = require('../src/config/configParser');

async function testDeleteUpdate() {
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
    console.log('\nFetching items...');
    const items = await client.getItems(config.monday_board_id, { limit: 1 });
    
    if (!items || items.length === 0) {
      console.log('❌ No items found to test');
      return;
    }
    
    const itemId = items[0].id;
    console.log(`Using item ID: ${itemId}`);
    
    // Create a test update
    console.log('\nCreating a test update...');
    const updateText = `Test update for deletion - ${new Date().toISOString()}`;
    
    const createResult = await client.postUpdate(itemId, updateText);
    console.log('✅ Created test update with ID:', createResult.id);
    
    // Wait a moment before deleting
    console.log('Waiting 2 seconds before deletion...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Now try to delete it
    console.log(`Attempting to delete update with ID ${createResult.id}...`);
    
    try {
      // First, get the raw GraphQL query for deletion to see what's being sent
      const query = `
        mutation DeleteUpdate($updateId: ID!) {
          delete_update(id: $updateId) {
            id
          }
        }
      `;
      
      const variables = {
        updateId: createResult.id
      };
      
      console.log('Raw query:', query);
      console.log('Variables:', JSON.stringify(variables));
      
      // Execute the raw query directly
      const rawResult = await client.executeQuery(query, variables);
      console.log('Raw delete result:', JSON.stringify(rawResult, null, 2));
      
      // Extract the ID from the result to verify it matches
      if (rawResult.data && 
          rawResult.data.delete_update && 
          rawResult.data.delete_update.id) {
        console.log(`✅ Delete response contains ID: ${rawResult.data.delete_update.id}`);
        console.log(`  Expected ID: ${createResult.id}`);
        console.log(`  Match?: ${rawResult.data.delete_update.id === createResult.id}`);
      } else {
        console.log('❌ Delete response does not contain the expected ID structure');
      }
      
      // Try the regular delete method
      const deleteResult = await client.deleteUpdate(createResult.id);
      
      if (deleteResult === true) {
        console.log('✅ Successfully deleted update via client.deleteUpdate()');
      } else {
        console.log('❌ client.deleteUpdate() returned something other than true:', deleteResult);
      }
    } catch (error) {
      console.log('❌ Error deleting update:', error.message);
      if (error.response) {
        console.log('Error response:', JSON.stringify(error.response, null, 2));
      }
    }
    
    console.log('\nTest completed. Check the Monday.com board to verify deletion.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testDeleteUpdate(); 