/**
 * Task ID Resolver Module
 * 
 * Handles resolving task IDs from Monday.com items and maintains the mapping between
 * Monday.com item IDs and TaskMaster task IDs.
 */

/**
 * Resolves a TaskMaster task ID from a Monday.com item
 * @param {Object} item - The Monday.com item
 * @param {Object} columnMapping - Column mapping configuration
 * @returns {string|null} - The resolved task ID or null if not found
 */
function resolveTaskIdFromMondayItem(item, columnMapping) {
  if (!item || !item.column_values || !columnMapping || !columnMapping.taskId) {
    return null;
  }
  
  // Find the task ID column
  const taskIdColumn = item.column_values.find(col => col.id === columnMapping.taskId);
  
  // Return the text value if found
  if (taskIdColumn && taskIdColumn.text) {
    return taskIdColumn.text.trim();
  }
  
  return null;
}

module.exports = {
  resolveTaskIdFromMondayItem
}; 