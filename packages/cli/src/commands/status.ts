import { Command } from 'commander'
import { StatusOptions } from '../types'
import { BaseCommand } from '../utils/baseCommand'
import { registerCommand } from '../utils/commandRegistrar'

/**
 * Handles displaying the current status of a Latitude project
 */
export class StatusCommand extends BaseCommand {
  /**
   * Execute the status command
   */
  async execute(options: StatusOptions): Promise<void> {
    try {
      this.setProjectPath(options)

      // Validate environment
      await this.validateEnvironment()

      // Get project info from lock file
      const lockFile = await this.getLockFile()

      // Detect module format
      await this.detectModuleFormat()

      // Display project status
      console.log('Latitude Project Status:')
      console.log('======================')
      console.log(`Project ID:       ${lockFile.projectId}`)
      console.log(`Current Version:  ${lockFile.version}`)
      console.log(`Prompts Folder:   ${lockFile.rootFolder}`)
      console.log(`Project Path:     ${this.projectPath}`)
      console.log(`Module Format:    ${this.isEsm ? 'ESM' : 'CommonJS'}`)

      // Count prompt files
      try {
        const promptFiles = await this.promptManager.findAllPromptFiles(
          lockFile.rootFolder,
          this.projectPath,
        )
        console.log(`Prompt Files:     ${promptFiles.length}`)
      } catch (error) {
        console.log(`Prompt Files:     Unable to determine`)
      }
    } catch (error: any) {
      this.handleError(error, 'Status check')
    }
  }
}

/**
 * Display the current status of a Latitude project
 */
export function status(program: Command): void {
  registerCommand(
    program,
    'status',
    'Display the current status of the Latitude project',
    StatusCommand,
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
