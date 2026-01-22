import * as path from 'path'
import { Prompt } from '@latitude-data/sdk'
import { PromptManager } from './promptManager'

/**
 * Save prompts to the filesystem as .promptl text files
 * @param prompts The prompts to save
 * @param promptsRootFolder The root folder to save prompts in
 * @param projectPath The project path
 * @param promptManager The prompt manager instance
 */
export async function savePrompts(
  prompts: Prompt[],
  promptsRootFolder: string,
  projectPath: string,
  promptManager: PromptManager,
): Promise<void> {
  if (prompts.length === 0) {
    console.log('No prompts found.')
    return
  }

  console.log(
    `Found ${prompts.length} prompts. Saving to ${promptsRootFolder}/...`,
  )

  // Ensure the prompts directory exists
  await promptManager.createPromptDirectory(projectPath, promptsRootFolder)

  // Clean up old prompt files that aren't in the project
  const deletedFiles = await promptManager.cleanupPromptFiles(
    prompts,
    promptsRootFolder,
    projectPath,
  )

  if (deletedFiles.length > 0) {
    console.log(`Removed ${deletedFiles.length} prompts that no longer exist:`)
    for (const file of deletedFiles) {
      console.log(`  - Removed ${path.join(promptsRootFolder, file)}`)
    }
  }

  // Save each prompt to the filesystem
  for (const prompt of prompts) {
    const savedPath = await promptManager.savePromptToFile(
      prompt,
      promptsRootFolder,
      projectPath,
    )

    console.log(`  - Saved ${prompt.path} to ${savedPath}`)
  }

  console.log(`✅ Successfully saved ${prompts.length} prompts.`)
}
