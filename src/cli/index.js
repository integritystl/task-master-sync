#!/usr/bin/env node

/**
 * TaskMaster-Monday Sync CLI
 * Command-line interface for the synchronization tool
 */

const { program } = require('commander');
const { version } = require('../../package.json');
const dotenv = require('dotenv');
const cli = require('./cli');

// Load environment variables
dotenv.config();

// Configure the CLI
program
  .name('taskmaster-sync')
  .description('Synchronize TaskMaster tasks with Monday.com')
  .version(version);

// Push command
program
  .command('push')
  .description('Push TaskMaster tasks to Monday.com')
  .option('-d, --dry-run', 'Show what would be synced without making changes', false)
  .option('-v, --verbose', 'Increase logging detail', false)
  .option('-c, --config <path>', 'Path to sync config file', cli.DEFAULT_SYNC_CONFIG_PATH)
  .option('-t, --tasks <path>', 'Path to tasks.json file', cli.DEFAULT_TASKS_PATH)
  .option('-s, --state <path>', 'Path to sync state file', cli.DEFAULT_SYNC_STATE_PATH)
  .option('--delete-orphaned', 'Delete orphaned Monday.com items (default: true)', true)
  .option('--no-delete-orphaned', 'Do not delete orphaned Monday.com items')
  .option('--skip-generate', 'Skip running task-master generate before pushing', false)
  .action(cli.runPushSync);

// Pull command
program
  .command('pull')
  .description('Pull Monday.com items to TaskMaster')
  .option('-d, --dry-run', 'Show what would be synced without making changes', false)
  .option('-v, --verbose', 'Increase logging detail', false)
  .option('-c, --config <path>', 'Path to sync config file', cli.DEFAULT_SYNC_CONFIG_PATH)
  .option('-t, --tasks <path>', 'Path to tasks.json file', cli.DEFAULT_TASKS_PATH)
  .option('-s, --state <path>', 'Path to sync state file', cli.DEFAULT_SYNC_STATE_PATH)
  .option('-a, --assign-task-ids', 'Automatically assign Task IDs to new Monday.com items', false)
  .option('-f, --force', 'Overwrite local changes with Monday.com data', false)
  .option('--skip-conflicts', 'Skip tasks with local changes', false)
  .option('--task-id <id>', 'Pull only a specific task by ID')
  .option('--group <group_id>', 'Pull from a specific Monday.com group')
  .option('--regenerate', 'Regenerate task files after pull', true)
  .option('--no-regenerate', 'Do not regenerate task files after pull')
  .option('--remove-orphaned', 'Remove orphaned local tasks (default: true)', true)
  .option('--no-remove-orphaned', 'Do not remove orphaned local tasks')
  .option('--recreate-missing-tasks', 'Recreate tasks that exist in Monday.com but not locally (default: true)', true)
  .option('--no-recreate-missing-tasks', 'Do not recreate missing tasks from Monday.com')
  .option('--skip-generate', 'Skip running task-master generate after pulling', false)
  .action(cli.runPullSync);

// Config command to display the current configuration
program
  .command('config')
  .description('Display the current sync configuration')
  .option('-c, --config <path>', 'Path to sync config file', cli.DEFAULT_SYNC_CONFIG_PATH)
  .action(cli.showConfig);

program.parse(process.argv);

// If no arguments are provided, display help
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 