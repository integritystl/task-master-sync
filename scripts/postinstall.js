#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

// Paths relative to where the script is installed
const userDir = process.cwd();

/**
 * Post-installation script to help set up the package
 */
async function postInstall() {
  console.log(chalk.blue('\n📦 Setting up task-master-sync...\n'));

  // Only run in actual installs, not during development
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  // Check if files need to be created
  const configExists = fs.existsSync(path.join(userDir, 'sync-config.json'));
  const envExists = fs.existsSync(path.join(userDir, '.env'));

  // Info about files to set up
  if (!configExists) {
    console.log(chalk.yellow('✨ To get started, create a sync-config.json file:'));
    console.log(`   ${chalk.cyan('cp node_modules/task-master-sync/sync-config.example.json ./sync-config.json')}`);
    console.log(`   ${chalk.cyan('# Edit sync-config.json with your Monday.com board details')}\n`);
    
    console.log(chalk.yellow('⚠️ Important: Configure your Monday.com column mappings:'));
    console.log(`   ${chalk.cyan('1. Go to your Monday.com board settings')}`);
    console.log(`   ${chalk.cyan('2. Navigate to the "Customize" tab')}`);
    console.log(`   ${chalk.cyan('3. Find the column IDs for each field you want to map')}`);
    console.log(`   ${chalk.cyan('4. Update the "column_mappings" section in sync-config.json')}\n`);
  }

  if (!envExists) {
    console.log(chalk.yellow('🔑 Set up your environment variables:'));
    console.log(`   ${chalk.cyan('cp node_modules/task-master-sync/env.example ./.env')}`);
    console.log(`   ${chalk.cyan('# Edit .env with your Monday.com API key')}\n`);
  }

  console.log(chalk.green('🚀 Usage:'));
  console.log(`   ${chalk.cyan('npx taskmaster-sync push')} - Push TaskMaster tasks to Monday.com`);
  console.log(`   ${chalk.cyan('npx taskmaster-sync pull')} - Pull Monday.com items to TaskMaster\n`);

  console.log(chalk.blue('📚 For more information, see the documentation:'));
  console.log(`   ${chalk.cyan('https://github.com/yourusername/task-master-sync#readme')}\n`);
}

// Run the post-install script
postInstall().catch(err => {
  console.error('Error during post-install setup:', err);
  process.exit(1);
}); 