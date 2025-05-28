/**
 * Test Monday.com Update Management
 * 
 * This script tests the ability to track, delete, and replace updates
 * rather than creating new ones each time.
 */

const { createMondayClient } = require('../src/api/mondayClient');
const { createSyncStateManager } = require('../src/sync/syncStateManager');
const { loadConfig } = require('../src/config/configParser');

async function testUpdateManagement() {
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
    
    // Create a sync state manager
    console.log('Creating sync state manager...');
    const stateManager = createSyncStateManager({
      syncFilePath: '.taskmaster_sync_state.json'
    });
    
    // Fetch a sample item
    console.log('\nFetching items...');
    const items = await client.getItems(config.monday_board_id, { limit: 1 });
    
    if (!items || items.length === 0) {
      console.log('❌ No items found to test');
      return;
    }
    
    const itemId = items[0].id;
    const taskId = '1'; // For testing, we'll pretend this is task ID 1
    console.log(`Using item ID: ${itemId} for test task ID: ${taskId}`);
    
    // Create formatted update with rich content
    const updateText = `
📋 TASK DETAILS - ${taskId} - Test Update Management 📋

${'='.repeat(40)}

🔍 **Description**
This is the first test update.

${'='.repeat(40)}
Last updated: ${new Date().toISOString()}
`;
    
    console.log('\nPosting initial update...');
    
    try {
      // Create the first update
      const result = await client.postUpdate(itemId, updateText);
      console.log('✅ Successfully posted update!');
      console.log('Update ID:', result.id);
      
      // Store the update ID in the sync state
      await stateManager.storeUpdateIdForTask(taskId, itemId, result.id);
      console.log('✅ Stored update ID in sync state');
      
      // Create a new update text
      const newUpdateText = `
📋 TASK DETAILS - ${taskId} - Test Update Management 📋

${'='.repeat(40)}

🔍 **Description**
This is the UPDATED content that should replace the first update.

${'='.repeat(40)}
Last updated: ${new Date().toISOString()}
`;
      
      console.log('\nWaiting 5 seconds before posting second update...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get the stored update ID
      const storedUpdateId = await stateManager.getUpdateIdForTask(taskId, itemId);
      console.log('Retrieved stored update ID:', storedUpdateId);
      
      if (storedUpdateId) {
        // Delete the old update
        console.log(`Deleting update with ID ${storedUpdateId}...`);
        await client.deleteUpdate(storedUpdateId);
        console.log('✅ Successfully deleted old update');
      }
      
      // Create a new update
      console.log('Posting new update...');
      const newResult = await client.postUpdate(itemId, newUpdateText);
      console.log('✅ Successfully posted new update!');
      console.log('New Update ID:', newResult.id);
      
      // Store the new update ID
      await stateManager.storeUpdateIdForTask(taskId, itemId, newResult.id);
      console.log('✅ Stored new update ID in sync state');
      
      // Verify the stored ID
      const finalUpdateId = await stateManager.getUpdateIdForTask(taskId, itemId);
      console.log('Final stored update ID:', finalUpdateId);
      
      if (finalUpdateId === newResult.id) {
        console.log('✅ Update management test PASSED!');
      } else {
        console.log('❌ Update management test FAILED! IDs do not match.');
      }
    } catch (error) {
      console.log('❌ Error during test:', error.message);
      if (error.response) {
        console.log('Error response:', JSON.stringify(error.response, null, 2));
      }
    }
    
    console.log('\nTest completed. Check the Monday.com board to verify updates.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testUpdateManagement(); 