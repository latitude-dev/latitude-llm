# Latitude CLI

Command-line interface for managing Latitude prompts and projects.

## Abstractions and Design Patterns

The CLI codebase uses several design patterns and abstractions to promote code reuse and maintainability:

1. **BaseCommand** - Abstract base class for all command implementations that provides:

   - Common properties and utilities
   - Standardized error handling
   - Shared setup/initialization logic
   - Access to utility classes

2. **CommandRegistrar** - Helper class to standardize command registration with Commander

   - Consistent command setup and options
   - Type-safe command execution
   - Simplified API for adding new commands

3. **PromptOperations** - Common utility for working with prompts

   - Centralized prompt management operations
   - Abstracts away file system operations for prompts
   - Ensures consistent handling across commands

4. **EnvironmentValidator** - Validation logic for CLI environment

   - Project structure validation
   - Lock file validation
   - Consistent error messages

5. **Type Definitions** - Shared interfaces for command options
   - Type-safe command options
   - Inheritance for common options
   - Clear contracts between modules

## Usage

```bash
# Initialize a new project
latitude init

# Pull prompts from server
latitude pull

# Check status of a project
latitude status

# Checkout a specific version
latitude checkout <versionUuid>

# Show help
latitude help
```

## Development

When adding new commands, extend the base abstractions to ensure consistency:

1. Create a new command class that extends `BaseCommand`
2. Add appropriate type definitions in `types.ts`
3. Use the `CommandRegistrar` to register the command
4. Reuse common utilities from `PromptOperations` and other helpers
