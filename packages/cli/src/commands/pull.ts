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
        !!lockFile.npm,
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
          !!lockFile.npm,
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
    isNpmProject: boolean,
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
      const localPrompts = await this.readLocalPrompts(rootFolder, isNpmProject)

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
      console.log(chalk.yellow('No local prompts directory found.'))
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
   * Pull all prompts from a project
   */
  private async pullPrompts(
    projectId: number,
    promptsRootFolder: string,
    version = 'live',
    isNpmProject: boolean = false,
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
        this.isEsm,
        this.promptManager,
        isNpmProject,
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
      ],
      action: async (command, options) => {
        await command.execute(options)
      },
    },
  )
}
