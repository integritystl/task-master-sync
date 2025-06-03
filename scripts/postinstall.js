#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

// ANSI color codes for fallback
const colors = {
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`
};

// Try to load chalk, fallback to ANSI colors
let chalk;
async function getChalk() {
  if (!chalk) {
    try {
      chalk = (await import('chalk')).default;
    } catch (error) {
      // Fallback to ANSI colors if chalk fails to load
      chalk = colors;
    }
  }
  return chalk;
}

// Paths relative to where the script is installed
const userDir = process.cwd();

/**
 * Post-installation script to help set up the package
 */
async function postInstall() {
  const c = await getChalk();
  console.log(c.blue('\n📦 Setting up task-master-sync...\n'));

  // Only run in actual installs, not during development
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  // Check if files need to be created
  const configExists = fs.existsSync(path.join(userDir, 'sync-config.json'));
  const envExists = fs.existsSync(path.join(userDir, '.env'));

  // Info about files to set up
  if (!configExists) {
    console.log(c.yellow('✨ To get started, create a sync-config.json file:'));
    console.log(`   ${c.cyan('cp node_modules/task-master-sync/sync-config.example.json ./sync-config.json')}`);
    console.log(`   ${c.cyan('# Edit sync-config.json with your Monday.com board details')}\n`);
    
    console.log(c.yellow('⚠️ Important: Configure your Monday.com column mappings:'));
    console.log(`   ${c.cyan('1. Go to your Monday.com board settings')}`);
    console.log(`   ${c.cyan('2. Navigate to the "Customize" tab')}`);
    console.log(`   ${c.cyan('3. Find the column IDs for each field you want to map')}`);
    console.log(`   ${c.cyan('4. Update the "column_mappings" section in sync-config.json')}\n`);
  }

  if (!envExists) {
    console.log(c.yellow('🔑 Set up your environment variables:'));
    console.log(`   ${c.cyan('cp node_modules/task-master-sync/env.example ./.env')}`);
    console.log(`   ${c.cyan('# Edit .env with your Monday.com API key')}\n`);
  }

  console.log(c.green('🚀 Usage:'));
  console.log(`   ${c.cyan('npx taskmaster-sync push')} - Push TaskMaster tasks to Monday.com`);
  console.log(`   ${c.cyan('npx taskmaster-sync pull')} - Pull Monday.com items to TaskMaster\n`);

  console.log(c.blue('📚 For more information, see the documentation:'));
  console.log(`   ${c.cyan('https://github.com/yourusername/task-master-sync#readme')}\n`);
}

// Run the post-install script
postInstall().catch(err => {
  console.error('Error during post-install setup:', err);
  process.exit(1);
}); 