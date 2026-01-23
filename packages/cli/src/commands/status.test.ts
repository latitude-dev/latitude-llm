import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StatusCommand } from './status'
import { StatusOptions } from '../types'
import * as fs from 'fs/promises'

const mocks = vi.hoisted(() => ({
  blue: vi.fn((text) => text),
}))

// @ts-expect-error - mock
mocks.blue.bold = vi.fn((text) => text)

vi.mock('fs/promises')
vi.mock('chalk', () => ({
  default: {
    blue: mocks.blue,
    cyan: {
      bold: vi.fn((text) => text),
    },
    gray: vi.fn((text) => text),
    green: vi.fn((text) => text),
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
  },
}))

describe('StatusCommand', () => {
  let statusCommand: StatusCommand
  let mockFs: any

  beforeEach(() => {
    statusCommand = new StatusCommand()
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
    const mockOptions: StatusOptions = {
      path: '/test/project',
    }

    const mockLockFile = {
      projectId: 123,
      rootFolder: 'prompts',
      version: 'test-version',
    }

    const mockVersionDetails = {
      title: 'Test Version',
      description: 'Test version description',
    }

    beforeEach(() => {
      // Mock base command methods
      // @ts-expect-error - mock
      vi.spyOn(statusCommand as any, 'validateEnvironment').mockResolvedValue()
      vi.spyOn(statusCommand as any, 'getLockFile').mockResolvedValue(
        mockLockFile,
      )
      vi.spyOn(statusCommand as any, 'readLocalPrompts').mockResolvedValue([])
      vi.spyOn(statusCommand as any, 'getDiffWithRemote').mockResolvedValue([])
      vi.spyOn(statusCommand as any, 'showChangesSummary').mockReturnValue(
        false,
      )

      // Mock client
      statusCommand['client'] = {
        versions: {
          get: vi.fn().mockResolvedValue(mockVersionDetails),
        },
      } as any
    })

    it('should execute status successfully', async () => {
      await statusCommand.execute(mockOptions)

      expect(statusCommand['validateEnvironment']).toHaveBeenCalledWith(
        mockOptions,
      )
      expect(statusCommand['getLockFile']).toHaveBeenCalled()
      expect(statusCommand['client']!.versions.get).toHaveBeenCalledWith(
        123,
        'test-version',
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Latitude Project Status'),
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Project 123'),
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Version Test Version'),
      )
    })

    it('should display version description when available', async () => {
      await statusCommand.execute(mockOptions)

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Test version description'),
      )
    })

    it('should handle missing version description', async () => {
      statusCommand['client'] = {
        versions: {
          get: vi.fn().mockResolvedValue({
            title: 'Test Version',
            description: null,
          }),
        },
      } as any

      await statusCommand.execute(mockOptions)

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Version Test Version'),
      )
    })

    it('should show changes summary when prompts can be analyzed', async () => {
      const mockDiffResults = [
        {
          path: 'test.promptl',
          status: 'modified' as const,
          localContent: 'new content',
          remoteContent: 'old content',
          contentHash: 'hash123',
        },
      ]

      vi.spyOn(statusCommand as any, 'getDiffWithRemote').mockResolvedValue(
        mockDiffResults,
      )
      vi.spyOn(statusCommand as any, 'showChangesSummary').mockReturnValue(true)

      await statusCommand.execute(mockOptions)

      expect(statusCommand['showChangesSummary']).toHaveBeenCalledWith(
        mockDiffResults,
      )
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error')
      vi.spyOn(statusCommand as any, 'validateEnvironment').mockRejectedValue(
        error,
      )
      vi.spyOn(statusCommand as any, 'handleError').mockImplementation(() => {})

      await statusCommand.execute(mockOptions)

      expect(statusCommand['handleError']).toHaveBeenCalledWith(
        error,
        'Status check',
      )
    })
  })

  describe('readLocalPrompts', () => {
    beforeEach(() => {
      statusCommand['projectPath'] = '/test/project'
      vi.spyOn(
        statusCommand['promptManager'],
        'findAllPromptFiles',
      ).mockResolvedValue(['test.promptl', 'example.promptl'])
    })

    it('should read all local prompts successfully', async () => {
      mockFs.access.mockResolvedValue(undefined)
      mockFs.readFile
        .mockResolvedValueOnce('promptl content')
        .mockResolvedValueOnce('example content')

      const result = await (statusCommand as any).readLocalPrompts('prompts')

      expect(result).toEqual([
        { path: 'test', content: 'promptl content' },
        { path: 'example', content: 'example content' },
      ])
    })

    it('should return empty array when prompts directory does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory not found'))

      const result = await (statusCommand as any).readLocalPrompts('prompts')

      expect(result).toEqual([])
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No prompts directory found'),
      )
    })

    it('should skip files that cannot be read', async () => {
      mockFs.access.mockResolvedValue(undefined)
      mockFs.readFile
        .mockResolvedValueOnce('promptl content')
        .mockRejectedValueOnce(new Error('Cannot read file'))

      const result = await (statusCommand as any).readLocalPrompts('prompts')

      expect(result).toEqual([{ path: 'test', content: 'promptl content' }])
    })
  })

  describe('getDiffWithRemote', () => {
    beforeEach(() => {
      statusCommand['client'] = {
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
    })

    it('should get diff with remote prompts', async () => {
      const localPrompts = [{ path: 'test.promptl', content: 'local content' }]

      const result = await (statusCommand as any).getDiffWithRemote(
        123,
        'test-version',
        localPrompts,
      )

      expect(statusCommand['client']!.prompts.getAll).toHaveBeenCalledWith({
        projectId: 123,
        versionUuid: 'test-version',
      })
      expect(result).toBeDefined()
    })

    it('should handle diff computation errors', async () => {
      const error = new Error('API error')
      statusCommand['client']!.prompts.getAll = vi.fn().mockRejectedValue(error)

      await expect(
        (statusCommand as any).getDiffWithRemote(123, 'test-version', []),
      ).rejects.toThrow('Failed to compute diff: API error')
    })
  })
})
