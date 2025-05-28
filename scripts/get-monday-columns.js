#!/usr/bin/env node

/**
 * Utility script to fetch and display column IDs from a Monday.com board
 * This helps users configure the column_mappings in their sync-config.json
 */

const { loadConfig } = require('../src/config/configParser');
const { createMondayClient } = require('../src/api/mondayClient');
const chalk = require('chalk');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Process command line arguments
const args = process.argv.slice(2);
const apiKeyArg = args.find(arg => arg.startsWith('--api-key='));
const boardIdArg = args.find(arg => arg.startsWith('--board-id='));

// Load environment variables from .env file
dotenv.config();

// Debug environment variables
console.log(chalk.blue('Environment variables:'));
console.log(chalk.gray('-------------------------'));
console.log(`MONDAY_API_KEY: ${process.env.MONDAY_API_KEY ? 'Set ✅' : 'Not set ❌'}`);
console.log(`MONDAY_BOARD_ID: ${process.env.MONDAY_BOARD_ID ? 'Set ✅' : 'Not set ❌'}`);
console.log(chalk.gray('-------------------------\n'));

async function getColumnIds() {
  try {
    console.log(chalk.blue('\n🔍 Fetching Monday.com board columns...\n'));
    
    // Try to load configuration 
    let config;
    try {
      config = loadConfig();
    } catch (err) {
      config = {};
      console.log(chalk.yellow('⚠️ No sync-config.json found. Using environment variables or CLI arguments.'));
    }
    
    // Override with command line arguments if provided
    if (apiKeyArg) {
      config.monday_api_key = apiKeyArg.split('=')[1];
    }
    
    if (boardIdArg) {
      config.monday_board_id = boardIdArg.split('=')[1];
    }
    
    // Check for API key in environment variables if not in config
    if (!config.monday_api_key) {
      config.monday_api_key = process.env.MONDAY_API_KEY;
    }
    
    // Check for board ID in environment variables if not in config
    if (!config.monday_board_id) {
      config.monday_board_id = process.env.MONDAY_BOARD_ID;
    }
    
    // Final check for required values
    if (!config.monday_board_id) {
      console.error(chalk.red('❌ Error: monday_board_id is missing'));
      console.log(chalk.yellow('\nTo provide a board ID, use one of these methods:'));
      console.log('  1. Add monday_board_id in sync-config.json');
      console.log('  2. Set MONDAY_BOARD_ID environment variable');
      console.log('  3. Use the --board-id=<id> command line argument\n');
      process.exit(1);
    }
    
    if (!config.monday_api_key) {
      console.error(chalk.red('❌ Error: monday_api_key is missing'));
      console.log(chalk.yellow('\nTo provide an API key, use one of these methods:'));
      console.log('  1. Add monday_api_key in sync-config.json');
      console.log('  2. Set MONDAY_API_KEY environment variable');
      console.log('  3. Use the --api-key=<key> command line argument');
      console.log('\nTo get an API key:');
      console.log('  1. Go to monday.com');
      console.log('  2. Click your avatar > Admin > API');
      console.log('  3. Generate "API v2 Token"\n');
      process.exit(1);
    }
    
    // Create Monday client
    const mondayClient = createMondayClient(config);
    
    // Fetch board details
    console.log(chalk.cyan(`Fetching columns for board ID: ${config.monday_board_id}`));
    const board = await mondayClient.getBoard(config.monday_board_id);
    
    if (!board) {
      console.error(chalk.red('❌ Error: Could not fetch board data. Check your board ID and API key.'));
      process.exit(1);
    }
    
    console.log(chalk.green(`\n✅ Board: ${board.name}\n`));
    
    // Display column information
    console.log(chalk.yellow('Board Columns:'));
    console.log(chalk.gray('-----------------------------------'));
    console.log(chalk.yellow('ID'.padEnd(25) + 'Title'.padEnd(30) + 'Type'));
    console.log(chalk.gray('-----------------------------------'));
    
    board.columns.forEach(column => {
      console.log(`${chalk.cyan(column.id.padEnd(25))}${column.title.padEnd(30)}${column.type}`);
    });
    
    console.log(chalk.gray('-----------------------------------\n'));
    
    // Provide instructions for updating the config
    console.log(chalk.green('Use these column IDs in your sync-config.json file:'));
    console.log(chalk.gray('-----------------------------------'));
    console.log(`
"column_mappings": {
  "taskId": "${chalk.cyan('<ID_OF_TEXT_COLUMN>')}",
  "status": "${chalk.cyan('<ID_OF_STATUS_COLUMN>')}",
  "priority": "${chalk.cyan('<ID_OF_PRIORITY_COLUMN>')}",
  "dependencies": "${chalk.cyan('<ID_OF_TEXT_COLUMN>')}",
  "complexity": "${chalk.cyan('<ID_OF_COLOR_COLUMN>')}",
  "description": "${chalk.cyan('<ID_OF_LONG_TEXT_COLUMN>')}",
  "details": "${chalk.cyan('<ID_OF_LONG_TEXT_COLUMN>')}",
  "testStrategy": "${chalk.cyan('<ID_OF_LONG_TEXT_COLUMN>')}"
}
`);
    
    console.log(chalk.gray('-----------------------------------\n'));
    
    // Write example config if none exists
    const configPath = path.join(process.cwd(), 'sync-config.json');
    if (!fs.existsSync(configPath)) {
      console.log(chalk.yellow('\nNo sync-config.json found. Would you like to create one? (Y/n)'));
      // In a real interactive environment, we'd get user input here
      console.log(chalk.yellow('In a CI/CD environment, you can create one with:'));
      console.log(`
cat > sync-config.json << EOL
{
  "monday_board_id": "${config.monday_board_id}",
  "monday_group_ids": ["YOUR_GROUP_ID"],
  "monday_api_key": "${config.monday_api_key}",
  "developer_id": "ci-pipeline",
  "column_mappings": {
    // Add your column mappings here based on the IDs above
  }
}
EOL
`);
    }
    
  } catch (error) {
    console.error(chalk.red(`❌ Error: ${error.message}`));
    console.log(chalk.yellow('\nTip: Make sure your Monday.com API key has the correct permissions.'));
    process.exit(1);
  }
}

// Display help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npx taskmaster-sync-get-columns [options]

Options:
  --api-key=<key>     Specify Monday.com API key
  --board-id=<id>     Specify Monday.com board ID
  --help, -h          Show this help

Environment Variables:
  MONDAY_API_KEY      Monday.com API key
  MONDAY_BOARD_ID     Monday.com board ID

Description:
  This utility fetches and displays column IDs from your Monday.com board
  to help you configure the column_mappings in your sync-config.json file.
  `);
  process.exit(0);
}

// Run the script
getColumnIds().catch(error => {
  console.error(chalk.red(`❌ Error: ${error.message}`));
  process.exit(1);
}); 