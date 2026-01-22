import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PullCommand } from './pull'
import { PullOptions } from '../types'
import * as fs from 'fs/promises'

vi.mock('fs/promises')
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((text) => text),
    cyan: { bold: vi.fn((text) => text) },
    gray: vi.fn((text) => text),
    green: vi.fn((text) => text),
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
  },
}))

describe('PullCommand', () => {
  let pullCommand: PullCommand
  let mockFs: any

  beforeEach(() => {
    pullCommand = new PullCommand()
    mockFs = vi.mocked(fs)

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('execute', () => {
    const mockOptions: PullOptions = {
      path: '/test/project',
      yes: false,
    }

    const mockLockFile = {
      projectId: 123,
      rootFolder: 'prompts',
      version: 'test-version',
    }

    beforeEach(() => {
      // Mock base command methods
      // @ts-expect-error - mock
      vi.spyOn(pullCommand as any, 'validateEnvironment').mockResolvedValue()
      vi.spyOn(pullCommand as any, 'getLockFile').mockResolvedValue(
        mockLockFile,
      )
      vi.spyOn(pullCommand as any, 'computePullDiff').mockResolvedValue([])
      vi.spyOn(pullCommand as any, 'showChangesSummary').mockReturnValue(false)
      vi.spyOn(pullCommand as any, 'handleUserChoice').mockResolvedValue(true)
      // @ts-expect-error - mock
      vi.spyOn(pullCommand as any, 'pullPrompts').mockResolvedValue()

      // Mock client
      pullCommand['client'] = {
        versions: {
          get: vi.fn().mockResolvedValue({
            title: 'Test Version',
            description: 'Test description',
          }),
        },
      } as any
    })

    it('should execute pull successfully with no changes', async () => {
      await pullCommand.execute(mockOptions)

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No changes detected'),
      )
    })

    it('should execute pull successfully with changes', async () => {
      const mockDiffResults = [
        {
          path: 'test.promptl',
          status: 'modified' as const,
          localContent: 'new content',
          remoteContent: 'old content',
          contentHash: 'hash123',
        },
      ]

      vi.spyOn(pullCommand as any, 'computePullDiff').mockResolvedValue(
        mockDiffResults,
      )
      vi.spyOn(pullCommand as any, 'showChangesSummary').mockReturnValue(true)

      await pullCommand.execute(mockOptions)

      expect(pullCommand['handleUserChoice']).toHaveBeenCalledWith(
        mockDiffResults,
        true,
        false,
      )
      expect(pullCommand['pullPrompts']).toHaveBeenCalledWith(
        123,
        'prompts',
        'test-version',
      )
    })

    it('should skip pull when user declines', async () => {
      const mockDiffResults = [
        {
          path: 'test.promptl',
          status: 'modified' as const,
          localContent: 'new content',
          remoteContent: 'old content',
          contentHash: 'hash123',
        },
      ]

      vi.spyOn(pullCommand as any, 'computePullDiff').mockResolvedValue(
        mockDiffResults,
      )
      vi.spyOn(pullCommand as any, 'showChangesSummary').mockReturnValue(true)
      vi.spyOn(pullCommand as any, 'handleUserChoice').mockResolvedValue(false)

      await pullCommand.execute(mockOptions)

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Pull operation canceled'),
      )
      expect(pullCommand['pullPrompts']).not.toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error')
      vi.spyOn(pullCommand as any, 'validateEnvironment').mockRejectedValue(
        error,
      )
      vi.spyOn(pullCommand as any, 'handleError').mockImplementation(() => {})

      await pullCommand.execute(mockOptions)

      expect(pullCommand['handleError']).toHaveBeenCalledWith(error, 'Pull')
    })
  })

  describe('computePullDiff', () => {
    beforeEach(() => {
      pullCommand['client'] = {
        prompts: {
          getAll: vi.fn().mockResolvedValue([
            {
              path: 'test.promptl',
              content: 'remote content',
              versionUuid: 'v1',
              uuid: 'prompt-1',
              config: {},
              parameters: {},
            },
          ]),
        },
      } as any

      vi.spyOn(pullCommand as any, 'readLocalPrompts').mockResolvedValue([
        {
          path: 'test.promptl',
          content: 'local content',
        },
      ])
    })

    it('should compute diff between remote and local prompts', async () => {
      const result = await (pullCommand as any).computePullDiff(
        123,
        'prompts',
        'test-version',
      )

      expect(pullCommand['client']!.prompts.getAll).toHaveBeenCalledWith({
        projectId: 123,
        versionUuid: 'test-version',
      })
      expect(result).toBeDefined()
    })

    it('should handle diff computation errors', async () => {
      const error = new Error('API error')
      pullCommand['client']!.prompts.getAll = vi.fn().mockRejectedValue(error)

      await expect(
        (pullCommand as any).computePullDiff(123, 'prompts', 'test-version'),
      ).rejects.toThrow('Failed to compute diff: API error')
    })
  })

  describe('readLocalPrompts', () => {
    beforeEach(() => {
      pullCommand['projectPath'] = '/test/project'
      vi.spyOn(
        pullCommand['promptManager'],
        'findAllPromptFiles',
      ).mockResolvedValue(['test.promptl', 'example.promptl'])
    })

    it('should read all local prompts successfully', async () => {
      mockFs.access.mockResolvedValue(undefined)
      mockFs.readFile
        .mockResolvedValueOnce('promptl content')
        .mockResolvedValueOnce('example content')

      const result = await (pullCommand as any).readLocalPrompts('prompts')

      expect(result).toEqual([
        { path: 'test', content: 'promptl content' },
        { path: 'example', content: 'example content' },
      ])
    })

    it('should return empty array when prompts directory does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory not found'))

      const result = await (pullCommand as any).readLocalPrompts('prompts')

      expect(result).toEqual([])
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No local prompts directory found'),
      )
    })

    it('should skip files that cannot be read', async () => {
      mockFs.access.mockResolvedValue(undefined)
      mockFs.readFile
        .mockResolvedValueOnce('promptl content')
        .mockRejectedValueOnce(new Error('Cannot read file'))

      const result = await (pullCommand as any).readLocalPrompts('prompts')

      expect(result).toEqual([{ path: 'test', content: 'promptl content' }])
    })
  })

  describe('pullPrompts', () => {
    beforeEach(() => {
      vi.spyOn(
        pullCommand['projectManager'],
        'fetchAllPrompts',
      ).mockResolvedValue([
        {
          path: 'test',
          content: 'test content',
          versionUuid: 'v1',
          uuid: 'prompt-1',
          config: {},
          parameters: {},
        },
      ])

      // Mock savePrompts function
      vi.doMock('../utils/promptOperations', () => ({
        savePrompts: vi.fn().mockResolvedValue(undefined),
      }))
    })

    it('should pull prompts successfully', async () => {
      await (pullCommand as any).pullPrompts(123, 'prompts', 'test-version')

      expect(
        pullCommand['projectManager'].fetchAllPrompts,
      ).toHaveBeenCalledWith(pullCommand['client'], 123, 'test-version')
    })

    it('should handle pull errors', async () => {
      const error = new Error('Fetch failed')
      vi.spyOn(
        pullCommand['projectManager'],
        'fetchAllPrompts',
      ).mockRejectedValue(error)

      await expect(
        (pullCommand as any).pullPrompts(123, 'prompts', 'test-version'),
      ).rejects.toThrow('Failed to pull prompts: Fetch failed')
    })
  })
})
