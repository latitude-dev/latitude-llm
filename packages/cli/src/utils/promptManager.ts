import * as fs from 'fs/promises'
import * as path from 'path'
import glob from 'glob'
import { Prompt } from '@latitude-data/sdk'
/**
 * Manages prompt operations for the Latitude CLI
 */
export class PromptManager {
  /**
   * Determine the root folder for storing prompts
   */
  async determineRootFolder(
    projectPath: string,
    defaultFolder = 'prompts',
  ): Promise<string> {
    try {
      // Check if src folder exists
      const srcPath = path.join(projectPath, 'src')
      try {
        await fs.access(srcPath)
        // If src exists, default to src/prompts
        return path.join('src', defaultFolder)
      } catch {
        // If src doesn't exist, default to prompts
        return defaultFolder
      }
    } catch (_error) {
      // If any error occurs, default to prompts
      return defaultFolder
    }
  }
  /**
   * Create the prompt directory structure
   */
  async createPromptDirectory(
    projectPath: string,
    promptsRoot: string,
  ): Promise<void> {
    try {
      const dirPath = path.join(projectPath, promptsRoot)
      await fs.mkdir(dirPath, { recursive: true })
      return
    } catch (error: any) {
      throw new Error(
        `Failed to create prompt directory: ${error.message || String(error)}`,
      )
    }
  }
  /**
   * Save a prompt to the filesystem
   */
  async savePromptToFile(
    prompt: Prompt,
    rootFolder: string,
    projectPath: string,
  ): Promise<string> {
    // Use the prompt's path property to determine where to save it
    // Remove any leading slashes
    const promptPath = prompt.path.startsWith('/')
      ? prompt.path.slice(1)
      : prompt.path
    // Create the full directory path
    const dirPath = path.join(projectPath, rootFolder, path.dirname(promptPath))
    await fs.mkdir(dirPath, { recursive: true })
    // Create the file
    const fileName = path.basename(promptPath) + '.js'
    const filePath = path.join(dirPath, fileName)

    // Serialize content as a JSON string literal to avoid template issues
    const jsonString = JSON.stringify(prompt.content)
    // Create the content exporting default to avoid invalid identifiers
    const content = `export default ${jsonString}\n`
    await fs.writeFile(filePath, content)
    // Return the relative path for logging
    return path.join(rootFolder, path.dirname(promptPath), fileName)
  }
  /**
   * Convert a prompt path to a filesystem path
   */
  convertPromptPathToFilePath(
    promptPath: string,
    rootFolder: string,
    isNpmProject: boolean = true,
  ): string {
    // Remove any leading slashes
    const normalizedPath = promptPath.startsWith('/')
      ? promptPath.slice(1)
      : promptPath

    // Add appropriate extension based on project type
    if (isNpmProject) {
      return path.join(rootFolder, normalizedPath + '.js')
    } else {
      return path.join(rootFolder, normalizedPath + '.promptl')
    }
  }
  /**
   * Find all prompt files in the filesystem
   */
  findAllPromptFiles(
    rootFolder: string,
    projectPath: string,
    isNpmProject: boolean = true,
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      // Set the file pattern based on whether it's an npm project
      const filePattern = isNpmProject ? '*.{js,mjs,ts,cjs}' : '*.promptl'
      const pattern = path.join(projectPath, rootFolder, '**', filePattern)

      glob(pattern, (err, matches) => {
        if (err) {
          reject(new Error(`Failed to find prompt files: ${err.message}`))
          return
        }
        // Convert absolute paths to relative paths
        const relativePaths = matches.map((match: string) =>
          path.relative(path.join(projectPath, rootFolder), match),
        )

        resolve(relativePaths)
      })
    })
  }
  /**
   * Clean up prompt files that are no longer in the project
   */
  async cleanupPromptFiles(
    prompts: Prompt[],
    rootFolder: string,
    projectPath: string,
    isNpmProject: boolean = true,
  ): Promise<string[]> {
    try {
      // Get all prompt files in the filesystem
      const existingFiles = await this.findAllPromptFiles(
        rootFolder,
        projectPath,
        isNpmProject,
      )
      // Create a set of files that should exist based on the prompts
      const shouldExist = new Set<string>()
      for (const prompt of prompts) {
        // Remove any leading slashes
        const promptPath = prompt.path.startsWith('/')
          ? prompt.path.slice(1)
          : prompt.path

        // Add filename with appropriate extension
        let fileName: string
        if (isNpmProject) {
          fileName = path.basename(promptPath) + '.js'
        } else {
          fileName = path.basename(promptPath) + '.promptl'
        }

        // Calculate relative path
        const relativePath = path.join(path.dirname(promptPath), fileName)
        shouldExist.add(relativePath)
      }
      // Find files that shouldn't exist
      const filesToDelete = existingFiles.filter(
        (file) => !shouldExist.has(file),
      )
      // Delete each file
      const deletedFiles: string[] = []
      for (const file of filesToDelete) {
        const fullPath = path.join(projectPath, rootFolder, file)
        await fs.unlink(fullPath)
        deletedFiles.push(file)
      }
      return deletedFiles
    } catch (error: any) {
      throw new Error(
        `Failed to clean up prompt files: ${error.message || String(error)}`,
      )
    }
  }
}
