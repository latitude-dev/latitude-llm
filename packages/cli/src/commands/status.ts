import chalk from 'chalk'
import { Command } from 'commander'
import * as fs from 'fs/promises'
import * as path from 'path'
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
        const localPrompts = await this.readLocalPrompts(
          lockFile.rootFolder,
          !!lockFile.npm,
        )
        const diffResults = await this.getDiffWithRemote(
          lockFile.projectId,
          lockFile.version,
          localPrompts,
        )

        // Display diff summary
        this.showChangesSummary(diffResults)
      } catch (error) {
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
    // If it's a JS/CJS file, try to import and extract the prompt
    if (
      filePath.endsWith('.js') ||
      filePath.endsWith('.cjs') ||
      filePath.endsWith('.mjs') ||
      filePath.endsWith('.ts')
    ) {
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

    // Skip TypeScript files for now as they need compilation
    if (filePath.endsWith('.ts')) {
      console.warn(
        chalk.yellow(
          `TypeScript files not supported yet, skipping ${filePath}`,
        ),
      )
      throw new Error(`TypeScript files not supported yet`)
    }

    // Default: read as plain text
    return await fs.readFile(filePath, 'utf-8')
  }

  /**
   * Import and extract prompt content from a JS/CJS file
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
    return filePath.replace(/\.(js|cjs|ts|promptl)$/, '')
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
