import * as path from 'path'
import { Latitude } from '@latitude-data/sdk'
import { CommonOptions } from '../types'
import { validateEnvironment } from './environmentValidator'
import { ConfigManager } from './configManager'
import { LockFileManager } from './lockFileManager'
import { PromptManager } from './promptManager'
import { ProjectManager } from './projectManager'

/**
 * Base class for all Latitude CLI commands
 * Abstracts common functionality and dependencies used across command implementations
 */
export abstract class BaseCommand {
  protected configManager: ConfigManager
  protected lockFileManager: LockFileManager
  protected promptManager: PromptManager
  protected projectManager: ProjectManager
  protected client: Latitude | null = null
  protected projectPath: string = ''
  protected isEsm: boolean = false

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

  /**
   * Set the project path from options
   */
  protected setProjectPath(options: CommonOptions): void {
    this.projectPath = path.resolve(options.path)
  }

  /**
   * Initialize the Latitude client with the API key
   */
  protected async initClient(): Promise<void> {
    const apiKey = await this.configManager.getApiKey()
    if (!apiKey) {
      throw new Error('❌ No API key found. Please run "latitude init" first.')
    }

    this.client = this.createLatitudeClient(apiKey)
  }

  /**
   * Creates a Latitude client with the appropriate configuration
   * Includes optional config for development environments
   */
  protected createLatitudeClient(apiKey: string): Latitude {
    // Include second optional argument if in development environment
    if (process.env.NODE_ENV === 'development') {
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
  protected async validateEnvironment(checkLockFile = true): Promise<void> {
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
   * Detect if the project uses ESM or CommonJS
   */
  protected async detectModuleFormat(): Promise<void> {
    this.isEsm = await this.promptManager.isEsmProject(this.projectPath)
  }

  /**
   * Handle errors consistently across commands
   */
  protected handleError(error: any, operation: string): void {
    console.error(`❌ ${operation} failed: ${error.message || String(error)}`)
    process.exit(1)
  }
}
