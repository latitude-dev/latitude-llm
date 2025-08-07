import * as fs from 'fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PushOptions } from '../types'
import { PushCommand } from './push'

vi.mock('fs/promises')
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((text) => text),
    cyan: vi.fn((text) => text),
    green: vi.fn((text) => text),
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
  },
}))

describe('PushCommand', () => {
  let pushCommand: PushCommand
  let mockFs: any

  beforeEach(() => {
    pushCommand = new PushCommand()
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
    const mockOptions: PushOptions = {
      path: '/test/project',
      yes: false,
    }

    const mockLockFile = {
      projectId: 123,
      rootFolder: 'prompts',
      version: 'test-version',
      npm: true,
    }

    beforeEach(() => {
      // Mock base command methods
      // @ts-expect-error - mock
      vi.spyOn(pushCommand as any, 'validateEnvironment').mockResolvedValue()
      vi.spyOn(pushCommand as any, 'getLockFile').mockResolvedValue(
        mockLockFile,
      )
      vi.spyOn(pushCommand as any, 'readLocalPrompts').mockResolvedValue([])
      vi.spyOn(pushCommand as any, 'getDiffWithRemote').mockResolvedValue([])
      // @ts-expect-error - mock
      vi.spyOn(pushCommand as any, 'displayDiffSummary').mockResolvedValue()
    })

    it('should execute push successfully', async () => {
      await pushCommand.execute(mockOptions)

      expect(pushCommand['validateEnvironment']).toHaveBeenCalledWith(
        mockOptions,
      )
      expect(pushCommand['getLockFile']).toHaveBeenCalled()
      expect(pushCommand['readLocalPrompts']).toHaveBeenCalledWith(
        'prompts',
        true,
      )
      expect(pushCommand['displayDiffSummary']).toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error')
      vi.spyOn(pushCommand as any, 'validateEnvironment').mockRejectedValue(
        error,
      )
      vi.spyOn(pushCommand as any, 'handleError').mockImplementation(() => {})

      await pushCommand.execute(mockOptions)

      expect(pushCommand['handleError']).toHaveBeenCalledWith(error, 'Push')
    })
  })

  describe('readLocalPrompts', () => {
    beforeEach(() => {
      pushCommand['projectPath'] = '/test/project'
      vi.spyOn(
        pushCommand['promptManager'],
        'findAllPromptFiles',
      ).mockResolvedValue(['test.promptl', 'example.js'])
      vi.spyOn(pushCommand as any, 'readPromptContent')
        .mockResolvedValueOnce('promptl content')
        .mockResolvedValueOnce('js content')
      vi.spyOn(pushCommand as any, 'convertFilePathToPromptPath')
        .mockReturnValueOnce('test')
        .mockReturnValueOnce('example')
    })

    it('should read all local prompts successfully', async () => {
      mockFs.access.mockResolvedValue(undefined)

      const result = await (pushCommand as any).readLocalPrompts(
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

      const result = await (pushCommand as any).readLocalPrompts(
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
      vi.spyOn(pushCommand as any, 'readPromptContent')
        .mockResolvedValueOnce('promptl content')
        .mockRejectedValueOnce(new Error('Cannot read file'))

      const result = await (pushCommand as any).readLocalPrompts(
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
      pushCommand['client'] = {
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

      const result = await (pushCommand as any).getDiffWithRemote(
        123,
        'test-version',
        localPrompts,
      )

      expect(pushCommand['client']!.prompts.getAll).toHaveBeenCalledWith({
        projectId: 123,
        versionUuid: 'test-version',
      })
      expect(result).toBeDefined()
    })

    it('should handle diff computation errors', async () => {
      const error = new Error('API error')
      pushCommand['client']!.prompts.getAll = vi.fn().mockRejectedValue(error)

      await expect(
        (pushCommand as any).getDiffWithRemote(123, 'test-version', []),
      ).rejects.toThrow('Failed to compute diff: API error')
    })
  })

  describe('displayDiffSummary', () => {
    const mockOptions: PushOptions = {
      path: '/test/project',
      yes: false,
    }

    beforeEach(() => {
      vi.spyOn(pushCommand as any, 'showChangesSummary').mockReturnValue(true)
      vi.spyOn(pushCommand as any, 'handleUserChoice').mockResolvedValue(true)
      // @ts-expect-error - mock
      vi.spyOn(pushCommand as any, 'executePush').mockResolvedValue()
    })

    it('should display diff summary and execute push when user accepts', async () => {
      const mockDiffResults = [
        {
          path: 'test.promptl',
          status: 'modified' as const,
          localContent: 'new content',
          remoteContent: 'old content',
          contentHash: 'hash123',
        },
      ]

      await (pushCommand as any).displayDiffSummary(
        mockDiffResults,
        mockOptions,
      )

      expect(pushCommand['handleUserChoice']).toHaveBeenCalledWith(
        mockDiffResults,
        false,
        false,
      )
      expect(pushCommand['executePush']).toHaveBeenCalledWith(mockDiffResults)
    })

    it('should not execute push when user declines', async () => {
      const mockDiffResults = [
        {
          path: 'test.promptl',
          status: 'modified' as const,
          localContent: 'new content',
          remoteContent: 'old content',
          contentHash: 'hash123',
        },
      ]

      vi.spyOn(pushCommand as any, 'handleUserChoice').mockResolvedValue(false)

      await (pushCommand as any).displayDiffSummary(
        mockDiffResults,
        mockOptions,
      )

      expect(pushCommand['executePush']).not.toHaveBeenCalled()
    })

    it('should return early when no changes detected', async () => {
      vi.spyOn(pushCommand as any, 'showChangesSummary').mockReturnValue(false)

      await (pushCommand as any).displayDiffSummary([], mockOptions)

      expect(pushCommand['handleUserChoice']).not.toHaveBeenCalled()
      expect(pushCommand['executePush']).not.toHaveBeenCalled()
    })
  })

  describe('executePush', () => {
    beforeEach(() => {
      pushCommand['client'] = {
        versions: {
          push: vi.fn().mockResolvedValue(undefined),
        },
      } as any

      vi.spyOn(pushCommand as any, 'getLockFile').mockResolvedValue({
        projectId: 123,
        version: 'test-version',
      })
    })

    it('should execute push successfully', async () => {
      const mockDiffResults = [
        {
          path: 'test.promptl',
          status: 'modified' as const,
          localContent: 'new content',
          remoteContent: 'old content',
          contentHash: 'hash123',
        },
      ]

      await (pushCommand as any).executePush(mockDiffResults)

      expect(pushCommand['client']!.versions.push).toHaveBeenCalledWith(
        123,
        'test-version',
        [
          {
            path: 'test.promptl',
            content: 'new content',
            status: 'modified',
            contentHash: 'hash123',
          },
        ],
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Successfully pushed changes'),
      )
    })

    it('should handle push errors', async () => {
      const error = new Error('Push failed')
      pushCommand['client']!.versions.push = vi.fn().mockRejectedValue(error)

      const mockDiffResults = [
        {
          path: 'test.promptl',
          status: 'modified' as const,
          localContent: 'new content',
          remoteContent: 'old content',
          contentHash: 'hash123',
        },
      ]

      await expect(
        (pushCommand as any).executePush(mockDiffResults),
      ).rejects.toThrow(error)

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to push changes'),
      )
    })
  })

  describe('readPromptContent', () => {
    it('should read .promptl files directly', async () => {
      mockFs.readFile.mockResolvedValue('promptl content')

      const result = await (pushCommand as any).readPromptContent(
        '/path/test.promptl',
      )

      expect(mockFs.readFile).toHaveBeenCalledWith(
        '/path/test.promptl',
        'utf-8',
      )
      expect(result).toBe('promptl content')
    })

    it('should import JS files and extract prompt content', async () => {
      vi.spyOn(pushCommand as any, 'importPromptFromFile').mockResolvedValue(
        'js content',
      )

      const result = await (pushCommand as any).readPromptContent(
        '/path/test.js',
      )

      expect(result).toBe('js content')
    })
  })

  describe('convertToPromptVariableName', () => {
    it('should convert file name to camelCase', () => {
      const result = (pushCommand as any).convertToPromptVariableName(
        'test-prompt_name',
      )
      expect(result).toBe('testPromptName')
    })

    it('should handle single word', () => {
      const result = (pushCommand as any).convertToPromptVariableName('test')
      expect(result).toBe('test')
    })
  })

  describe('convertFilePathToPromptPath', () => {
    it('should remove file extensions', () => {
      expect((pushCommand as any).convertFilePathToPromptPath('test.js')).toBe(
        'test',
      )
      expect(
        (pushCommand as any).convertFilePathToPromptPath('test.promptl'),
      ).toBe('test')
      expect((pushCommand as any).convertFilePathToPromptPath('test.ts')).toBe(
        'test',
      )
      expect((pushCommand as any).convertFilePathToPromptPath('test.cjs')).toBe(
        'test',
      )
    })
  })
})
