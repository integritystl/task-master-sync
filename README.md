# Task-Master-Sync

A command-line synchronization tool for TaskMaster AI and Monday.com, designed for DevOps workflows.

## Overview

This CLI tool bridges the gap between AI-driven task management (TaskMaster AI) and collaborative project tracking on Monday.com. It's particularly useful for DevOps workflows, CI/CD pipelines, and automating task synchronization between developers and project managers.

## Features

- Command-line driven synchronization (push/pull)
- **Bidirectional synchronization with automatic item recreation**
- Easy integration with CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins)
- Task-to-Item data mapping between TaskMaster and Monday.com
- Local configuration through sync-config.json
- Detailed synchronization logs
- Support for standard TaskMaster task properties
- Conflict detection and resolution strategies
- Selective synchronization options

## Cursor Integration Setup

For developers using Cursor IDE, an MCP configuration file is required to enable TaskMaster AI integration. Follow these steps:

1. Create a `.cursor` directory in your project root (if it doesn't already exist):

```bash
mkdir -p .cursor
```

2. Create an `mcp.json` file inside the `.cursor` directory with your API keys:

```bash
touch .cursor/mcp.json
```

3. Add the configuration to your `mcp.json` file. You can use the provided example file as a reference:

```bash
# Option 1: Copy the example file
cp .cursor/example-mcp.json .cursor/mcp.json

# Option 2: Create your own based on the template below
```

Basic configuration template:

```json
{
    "mcpServers": {
        "task-master-ai": {
            "command": "npx",
            "args": [
                "-y",
                "--package=task-master-ai",
                "task-master-ai"
            ],
            "env": {
                "ANTHROPIC_API_KEY": "your-anthropic-api-key-here",
                "PERPLEXITY_API_KEY": "your-perplexity-api-key-here",
                "MODEL": "claude-3-7-sonnet-20250219",
                "PERPLEXITY_MODEL": "sonar",
                "MAX_TOKENS": 64000,
                "TEMPERATURE": 0.2,
                "DEFAULT_SUBTASKS": 5,
                "DEFAULT_PRIORITY": "medium"
            }
        }
    }
}
```

4. Replace the placeholder API keys with your actual keys:

### Required API Keys

You need at least one of these API keys depending on which AI provider you prefer:

- `ANTHROPIC_API_KEY`: Required for using Claude models (recommended)
- `PERPLEXITY_API_KEY`: Required for research-backed operations

### Optional API Keys

You can also add these optional API keys for alternative providers:

- `OPENAI_API_KEY`: For using OpenAI models
- `GOOGLE_API_KEY`: For using Google AI models
- `MISTRAL_API_KEY`: For using Mistral AI models
- `OPENROUTER_API_KEY`: For using OpenRouter's model router

### Configuration Options

- `MODEL`: Primary model for task generation (default: "claude-3-7-sonnet-20250219")
- `PERPLEXITY_MODEL`: Model for research operations (default: "sonar")
- `MAX_TOKENS`: Maximum tokens for model responses (default: 64000)
- `TEMPERATURE`: Controls randomness in responses (lower values = more deterministic, default: 0.2)
- `DEFAULT_SUBTASKS`: Default number of subtasks when expanding tasks (default: 5)
- `DEFAULT_PRIORITY`: Default priority for new tasks (default: "medium")

> **Important**: The `mcp.json` file contains sensitive API keys and should not be committed to your repository. It is already added to `.gitignore`.

## Bidirectional Synchronization

TaskMaster-Monday Sync v0.2.0+ features robust bidirectional synchronization with automatic item recreation:

### Push Sync (TaskMaster → Monday)

When pushing tasks from TaskMaster to Monday.com:

- If a Monday.com item has been deleted but still exists in TaskMaster, it will be automatically recreated
- The system tracks recreated items and updates tasks.json with the new Monday item IDs
- Detailed reporting shows both recreated and standard created/updated items

### Pull Sync (Monday → TaskMaster)

When pulling items from Monday.com to TaskMaster:

- If a task has been deleted locally but still exists in Monday.com, it will be automatically recreated
- The `recreateMissingTasks` option (default: true) controls this behavior
- Conflicts between recreated and existing tasks are detected and reported

### Configuration Options

Additional configuration options for bidirectional sync:

```bash
# Push sync with deletion of orphaned Monday items (default)
taskmaster-sync push

# Push sync without deletion of orphaned Monday items
taskmaster-sync push --no-delete-orphaned

# Pull sync with automatic recreation of missing tasks (default)
taskmaster-sync pull

# Pull sync without recreation of missing tasks
taskmaster-sync pull --no-recreate-missing-tasks
```

For more details on the bidirectional sync implementation, see [README-BidirectionalSync.md](README-BidirectionalSync.md).

## Getting Started

### Installation

```bash
# Install globally
npm install -g task-master-sync

# Or use directly with npx
npx task-master-sync ...
```

### Setup

1. **Find your Monday.com column IDs** - Use the included utility to discover your board's column IDs:

```bash
# Option 1: Using environment variables
export MONDAY_API_KEY="your_api_key_here"
export MONDAY_BOARD_ID="your_board_id_here"
npm run get-columns

# Option 2: Using command-line arguments
npm run get-columns -- --api-key="your_api_key_here" --board-id="your_board_id_here"

# Option 3: Using the global command
taskmaster-sync-get-columns --api-key="your_api_key_here" --board-id="your_board_id_here"
```

2. **Create your configuration file** - Copy the example and add your Monday.com details:

```bash
cp sync-config.example.json sync-config.json
```

## Configuration

Create a `sync-config.json` file in your project root:

```json
{
  "monday_board_id": "your_board_id",
  "monday_group_ids": ["your_group_id"],
  "monday_api_key": "your_api_key",
  "developer_id": "your_unique_id",
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
```

Alternatively, you can set your Monday.com API key as an environment variable:

```bash
export MONDAY_API_KEY=your_api_key
```

### Column Mappings

The `column_mappings` object in your configuration maps TaskMaster task fields to Monday.com column IDs. These column IDs are specific to your Monday.com board and can be found in the board settings or using the Monday.com API.

For each field, provide the corresponding Monday.com column ID:

| Field | Description | Monday.com Column Type |
|-------|-------------|------------------------|
| `taskId` | The TaskMaster task ID | Text column |
| `status` | Task status (pending, in-progress, done, etc.) | Status column |
| `priority` | Task priority (high, medium, low) | Status column |
| `dependencies` | Comma-separated list of dependent task IDs | Text column |
| `complexity` | Task complexity (1-10) | Status column |
| `description` | Task description | Long text column |
| `details` | Implementation details | Long text column |
| `testStrategy` | Testing strategy | Long text column |

### Finding Your Column IDs

To help you find the column IDs for your Monday.com board, we've included a utility command:

```bash
# If installed globally
taskmaster-sync-get-columns

# If installed locally in your project
npx taskmaster-sync-get-columns

# Or using npm script
npm run get-columns
```

This command will:
1. Connect to your Monday.com board using your configured API key
2. Fetch all column definitions
3. Display their IDs, titles, and types
4. Provide a template for your column_mappings configuration

Make sure you have a valid `sync-config.json` with your `monday_board_id` and `monday_api_key` before running this command.

## CLI Commands

### Basic Usage

```bash
# If installed globally
taskmaster-sync --help

# If installed locally in your project
npx taskmaster-sync --help

# View command-specific help
taskmaster-sync push --help
taskmaster-sync pull --help

# Display current configuration
taskmaster-sync config
```

### Push Command

Push your local TaskMaster tasks to Monday.com.

```bash
taskmaster-sync push [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dry-run` | Show what would be synced without making changes | `false` |
| `-v, --verbose` | Increase logging detail | `false` |
| `-c, --config <path>` | Path to sync config file | `sync-config.json` |
| `-t, --tasks <path>` | Path to tasks.json file | `tasks/tasks.json` |
| `-s, --state <path>` | Path to sync state file | `.taskmaster_sync_state.json` |

#### Examples

```bash
# Basic push with default options
taskmaster-sync push

# Dry run to preview changes
taskmaster-sync push --dry-run

# Use a custom tasks file
taskmaster-sync push --tasks custom-tasks/tasks.json

# Enable verbose logging
taskmaster-sync push --verbose
```

### Pull Command

Pull Monday.com items to your local TaskMaster tasks.

```bash
taskmaster-sync pull [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dry-run` | Show what would be synced without making changes | `false` |
| `-v, --verbose` | Increase logging detail | `false` |
| `-c, --config <path>` | Path to sync config file | `sync-config.json` |
| `-t, --tasks <path>` | Path to tasks.json file | `tasks/tasks.json` |
| `-s, --state <path>` | Path to sync state file | `.taskmaster_sync_state.json` |
| `-a, --assign-task-ids` | Automatically assign Task IDs to new Monday.com items | `false` |
| `-f, --force` | Overwrite local changes with Monday.com data | `false` |
| `--skip-conflicts` | Skip tasks with local changes | `false` |
| `--task-id <id>` | Pull only a specific task by ID | |
| `--group <group_id>` | Pull from a specific Monday.com group | |
| `--regenerate` | Regenerate task files after pull | `true` |
| `--remove-orphaned` | Remove orphaned local tasks | `true` |
| `--no-remove-orphaned` | Keep orphaned local tasks | |
| `--recreate-missing-tasks` | Recreate tasks that exist in Monday but not locally | `true` |
| `--no-recreate-missing-tasks` | Don't recreate missing tasks | |

## License

MIT 

## Development & Publishing

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/task-master-sync.git
cd task-master-sync

# Install dependencies
npm install

# Run tests
npm test

# Try the CLI locally
node src/cli/index.js --help
```

### Building for Publication

The package doesn't require a build step as it uses plain JavaScript. However, before publishing:

1. Update the version in `package.json`
2. Ensure all tests are passing
3. Check that the `files` field in `package.json` includes all necessary files
4. Verify the README is up-to-date

### Publishing to npm
For Integrity Internal use - check the password manager for the npm username/password and publish token.

```bash
# Login to npm (only needed once)
npm login

# Test the package contents that would be published
npm pack

# Review the generated .tgz file to ensure it contains the correct files
tar -tf task-master-sync-*.tgz

# Run the prepublish checks (linting and tests)
npm run prepublishOnly

# Publish to npm
npm publish

# For testing with a specific version before publishing publicly
npm publish --tag beta
```

### CI/CD Publishing (GitHub Actions)

You can automate publishing using GitHub Actions by adding a workflow file:

```yaml
# .github/workflows/publish.yml
name: Publish to npm

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20.x'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm test
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Remember to add an NPM_TOKEN secret in your GitHub repository settings.

### Using the Package Locally During Development

```bash
# Create a global symlink
npm link

# In another project, use the linked package
npm link task-master-sync

# Run the commands from your development version
taskmaster-sync --help
``` 