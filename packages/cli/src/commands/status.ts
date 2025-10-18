import { Command } from 'commander'
import chalk from 'chalk'
import { StatusOptions } from '../types'
import { BaseCommand } from '../utils/baseCommand'
import { registerCommand } from '../utils/commandRegistrar'
import {
  computePromptDiff,
  DiffResult,
  IncomingPrompt,
  OriginPrompt,
} from '../utils/computePromptDiff'
import { hashContent } from '../utils/hashContent'
import * as path from 'path'
import * as fs from 'fs/promises'

/**
 * Handles displaying the current status of a Latitude project
 */
export class StatusCommand extends BaseCommand {
  /**
   * Execute the status command
   */
  async execute(options: StatusOptions): Promise<void> {
    try {
      // Validate environment
      await this.validateEnvironment(options)

      // Get project info from lock file
      const lockFile = await this.getLockFile()

      // Get version details from SDK
      const versionDetails = await this.client!.versions.get(
        lockFile.projectId,
        lockFile.version,
      )

      // Display project status with improved formatting
      console.log(chalk.blue.bold('\n📊 Latitude Project Status'))
      console.log(chalk.blue('========================\n'))
      console.log(
        `Project ${chalk.cyan.bold(lockFile.projectId)} ${chalk.gray(`https://app.latitude.so/projects/${lockFile.projectId}/commits/${lockFile.version}`)}`,
      )

      // Display version information prominently
      console.log(`Version ${chalk.cyan.bold(versionDetails.title)}`)
      if (versionDetails.description) {
        console.log(chalk.gray(`${versionDetails.description}`))
      }

      // Count prompt files
      try {
        //// Read local prompts and get diff with remote
        const localPrompts = await this.readLocalPrompts(lockFile.rootFolder)
        const diffResults = await this.getDiffWithRemote(
          lockFile.projectId,
          lockFile.version,
          localPrompts,
        )

        // Display diff summary
        this.showChangesSummary(diffResults)
      } catch (_error) {
        console.log(
          `${chalk.yellow('Prompt Files:')}     ${chalk.red('Unable to determine')}`,
        )
      }
    } catch (error: any) {
      this.handleError(error, 'Status check')
    }
  }

  /**
   * Read all local prompts from the filesystem
   */
  private async readLocalPrompts(
    rootFolder: string,
  ): Promise<IncomingPrompt[]> {
    const prompts: IncomingPrompt[] = []
    const promptsDir = path.join(this.projectPath, rootFolder)

    try {
      // Check if prompts directory exists
      await fs.access(promptsDir)
    } catch {
      console.log(chalk.yellow('No prompts directory found.'))
      return prompts
    }

    // Find all prompt files
    const files = await this.promptManager.findAllPromptFiles(
      rootFolder,
      this.projectPath,
    )

    for (const file of files) {
      const filePath = path.join(promptsDir, file)

      try {
        const content = await fs.readFile(filePath, 'utf-8')

        // Convert file path back to prompt path (remove .promptl extension)
        const promptPath = file.replace(/\.promptl$/, '')

        prompts.push({
          path: promptPath,
          content,
        })
      } catch (error) {
        // Skip files that can't be read
        console.warn(chalk.yellow(`Skipping ${file}: ${error}`))
      }
    }

    return prompts
  }

  /**
   * Get diff results by comparing local prompts with remote
   */
  private async getDiffWithRemote(
    projectId: number,
    commitUuid: string,
    localPrompts: IncomingPrompt[],
  ): Promise<DiffResult[]> {
    try {
      // Fetch all remote prompts using SDK's getAll method
      const remotePrompts = await this.client!.prompts.getAll({
        projectId,
        versionUuid: commitUuid,
      })

      // Map remote prompts to our interface
      const mappedRemotePrompts: OriginPrompt[] = remotePrompts.map(
        (prompt) => ({
          path: prompt.path,
          content: prompt.content,
          contentHash: hashContent(prompt.content),
        }),
      )

      // Compute diff locally
      return computePromptDiff(localPrompts, mappedRemotePrompts)
    } catch (error: any) {
      throw new Error(
        `Failed to compute diff: ${error.message || String(error)}`,
      )
    }
  }
}

/**
 * Display the current status of a Latitude project with enhanced visual output
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
