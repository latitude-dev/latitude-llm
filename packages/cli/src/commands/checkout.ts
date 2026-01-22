import { Command } from 'commander'
import { CheckoutOptions } from '../types'
import { BaseCommand } from '../utils/baseCommand'
import { LatitudeLockFile } from '../utils/lockFileManager'
import { savePrompts } from '../utils/promptOperations'
import { registerCommand } from '../utils/commandRegistrar'

/**
 * Handles checking out a specific version of prompts from a Latitude project
 */
export class CheckoutCommand extends BaseCommand {
  private originalLockFile: LatitudeLockFile | null = null

  /**
   * Execute the checkout command
   */
  async execute(
    versionUuid: string | undefined,
    options: CheckoutOptions,
  ): Promise<void> {
    try {
      // Validate environment
      await this.validateEnvironment(options)

      // Get project info from lock file
      const lockFile = await this.getLockFile()

      // Save the original lock file in case we need to revert
      this.originalLockFile = { ...lockFile }

      let targetVersionUuid = versionUuid

      // If -b flag is provided, create a new version first
      if (options.branch) {
        if (versionUuid) {
          throw new Error(
            'Cannot specify both version UUID and -b flag. Use -b to create a new version or provide a version UUID to checkout to an existing version.',
          )
        }

        console.log(`Creating new version: ${options.branch}...`)
        const newVersion = await this.createNewVersion(
          lockFile.projectId,
          options.branch,
        )
        targetVersionUuid = newVersion.uuid
        console.log(`✅ Created new version: ${targetVersionUuid}`)
      }

      if (!targetVersionUuid) {
        throw new Error(
          'Version UUID is required. Either provide a version UUID as argument or use -b flag to create a new version.',
        )
      }

      console.log(
        `Checking out version ${targetVersionUuid} to ${this.projectPath}...`,
      )

      // First verify we can fetch prompts with the version UUID
      // This validates the version exists before updating the lock file
      console.log(`Verifying version ${targetVersionUuid} exists...`)
      const version = await this.verifyVersion(
        lockFile.projectId,
        targetVersionUuid,
      )
      const prompts = await this.fetchAllPrompts(
        lockFile.projectId,
        version.uuid,
      )

      // Update the lock file with the new version only after verification
      await this.updateLockFile(
        lockFile.projectId,
        lockFile.rootFolder,
        targetVersionUuid,
      )

      // Now proceed with saving the prompts
      await this.savePrompts(lockFile.rootFolder, targetVersionUuid, prompts)

      console.log(`✅ Successfully checked out version ${targetVersionUuid}!`)
    } catch (error: any) {
      // If we have the original lock file and something went wrong, revert it
      if (this.originalLockFile) {
        try {
          console.log('Reverting lock file to original version due to error...')
          await this.lockFileManager.write(
            this.projectPath,
            this.originalLockFile,
          )
        } catch (revertError: any) {
          console.error(
            `❌ Failed to revert lock file: ${revertError.message || String(revertError)}`,
          )
        }
      }

      this.handleError(error, 'Checkout')
    }
  }

  private async fetchAllPrompts(
    projectId: number,
    versionUuid: string,
  ): Promise<any[]> {
    try {
      console.log('fetch all prompts')
      return await this.projectManager.fetchAllPrompts(
        this.client!,
        projectId,
        versionUuid,
      )
    } catch (error: any) {
      throw new Error(
        `Failed to fetch prompts: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Create a new version/commit
   */
  private async createNewVersion(projectId: number, name: string) {
    try {
      return await this.projectManager.createVersion(
        this.client!,
        name,
        projectId,
      )
    } catch (error: any) {
      throw new Error(
        `Failed to create new version: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Verify the version exists and return its prompts
   */
  private async verifyVersion(projectId: number, versionUuid: string) {
    try {
      // Attempt to fetch prompts using the specified version UUID
      const version = await this.projectManager.getVersion(
        this.client!,
        projectId,
        versionUuid,
      )

      // If we got here, the version exists and we can proceed
      return version
    } catch (error: any) {
      throw new Error(
        `Invalid version UUID or unable to fetch prompts: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Update the lock file with the new version
   */
  private async updateLockFile(
    projectId: number,
    rootFolder: string,
    versionUuid: string,
  ): Promise<void> {
    try {
      // Create a new lock file content with the updated version
      const updatedLockFile = {
        ...this.originalLockFile,
        projectId,
        rootFolder,
        version: versionUuid,
      }

      // Write the updated lock file
      await this.lockFileManager.write(this.projectPath, updatedLockFile)
      console.log(`Updated latitude-lock.json with version: ${versionUuid}`)
    } catch (error: any) {
      throw new Error(
        `Failed to update lock file: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Save the prompts to the filesystem
   */
  private async savePrompts(
    promptsRootFolder: string,
    versionUuid: string,
    prompts: any[],
  ): Promise<void> {
    try {
      console.log(
        `Processing ${prompts.length} prompts from version ${versionUuid}...`,
      )

      await savePrompts(
        prompts,
        promptsRootFolder,
        this.projectPath,
        this.promptManager,
      )

      console.log(`✅ Successfully saved prompts from version ${versionUuid}.`)
    } catch (error: any) {
      throw new Error(
        `Failed to save prompts: ${error.message || String(error)}`,
      )
    }
  }
}

/**
 * Checkout a specific version of prompts from a Latitude project
 */
export function checkout(program: Command): void {
  registerCommand(
    program,
    'checkout [versionUuid]',
    'Checkout a specific version of prompts from the Latitude project',
    CheckoutCommand,
    {
      options: [
        {
          flags: '-p, --path <path>',
          description: 'Path to the project',
          defaultValue: '.',
        },
        {
          flags: '-b, --branch <name>',
          description:
            'Create a new version/commit with the specified name and checkout to it',
        },
        {
          flags: '--dev',
          description: 'Use localhost development environment',
        },
      ],
      action: async (command, versionUuid, options) => {
        await command.execute(versionUuid, options)
      },
    },
  )
}
