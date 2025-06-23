# Latitude CLI

A command-line interface for managing Latitude prompts and projects. The Latitude CLI allows you to synchronize prompts between your local development environment and the Latitude platform, manage project versions, and streamline your prompt engineering workflow.

## Installation

Install the Latitude CLI globally using npm:

```bash
npm install -g @latitude-data/cli
```

Or use it directly with npx:

```bash
npx @latitude-data/cli <command>
```

## Quick Start

1. **Initialize a new project**:

   ```bash
   latitude init
   ```

2. **Pull prompts from your Latitude project**:

   ```bash
   latitude pull
   ```

3. **Check project status**:

   ```bash
   latitude status
   ```

4. **Push local changes**:
   ```bash
   latitude push
   ```

## Commands

### `latitude init`

Initialize a new Latitude project in your current directory or link to an existing Latitude project.

**Usage:**

```bash
latitude init [options]
```

**Options:**

- `-p, --path <path>` - Path to initialize the project in (default: current directory)

**Examples:**

Initialize in current directory:

```bash
latitude init
```

Initialize in a specific directory:

```bash
latitude init --path ./my-prompts
```

**What it does:**

- Prompts for your Latitude API key (stored securely)
- Allows you to create a new project or connect to an existing one
- Sets up the project structure and prompts directory
- Creates a `latitude-lock.json` file to track project configuration
- Pulls existing prompts if connecting to an existing project

---

### `latitude pull`

Pull all prompts from your Latitude project to your local filesystem.

**Usage:**

```bash
latitude pull [options]
```

**Options:**

- `-p, --path <path>` - Path to the project (default: current directory)
- `-y, --yes` - Skip confirmation and pull automatically

**Examples:**

Pull prompts to current directory:

```bash
latitude pull
```

Pull prompts for a project in a specific directory:

```bash
latitude pull --path ./my-project
```

Pull prompts without confirmation (useful for CI/CD):

```bash
latitude pull --yes
```

**What it does:**

- Fetches all prompts from the remote Latitude project
- Shows a diff of changes between remote and local prompts
- Asks for confirmation before overwriting local files
- Saves prompts in the configured format (JavaScript, TypeScript, or .promptl files)
- Updates local files to match the remote version

---

### `latitude push`

Push local prompt changes to your Latitude project after showing a diff.

**Usage:**

```bash
latitude push [options]
```

**Options:**

- `-p, --path <path>` - Path to the project (default: current directory)
- `-y, --yes` - Skip confirmation and push automatically

**Examples:**

Push changes from current directory:

```bash
latitude push
```

Push changes from a specific project directory:

```bash
latitude push --path ./my-project
```

Push changes without confirmation (useful for CI/CD):

```bash
latitude push --yes
```

**What it does:**

- Reads all local prompt files
- Compares them with the remote version
- Shows a detailed diff of changes (additions, modifications, deletions)
- Asks for confirmation before pushing changes
- Uploads changes to your Latitude project

---

### `latitude checkout`

Checkout a specific version of prompts from your Latitude project.

**Usage:**

```bash
latitude checkout [versionUuid] [options]
```

**Options:**

- `-p, --path <path>` - Path to the project (default: current directory)
- `-b, --branch <name>` - Create a new version with the specified name and checkout to it

**Examples:**

Checkout a specific version:

```bash
latitude checkout abc123-def456-ghi789
```

Create and checkout a new version:

```bash
latitude checkout -b "new-feature-prompts"
```

Checkout in a specific directory:

```bash
latitude checkout abc123-def456-ghi789 --path ./my-project
```

**What it does:**

- Switches your local prompts to a specific version
- Updates the `latitude-lock.json` file with the new version
- Downloads and saves all prompts from the specified version
- Can create new versions when using the `-b` flag

---

### `latitude status`

Display the current status of your Latitude project, including version information and local changes.

**Usage:**

```bash
latitude status [options]
```

**Options:**

- `-p, --path <path>` - Path to the project (default: current directory)

**Examples:**

Check status of current directory:

```bash
latitude status
```

Check status of a specific project:

```bash
latitude status --path ./my-project
```

**What it does:**

- Shows current project ID and version information
- Displays the version name and description
- Compares local prompts with remote version
- Shows a summary of any local changes (modified, added, or deleted prompts)
- Provides a link to view the project in the Latitude web interface

---

### `latitude help`

Display help information for the CLI.

**Usage:**

```bash
latitude help
```

**Example:**

```bash
latitude help
```

## Project Structure

After initialization, your project will have the following structure:

```
your-project/
├── latitude-lock.json          # Project configuration and version tracking
└── prompts/                    # Directory containing your prompts
    ├── welcome.js              # Example prompt file
    ├── analysis/
    │   └── data-summary.js     # Nested prompt organization
    └── ...
```

### Configuration File (`latitude-lock.json`)

The `latitude-lock.json` file contains your project configuration:

```json
{
  "projectId": 123,
  "rootFolder": "prompts",
  "version": "abc123-def456-ghi789",
  "npm": true
}
```

- `projectId`: Your Latitude project ID
- `rootFolder`: Directory where prompts are stored
- `version`: Current version UUID you're working with
- `npm`: Whether this is an npm project (affects file format)

## Prompt File Formats

The CLI supports multiple prompt file formats:

### JavaScript/TypeScript Files

```javascript
// prompts/welcome.js
export const welcome = `Hello {{name}}, welcome to our service!

How can I help you today?`
```

### .promptl Files

```
<!-- prompts/welcome.promptl -->
Hello {{name}}, welcome to our service!

How can I help you today?
```

## Authentication

The CLI supports two methods for providing your Latitude API key:

### Method 1: Interactive Setup (Recommended)

The CLI securely stores your API key using your system's keychain. You'll be prompted for your API key during the first `latitude init` command.

### Method 2: Environment Variable

Set the `LATITUDE_API_KEY` environment variable:

```bash
export LATITUDE_API_KEY=your_api_key_here
latitude init
```

Or use it inline:

```bash
LATITUDE_API_KEY=your_api_key_here latitude pull
```

### Getting Your API Key

To get your API key:

1. Visit [Latitude Dashboard](https://app.latitude.so)
2. Go to your project settings
3. Generate or copy your API key

## Common Workflows

### Starting a New Project

```bash
# Initialize the project
latitude init

# Make changes to your prompts locally
# ... edit files in prompts/ directory ...

# Push changes to Latitude
latitude push
```

### Working with an Existing Project

```bash
# Initialize and connect to existing project
latitude init

# Pull latest changes
latitude pull

# Check current status
latitude status

# Make local changes and push
latitude push
```

### Version Management

```bash
# Create a new version for experimentation
latitude checkout -b "experiment-v2"

# Make changes and push
latitude push

# Switch back to main version
latitude checkout main-version-uuid

# Check what version you're on
latitude status
```

### Automated Workflows (CI/CD)

```bash
# Pull latest changes without confirmation
latitude pull --yes

# Push changes without confirmation
latitude push --yes

# Combine with environment variable for API key
LATITUDE_API_KEY=your_key latitude pull --yes
```

## Troubleshooting

### Common Issues

**"No latitude-lock.json found"**

- Run `latitude init` to initialize your project

**"API key not found"**

- Run `latitude init` to set up your API key

**"Failed to import prompt from file"**

- Ensure your JavaScript/TypeScript files export prompts correctly
- Check that file syntax is valid

**"Version UUID not found"**

- Verify the version UUID exists in your Latitude project
- Use `latitude status` to see your current version

### Getting Help

- Use `latitude help` to see all available commands
- Check the [Latitude Documentation](https://docs.latitude.so) for more information
- Report issues on [GitHub](https://github.com/latitude-dev/latitude-llm/issues)

## Development

This CLI is built with:

- **Commander.js** for command-line interface
- **Inquirer.js** for interactive prompts
- **Chalk** for colored terminal output
- **TypeScript** for type safety

### Architecture

The CLI follows a modular architecture with:

- **BaseCommand**: Abstract base class for all commands
- **CommandRegistrar**: Standardized command registration
- **PromptOperations**: Common prompt management utilities
- **EnvironmentValidator**: Project validation logic
- **Type Definitions**: Shared interfaces and types
