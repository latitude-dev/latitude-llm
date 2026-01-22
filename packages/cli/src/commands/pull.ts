import { Command } from 'commander'
import chalk from 'chalk'
import * as path from 'path'
import * as fs from 'fs/promises'
import { PullOptions } from '../types'
import { BaseCommand } from '../utils/baseCommand'
import { savePrompts } from '../utils/promptOperations'
import { registerCommand } from '../utils/commandRegistrar'
import {
  computePromptDiff,
  DiffResult,
  IncomingPrompt,
  OriginPrompt,
} from '../utils/computePromptDiff'
import { hashContent } from '../utils/hashContent'

/**
 * Handles pulling prompts from a Latitude project to the local filesystem
 */
export class PullCommand extends BaseCommand {
  /**
   * Execute the pull command
   */
  async execute(options: PullOptions): Promise<void> {
    try {
      console.log(
        chalk.blue(`\n🔍 Analyzing project at ${this.projectPath}...`),
      )

      // Validate environment
      await this.validateEnvironment(options)

      // Get project ID from lock file
      const lockFile = await this.getLockFile()

      // Get version details
      const versionDetails = await this.client!.versions.get(
        lockFile.projectId,
        lockFile.version,
      )

      console.log(
        `\nProject ${chalk.cyan.bold(lockFile.projectId)} ${chalk.gray(`https://app.latitude.so/projects/${lockFile.projectId}/commits/${lockFile.version}`)}`,
      )
      console.log(`Version ${chalk.cyan.bold(versionDetails.title)}`)

      // Compute diff before pulling
      const diffResults = await this.computePullDiff(
        lockFile.projectId,
        lockFile.rootFolder,
        lockFile.version,
      )

      // If no changes, inform the user and exit
      if (diffResults.every((result) => result.status === 'unchanged')) {
        console.log(
          `\n${chalk.green('✓')} No changes detected. Local prompts are up to date.`,
        )
        return
      }

      // Display the changes summary
      this.showChangesSummary(diffResults)

      // Ask for user confirmation (true indicates this is a pull operation)
      const shouldPull = await this.handleUserChoice(
        diffResults,
        true,
        options.yes,
      )

      if (shouldPull) {
        // Pull all prompts from the project
        await this.pullPrompts(
          lockFile.projectId,
          lockFile.rootFolder,
          lockFile.version,
        )

        console.log(
          `\n${chalk.green('✓')} Successfully pulled all prompts from the project!`,
        )
      } else {
        console.log(`\n${chalk.red('x')} Pull operation canceled.`)
      }
    } catch (error: any) {
      this.handleError(error, 'Pull')
    }
  }

  /**
   * Compute the diff between remote and local prompts before pulling
   */
  private async computePullDiff(
    projectId: number,
    rootFolder: string,
    version: string,
  ): Promise<DiffResult[]> {
    try {
      // Get remote prompts
      const remotePrompts = await this.client!.prompts.getAll({
        projectId,
        versionUuid: version,
      })

      // Map to the format needed for diff computation
      const mappedRemotePrompts: IncomingPrompt[] = remotePrompts.map(
        (prompt) => ({
          path: prompt.path,
          content: prompt.content,
        }),
      )

      // Read local prompts
      const localPrompts = await this.readLocalPrompts(rootFolder)

      // Map local prompts to OriginPrompt format for diff comparison
      const mappedLocalPrompts: OriginPrompt[] = localPrompts.map((prompt) => ({
        path: prompt.path,
        content: prompt.content,
        contentHash: hashContent(prompt.content),
      }))

      // Compute diff with remote (switch order compared to push - here remote is "incoming")
      return computePromptDiff(mappedRemotePrompts, mappedLocalPrompts)
    } catch (error: any) {
      throw new Error(
        `Failed to compute diff: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Read all local prompts from the filesystem
   */
  private async readLocalPrompts(rootFolder: string): Promise<IncomingPrompt[]> {
    const prompts: IncomingPrompt[] = []
    const promptsDir = path.join(this.projectPath, rootFolder)

    try {
      // Check if prompts directory exists
      await fs.access(promptsDir)
    } catch {
      console.log(chalk.yellow('No local prompts directory found.'))
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
   * Pull all prompts from a project
   */
  private async pullPrompts(
    projectId: number,
    promptsRootFolder: string,
    version = 'live',
  ): Promise<void> {
    try {
      console.log(
        chalk.blue(`\n🔄 Pulling prompts from project ${projectId}...`),
      )
      const prompts = await this.projectManager.fetchAllPrompts(
        this.client!,
        projectId,
        version,
      )

      // Use the common utility for saving prompts
      await savePrompts(
        prompts,
        promptsRootFolder,
        this.projectPath,
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
        {
          flags: '-y, --yes',
          description: 'Skip confirmation and pull automatically',
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
