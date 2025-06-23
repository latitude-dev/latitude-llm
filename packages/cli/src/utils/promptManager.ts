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
    } catch (error) {
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
   * Detect if the project uses ESM or CJS
   */
  async isEsmProject(projectPath: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json')
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonContent)
      return packageJson.type === 'module'
    } catch (error) {
      // Default to CJS if we can't determine
      return false
    }
  }
  /**
   * Save a prompt to the filesystem
   */
  async savePromptToFile(
    prompt: Prompt,
    rootFolder: string,
    projectPath: string,
    isEsm: boolean,
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
    const fileName = path.basename(promptPath) + (isEsm ? '.js' : '.cjs')
    const filePath = path.join(dirPath, fileName)
    // Get the prompt name from the path and convert to camelCase
    const promptName = path.basename(promptPath)
    const camelCaseName = promptName
      .replace(/[-_\s.]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^(.)/, (c) => c.toLowerCase())
    // Use the raw prompt content without modifying indentation
    const prettyPrompt = prompt.content
    // Create the content with the camelCased variable name
    const content = isEsm
      ? `export const ${camelCaseName} = \`${prettyPrompt}\``
      : `const ${camelCaseName} = \`${prettyPrompt}\`\n\nmodule.exports = { ${camelCaseName} }`
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
    isEsm: boolean = false,
  ): string {
    // Remove any leading slashes
    const normalizedPath = promptPath.startsWith('/')
      ? promptPath.slice(1)
      : promptPath

    // Add appropriate extension based on project type
    if (isNpmProject) {
      const extension = isEsm ? '.js' : '.cjs'
      return path.join(rootFolder, normalizedPath + extension)
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
      const filePattern = isNpmProject ? '*.{js,mjs,cjs,ts}' : '*.promptl'
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
    isEsm: boolean = false,
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
          fileName = path.basename(promptPath) + (isEsm ? '.js' : '.cjs')
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
