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
      const localPrompts = await this.readLocalPrompts(
        lockFile.rootFolder,
        !!lockFile.npm,
      )

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
    isNpmProject: boolean,
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
      isNpmProject,
    )

    for (const file of files) {
      const filePath = path.join(promptsDir, file)

      try {
        const content = await this.readPromptContent(filePath)

        // Convert file path back to prompt path
        const promptPath = this.convertFilePathToPromptPath(file)

        prompts.push({
          path: promptPath,
          content,
        })
      } catch (error) {
        // Skip files that can't be read/imported
        console.warn(chalk.yellow(`Skipping ${file}: ${error}`))
      }
    }

    return prompts
  }

  /**
   * Read content from a prompt file
   */
  private async readPromptContent(filePath: string): Promise<string> {
    if (filePath.endsWith('.cjs')) {
      throw new Error(
        'CommonJS prompt files are no longer supported. Rename to .js to continue.',
      )
    }

    if (filePath.endsWith('.ts')) {
      console.warn(
        chalk.yellow(
          `TypeScript files not supported yet, skipping ${filePath}`,
        ),
      )
      throw new Error(`TypeScript files not supported yet`)
    }

    // If it's a JS/MJS file, try to import and extract the prompt
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
      try {
        return await this.importPromptFromFile(filePath)
      } catch (error) {
        console.warn(
          chalk.yellow(`Failed to import prompt from ${filePath}, skipping...`),
        )
        // If import fails, we assume the prompt is not valid/available
        throw new Error(`Cannot read prompt from ${filePath}`)
      }
    }

    // For .promptl files, return content as-is
    if (filePath.endsWith('.promptl')) {
      return await fs.readFile(filePath, 'utf-8')
    }

    // Default: read as plain text
    return await fs.readFile(filePath, 'utf-8')
  }

  /**
   * Import and extract prompt content from a JS module file
   */
  private async importPromptFromFile(filePath: string): Promise<string> {
    // Get the prompt name from the file path
    const fileName = path.basename(filePath, path.extname(filePath))
    const promptName = this.convertToPromptVariableName(fileName)

    // Convert to absolute path and use dynamic import
    const absolutePath = path.resolve(filePath)
    const module = await import(absolutePath)

    // Try to get the prompt content from the expected export
    if (module[promptName] && typeof module[promptName] === 'string') {
      return module[promptName]
    }

    // Try default export
    if (module.default && typeof module.default === 'string') {
      return module.default
    }

    // Try to find any string export
    for (const [key, value] of Object.entries(module)) {
      if (typeof value === 'string' && key !== 'default') {
        return value
      }
    }

    throw new Error(`No string export found in ${filePath}`)
  }

  /**
   * Convert file name to camelCase variable name (same logic as PromptManager)
   */
  private convertToPromptVariableName(fileName: string): string {
    return fileName
      .replace(/[-_\s.]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^(.)/, (c) => c.toLowerCase())
  }

  /**
   * Convert file path back to prompt path (reverse of PromptManager.convertPromptPathToFilePath)
   */
  private convertFilePathToPromptPath(filePath: string): string {
    return filePath.replace(/\.(js|ts|promptl)$/, '')
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
