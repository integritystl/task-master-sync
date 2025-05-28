/**
 * TaskMaster-Monday Sync CLI Module
 * Core CLI functionality separated for testing
 */

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const ora = require('ora');
const { createPushSync } = require('../sync/pushSyncLogic');
const { createPullSync } = require('../sync/pullSyncLogic');
const { Logger } = require('../utils/logger');
const { spawn } = require('child_process');

// Default paths
const DEFAULT_TASKS_PATH = 'tasks/tasks.json';
const DEFAULT_SYNC_CONFIG_PATH = 'sync-config.json';
const DEFAULT_SYNC_STATE_PATH = '.taskmaster_sync_state.json';

/**
 * Load and validate the sync configuration
 * @param {string} configPath - Path to the sync config file
 * @returns {Object} - The sync configuration
 */
function loadConfig(configPath) {
  try {
    // Check if the config file exists
    if (!fs.existsSync(configPath)) {
      console.error(chalk.red(`Error: Config file not found at ${configPath}`));
      console.log(chalk.yellow(`Create a sync-config.json file based on sync-config.example.json`));
      process.exit(1);
    }

    // Load the config file
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Validate required fields
    if (!config.monday_api_key && !process.env.MONDAY_API_KEY) {
      console.error(chalk.red('Error: Monday.com API key is required in config file or MONDAY_API_KEY environment variable'));
      process.exit(1);
    }

    if (!config.monday_board_id) {
      console.error(chalk.red('Error: Monday.com board ID is required in config file'));
      process.exit(1);
    }

    if (!config.monday_group_ids || !Array.isArray(config.monday_group_ids) || config.monday_group_ids.length === 0) {
      console.error(chalk.red('Error: Monday.com group IDs array is required in config file'));
      process.exit(1);
    }

    return config;
  } catch (error) {
    console.error(chalk.red(`Error loading config: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Format sync results for console output
 * @param {Object} results - Sync results
 * @returns {string} - Formatted results
 */
function formatSyncResults(results) {
  let output = '\n';
  
  // Created items
  if (results.created.length > 0) {
    output += chalk.green(`✓ Created ${results.created.length} items:\n`);
    results.created.forEach(item => {
      output += chalk.green(`  - Task ${item.taskId} → Monday.com item ${item.mondayItemId}\n`);
    });
    output += '\n';
  }
  
  // Recreated items
  if (results.recreated && results.recreated.length > 0) {
    output += chalk.cyan(`✓ Recreated ${results.recreated.length} deleted Monday.com items:\n`);
    results.recreated.forEach(item => {
      output += chalk.cyan(`  - Task ${item.taskId} → New Monday.com item ${item.newMondayItemId} (replaced ${item.oldMondayItemId})\n`);
    });
    output += '\n';
  }
  
  // Updated items
  if (results.updated.length > 0) {
    output += chalk.blue(`✓ Updated ${results.updated.length} items:\n`);
    results.updated.forEach(item => {
      output += chalk.blue(`  - Task ${item.taskId} → Monday.com item ${item.mondayItemId}\n`);
    });
    output += '\n';
  }
  
  // Errors
  if (results.errors.length > 0) {
    output += chalk.red(`✗ Encountered ${results.errors.length} errors:\n`);
    results.errors.forEach(error => {
      output += chalk.red(`  - Task ${error.taskId}: ${error.error}\n`);
    });
    output += '\n';
  }
  
  // Add the deleted items section before the summary
  if (results.deleted && results.deleted.length > 0) {
    const deletedSection = chalk.yellow(`✓ Deleted ${results.deleted.length} orphaned items:\n`);
    const deletedItems = results.deleted.map(item => 
      chalk.yellow(`  - Monday.com item ${item.mondayItemId} (was mapped to task ${item.taskId})\n`)
    ).join('');
    
    output += deletedSection + deletedItems + '\n';
  }
  
  // Add summary line
  output += chalk.bold(`Summary: ${results.created.length} created, ${results.updated.length} updated, ${results.errors.length} errors\n`);
  
  if (results.dryRun) {
    output += chalk.yellow('\nThis was a dry run. No changes were made to Monday.com.\n');
  }
  
  return output;
}

/**
 * Run the task-master generate command to ensure task files are up to date
 * @param {boolean} verbose - Whether to show verbose output
 * @returns {Promise<boolean>} - Whether the command succeeded
 */
async function runTaskMasterGenerate(verbose = false) {
  // eslint-disable-next-line no-unused-vars
  return new Promise((resolve, reject) => {
    console.log(chalk.blue('Running task-master generate to ensure task files are up to date...'));
    
    const spinner = ora({
      text: 'Generating task files...',
      color: 'blue'
    }).start();
    
    const generateProcess = spawn('task-master', ['generate'], {
      stdio: verbose ? 'inherit' : 'pipe'
    });
    
    let errorOutput = '';
    if (!verbose && generateProcess.stderr) {
      generateProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
    }
    
    generateProcess.on('close', (code) => {
      if (code === 0) {
        spinner.succeed('Task files generated successfully');
        resolve(true);
      } else {
        spinner.fail('Failed to generate task files');
        if (errorOutput) {
          console.error(chalk.red(errorOutput));
        }
        // Don't reject, just log the error and continue with sync
        console.error(chalk.yellow(`Warning: task-master generate exited with code ${code}`));
        console.log(chalk.yellow('Continuing with sync anyway...'));
        resolve(false);
      }
    });
    
    generateProcess.on('error', (error) => {
      spinner.fail('Failed to run task-master generate');
      console.error(chalk.red(`Error: ${error.message}`));
      console.log(chalk.yellow('Continuing with sync anyway...'));
      resolve(false);
    });
  });
}

/**
 * Run the push sync process
 * @param {Object} options - CLI options
 * @returns {Promise<Object>} - Sync results
 */
async function runPushSync(options) {
  try {
    // Set verbose mode
    const verboseMode = options.verbose || false;
    if (verboseMode) {
      Logger.level = 'debug';
      console.log(chalk.blue('Verbose mode enabled'));
    }
    
    // First, run task-master generate to ensure task files are up to date
    // Only if not in dry run mode
    const skipGenerate = options.skipGenerate || false;
    if (!options.dryRun && !skipGenerate) {
      await runTaskMasterGenerate(verboseMode);
    } else if (skipGenerate) {
      console.log(chalk.yellow('Skipping task-master generate (--skip-generate flag set)'));
    }
    
    // Resolve file paths
    const configPath = path.resolve(process.cwd(), options.config || DEFAULT_SYNC_CONFIG_PATH);
    const tasksPath = path.resolve(process.cwd(), options.tasks || DEFAULT_TASKS_PATH);
    const statePath = path.resolve(process.cwd(), options.state || DEFAULT_SYNC_STATE_PATH);
    const dryRun = options.dryRun || false;
    const deleteOrphaned = options.deleteOrphaned !== undefined ? options.deleteOrphaned : true;
    
    // Load the config
    const config = loadConfig(configPath);
    
    // Check if tasks file exists
    if (!fs.existsSync(tasksPath)) {
      console.error(chalk.red(`Error: Tasks file not found at ${tasksPath}`));
      process.exit(1);
    }
    
    // Create push sync instance
    console.log(chalk.dim(`API Key in config: ${config.monday_api_key ? 'Present' : 'Not found'}`));
    console.log(chalk.dim(`API Key in env: ${process.env.MONDAY_API_KEY ? 'Present' : 'Not found'}`));
    
    // Ensure API key is in the config object
    const configWithApiKey = {
      ...config,
      // Ensure API key is available in all the formats the client might expect
      monday_api_key: config.monday_api_key || process.env.MONDAY_API_KEY,
      apiToken: config.monday_api_key || process.env.MONDAY_API_KEY
    };
    
    console.log(chalk.dim(`Push sync config: ${JSON.stringify({
      monday_api_key: configWithApiKey.monday_api_key ? 'Present' : 'Not found',
      apiToken: configWithApiKey.apiToken ? 'Present' : 'Not found',
      mondayBoardId: configWithApiKey.monday_board_id,
      deleteOrphaned: deleteOrphaned
    })}`));
    
    const pushSyncOptions = {
      mondayApiKey: configWithApiKey.monday_api_key || configWithApiKey.apiToken,
      tasksFilePath: tasksPath,
      syncFilePath: statePath,
      dryRun: dryRun,
      deleteOrphaned: deleteOrphaned,
      mondayBoardId: config.monday_board_id,
      mondayGroupIds: config.monday_group_ids,
      columnMappings: config.column_mappings
    };
    
    console.log(chalk.dim(`Push sync options: ${JSON.stringify({
      mondayApiKey: pushSyncOptions.mondayApiKey ? 'Present' : 'Not found',
      dryRun: pushSyncOptions.dryRun,
      deleteOrphaned: pushSyncOptions.deleteOrphaned,
      mondayBoardId: pushSyncOptions.mondayBoardId,
      mondayGroupIds: pushSyncOptions.mondayGroupIds
    })}`));
    
    // Create push sync with the updated options
    const pushSync = createPushSync(pushSyncOptions);
    
    // Debug log
    console.log(chalk.dim(`Using API key: ${config.monday_api_key ? 'From config' : process.env.MONDAY_API_KEY ? 'From env' : 'Not found'}`));
    
    // Show start message
    console.log(chalk.bold(`\nStarting push sync${dryRun ? ' (DRY RUN)' : ''} of TaskMaster tasks to Monday.com\n`));
    console.log(chalk.dim(`Using config: ${configPath}`));
    console.log(chalk.dim(`Tasks file: ${tasksPath}`));
    console.log(chalk.dim(`Sync state: ${statePath}`));
    console.log(chalk.dim(`Board ID: ${config.monday_board_id}`));
    console.log(chalk.dim(`Group IDs: ${config.monday_group_ids.join(', ')}`));
    
    if (!deleteOrphaned) {
      console.log(chalk.yellow('Note: Orphaned Monday.com items will not be deleted'));
    }
    
    // Create a spinner
    const spinner = ora({
      text: 'Pushing tasks to Monday.com...',
      color: 'yellow'
    }).start();
    
    // Execute the push sync
    const results = await pushSync.pushSync(tasksPath, { dryRun: dryRun, deleteOrphaned: deleteOrphaned });
    
    // Show results
    spinner.succeed('Push sync completed');
    
    // Format and display the results
    const output = formatSyncResults(results);
    console.log(output);
    
    return results;
  } catch (error) {
    console.error(chalk.red(`\nError during push sync: ${error.message}`));
    if (options.verbose && error.stack) {
      console.error(chalk.red(error.stack));
    }
    process.exit(1);
  }
}

/**
 * Show the current configuration
 * @param {Object} options - CLI options
 */
function showConfig(options) {
  try {
    const configPath = path.resolve(process.cwd(), options.config || DEFAULT_SYNC_CONFIG_PATH);
    const config = loadConfig(configPath);
    
    console.log(chalk.bold('\nCurrent Sync Configuration:\n'));
    console.log(chalk.dim(`Config file: ${configPath}`));
    console.log(`Monday.com Board ID: ${chalk.cyan(config.monday_board_id)}`);
    console.log(`Monday.com Group IDs: ${chalk.cyan(config.monday_group_ids.join(', '))}`);
    console.log(`Monday.com API Key: ${chalk.cyan('***' + (config.monday_api_key || process.env.MONDAY_API_KEY).slice(-4))}`);
    
    if (config.developer_id) {
      console.log(`Developer ID: ${chalk.cyan(config.developer_id)}`);
    }
    
  } catch (error) {
    console.error(chalk.red(`\nError displaying config: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Format pull sync results for console output
 * @param {Object} results - Pull sync results
 * @returns {string} - Formatted results
 */
function formatPullResults(results) {
  let output = '\n';
  
  // New tasks
  if (results.newTasks > 0) {
    output += chalk.green(`✓ Found ${results.newTasks} new tasks from Monday.com:\n`);
    results.newItems.forEach(task => {
      output += chalk.green(`  - Monday.com item → Task ${task.id}: ${task.title}\n`);
    });
    output += '\n';
  }
  
  // Updated tasks
  if (results.updatedTasks > 0) {
    output += chalk.blue(`✓ Found ${results.updatedTasks} tasks with updates from Monday.com:\n`);
    results.updatedItems.forEach(task => {
      output += chalk.blue(`  - Monday.com item → Task ${task.id}: ${task.title}\n`);
    });
    output += '\n';
  }
  
  // Recreated tasks
  if (results.recreated > 0) {
    output += chalk.cyan(`✓ Recreated ${results.recreated} tasks that exist in Monday.com but were missing locally:\n`);
    results.recreatedItems.forEach(task => {
      output += chalk.cyan(`  - Monday.com item → Task ${task.id}: ${task.title}\n`);
    });
    output += '\n';
  }
  
  // Orphaned tasks
  if (results.orphanedTasks > 0) {
    output += chalk.yellow(`✓ Found ${results.orphanedTasks} orphaned tasks (Monday.com items deleted):\n`);
    if (results.orphanedTaskIds && results.orphanedTaskIds.length > 0) {
      results.orphanedTaskIds.forEach(taskId => {
        output += chalk.yellow(`  - Task ${taskId} (Monday.com item deleted)\n`);
      });
    }
    output += '\n';
  }
  
  // Conflicts
  if (results.conflicts > 0) {
    output += chalk.yellow(`⚠ Found ${results.conflicts} potential conflicts:\n`);
    results.conflictItems.forEach(conflict => {
      output += chalk.yellow(`  - Task ${conflict.mondayTask.id}: Local changes conflict with Monday.com changes\n`);
    });
    output += '\n';
  }
  
  // Summary
  output += chalk.bold(`Summary: ${results.newTasks} new, ${results.updatedTasks} updated, ${results.orphanedTasks} orphaned, ${results.conflicts} conflicts\n`);
  
  if (results.dryRun) {
    output += chalk.yellow('\nThis was a dry run. No changes were made to tasks.json.\n');
  }
  
  return output;
}

/**
 * Run the pull sync process
 * @param {Object} options - CLI options
 * @returns {Promise<Object>} - Sync results
 */
async function runPullSync(options) {
  try {
    // Set verbose mode
    const verboseMode = options.verbose || false;
    if (verboseMode) {
      Logger.level = 'debug';
      console.log(chalk.blue('Verbose mode enabled'));
    }
    
    // Resolve file paths
    const configPath = path.resolve(process.cwd(), options.config || DEFAULT_SYNC_CONFIG_PATH);
    const tasksPath = path.resolve(process.cwd(), options.tasks || DEFAULT_TASKS_PATH);
    const statePath = path.resolve(process.cwd(), options.state || DEFAULT_SYNC_STATE_PATH);
    const dryRun = options.dryRun || false;
    const forceOverwrite = options.force || false;
    const skipConflicts = options.skipConflicts || false;
    const specificTaskId = options.task || null;
    const regenerateTaskFiles = options.regenerate !== undefined ? options.regenerate : true;
    const removeOrphaned = options.removeOrphaned !== undefined ? options.removeOrphaned : true;
    const recreateMissingTasks = options.recreateMissingTasks !== undefined ? options.recreateMissingTasks : true;
    
    // Load the config
    const config = loadConfig(configPath);
    
    // Handle group override if provided
    let mondayGroupIds = config.monday_group_ids;
    if (options.group) {
      mondayGroupIds = [options.group];
      console.log(chalk.blue(`Overriding configured groups with: ${options.group}`));
    }
    
    // Ensure API key is in the config object
    const configWithApiKey = {
      ...config,
      // Ensure API key is available in all the formats the client might expect
      monday_api_key: config.monday_api_key || process.env.MONDAY_API_KEY,
      apiToken: config.monday_api_key || process.env.MONDAY_API_KEY
    };
    
    // Create pull sync
    const pullSync = createPullSync(configWithApiKey, {
      tasksFilePath: tasksPath,
      syncFilePath: statePath,
      dryRun: dryRun,
      mondayBoardId: config.monday_board_id,
      mondayGroupIds: mondayGroupIds,
      mondayApiKey: configWithApiKey.monday_api_key || configWithApiKey.apiToken,
      removeOrphaned: removeOrphaned,
      columnMappings: config.column_mappings
    });
    
    // Show start message
    console.log(chalk.bold(`\nStarting pull sync${dryRun ? ' (DRY RUN)' : ''} of Monday.com items to TaskMaster\n`));
    console.log(chalk.dim(`Using config: ${configPath}`));
    console.log(chalk.dim(`Tasks file: ${tasksPath}`));
    console.log(chalk.dim(`Sync state: ${statePath}`));
    console.log(chalk.dim(`Board ID: ${config.monday_board_id}`));
    console.log(chalk.dim(`Group IDs: ${mondayGroupIds.join(', ')}`));
    
    if (forceOverwrite) {
      console.log(chalk.yellow('Force mode enabled: local changes will be overwritten'));
    }
    
    if (skipConflicts) {
      console.log(chalk.yellow('Skip conflicts mode enabled: tasks with local changes will be skipped'));
    }
    
    if (specificTaskId) {
      console.log(chalk.yellow(`Specific task mode: pulling only task ID ${specificTaskId}`));
    }
    
    if (!regenerateTaskFiles) {
      console.log(chalk.yellow('Task files will not be regenerated'));
    }
    
    if (!removeOrphaned) {
      console.log(chalk.yellow('Orphaned local tasks will not be removed'));
    }
    
    if (!recreateMissingTasks) {
      console.log(chalk.yellow('Missing tasks will not be automatically recreated'));
    }
    
    // Create a spinner
    const spinner = ora({
      text: 'Pulling items from Monday.com...',
      color: 'yellow'
    }).start();
    
    // Execute the pull sync
    const results = await pullSync.pullSync({
      dryRun,
      forceOverwrite,
      skipConflicts,
      specificTaskId,
      regenerateTaskFiles,
      removeOrphaned,
      recreateMissingTasks
    });
    
    // Show results
    spinner.succeed('Pull sync completed');
    console.log(formatPullResults(results));
    
    // Run task-master generate after pull if not in dry run mode and regenerateTaskFiles is true
    if (!dryRun && regenerateTaskFiles && !options.skipGenerate) {
      await runTaskMasterGenerate(verboseMode);
    } else if (!dryRun && regenerateTaskFiles && options.skipGenerate) {
      console.log(chalk.yellow('Skipping task-master generate (--skip-generate flag set)'));
    }
    
    return results;
  } catch (error) {
    console.error(chalk.red(`\nError during pull sync: ${error.message}`));
    if (options.verbose && error.stack) {
      console.error(chalk.red(error.stack));
    }
    process.exit(1);
  }
}

// Export functions for testing and for use by the CLI entry point
module.exports = {
  loadConfig,
  formatSyncResults,
  formatPullResults,
  runPushSync,
  runPullSync,
  showConfig,
  runTaskMasterGenerate,
  DEFAULT_TASKS_PATH,
  DEFAULT_SYNC_CONFIG_PATH,
  DEFAULT_SYNC_STATE_PATH
}; 