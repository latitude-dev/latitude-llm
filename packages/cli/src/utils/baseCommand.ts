import * as path from 'path'
import { Latitude } from '@latitude-data/sdk'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { CommonOptions } from '../types'
import { validateEnvironment } from './environmentValidator'
import { ConfigManager } from './configManager'
import { LockFileManager } from './lockFileManager'
import { PromptManager } from './promptManager'
import { ProjectManager } from './projectManager'
import { DiffResult } from './computePromptDiff'

/**
 * Base class for all Latitude CLI commands
 * Abstracts common functionality and dependencies used across command implementations
 */
export abstract class BaseCommand {
  protected client: Latitude | undefined
  protected configManager: ConfigManager
  protected lockFileManager: LockFileManager
  protected projectManager: ProjectManager
  protected projectPath: string = ''
  protected promptManager: PromptManager

  constructor() {
    this.configManager = new ConfigManager()
    this.lockFileManager = new LockFileManager()
    this.promptManager = new PromptManager()
    this.projectManager = new ProjectManager()
  }

  /**
   * Execute the command with the given options
   * This is the main entry point for all commands
   */
  abstract execute(...args: any[]): Promise<void>

  protected async setClient(options?: CommonOptions) {
    if (!this.client) {
      this.client = this.createLatitudeClient(
        await this.configManager.getApiKey(),
        options,
      )
    }

    return this.client
  }

  /**
   * Set the project path from options
   */
  protected setProjectPath(options: CommonOptions): void {
    this.projectPath = path.resolve(options.path)
  }

  /**
   * Creates a Latitude client with the appropriate configuration
   * Includes optional config for development environments
   */
  protected createLatitudeClient(
    apiKey: string,
    options?: CommonOptions,
  ): Latitude {
    if (process.env.NODE_ENV === 'development' || options?.dev) {
      return new Latitude(apiKey, {
        __internal: {
          gateway: {
            host: 'localhost',
            port: 8787,
            ssl: false,
          },
        },
      })
    }

    return new Latitude(apiKey)
  }

  /**
   * Validate the environment before executing a command
   * Checks for latitude-lock.json file and optionally for a valid npm project
   */
  protected async validateEnvironment(
    options: CommonOptions,
    checkLockFile = true,
  ): Promise<void> {
    this.setProjectPath(options)

    await this.setClient(options)
    await validateEnvironment(
      this.projectPath,
      this.lockFileManager,
      checkLockFile,
    )
  }

  /**
   * Get the lock file contents, with error handling
   */
  protected async getLockFile() {
    const lockFile = await this.lockFileManager.read(this.projectPath)
    if (!lockFile) {
      throw new Error(
        '❌ No latitude-lock.json file found. Please run "latitude init" first.',
      )
    }
    return lockFile
  }

  /**
   * Handle errors consistently across commands
   */
  protected handleError(error: any, operation: string): void {
    console.error(`❌ ${operation} failed: ${error.message || String(error)}`)
    process.exit(1)
  }

  /**
   * Show detailed diffs for all changed files
   * @param changes The diff results to display
   * @param isPull Whether this is for a pull operation (affects the display)
   */
  protected async showDetailedDiffs(
    changes: DiffResult[],
    isPull: boolean = false,
  ): Promise<void> {
    const changesWithContent = changes.filter(
      (result) => result.status !== 'unchanged',
    )

    if (changesWithContent.length === 0) {
      console.log(chalk.yellow('No changes to display.'))
      return
    }

    // Prepare the full diff output for all files
    const allDiffs: string[] = []

    // Add a header for each file and its diff content
    for (const change of changesWithContent) {
      allDiffs.push(`\n${'='.repeat(60)}`)
      allDiffs.push(
        `File: ${chalk.bold(change.path)} (${chalk.cyan(change.status)})`,
      )
      allDiffs.push('='.repeat(60))

      const localLabel = isPull ? 'Local (will be replaced)' : 'Local'
      const remoteLabel = isPull ? 'Remote (incoming)' : 'Remote'

      if (change.status === 'added') {
        const addedLabel = isPull ? 'New prompt to be added:' : 'New prompt:'
        allDiffs.push(`${chalk.green('A')} ${addedLabel}`)

        // Format the entire new file as added lines
        const lines = change.localContent.split('\n')
        for (const line of lines) {
          allDiffs.push(chalk.green(`+${line}`))
        }
      } else if (change.status === 'deleted') {
        const deletedLabel = isPull
          ? 'Local prompt to be deleted:'
          : 'Deleted prompt:'
        allDiffs.push(`${chalk.red('D')} ${deletedLabel}`)

        // Format the entire deleted file as removed lines
        const lines = (change.remoteContent || '').split('\n')
        for (const line of lines) {
          allDiffs.push(chalk.red(`-${line}`))
        }
      } else if (change.status === 'modified' && change.remoteContent) {
        allDiffs.push(`${chalk.yellow('M')} Changes:`)

        // Show a simple diff of the changes
        this.showSimpleDiff(
          change.remoteContent,
          change.localContent,
          allDiffs,
          localLabel,
          remoteLabel,
        )
      }

      allDiffs.push('') // Empty line between files
    }

    // Check if we should use pager or direct console output
    if (allDiffs.length > 50) {
      await this.displayInPager(allDiffs.join('\n'))
    } else {
      // Direct console output for smaller diffs
      console.log(allDiffs.join('\n'))
    }
  }

  /**
   * Show a simple diff between old and new content
   */
  protected showSimpleDiff(
    oldContent: string,
    newContent: string,
    output: string[],
    oldLabel: string = 'Remote',
    newLabel: string = 'Local',
  ): void {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')

    // Very basic diff - just show removed and added lines
    output.push(chalk.red(`--- ${oldLabel}`))
    output.push(chalk.green(`+++ ${newLabel}`))

    // Show old lines with - prefix
    for (const line of oldLines) {
      output.push(chalk.red(`-${line}`))
    }

    // Separator
    output.push(chalk.blue('---'))

    // Show new lines with + prefix
    for (const line of newLines) {
      output.push(chalk.green(`+${line}`))
    }
  }

  /**
   * Display content in a pager similar to git's pager
   */
  protected async displayInPager(content: string): Promise<void> {
    // Create a temporary file for the diff
    const tempDir = process.env.TMPDIR || process.env.TEMP || '/tmp'
    const tempFile = path.join(tempDir, `latitude-diff-${Date.now()}.txt`)

    try {
      // Only import fs/promises when needed
      const fs = await import('fs/promises')

      // Write the content to the temp file
      await fs.writeFile(tempFile, content)

      // Determine the best pager to use
      let pager: string = process.env.GIT_PAGER || process.env.PAGER || 'less'

      // Add less options if using less
      if (pager === 'less') {
        pager = 'less -R -F -X' // -R preserves colors, -F exits if content fits on one screen, -X leaves content on screen
      }

      // Display the content using the pager
      console.log(chalk.blue(`Opening diff in pager...`))

      // Build the command to run
      const pagerParts = pager.split(' ')
      const pagerCmd = pagerParts[0]
      const pagerArgs = [...pagerParts.slice(1), tempFile]

      // Use spawn instead of exec for better terminal handling
      const { spawn } = await import('child_process')
      const child = spawn(pagerCmd!, pagerArgs, {
        stdio: 'inherit', // Attach to parent's stdio
        shell: true,
      })

      // Wait for the pager to exit
      return new Promise((resolve) => {
        child.on('close', () => {
          // Clean up the temp file
          fs.unlink(tempFile).catch(() => {})
          resolve()
        })
      })
    } catch (error) {
      console.error(chalk.red(`Error displaying in pager: ${error}`))
      // Fallback to regular console output if pager fails
      console.log(content)
    }
  }

  /**
   * Display a summary of changes between local and remote prompts
   * @param diffResults Array of diff results between local and remote prompts
   * @param showPushMessage Whether to show a message about pushing changes
   * @returns True if there are changes, false if everything is up to date
   */
  protected showChangesSummary(
    diffResults: DiffResult[],
    showPushMessage: boolean = false,
  ): boolean {
    const changes = diffResults.filter(
      (result) => result.status !== 'unchanged',
    )

    if (changes.length === 0) {
      console.log(
        `\n${chalk.green('✓')} No changes detected. Local prompts are up to date.`,
      )
      return false
    }

    console.log(`\n${chalk.blue('🔄')} ${chalk.bold('Prompt Changes:')}`)
    console.log(chalk.blue('================='))

    const added = changes.filter((r) => r.status === 'added')
    const modified = changes.filter((r) => r.status === 'modified')
    const deleted = changes.filter((r) => r.status === 'deleted')

    if (added.length > 0) {
      console.log(`${chalk.green('A')} Added (${added.length}):`)
      added.forEach((change) =>
        console.log(`  ${chalk.green('+')} ${change.path}`),
      )
    }

    if (modified.length > 0) {
      console.log(`${chalk.yellow('M')} Modified (${modified.length}):`)
      modified.forEach((change) =>
        console.log(`  ${chalk.yellow('~')} ${change.path}`),
      )
    }

    if (deleted.length > 0) {
      console.log(`${chalk.red('D')} Deleted (${deleted.length}):`)
      deleted.forEach((change) =>
        console.log(`  ${chalk.red('-')} ${change.path}`),
      )
    }

    if (showPushMessage) {
      console.log(
        `\n${chalk.blue('ℹ')} Run ${chalk.cyan('latitude push')} to push these changes to the remote project.`,
      )
    }

    return true
  }

  /**
   * Handle user choice for pull/push actions
   * @param diffResults Array of diff results between local and remote prompts
   * @param isPull Whether this is for a pull operation (affects detailed diff display)
   * @param skipConfirmation Whether to skip user confirmation (for -y flag)
   * @returns true if the user wants to proceed with the operation, false otherwise
   */
  protected async handleUserChoice(
    diffResults: DiffResult[],
    isPull: boolean = false,
    skipConfirmation: boolean = false,
  ): Promise<boolean> {
    // If skipConfirmation is true, automatically proceed
    if (skipConfirmation) {
      return true
    }
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Accept', value: 'accept' },
          { name: 'Cancel', value: 'cancel' },
          { name: 'View details', value: 'details' },
        ],
        default: 'cancel',
      },
    ])

    switch (action) {
      case 'cancel':
        console.log(`${chalk.red('✖')} Operation cancelled.`)
        return false
      case 'details': {
        const changes = diffResults.filter(
          (result) => result.status !== 'unchanged',
        )
        // Show detailed diffs for all changed files
        await this.showDetailedDiffs(changes, isPull)
        // After showing details, ask again
        return await this.handleUserChoice(
          diffResults,
          isPull,
          skipConfirmation,
        )
      }
      case 'accept':
        return true
      default:
        return false
    }
  }
}
