import { Command } from 'commander'
import * as path from 'path'
import * as fs from 'fs/promises'
import inquirer from 'inquirer'
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
class PushCommand extends BaseCommand {
  /**
   * Execute the push command
   */
  async execute(options: PushOptions): Promise<void> {
    try {
      this.setProjectPath(options)

      // Validate environment
      await this.validateEnvironment()

      // Initialize the client
      await this.initClient()

      // Get project ID from lock file
      const lockFile = await this.getLockFile()

      // Determine if the project uses ESM or CJS
      await this.detectModuleFormat()

      // Read local prompts
      const localPrompts = await this.readLocalPrompts(lockFile.rootFolder)

      // Get diff with remote
      const diffResults = await this.getDiffWithRemote(
        lockFile.projectId,
        lockFile.version,
        localPrompts,
      )

      // Display summary and handle user interaction
      await this.displayDiffSummary(diffResults)
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
      true, // isNpmProject
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
    if (!this.client) {
      throw new Error('Latitude client not initialized')
    }

    try {
      // Fetch all remote prompts using SDK's getAll method
      const remotePrompts = await this.client.prompts.getAll({
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
  private async displayDiffSummary(diffResults: DiffResult[]): Promise<void> {
    const changes = diffResults.filter(
      (result) => result.status !== 'unchanged',
    )

    if (changes.length === 0) {
      console.log(`No changes detected. Local prompts are up to date.`)
      return
    }

    console.log(`\n${chalk.blue('📊')} ${chalk.bold('Changes Summary:')}`)
    console.log(chalk.blue('=================='))

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

    // Present user with three options
    await this.handleUserChoice(diffResults)
  }

  /**
   * Handle user choice for push action
   */
  private async handleUserChoice(diffResults: DiffResult[]): Promise<void> {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Accept', value: 'push' },
          { name: 'Cancel', value: 'cancel' },
          { name: 'View details', value: 'details' },
        ],
        default: 'cancel',
      },
    ])

    switch (action) {
      case 'cancel':
        console.log(`${chalk.red('✖')} Push cancelled.`)
        break
      case 'details': {
        const changes = diffResults.filter(
          (result) => result.status !== 'unchanged',
        )
        await this.showDetailedDiffs(changes)
        // After showing details, ask again
        await this.handleUserChoice(diffResults)
        break
      }
      case 'push':
        await this.executePush(diffResults)
        break
    }
  }

  /**
   * Execute the actual push operation
   */
  private async executePush(diffResults: DiffResult[]): Promise<void> {
    if (!this.client) {
      throw new Error('Latitude client not initialized')
    }

    console.log(`${chalk.blue('🚀')} Pushing changes to Latitude...`)

    try {
      // Get project info from lock file
      const lockFile = await this.getLockFile()

      // Use the SDK commits.push method (currently mocked)
      const changes = diffResults.filter(
        (result) => result.status !== 'unchanged',
      )
      const changesForSdk = changes.map((change) => ({
        path: change.path,
        content: change.localContent,
        status: change.status,
        contentHash: change.contentHash,
      }))

      const result = await this.client.commits.push(
        lockFile.projectId,
        lockFile.version,
        changesForSdk,
      )

      console.log(
        `${chalk.green('✓')} Successfully pushed changes! New commit: ${chalk.cyan(result.commitUuid)}`,
      )
    } catch (error: any) {
      console.error(
        `${chalk.red('✖')} Failed to push changes: ${error.message}`,
      )
      throw error
    }
  }

  /**
   * Show detailed diffs for all changed files in a browsable view
   */
  private async showDetailedDiffs(changes: DiffResult[]): Promise<void> {
    // Prepare the full diff output for all files
    const allDiffs: string[] = []

    // Add a header for each file and its diff content
    for (const change of changes) {
      allDiffs.push(`\n${'='.repeat(60)}`)
      allDiffs.push(
        `File: ${chalk.bold(change.path)} (${chalk.cyan(change.status)})`,
      )
      allDiffs.push('='.repeat(60))

      if (change.status === 'added') {
        allDiffs.push(`${chalk.green('A')} New prompt:`)

        // Format the entire new file as added lines
        const lines = change.localContent.split('\n')
        for (const line of lines) {
          allDiffs.push(chalk.green(`+${line}`))
        }
      } else if (change.status === 'deleted') {
        allDiffs.push(`${chalk.red('D')} Deleted prompt:`)

        // Format the entire deleted file as removed lines
        const lines = (change.remoteContent || '').split('\n')
        for (const line of lines) {
          allDiffs.push(chalk.red(`-${line}`))
        }
      } else if (change.status === 'modified' && change.remoteContent) {
        allDiffs.push(`${chalk.yellow('M')} Changes:`)

        // Capture the diff output
        const diffLines: string[] = []
        const originalConsoleLog = console.log
        console.log = (...args) => {
          diffLines.push(args.join(' '))
        }

        this.showDiff(change.remoteContent, change.localContent, change.path)

        // Restore console.log
        console.log = originalConsoleLog

        // Add the captured diff lines
        allDiffs.push(...diffLines)
      }

      allDiffs.push('') // Empty line between files
    }

    // Now display the combined diff in a browsable pager
    await this.displayInPager(allDiffs.join('\n'))
  }

  /**
   * Display content in a pager similar to git's pager
   */
  private async displayInPager(content: string): Promise<void> {
    // Create a temporary file for the diff
    const tempDir = process.env.TMPDIR || process.env.TEMP || '/tmp'
    const tempFile = path.join(tempDir, `latitude-diff-${Date.now()}.txt`)

    try {
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
   * Simple line-based LCS diff algorithm
   */
  private computeLineDiff(
    oldLines: string[],
    newLines: string[],
  ): Array<{ type: 'equal' | 'delete' | 'insert'; lines: string[] }> {
    const result: Array<{
      type: 'equal' | 'delete' | 'insert'
      lines: string[]
    }> = []

    let oldIndex = 0
    let newIndex = 0

    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex >= oldLines.length) {
        // Only new lines left - all insertions
        result.push({
          type: 'insert',
          lines: newLines.slice(newIndex),
        })
        break
      } else if (newIndex >= newLines.length) {
        // Only old lines left - all deletions
        result.push({
          type: 'delete',
          lines: oldLines.slice(oldIndex),
        })
        break
      } else if (oldLines[oldIndex] === newLines[newIndex]) {
        // Lines match - equal
        const equalLines: string[] = []
        while (
          oldIndex < oldLines.length &&
          newIndex < newLines.length &&
          oldLines[oldIndex] === newLines[newIndex]
        ) {
          const line = oldLines[oldIndex]
          if (line !== undefined) {
            equalLines.push(line)
          }
          oldIndex++
          newIndex++
        }
        result.push({
          type: 'equal',
          lines: equalLines,
        })
      } else {
        // Lines don't match - find next matching point
        let nextMatchOld = -1
        let nextMatchNew = -1

        // Look ahead to find next matching line
        for (
          let i = oldIndex + 1;
          i < Math.min(oldLines.length, oldIndex + 10);
          i++
        ) {
          for (
            let j = newIndex + 1;
            j < Math.min(newLines.length, newIndex + 10);
            j++
          ) {
            if (oldLines[i] === newLines[j]) {
              nextMatchOld = i
              nextMatchNew = j
              break
            }
          }
          if (nextMatchOld !== -1) break
        }

        if (nextMatchOld !== -1) {
          // Found a match - mark deletions and insertions
          if (nextMatchOld > oldIndex) {
            result.push({
              type: 'delete',
              lines: oldLines.slice(oldIndex, nextMatchOld),
            })
          }
          if (nextMatchNew > newIndex) {
            result.push({
              type: 'insert',
              lines: newLines.slice(newIndex, nextMatchNew),
            })
          }
          oldIndex = nextMatchOld
          newIndex = nextMatchNew
        } else {
          // No match found - treat current lines as delete/insert
          const oldLine = oldLines[oldIndex]
          const newLine = newLines[newIndex]

          if (oldLine !== undefined) {
            result.push({
              type: 'delete',
              lines: [oldLine],
            })
          }
          if (newLine !== undefined) {
            result.push({
              type: 'insert',
              lines: [newLine],
            })
          }
          oldIndex++
          newIndex++
        }
      }
    }

    return result
  }

  /**
   * Display a diff between old and new content with git-like headers
   */
  private showDiff(
    oldContent: string,
    newContent: string,
    filePath?: string,
  ): void {
    // If no changes, return early
    if (oldContent === newContent) {
      console.log(chalk.gray('No changes detected'))
      return
    }

    // Add git-like file headers
    if (filePath) {
      console.log(chalk.bold(`--- a${filePath}`))
      console.log(chalk.bold(`+++ b${filePath}`))
    }

    // Split content into lines
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')

    // Compute line-based diff
    const diffBlocks = this.computeLineDiff(oldLines, newLines)

    // Build hunk with line numbers
    const hunkLines: string[] = []
    let oldLineNum = 1
    let newLineNum = 1

    for (const block of diffBlocks) {
      switch (block.type) {
        case 'equal':
          for (const line of block.lines) {
            hunkLines.push(` ${line}`)
            oldLineNum++
            newLineNum++
          }
          break
        case 'delete':
          for (const line of block.lines) {
            hunkLines.push(chalk.red(`-${line}`))
            oldLineNum++
          }
          break
        case 'insert':
          for (const line of block.lines) {
            hunkLines.push(chalk.green(`+${line}`))
            newLineNum++
          }
          break
      }
    }

    // Print hunk header and lines
    if (hunkLines.length > 0) {
      console.log(
        chalk.cyan(`@@ -1,${oldLines.length} +1,${newLines.length} @@`),
      )
      hunkLines.forEach((line) => console.log(line))
    }

    console.log() // Empty line at the end
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
      ],
      action: async (command, options) => {
        await command.execute(options)
      },
    },
  )
}
