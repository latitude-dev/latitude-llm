import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CheckoutCommand } from './checkout'
import { CheckoutOptions } from '../types'

vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((text) => text),
    cyan: vi.fn((text) => text),
    green: vi.fn((text) => text),
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
  },
}))

describe('CheckoutCommand', () => {
  let checkoutCommand: CheckoutCommand

  beforeEach(() => {
    checkoutCommand = new CheckoutCommand()

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('execute', () => {
    const mockOptions: CheckoutOptions = {
      path: '/test/project',
    }

    const mockLockFile = {
      projectId: 123,
      rootFolder: 'prompts',
      version: 'current-version',
    }

    beforeEach(() => {
      // Mock base command methods
      vi.spyOn(
        checkoutCommand as any,
        'validateEnvironment',
        // @ts-expect-error - mock
      ).mockResolvedValue()
      vi.spyOn(checkoutCommand as any, 'getLockFile').mockResolvedValue(
        mockLockFile,
      )
      vi.spyOn(checkoutCommand as any, 'verifyVersion').mockResolvedValue({
        uuid: 'target-version',
        title: 'Target Version',
      })
      vi.spyOn(checkoutCommand as any, 'fetchAllPrompts').mockResolvedValue([
        { path: 'test', content: 'test content' },
      ])
      // @ts-expect-error - mock
      vi.spyOn(checkoutCommand as any, 'updateLockFile').mockResolvedValue()
      // @ts-expect-error - mock
      vi.spyOn(checkoutCommand as any, 'savePrompts').mockResolvedValue()
    })

    it('should checkout to existing version successfully', async () => {
      await checkoutCommand.execute('target-version', mockOptions)

      expect(checkoutCommand['validateEnvironment']).toHaveBeenCalledWith(
        mockOptions,
      )
      expect(checkoutCommand['verifyVersion']).toHaveBeenCalledWith(
        123,
        'target-version',
      )
      expect(checkoutCommand['updateLockFile']).toHaveBeenCalledWith(
        123,
        'prompts',
        'target-version',
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Successfully checked out version target-version',
        ),
      )
    })

    it('should create new version with -b flag', async () => {
      const optionsWithBranch: CheckoutOptions = {
        path: '/test/project',
        branch: 'new-branch',
      }

      vi.spyOn(checkoutCommand as any, 'createNewVersion').mockResolvedValue({
        uuid: 'new-version-uuid',
      })

      await checkoutCommand.execute(undefined, optionsWithBranch)

      expect(checkoutCommand['createNewVersion']).toHaveBeenCalledWith(
        123,
        'new-branch',
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Created new version: new-version-uuid'),
      )
    })

    it('should throw error when both version UUID and -b flag provided', async () => {
      const optionsWithBranch: CheckoutOptions = {
        path: '/test/project',
        branch: 'new-branch',
      }

      await expect(
        checkoutCommand.execute('target-version', optionsWithBranch),
      ).rejects.toThrow()
    })

    it('should throw error when no version UUID provided and no -b flag', async () => {
      await expect(
        checkoutCommand.execute(undefined, mockOptions),
      ).rejects.toThrow()
    })

    it('should revert lock file on error', async () => {
      const error = new Error('Test error')
      vi.spyOn(checkoutCommand as any, 'verifyVersion').mockRejectedValue(error)
      vi.spyOn(checkoutCommand as any, 'handleError').mockImplementation(
        () => {},
      )
      vi.spyOn(checkoutCommand['lockFileManager'], 'write').mockResolvedValue()

      await checkoutCommand.execute('target-version', mockOptions)

      expect(checkoutCommand['lockFileManager'].write).toHaveBeenCalledWith(
        checkoutCommand['projectPath'],
        mockLockFile,
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Reverting lock file to original version'),
      )
    })

    it('should handle lock file revert errors', async () => {
      const error = new Error('Test error')
      const revertError = new Error('Revert error')
      vi.spyOn(checkoutCommand as any, 'verifyVersion').mockRejectedValue(error)
      vi.spyOn(checkoutCommand as any, 'handleError').mockImplementation(
        () => {},
      )
      vi.spyOn(checkoutCommand['lockFileManager'], 'write').mockRejectedValue(
        revertError,
      )

      await checkoutCommand.execute('target-version', mockOptions)

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to revert lock file'),
      )
    })
  })

  describe('createNewVersion', () => {
    beforeEach(() => {
      vi.spyOn(
        checkoutCommand['projectManager'],
        'createVersion',
      ).mockResolvedValue(
        expect.objectContaining({
          uuid: 'new-version-uuid',
          title: 'New Version',
          id: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          description: null,
          mergedAt: null,
          deletedAt: null,
          projectId: 123,
          userId: '1',
        }),
      )
    })

    it('should create new version successfully', async () => {
      const result = await (checkoutCommand as any).createNewVersion(
        123,
        'new-branch',
      )

      expect(
        checkoutCommand['projectManager'].createVersion,
      ).toHaveBeenCalledWith(checkoutCommand['client'], 'new-branch', 123)
      expect(result).toEqual(
        expect.objectContaining({
          createdAt: '2024-01-01T00:00:00Z',
          deletedAt: null,
          description: null,
          id: 1,
          mergedAt: null,
          projectId: 123,
          title: 'New Version',
          updatedAt: '2024-01-01T00:00:00Z',
          userId: '1',
          uuid: 'new-version-uuid',
        }),
      )
    })

    it('should handle creation errors', async () => {
      const error = new Error('Creation failed')
      vi.spyOn(
        checkoutCommand['projectManager'],
        'createVersion',
      ).mockRejectedValue(error)

      await expect(
        (checkoutCommand as any).createNewVersion(123, 'new-branch'),
      ).rejects.toThrow('Failed to create new version: Creation failed')
    })
  })

  describe('verifyVersion', () => {
    beforeEach(() => {
      vi.spyOn(
        checkoutCommand['projectManager'],
        'getVersion',
        // @ts-expect-error - mock
      ).mockResolvedValue({
        uuid: 'version-uuid',
        title: 'Version Title',
      })
    })

    it('should verify version successfully', async () => {
      const result = await (checkoutCommand as any).verifyVersion(
        123,
        'version-uuid',
      )

      expect(checkoutCommand['projectManager'].getVersion).toHaveBeenCalledWith(
        checkoutCommand['client'],
        123,
        'version-uuid',
      )
      expect(result).toEqual({
        uuid: 'version-uuid',
        title: 'Version Title',
      })
    })

    it('should handle verification errors', async () => {
      const error = new Error('Version not found')
      vi.spyOn(
        checkoutCommand['projectManager'],
        'getVersion',
      ).mockRejectedValue(error)

      await expect(
        (checkoutCommand as any).verifyVersion(123, 'invalid-version'),
      ).rejects.toThrow(
        'Invalid version UUID or unable to fetch prompts: Version not found',
      )
    })
  })

  describe('updateLockFile', () => {
    beforeEach(() => {
      checkoutCommand['originalLockFile'] = {
        projectId: 123,
        rootFolder: 'prompts',
        version: 'old-version',
      }
      vi.spyOn(checkoutCommand['lockFileManager'], 'write').mockResolvedValue()
    })

    it('should update lock file successfully', async () => {
      await (checkoutCommand as any).updateLockFile(
        123,
        'prompts',
        'new-version',
      )

      expect(checkoutCommand['lockFileManager'].write).toHaveBeenCalledWith(
        checkoutCommand['projectPath'],
        {
          projectId: 123,
          rootFolder: 'prompts',
          version: 'new-version',
        },
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Updated latitude-lock.json with version: new-version',
        ),
      )
    })

    it('should handle update errors', async () => {
      const error = new Error('Write failed')
      vi.spyOn(checkoutCommand['lockFileManager'], 'write').mockRejectedValue(
        error,
      )

      await expect(
        (checkoutCommand as any).updateLockFile(123, 'prompts', 'new-version'),
      ).rejects.toThrow('Failed to update lock file: Write failed')
    })
  })

  describe('fetchAllPrompts', () => {
    beforeEach(() => {
      vi.spyOn(
        checkoutCommand['projectManager'],
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
    })

    it('should fetch all prompts successfully', async () => {
      const result = await (checkoutCommand as any).fetchAllPrompts(
        123,
        'version-uuid',
      )

      expect(
        checkoutCommand['projectManager'].fetchAllPrompts,
      ).toHaveBeenCalledWith(checkoutCommand['client'], 123, 'version-uuid')
      expect(result).toHaveLength(1)
      expect(console.log).toHaveBeenCalledWith('fetch all prompts')
    })

    it('should handle fetch errors', async () => {
      const error = new Error('Fetch failed')
      vi.spyOn(
        checkoutCommand['projectManager'],
        'fetchAllPrompts',
      ).mockRejectedValue(error)

      await expect(
        (checkoutCommand as any).fetchAllPrompts(123, 'version-uuid'),
      ).rejects.toThrow('Failed to fetch prompts: Fetch failed')
    })
  })

  describe('savePrompts', () => {
    beforeEach(() => {
      // Mock savePrompts function
      vi.doMock('../utils/promptOperations', () => ({
        savePrompts: vi.fn().mockResolvedValue(undefined),
      }))
    })

    it('should save prompts successfully', async () => {
      const mockPrompts = [
        {
          path: 'test',
          content: 'test content',
          versionUuid: 'v1',
          uuid: 'prompt-1',
          config: {},
          parameters: {},
        },
      ]

      await (checkoutCommand as any).savePrompts(
        'prompts',
        'version-uuid',
        mockPrompts,
      )

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Processing 1 prompts from version version-uuid',
        ),
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Successfully saved prompts from version version-uuid',
        ),
      )
    })
  })
})
