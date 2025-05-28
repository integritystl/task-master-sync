/**
 * Test Monday.com Updates
 * 
 * This script tests posting updates to Monday.com items
 */

const { createMondayClient } = require('../src/api/mondayClient');
const { loadConfig } = require('../src/config/configParser');

async function testUpdates() {
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
    
    // Create formatted update with rich content
    const updateText = `
📋 TASK DETAILS - TEST - Sample Task 📋

${'='.repeat(40)}

🔍 **Description**
This is a test description for a TaskMaster task.

📝 **Implementation Details**
These are the implementation details for the task:
- Step 1: Configure API
- Step 2: Implement sync logic
- Step 3: Test and verify functionality

✅ **Test Strategy**
This task will be tested by:
1. Unit tests for each component
2. Integration test with Monday.com API
3. End-to-end test with real data

${'='.repeat(40)}
Last updated: ${new Date().toISOString()}
`;
    
    console.log('\nPosting update with formatted content...');
    console.log('Update content:', updateText);
    
    try {
      // Use the standard postUpdate method
      const result = await client.postUpdate(itemId, updateText);
      console.log('✅ Successfully posted update!');
      console.log('Update ID:', result.id);
    } catch (error) {
      console.log('❌ Error posting update:', error.message);
      if (error.response) {
        console.log('Error response:', JSON.stringify(error.response, null, 2));
      }
    }
    
    console.log('\nTest completed. Check the Monday.com board to see if the update appears correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testUpdates(); 