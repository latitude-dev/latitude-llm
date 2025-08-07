import type { LockFileManager } from './lockFileManager'

/**
 * Verify project environment
 * @param projectPath The project path to validate
 * @param lockFileManager The lock file manager instance
 * @param checkLockFile Whether to check for the lock file
 */
export async function validateEnvironment(
  projectPath: string,
  lockFileManager: LockFileManager,
  checkLockFile = true,
): Promise<void> {
  // Check if a latitude-lock.json file exists
  if (checkLockFile) {
    const lockFileExists = await lockFileManager.exists(projectPath)
    if (!lockFileExists) {
      throw new Error('❌ No latitude-lock.json file found. Please run "latitude init" first.')
    }
  }
}
