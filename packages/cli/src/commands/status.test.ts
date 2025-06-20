import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { status, StatusCommand } from './status'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('status command', () => {
  const program = new Command()
  let consoleSpy: any
  let consoleErrorSpy: any
  let tempDir: string
  let lockFilePath: string
  let promptsDir: string

  beforeEach(async () => {
    // Create a temp directory for our test project
    tempDir = path.join(os.tmpdir(), `latitude-test-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })

    // Create package.json with ESM type
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-project', type: 'module' }, null, 2),
    )

    // Create prompts directory structure
    promptsDir = path.join(tempDir, 'src', 'prompts')
    await fs.mkdir(promptsDir, { recursive: true })

    // Create a couple of test prompt files
    await fs.writeFile(
      path.join(promptsDir, 'prompt1.js'),
      'export default { messages: [{ role: "system", content: "Test prompt 1" }] }',
    )

    await fs.writeFile(
      path.join(promptsDir, 'prompt2.js'),
      'export default { messages: [{ role: "system", content: "Test prompt 2" }] }',
    )

    // Create a lock file
    lockFilePath = path.join(tempDir, 'latitude-lock.json')
    await fs.writeFile(
      lockFilePath,
      JSON.stringify(
        {
          projectId: 12345,
          rootFolder: 'src/prompts',
          version: 'test-version-uuid',
        },
        null,
        2,
      ),
    )

    // Spy on console methods
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn())
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn())

    // Only mock the API key retrieval, but use real implementations for other classes
    vi.mock('../utils/configManager', () => ({
      ConfigManager: vi.fn().mockImplementation(() => ({
        getApiKey: vi.fn().mockResolvedValue('test-api-key'),
      })),
    }))
  })

  afterEach(async () => {
    // Clean up the temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (error) {
      console.error(`Error cleaning up: ${error}`)
    }

    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()
  })

  it('registers the status command with commander', () => {
    const commandSpy = vi.spyOn(program, 'command')

    status(program)

    expect(commandSpy).toHaveBeenCalledWith('status')
  })

  it('displays project status information correctly', async () => {
    // Create a new instance of the command
    const statusCommand = new StatusCommand()

    // Execute the command with our temp directory path
    await statusCommand.execute({ path: tempDir })

    // Verify console output
    expect(consoleSpy).toHaveBeenCalledWith('Latitude Project Status:')
    expect(consoleSpy).toHaveBeenCalledWith('======================')
    expect(consoleSpy).toHaveBeenCalledWith('Project ID:       12345')
    expect(consoleSpy).toHaveBeenCalledWith(
      'Current Version:  test-version-uuid',
    )
    expect(consoleSpy).toHaveBeenCalledWith('Prompts Folder:   src/prompts')
    expect(consoleSpy).toHaveBeenCalledWith(`Project Path:     ${tempDir}`)
    expect(consoleSpy).toHaveBeenCalledWith('Module Format:    ESM')
    expect(consoleSpy).toHaveBeenCalledWith('Prompt Files:     2')
  })

  it('handles errors when lock file does not exist', async () => {
    // Remove the lock file
    await fs.unlink(lockFilePath)

    // Create a new instance of the command
    const statusCommand = new StatusCommand()

    // Expect the execute method to throw
    try {
      await statusCommand.execute({ path: tempDir })
      // Should not reach here
      expect(true).toBe(false)
    } catch (error: any) {
      expect(error.message).toContain(
        'process.exit unexpectedly called with "1"',
      )
    }

    // Verify error message
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Status check failed: ❌ No latitude-lock.json file found. Please run "latitude init" first.',
    )
  })

  it('shows correct module format for CommonJS projects', async () => {
    // Update package.json to CommonJS
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-project' }, null, 2), // No type: "module" = CommonJS
    )

    // Create a new instance of the command
    const statusCommand = new StatusCommand()

    // Execute the command
    await statusCommand.execute({ path: tempDir })

    // Verify module format output is CommonJS
    expect(consoleSpy).toHaveBeenCalledWith('Module Format:    CommonJS')
  })

  it('handles projects with no prompt files', async () => {
    // Remove all prompt files
    await fs.rm(promptsDir, { recursive: true, force: true })
    // Recreate the empty directory
    await fs.mkdir(promptsDir, { recursive: true })

    // Create a new instance of the command
    const statusCommand = new StatusCommand()

    // Execute the command
    await statusCommand.execute({ path: tempDir })

    // Verify prompt files count is 0
    expect(consoleSpy).toHaveBeenCalledWith('Prompt Files:     0')
  })

  it('handles invalid package.json', async () => {
    // Write invalid JSON to package.json
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      '{ this is not valid JSON',
    )

    // Create a new instance of the command
    const statusCommand = new StatusCommand()

    // Execute the command - should not throw
    await statusCommand.execute({ path: tempDir })

    // Verify default to CommonJS when package.json can't be parsed
    expect(consoleSpy).toHaveBeenCalledWith('Module Format:    CommonJS')
  })
})
