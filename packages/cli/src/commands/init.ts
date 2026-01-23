import { Command } from 'commander'
import inquirer from 'inquirer'
import * as fs from 'fs/promises'
import * as path from 'path'
import { InitOptions } from '../types'
import { BaseCommand } from '../utils/baseCommand'
import { savePrompts } from '../utils/promptOperations'
import { LatitudeLockFile } from '../utils/lockFileManager'
import { registerCommand } from '../utils/commandRegistrar'

/**
 * Handles the initialization of a new Latitude project
 */
export class InitCommand extends BaseCommand {
  /**
   * Execute the init command
   */
  async execute(options: InitOptions): Promise<void> {
    try {
      console.log(`Initializing Latitude project in ${this.projectPath}...`)

      this.setProjectPath(options)

      await this.getOrPromptForApiKey()
      await this.setClient()

      // Check if a latitude-lock.json file already exists
      const lockFileExists = await this.lockFileManager.exists(this.projectPath)
      if (lockFileExists) {
        const { overrideLock } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overrideLock',
            message:
              'A latitude-lock.json file already exists. Do you want to override it?',
            default: false,
          },
        ])

        if (!overrideLock) {
          console.log(
            'Init cancelled. Existing latitude-lock.json file will not be modified.',
          )
          process.exit(0)
        }
      }

      // Handle project selection
      const projectId = await this.handleProjectSelection()

      console.log('✅ Latitude project initialized successfully!')
      console.log(`API key and project ID (${projectId}) have been saved.`)
    } catch (error: any) {
      this.handleError(error, 'Initialization')
    }
  }

  /**
   * Get existing API key or prompt for a new one
   */
  private async getOrPromptForApiKey(): Promise<string> {
    // Check if an API key already exists
    try {
      return await this.configManager.getApiKey()
    } catch (error) {
      // No API key found, prompt for one
      const { apiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Enter your Latitude API key:',
          validate: (input) =>
            input.trim() !== '' ? true : 'API key is required',
        },
      ])

      await this.configManager.setApiKey(apiKey)
      return apiKey
    }
  }

  /**
   * Handle project selection (new or existing)
   */
  private async handleProjectSelection(): Promise<number> {
    const { projectChoice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'projectChoice',
        message: 'Do you want to use an existing project or create a new one?',
        choices: [
          { name: 'Create a new project', value: 'new' },
          { name: 'Use an existing project', value: 'existing' },
        ],
      },
    ])

    if (projectChoice === 'new') {
      return await this.createNewProject()
    } else {
      return await this.useExistingProject()
    }
  }

  /**
   * Create a new project
   */
  private async createNewProject(): Promise<number> {
    // Ask for project name
    const { projectName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Enter name for your new Latitude project:',
        validate: (input) =>
          input.trim() !== '' ? true : 'Project name is required',
      },
    ])

    // Create the project
    console.log(`Creating new Latitude project "${projectName}"...`)
    const { projectId, versionUuid } = await this.projectManager.createProject(
      this.client!,
      projectName,
    )
    console.log(`✅ Created new project with ID: ${projectId}`)

    // Set up the project structure
    const promptsRoot = await this.setupProjectStructure()

    // Create lock file
    await this.createLockFile(projectId, promptsRoot, versionUuid)

    return projectId
  }

  /**
   * Use an existing project
   */
  private async useExistingProject(): Promise<number> {
    // Ask for existing project ID
    const { existingProjectId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'existingProjectId',
        message: 'Enter your existing Latitude project ID:',
        validate: (input) =>
          input.trim() !== '' ? true : 'Project ID is required',
      },
    ])

    const projectId = Number(existingProjectId)
    const version = await this.client!.versions.get(projectId, 'live')

    // Set up the project structure
    const promptsRoot = await this.setupProjectStructure()

    // Pull existing prompts
    await this.pullPrompts(projectId, promptsRoot)

    // Create lock file
    await this.createLockFile(projectId, promptsRoot, version.uuid)

    return projectId
  }

  /**
   * Set up the project structure by determining and creating prompts directory
   * @returns The path to the prompts root folder
   */
  private async setupProjectStructure(): Promise<string> {
    // Determine the root folder for storing prompts
    const defaultPath = await this.promptManager.determineRootFolder(
      this.projectPath,
    )

    let promptsRoot = defaultPath
    let isEmptyDirectory = false

    // Keep asking until we get an empty directory or user confirms to proceed
    while (!isEmptyDirectory) {
      const { userPromptsRoot } = await inquirer.prompt([
        {
          type: 'input',
          name: 'userPromptsRoot',
          message: 'Enter the relative path for storing prompts:',
          default: promptsRoot,
          validate: (input) =>
            input.trim() !== '' ? true : 'Path is required',
        },
      ])

      promptsRoot = userPromptsRoot

      // Check if directory exists and is empty
      try {
        const fullPath = path.join(this.projectPath, promptsRoot)
        try {
          // Check if directory exists
          await fs.access(fullPath)

          // Directory exists, check if it's empty
          const files = await fs.readdir(fullPath)
          if (files.length > 0) {
            // Directory is not empty, ask for confirmation
            const { confirmNonEmpty } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirmNonEmpty',
                message: `The directory '${promptsRoot}' is not empty. Its contents will be removed. Continue?`,
                default: false,
              },
            ])

            if (confirmNonEmpty) {
              isEmptyDirectory = true // User confirmed to use non-empty directory
            }
            // If not confirmed, the loop will continue and ask again
          } else {
            isEmptyDirectory = true // Directory exists and is empty
          }
        } catch (err) {
          // Directory doesn't exist yet, which is fine
          isEmptyDirectory = true
        }
      } catch (err) {
        // Error checking directory, let's just proceed (directory will be created)
        isEmptyDirectory = true
      }
    }

    // Create the directory
    await this.promptManager.createPromptDirectory(
      this.projectPath,
      promptsRoot,
    )

    return promptsRoot
  }

  /**
   * Pull all prompts from an existing project
   * @param projectId The project ID to pull prompts from
   * @param promptsRootFolder The folder to save prompts to
   */
  private async pullPrompts(
    projectId: number,
    promptsRootFolder: string,
  ): Promise<void> {
    try {
      console.log(`Pulling all prompts from project ${projectId}...`)
      const prompts = await this.projectManager.fetchAllPrompts(
        this.client!,
        projectId,
      )

      await savePrompts(
        prompts,
        promptsRootFolder,
        this.projectPath,
        this.promptManager,
      )

      console.log(`✅ Successfully pulled ${prompts.length} prompts`)
    } catch (error: any) {
      console.error(
        `❌ Error pulling prompts: ${error.message || String(error)}`,
      )
      // Continue with the initialization even if pulling prompts fails
    }
  }

  /**
   * Create the latitude-lock.json file
   * @param projectId The project ID to include in the lock file
   * @param promptsRootFolder The root folder for prompts
   */
  private async createLockFile(
    projectId: number,
    promptsRootFolder: string,
    versionUuid: string = 'live',
  ): Promise<void> {
    try {
      // Create the lock file
      const lockFile: LatitudeLockFile = {
        projectId,
        rootFolder: promptsRootFolder,
        version: versionUuid,
      }

      await this.lockFileManager.write(this.projectPath, lockFile)
      console.log('✅ Created latitude-lock.json file')
    } catch (error: any) {
      throw new Error(
        `Error creating lock file: ${error.message || String(error)}`,
      )
    }
  }
}

/**
 * Initialize a new Latitude project
 */
export function init(program: Command): void {
  registerCommand(
    program,
    'init',
    'Initialize a new Latitude project in an existing npm project',
    InitCommand,
    {
      options: [
        {
          flags: '-p, --path <path>',
          description: 'Path to initialize the project in',
          defaultValue: '.',
        },
        {
          flags: '--dev',
          description: 'Use localhost development environment',
        },
      ],
      action: async (command, options) => {
        await command.execute(options)
      },
    },
  )
}
