#!/bin/bash
##############################################################
# Basic CLI usage example for task-master-sync
# 
# This script demonstrates common task-master-sync
# commands and workflows for DevOps and CI/CD scenarios.
##############################################################

# Set output colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print a section header
section() {
  echo -e "\n${BLUE}============================================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}============================================================${NC}\n"
}

# Print a command before executing it
run_cmd() {
  echo -e "${YELLOW}$ $1${NC}"
  eval "$1"
  echo ""
}

# Check if taskmaster-sync is installed
if ! command -v taskmaster-sync &> /dev/null && ! command -v npx &> /dev/null; then
  echo -e "${RED}Error: taskmaster-sync is not installed and npx is not available.${NC}"
  echo -e "Please install the package with: npm install -g task-master-sync"
  exit 1
fi

# Determine how to run taskmaster-sync
if command -v taskmaster-sync &> /dev/null; then
  CMD="taskmaster-sync"
else
  CMD="npx taskmaster-sync"
fi

section "SETUP: Verifying configuration"

# Check if config exists
if [ ! -f "sync-config.json" ]; then
  echo -e "${YELLOW}Creating a sample sync-config.json (you'll need to edit it)${NC}"
  cat > sync-config.json << EOL
{
  "monday_board_id": "your_board_id",
  "monday_group_ids": ["your_group_id"],
  "monday_api_key": "your_monday_api_key",
  "developer_id": "example",
  "column_mappings": {
    "taskId": "text_column_id",
    "status": "status_column_id",
    "priority": "priority_column_id",
    "dependencies": "text_column_id",
    "complexity": "color_column_id",
    "description": "long_text_column_id",
    "details": "long_text_column_id",
    "testStrategy": "long_text_column_id"
  },
  "status_mappings": {
    "pending": "pending",
    "in-progress": "in-progress",
    "done": "done"
  },
  "priority_mappings": {
    "high": "high",
    "medium": "medium",
    "low": "low"
  }
}
EOL
  echo -e "${YELLOW}Sample config created. Edit sync-config.json with your actual Monday.com details.${NC}"
  echo -e "${YELLOW}Then run this script again.${NC}"
  exit 1
fi

# Show config help
run_cmd "$CMD config"

section "WORKFLOW 1: Initial push to Monday.com"

echo -e "${GREEN}Scenario: You've just set up Monday.com and want to push your TaskMaster tasks${NC}"
echo -e "${GREEN}First, let's do a dry run to see what would be synced without making changes${NC}"
run_cmd "$CMD push --dry-run"

echo -e "${GREEN}If the dry run looks good, you would run the actual push command:${NC}"
echo -e "${YELLOW}$ $CMD push${NC}"
echo -e "${GREEN}(Command commented out to prevent actual sync)${NC}"

section "WORKFLOW 2: Daily task update"

echo -e "${GREEN}Scenario: Daily workflow to sync your TaskMaster tasks with the team${NC}"
echo -e "${GREEN}First, check for any changes from your team on Monday.com:${NC}"
run_cmd "$CMD pull --dry-run"

echo -e "${GREEN}Pull changes but skip any tasks you've modified locally:${NC}"
echo -e "${YELLOW}$ $CMD pull --skip-conflicts${NC}"
echo -e "${GREEN}(Command commented out to prevent actual sync)${NC}"

echo -e "${GREEN}At the end of the day, push your updates back to Monday.com:${NC}"
echo -e "${YELLOW}$ $CMD push${NC}"
echo -e "${GREEN}(Command commented out to prevent actual sync)${NC}"

section "WORKFLOW 3: Selective synchronization"

echo -e "${GREEN}Scenario: You want to work with specific tasks or groups${NC}"
echo -e "${GREEN}Pull only a specific task by ID:${NC}"
echo -e "${YELLOW}$ $CMD pull --task-id 42${NC}"
echo -e "${GREEN}(Command commented out to prevent actual sync)${NC}"

echo -e "${GREEN}Pull tasks from a specific Monday.com group:${NC}"
echo -e "${YELLOW}$ $CMD pull --group \"sprint_backlog\"${NC}"
echo -e "${GREEN}(Command commented out to prevent actual sync)${NC}"

section "WORKFLOW 4: Conflict resolution"

echo -e "${GREEN}Scenario: Handling conflicts between local and Monday.com changes${NC}"
echo -e "${GREEN}1. Review conflicts first:${NC}"
echo -e "${YELLOW}$ $CMD pull --dry-run${NC}"

echo -e "${GREEN}2. Option 1: Keep your local changes:${NC}"
echo -e "${YELLOW}$ $CMD pull --skip-conflicts${NC}"

echo -e "${GREEN}3. Option 2: Use Monday.com's version:${NC}"
echo -e "${YELLOW}$ $CMD pull --force${NC}"

echo -e "${GREEN}4. Option 3: Selectively update specific tasks:${NC}"
echo -e "${YELLOW}$ $CMD pull --task-id 42 --force${NC}"
echo -e "${GREEN}(Commands commented out to prevent actual sync)${NC}"

section "WORKFLOW 5: CI/CD Integration"

echo -e "${GREEN}Scenario: CI/CD pipeline integration${NC}"
echo -e "${GREEN}Here's a sample code block for your CI pipeline:${NC}"
echo -e "${YELLOW}
# Install task-master-sync
npm install -g task-master-sync

# Create config file from environment variables
cat > sync-config.json << EOF
{
  \"monday_board_id\": \"\${MONDAY_BOARD_ID}\",
  \"monday_group_ids\": [\"\${MONDAY_GROUP_ID}\"],
  \"monday_api_key\": \"\${MONDAY_API_KEY}\",
  \"developer_id\": \"ci-pipeline\"
}
EOF

# Pull the latest tasks from Monday.com
taskmaster-sync pull --force

# Push any local changes back to Monday.com
taskmaster-sync push
${NC}"

section "WORKFLOW 6: Getting column IDs"

echo -e "${GREEN}Scenario: Finding your Monday.com column IDs${NC}"
echo -e "${GREEN}Use environment variables to authenticate:${NC}"
echo -e "${YELLOW}$ export MONDAY_API_KEY=\"your_api_key_here\"${NC}"
echo -e "${YELLOW}$ export MONDAY_BOARD_ID=\"your_board_id_here\"${NC}"
echo -e "${YELLOW}$ npx taskmaster-sync-get-columns${NC}"
echo -e "${GREEN}(Command commented out as it requires valid Monday.com credentials)${NC}"

echo -e "${GREEN}Or pass credentials as command-line arguments:${NC}"
echo -e "${YELLOW}$ npx taskmaster-sync-get-columns --api-key=\"your_api_key_here\" --board-id=\"your_board_id_here\"${NC}"
echo -e "${GREEN}(Command commented out as it requires valid Monday.com credentials)${NC}"

section "HELP & DOCUMENTATION"

echo -e "${GREEN}For more information on available commands and options:${NC}"
run_cmd "$CMD --help"

echo -e "${GREEN}For push command details:${NC}"
run_cmd "$CMD push --help"

echo -e "${GREEN}For pull command details:${NC}"
run_cmd "$CMD pull --help"

echo -e "\n${BLUE}=========================================================${NC}"
echo -e "${BLUE}This is a demonstration script. Most commands are commented${NC}"
echo -e "${BLUE}out to prevent actual synchronization. Remove the comments${NC}"
echo -e "${BLUE}to execute the actual commands in your workflow.${NC}"
echo -e "${BLUE}=========================================================${NC}" 