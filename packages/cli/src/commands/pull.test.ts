import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { Command } from 'commander'
import { pull, PullCommand } from './pull'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const mocks = vi.hoisted(() => ({
  fetchAllPromptsMock: vi.fn(),
  configManagerMock: vi.fn(() => {
    // @ts-ignore
    this.getApiKey = vi.fn().mockResolvedValue('test-api-key')
  }),
}))

vi.mock('./configManager', async (importOriginal) => ({
  ...(await importOriginal()),
  ConfigManager: mocks.configManagerMock,
}))
vi.mock('../utils/projectManager', async (importOriginal) => ({
  ...(await importOriginal()),
  ProjectManager: vi.fn().mockImplementation(() => ({
    fetchAllPrompts: (...args: any[]) => mocks.fetchAllPromptsMock(...args),
  })),
}))
vi.mock('../utils/clientManager', async (importOriginal) => ({
  ...(await importOriginal()),
  ClientManager: vi.fn().mockImplementation(() => ({
    initClient: vi.fn().mockResolvedValue({
      prompts: {
        getAll: vi.fn().mockResolvedValue([]),
      },
    }),
  })),
}))

vi.spyOn(console, 'log').mockImplementation(vi.fn())

describe('pull command', () => {
  const program = new Command()
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
  })

  afterEach(async () => {
    // Clean up the temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (error) {
      console.error(`Error cleaning up: ${error}`)
    }
  })

  it('registers the pull command with commander', () => {
    const commandSpy = vi.spyOn(program, 'command')

    pull(program)

    expect(commandSpy).toHaveBeenCalledWith('pull')
  })

  it('pulls prompts and saves them to disk correctly', async () => {
    mocks.fetchAllPromptsMock.mockResolvedValueOnce([
      {
        id: 'prompt1',
        path: 'prompt1',
        content: 'miau',
      },
      {
        id: 'prompt2',
        path: 'prompt2',
        content: 'miau',
      },
    ])
    // Create a new instance of the command
    const pullCommand = new PullCommand()
    await pullCommand.execute({ path: tempDir })

    // Verify files were created
    const prompt1Content = await fs.readFile(
      path.join(promptsDir, 'prompt1.js'),
      'utf-8',
    )
    const prompt2Content = await fs.readFile(
      path.join(promptsDir, 'prompt2.js'),
      'utf-8',
    )
    expect(prompt1Content).toBe('export const prompt1 = `miau`')
    expect(prompt2Content).toBe('export const prompt2 = `miau`')
  })

  it('removes existing documents that are not returned by the SDK', async () => {
    mocks.fetchAllPromptsMock.mockResolvedValueOnce([
      {
        id: 'prompt1',
        path: 'prompt1',
        content: 'miau',
      },
      {
        id: 'prompt2',
        path: 'prompt2',
        content: 'miau',
      },
    ])
    // Create an extra prompt file that shouldn't exist
    await fs.writeFile(
      path.join(promptsDir, 'extra-prompt.js'),
      'export default { messages: [{ role: "system", content: "This should be deleted" }] }',
    )
    const pullCommand = new PullCommand()
    await pullCommand.execute({ path: tempDir })
    await expect(
      fs.access(path.join(promptsDir, 'extra-prompt.js')),
    ).rejects.toThrow()
    const prompt1Content = await fs.readFile(
      path.join(promptsDir, 'prompt1.js'),
      'utf-8',
    )
    const prompt2Content = await fs.readFile(
      path.join(promptsDir, 'prompt2.js'),
      'utf-8',
    )
    expect(prompt1Content).toBe('export const prompt1 = `miau`')
    expect(prompt2Content).toBe('export const prompt2 = `miau`')
  })

  it('handles nested paths and creates subfolders as needed', async () => {
    mocks.fetchAllPromptsMock.mockResolvedValueOnce([
      {
        id: 'prompt1',
        path: 'folder1/prompt1',
        content: 'miau',
      },
      {
        id: 'prompt2',
        path: 'folder1/subfolder/prompt2',
        content: 'miau',
      },
      {
        id: 'prompt3',
        path: 'folder2/prompt3',
        content: 'miau',
      },
    ])
    const pullCommand = new PullCommand()
    await pullCommand.execute({ path: tempDir })
    const prompt1Content = await fs.readFile(
      path.join(promptsDir, 'folder1', 'prompt1.js'),
      'utf-8',
    )
    const prompt2Content = await fs.readFile(
      path.join(promptsDir, 'folder1', 'subfolder', 'prompt2.js'),
      'utf-8',
    )
    const prompt3Content = await fs.readFile(
      path.join(promptsDir, 'folder2', 'prompt3.js'),
      'utf-8',
    )
    expect(prompt1Content).toBe('export const prompt1 = `miau`')
    expect(prompt2Content).toBe('export const prompt2 = `miau`')
    expect(prompt3Content).toBe('export const prompt3 = `miau`')
    await expect(
      fs.access(path.join(promptsDir, 'folder1')),
    ).resolves.not.toThrow()
    await expect(
      fs.access(path.join(promptsDir, 'folder1', 'subfolder')),
    ).resolves.not.toThrow()
    await expect(
      fs.access(path.join(promptsDir, 'folder2')),
    ).resolves.not.toThrow()
  })
  it('overrides existing files with content from remote files', async () => {
    // First create an existing file
    await fs.mkdir(path.join(promptsDir, 'folder1'), { recursive: true })
    await fs.writeFile(
      path.join(promptsDir, 'folder1', 'prompt1.js'),
      'export const prompt1 = `old content`',
    )

    // Verify the file exists with old content
    const oldContent = await fs.readFile(
      path.join(promptsDir, 'folder1', 'prompt1.js'),
      'utf-8',
    )
    expect(oldContent).toBe('export const prompt1 = `old content`')

    // Now pull the new content
    mocks.fetchAllPromptsMock.mockResolvedValueOnce([
      {
        id: 'prompt1',
        path: 'folder1/prompt1',
        content: `this is a file
  with a tabbed middle line
that ends without a tab in the final line`,
      },
    ])

    const pullCommand = new PullCommand()
    await pullCommand.execute({ path: tempDir })

    // Check that the file was overridden with new content
    const newContent = await fs.readFile(
      path.join(promptsDir, 'folder1', 'prompt1.js'),
      'utf-8',
    )
    expect(newContent).toBe(`export const prompt1 = \`this is a file
  with a tabbed middle line
that ends without a tab in the final line\``)
  })
})
