import { Command } from 'commander'
import { PullOptions } from '../types'
import { BaseCommand } from '../utils/baseCommand'
import { savePrompts } from '../utils/promptOperations'
import { registerCommand } from '../utils/commandRegistrar'

/**
 * Handles pulling prompts from a Latitude project to the local filesystem
 */
export class PullCommand extends BaseCommand {
  /**
   * Execute the pull command
   */
  async execute(options: PullOptions): Promise<void> {
    try {
      this.setProjectPath(options)
      console.log(`Pulling prompts to ${this.projectPath}...`)

      // Validate environment
      await this.validateEnvironment()

      // Initialize the client
      await this.initClient()

      // Get project ID from lock file
      const lockFile = await this.getLockFile()

      // Determine if the project uses ESM or CJS
      await this.detectModuleFormat()

      // Pull all prompts from the project
      await this.pullPrompts(
        lockFile.projectId,
        lockFile.rootFolder,
        lockFile.version,
      )

      console.log('✅ Successfully pulled all prompts from the project!')
    } catch (error: any) {
      this.handleError(error, 'Pull')
    }
  }

  /**
   * Pull all prompts from a project
   */
  private async pullPrompts(
    projectId: number,
    promptsRootFolder: string,
    version = 'live',
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Latitude client not initialized')
    }

    try {
      console.log(
        `Pulling all prompts from project ${projectId} (version: ${version})...`,
      )
      const prompts = await this.projectManager.fetchAllPrompts(
        this.client,
        projectId,
        version,
      )

      // Use the common utility for saving prompts
      await savePrompts(
        prompts,
        promptsRootFolder,
        this.projectPath,
        this.isEsm,
        this.promptManager,
      )
    } catch (error: any) {
      throw new Error(
        `Failed to pull prompts: ${error.message || String(error)}`,
      )
    }
  }
}

/**
 * Pull prompts from a Latitude project
 */
export function pull(program: Command): void {
  registerCommand(
    program,
    'pull',
    'Pull all prompts from the current Latitude project',
    PullCommand,
    {
      options: [
        {
          flags: '-p, --path <path>',
          description: 'Path to the project',
          defaultValue: '.',
        },
      ],
      action: async (command, options) => {
        await command.execute(options)
      },
    },
  )
}
