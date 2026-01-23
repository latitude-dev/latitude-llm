import * as fs from 'fs/promises'
import * as path from 'path'

// Define the structure of the latitude-lock.json file
export interface LatitudeLockFile {
  projectId: number
  rootFolder: string
  version: string
}

/**
 * Manages the lock file for Latitude projects
 */
export class LockFileManager {
  private readonly lockFileName = 'latitude-lock.json'

  /**
   * Check if a lock file exists in the given project path
   */
  async exists(projectPath: string): Promise<boolean> {
    try {
      const lockFilePath = path.join(projectPath, this.lockFileName)
      await fs.access(lockFilePath)
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Read the lock file if it exists
   */
  async read(projectPath: string): Promise<LatitudeLockFile | null> {
    try {
      const lockFilePath = path.join(projectPath, this.lockFileName)
      const fileContent = await fs.readFile(lockFilePath, 'utf-8')
      return JSON.parse(fileContent) as LatitudeLockFile
    } catch (error) {
      return null
    }
  }

  /**
   * Create or update the lock file
   */
  async write(projectPath: string, lockFile: LatitudeLockFile): Promise<void> {
    try {
      const lockFilePath = path.join(projectPath, this.lockFileName)
      await fs.writeFile(
        lockFilePath,
        JSON.stringify(lockFile, null, 2),
        'utf-8',
      )
    } catch (error: any) {
      throw new Error(
        `Error creating ${this.lockFileName}: ${error.message || String(error)}`,
      )
    }
  }
}
