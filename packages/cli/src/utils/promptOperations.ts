import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { Prompt } from '@latitude-data/sdk'
import type { PromptManager } from './promptManager'

/**
 * Save prompts to the filesystem
 * @param prompts The prompts to save
 * @param promptsRootFolder The root folder to save prompts in
 * @param projectPath The project path
 * @param isEsm Whether the project uses ESM modules
 * @param promptManager The prompt manager instance
 * @param isNpmProject Whether the project is an npm project
 */
export async function savePrompts(
  prompts: Prompt[],
  promptsRootFolder: string,
  projectPath: string,
  isEsm: boolean,
  promptManager: PromptManager,
  isNpmProject: boolean = false,
): Promise<void> {
  if (prompts.length === 0) {
    console.log('No prompts found.')
    return
  }

  console.log(`Found ${prompts.length} prompts. Saving to ${promptsRootFolder}/...`)

  // Ensure the prompts directory exists
  await promptManager.createPromptDirectory(projectPath, promptsRootFolder)

  // Clean up old prompt files that aren't in the project
  const deletedFiles = await promptManager.cleanupPromptFiles(
    prompts,
    promptsRootFolder,
    projectPath,
    isNpmProject,
  )

  if (deletedFiles.length > 0) {
    console.log(`Removed ${deletedFiles.length} prompts that no longer exist:`)
    for (const file of deletedFiles) {
      console.log(`  - Removed ${path.join(promptsRootFolder, file)}`)
    }
  }

  // Save each prompt to the filesystem
  for (const prompt of prompts) {
    let savedPath: string

    if (isNpmProject) {
      // Save as JS/CJS file for npm projects
      savedPath = await promptManager.savePromptToFile(
        prompt,
        promptsRootFolder,
        projectPath,
        isEsm,
      )
    } else {
      // Save as .promptl file for non-npm projects
      savedPath = await savePromptAsPlainText(prompt, promptsRootFolder, projectPath)
    }

    console.log(`  - Saved ${prompt.path} to ${savedPath}`)
  }

  console.log(`✅ Successfully saved ${prompts.length} prompts.`)
}

/**
 * Save a prompt as a plain text .promptl file
 * @param prompt The prompt to save
 * @param rootFolder The root folder to save the prompt in
 * @param projectPath The project path
 */
async function savePromptAsPlainText(
  prompt: Prompt,
  rootFolder: string,
  projectPath: string,
): Promise<string> {
  // Use the prompt's path property to determine where to save it
  // Remove any leading slashes
  const promptPath = prompt.path.startsWith('/') ? prompt.path.slice(1) : prompt.path

  // Create the full directory path
  const dirPath = path.join(projectPath, rootFolder, path.dirname(promptPath))
  await fs.mkdir(dirPath, { recursive: true })

  // Create the file with .promptl extension
  const fileName = `${path.basename(promptPath)}.promptl`
  const filePath = path.join(dirPath, fileName)

  // Write the prompt content directly to the file
  await fs.writeFile(filePath, prompt.content, 'utf-8')

  // Return the relative path for logging
  return path.join(rootFolder, path.dirname(promptPath), fileName)
}
