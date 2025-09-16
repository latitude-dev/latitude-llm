import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PromptManager } from './promptManager'
import * as fs from 'fs/promises'
import * as path from 'path'

vi.mock('fs/promises')

describe('PromptManager.savePromptToFile', () => {
  const pm = new PromptManager()
  let mockFs: any

  beforeEach(() => {
    mockFs = vi.mocked(fs)
    vi.clearAllMocks()
    mockFs.mkdir.mockResolvedValue(undefined)
    mockFs.writeFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('writes ESM default export .js', async () => {
    const prompt = { path: 'emails/welcome', content: 'Hello' } as any
    const projectPath = '/project'
    const rootFolder = 'src/prompts'

    const saved = await pm.savePromptToFile(prompt, rootFolder, projectPath)

    const dirPath = path.join(projectPath, rootFolder, 'emails')
    const filePath = path.join(dirPath, 'welcome.js')

    expect(mockFs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true })
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      filePath,
      `export default ${JSON.stringify('Hello')}\n`,
    )
    expect(saved).toBe(path.join(rootFolder, 'emails', 'welcome.js'))
  })

  it('cleans prompt path and writes default export .js', async () => {
    const prompt = { path: '/greetings/hey', content: 'Hi' } as any
    const projectPath = '/project'
    const rootFolder = 'src/prompts'

    const saved = await pm.savePromptToFile(prompt, rootFolder, projectPath)

    const dirPath = path.join(projectPath, rootFolder, 'greetings')
    const filePath = path.join(dirPath, 'hey.js')

    expect(mockFs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true })
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      filePath,
      `export default ${JSON.stringify('Hi')}\n`,
    )
    expect(saved).toBe(path.join(rootFolder, 'greetings', 'hey.js'))
  })
})
