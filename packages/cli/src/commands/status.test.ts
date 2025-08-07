import * as fs from 'fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatusOptions } from '../types'
import { StatusCommand } from './status'

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
      npm: true,
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
      ).mockResolvedValue(['test.promptl', 'example.js'])
      vi.spyOn(statusCommand as any, 'readPromptContent')
        .mockResolvedValueOnce('promptl content')
        .mockResolvedValueOnce('js content')
      vi.spyOn(statusCommand as any, 'convertFilePathToPromptPath')
        .mockReturnValueOnce('test')
        .mockReturnValueOnce('example')
    })

    it('should read all local prompts successfully', async () => {
      mockFs.access.mockResolvedValue(undefined)

      const result = await (statusCommand as any).readLocalPrompts(
        'prompts',
        true,
      )

      expect(result).toEqual([
        { path: 'test', content: 'promptl content' },
        { path: 'example', content: 'js content' },
      ])
    })

    it('should return empty array when prompts directory does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory not found'))

      const result = await (statusCommand as any).readLocalPrompts(
        'prompts',
        true,
      )

      expect(result).toEqual([])
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No prompts directory found'),
      )
    })

    it('should skip files that cannot be read', async () => {
      mockFs.access.mockResolvedValue(undefined)
      vi.spyOn(statusCommand as any, 'readPromptContent')
        .mockResolvedValueOnce('promptl content')
        .mockRejectedValueOnce(new Error('Cannot read file'))

      const result = await (statusCommand as any).readLocalPrompts(
        'prompts',
        true,
      )

      expect(result).toEqual([
        { path: 'test', content: 'promptl content' },
        { path: 'example', content: 'js content' },
      ])
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

  describe('readPromptContent', () => {
    it('should read .promptl files directly', async () => {
      mockFs.readFile.mockResolvedValue('promptl content')

      const result = await (statusCommand as any).readPromptContent(
        '/path/test.promptl',
      )

      expect(mockFs.readFile).toHaveBeenCalledWith(
        '/path/test.promptl',
        'utf-8',
      )
      expect(result).toBe('promptl content')
    })

    it('should import JS files and extract prompt content', async () => {
      vi.spyOn(statusCommand as any, 'importPromptFromFile').mockResolvedValue(
        'js content',
      )

      const result = await (statusCommand as any).readPromptContent(
        '/path/test.js',
      )

      expect(result).toBe('js content')
    })

    it('should handle import failures for JS files', async () => {
      vi.spyOn(statusCommand as any, 'importPromptFromFile').mockRejectedValue(
        new Error('Import failed'),
      )

      await expect(
        (statusCommand as any).readPromptContent('/path/test.js'),
      ).rejects.toThrow('Cannot read prompt from /path/test.js')

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import prompt from /path/test.js'),
      )
    })
  })

  describe('convertToPromptVariableName', () => {
    it('should convert file name to camelCase', () => {
      const result = (statusCommand as any).convertToPromptVariableName(
        'test-prompt_name',
      )
      expect(result).toBe('testPromptName')
    })

    it('should handle single word', () => {
      const result = (statusCommand as any).convertToPromptVariableName('test')
      expect(result).toBe('test')
    })
  })

  describe('convertFilePathToPromptPath', () => {
    it('should remove file extensions', () => {
      expect(
        (statusCommand as any).convertFilePathToPromptPath('test.js'),
      ).toBe('test')
      expect(
        (statusCommand as any).convertFilePathToPromptPath('test.promptl'),
      ).toBe('test')
      expect(
        (statusCommand as any).convertFilePathToPromptPath('test.ts'),
      ).toBe('test')
      expect(
        (statusCommand as any).convertFilePathToPromptPath('test.cjs'),
      ).toBe('test')
    })
  })
})
