import { Command } from 'commander'
import * as path from 'path'
import * as fs from 'fs/promises'
import chalk from 'chalk'
import { PushOptions } from '../types'
import { BaseCommand } from '../utils/baseCommand'
import { registerCommand } from '../utils/commandRegistrar'
import {
  computePromptDiff,
  DiffResult,
  IncomingPrompt,
  OriginPrompt,
} from '../utils/computePromptDiff'
import { hashContent } from '../utils/hashContent'

/**
 * Handles pushing local prompts to a Latitude project with diff comparison
 */
export class PushCommand extends BaseCommand {
  /**
   * Execute the push command
   */
  async execute(options: PushOptions): Promise<void> {
    try {
      // Validate environment
      await this.validateEnvironment(options)

      // Get project ID from lock file
      const lockFile = await this.getLockFile()

      // Read local prompts
      const localPrompts = await this.readLocalPrompts(lockFile.rootFolder)

      // Get diff with remote
      const diffResults = await this.getDiffWithRemote(
        lockFile.projectId,
        lockFile.version,
        localPrompts,
      )

      // Display summary and handle user interaction
      await this.displayDiffSummary(diffResults, options)
    } catch (error: any) {
      this.handleError(error, 'Push')
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

  /**
   * Display diff summary and handle user interaction
   */
  private async displayDiffSummary(
    diffResults: DiffResult[],
    options: PushOptions,
  ): Promise<void> {
    const hasChanges = this.showChangesSummary(diffResults)

    if (!hasChanges) {
      return
    }

    // Present user with options and handle response
    // Pass false to indicate this is a push operation
    const shouldPush = await this.handleUserChoice(
      diffResults,
      false,
      options.yes,
    )

    if (shouldPush) {
      await this.executePush(diffResults)
    }
  }

  /**
   * Execute the actual push operation
   */
  private async executePush(diffResults: DiffResult[]): Promise<void> {
    console.log(`${chalk.blue('🚀')} Pushing changes to Latitude...`)

    try {
      // Get project info from lock file
      const lockFile = await this.getLockFile()

      // Use the SDK versions.push method (currently mocked)
      const changes = diffResults.filter(
        (result) => result.status !== 'unchanged',
      )
      const changesForSdk = changes.map((change) => ({
        path: change.path,
        content: change.localContent,
        status: change.status,
        contentHash: change.contentHash,
      }))

      await this.client!.versions.push(
        lockFile.projectId,
        lockFile.version,
        changesForSdk,
      )

      console.log(`${chalk.green('✓')} Successfully pushed changes!`)
    } catch (error: any) {
      console.error(
        `${chalk.red('✖')} Failed to push changes: ${error.message}`,
      )
      throw error
    }
  }
}

/**
 * Push local prompts and compare with remote project
 */
export function push(program: Command): void {
  registerCommand(
    program,
    'push',
    'Compare local prompts with remote project and show differences',
    PushCommand,
    {
      options: [
        {
          flags: '-p, --path <path>',
          description: 'Path to the project',
          defaultValue: '.',
        },
        {
          flags: '-y, --yes',
          description: 'Skip confirmation and push automatically',
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
