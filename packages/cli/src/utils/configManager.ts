import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'

/**
 * Configuration manager for the Latitude CLI
 * Handles storing and retrieving configuration values like API keys and project IDs
 */
export class ConfigManager {
  private configPath: string
  private config: Record<string, any> = {}

  constructor() {
    // Store configuration in the user's home directory
    this.configPath = path.join(os.homedir(), '.latitude', 'config.json')
  }

  /**
   * Initialize the configuration manager
   */
  async init(): Promise<void> {
    try {
      // Create the .latitude directory if it doesn't exist
      const configDir = path.dirname(this.configPath)
      try {
        await fs.access(configDir)
      } catch {
        await fs.mkdir(configDir, { recursive: true })
      }

      // Load existing config if it exists
      try {
        const configData = await fs.readFile(this.configPath, 'utf-8')
        this.config = JSON.parse(configData)
      } catch {
        // Config file doesn't exist yet, initialize with empty object
        this.config = {}
        await this.save()
      }
    } catch (error: any) {
      throw new Error(
        `Failed to initialize config: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Save the current configuration to disk
   */
  private async save(): Promise<void> {
    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8',
      )
    } catch (error: any) {
      throw new Error(
        `Failed to save config: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Set the API key
   */
  async setApiKey(apiKey: string): Promise<void> {
    await this.init()
    this.config.apiKey = apiKey
    await this.save()
  }

  /**
   * Get the stored API key
   */
  async getApiKey(): Promise<string | undefined> {
    await this.init()
    return this.config.apiKey
  }

  /**
   * Set the project ID
   */
  async setProjectId(projectId: number): Promise<void> {
    await this.init()
    this.config.projectId = projectId
    await this.save()
  }

  /**
   * Get the stored project ID
   */
  async getProjectId(): Promise<string | undefined> {
    await this.init()
    return this.config.projectId
  }

  /**
   * Get a configuration value by key
   */
  async get(key: string): Promise<any> {
    await this.init()
    return this.config[key]
  }

  /**
   * Set a configuration value
   */
  async set(key: string, value: any): Promise<void> {
    await this.init()
    this.config[key] = value
    await this.save()
  }

  /**
   * Delete a configuration value
   */
  async delete(key: string): Promise<void> {
    await this.init()
    delete this.config[key]
    await this.save()
  }

  /**
   * Get all configuration values
   */
  async getAll(): Promise<Record<string, any>> {
    await this.init()
    return { ...this.config }
  }

  /**
   * Clear all configuration values
   */
  async clear(): Promise<void> {
    this.config = {}
    await this.save()
  }
}
