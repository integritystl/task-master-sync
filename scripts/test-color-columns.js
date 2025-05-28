/**
 * Test Color Columns
 * 
 * This script tests the available label values for color/status columns in Monday.com
 */

const { createMondayClient } = require('../src/api/mondayClient');
const { loadConfig } = require('../src/config/configParser');

async function testColorColumns() {
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
    
    // Test fetching column values
    console.log('\nFetching board details to analyze column options...');
    const query = `
      query GetBoardColumns($boardId: ID!) {
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
    
    const result = await client.executeQuery(query, { boardId: config.monday_board_id });
    
    if (result.data && result.data.boards && result.data.boards[0] && result.data.boards[0].columns) {
      const columns = result.data.boards[0].columns;
      
      // Show all column types
      const columnTypes = [...new Set(columns.map(col => col.type))];
      console.log(`\nColumn types: ${columnTypes.join(', ')}`);
      
      console.log(`\nAll columns (${columns.length}):`);
      
      for (const column of columns) {
        console.log(`\nColumn: ${column.title} (${column.id}), Type: ${column.type}`);
        console.log('Settings:');
        
        try {
          const settings = JSON.parse(column.settings_str);
          console.log(JSON.stringify(settings, null, 2));
          
          if (settings && settings.labels) {
            console.log('\nValid labels:');
            const labels = Object.entries(settings.labels);
            for (const [index, label] of labels) {
              console.log(`- Index: ${index}, Label: "${label.name}"`);
            }
          }
        } catch (e) {
          console.log('Could not parse settings');
        }
      }
    } else {
      console.log('❌ Failed to fetch board columns');
    }
    
    console.log('\nTest completed.');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testColorColumns(); 