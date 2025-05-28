# TaskMaster-Monday Bidirectional Sync Implementation

This document outlines the implementation of bidirectional synchronization between TaskMaster AI and Monday.com, focusing on the automatic recreation of items deleted in either system.

## Key Features

1. **Push Sync (TaskMaster → Monday)**
   - Automatically recreates Monday.com items that were deleted but still exist in TaskMaster
   - Updates tasks.json with new Monday item IDs when items are recreated
   - Provides clear reporting of recreated items

2. **Pull Sync (Monday → TaskMaster)**
   - Automatically recreates local tasks that exist in Monday.com but were deleted locally
   - Supports a configuration option to control automatic recreation behavior
   - Properly handles potential conflicts during recreation

## Implementation Details

### Push Sync Enhancements

1. **Item Existence Check**
   - Enhanced the `syncTask` function to check if a Monday item exists before updating it
   - Added logic to handle the case when a Monday item referenced by a task no longer exists
   - Implemented error handling to detect "not found" errors and trigger recreation

2. **Recreation Logic**
   - Modified the sync process to recreate Monday items when the corresponding item ID is no longer valid
   - Added a new result category `recreated` to track items that were recreated
   - Preserved the relationship between tasks and Monday items by updating the task's Monday item ID

3. **Results Tracking**
   - Added a `recreated` array to the results object to track recreated items
   - Enhanced the formatted output to show recreated items with their old and new Monday IDs
   - Updated summary counts to include recreated items

### Pull Sync Enhancements

1. **Missing Task Detection**
   - Enhanced the `compareItemsWithTasks` function to identify tasks that exist in Monday.com but not locally
   - Added a `recreateMissingTasks` option (defaulting to true) to control automatic recreation behavior
   - Implemented special handling for cases where a Monday item maps to a different task ID

2. **Recreation Tracking**
   - Added a `recreatedItems` array to store information about recreated tasks
   - Updated the sync results to include a `recreated` count and detailed information
   - Enhanced the formatted output to show recreated tasks

3. **Conflict Resolution**
   - Added special handling for cases where a Monday item has a task ID that conflicts with existing tasks
   - Implemented logic to detect and report these conflicts for manual resolution
   - Preserved data integrity by avoiding overwrites of existing tasks

### Robustness Improvements

1. **Error Handling**
   - Made `handleOrphanedTasks` more robust to handle undefined or invalid task objects
   - Improved error handling in `findOrphanedLocalTasks` to manage sync state entries gracefully
   - Added more detailed error logging to help diagnose synchronization issues

2. **Sync State Management**
   - Enhanced the sync state management to properly track recreated items
   - Added cleanup of outdated sync state entries when items are recreated
   - Improved the handling of orphaned items in both directions

3. **CLI Improvements**
   - Updated the CLI interface to support the new recreation functionality
   - Added support for `--recreate-missing-tasks` and `--no-recreate-missing-tasks` flags
   - Enhanced result formatting to clearly show recreated items

## Testing

The implementation includes test scripts to verify the bidirectional synchronization:

1. **General Sync Test** (`scripts/test-sync.js`)
   - Tests basic push and pull synchronization
   - Verifies that changes are properly synchronized in both directions

2. **Recreation Test** (`scripts/test-recreation.js`)
   - Specifically tests the recreation functionality
   - Simulates deletion in both systems and verifies automatic recreation

## Configuration

The bidirectional sync functionality can be configured through the following options:

1. **Push Sync**
   - `deleteOrphaned`: Controls whether orphaned Monday items should be deleted (default: true)

2. **Pull Sync**
   - `recreateMissingTasks`: Controls whether missing tasks should be automatically recreated (default: true)
   - `removeOrphaned`: Controls whether orphaned local tasks should be removed (default: true)

## Usage Examples

### Push Sync with Recreation

```javascript
const { createPushSync } = require('task-master-sync');

const pushSync = createPushSync(config);
const results = await pushSync.pushSync('tasks/tasks.json', {
  deleteOrphaned: true
});

console.log(`Created: ${results.created.length}`);
console.log(`Updated: ${results.updated.length}`);
console.log(`Recreated: ${results.recreated.length}`);
```

### Pull Sync with Recreation

```javascript
const { createPullSync } = require('task-master-sync');

const pullSync = createPullSync(config);
const results = await pullSync.pullSync({
  recreateMissingTasks: true,
  removeOrphaned: true
});

console.log(`New: ${results.newTasks}`);
console.log(`Updated: ${results.updatedTasks}`);
console.log(`Recreated: ${results.recreated}`);
```

### CLI Usage

```bash
# Push sync with recreation
npx taskmaster-monday push

# Pull sync with recreation disabled
npx taskmaster-monday pull --no-recreate-missing-tasks
```

## Bug Fixes and Improvements

### File Path Handling

- Fixed an issue where the system would sometimes create a `tasks.json` file in the project root instead of using the correct path at `./tasks/tasks.json`.
- Updated the `DEFAULT_TASKS_PATH` constant in `taskMasterIO.js` to use `'tasks/tasks.json'` instead of just `'tasks.json'`.
- Modified test scripts to correctly respect the proper tasks file path.
- Ensured the `pushSync` function properly accepts options via an object parameter, including the correct tasks path.

### Sync State Management

- Fixed `findOrphanedLocalTasks` function to use `stateManager.readSyncState()` instead of the non-existent `getSyncState()` method.
- Improved error handling for sync state operations to gracefully handle undefined or invalid state entries.

## Task Master Generate Integration

To ensure task files are always up-to-date, we've implemented automatic execution of the `task-master generate` command:

### Push Sync Integration

- When running `push` sync, the system automatically runs `task-master generate` before sending updates to Monday.com
- This ensures all task markdown files are generated from the latest tasks.json data
- The integration can be disabled with the `--skip-generate` flag: `taskmaster-sync push --skip-generate`
- If the generate command fails, the sync operation continues with a warning

### Pull Sync Integration

- When running `pull` sync, the system automatically runs `task-master generate` after updating tasks.json
- This ensures all changes pulled from Monday.com are immediately reflected in markdown task files
- Can be disabled with the `--skip-generate` flag: `taskmaster-sync pull --skip-generate`
- Only runs when not in dry-run mode and when regeneration is enabled (`--regenerate` flag, which is true by default)

### Error Handling

- If the `task-master` command is not available, the sync operation continues with a warning
- All output from the generate command is captured and displayed in verbose mode
- Command execution is designed to be non-blocking for the main sync operation

## Conclusion

The bidirectional synchronization implementation ensures that tasks remain synchronized between TaskMaster AI and Monday.com even when items are deleted in either system. This significantly improves the robustness and reliability of the integration, reducing the need for manual intervention. 