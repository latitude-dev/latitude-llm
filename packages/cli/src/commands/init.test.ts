import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InitCommand } from './init'
import { InitOptions } from '../types'
import * as fs from 'fs/promises'
import inquirer from 'inquirer'

vi.mock('fs/promises')
vi.mock('inquirer')
vi.mock('@latitude-data/sdk')

describe('InitCommand', () => {
  let initCommand: InitCommand
  let mockFs: any
  let mockInquirer: any

  beforeEach(() => {
    initCommand = new InitCommand()
    mockFs = vi.mocked(fs)
    mockInquirer = vi.mocked(inquirer)

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('execute', () => {
    const mockOptions: InitOptions = {
      path: '/test/project',
    }

    beforeEach(() => {
      // Mock the base command methods
      vi.spyOn(initCommand as any, 'setProjectPath').mockImplementation(
        () => {},
      )
      vi.spyOn(initCommand as any, 'setClient').mockResolvedValue({})
      vi.spyOn(initCommand as any, 'getOrPromptForApiKey').mockResolvedValue(
        'test-api-key',
      )
      vi.spyOn(initCommand as any, 'handleProjectSelection').mockResolvedValue(
        123,
      )

      // Mock lock file manager
      vi.spyOn(initCommand['lockFileManager'], 'exists').mockResolvedValue(
        false,
      )
      vi.spyOn(initCommand['lockFileManager'], 'write').mockResolvedValue()
    })

    it('should initialize a new project successfully', async () => {
      await initCommand.execute(mockOptions)

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Initializing Latitude project'),
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          '✅ Latitude project initialized successfully!',
        ),
      )
    })

    it('should handle existing lock file with user confirmation', async () => {
      vi.spyOn(initCommand['lockFileManager'], 'exists').mockResolvedValue(true)
      mockInquirer.prompt.mockResolvedValue({ overrideLock: true })

      await initCommand.execute(mockOptions)

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'overrideLock',
          message: expect.stringContaining(
            'latitude-lock.json file already exists',
          ),
        }),
      ])
    })

    it('should exit when user declines to override existing lock file', async () => {
      vi.spyOn(initCommand['lockFileManager'], 'exists').mockResolvedValue(true)
      mockInquirer.prompt.mockResolvedValue({ overrideLock: false })

      await initCommand.execute(mockOptions)

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Init cancelled'),
      )
      expect(process.exit).toHaveBeenCalledWith(0)
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error')
      vi.spyOn(initCommand as any, 'setClient').mockRejectedValue(error)
      vi.spyOn(initCommand as any, 'handleError').mockImplementation(() => {})

      await initCommand.execute(mockOptions)

      expect(initCommand['handleError']).toHaveBeenCalledWith(
        error,
        'Initialization',
      )
    })
  })

  describe('getOrPromptForApiKey', () => {
    it('should return existing API key if available', async () => {
      vi.spyOn(initCommand['configManager'], 'getApiKey').mockResolvedValue(
        'existing-key',
      )

      const result = await (initCommand as any).getOrPromptForApiKey()

      expect(result).toBe('existing-key')
    })

    it('should prompt for API key if none exists', async () => {
      vi.spyOn(initCommand['configManager'], 'getApiKey').mockRejectedValue(
        new Error('No key'),
      )
      vi.spyOn(initCommand['configManager'], 'setApiKey').mockResolvedValue()
      mockInquirer.prompt.mockResolvedValue({ apiKey: 'new-api-key' })

      const result = await (initCommand as any).getOrPromptForApiKey()

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'password',
          name: 'apiKey',
          message: 'Enter your Latitude API key:',
        }),
      ])
      expect(result).toBe('new-api-key')
    })
  })

  describe('handleProjectSelection', () => {
    beforeEach(() => {
      vi.spyOn(initCommand as any, 'createNewProject').mockResolvedValue(123)
      vi.spyOn(initCommand as any, 'useExistingProject').mockResolvedValue(456)
    })

    it('should create new project when selected', async () => {
      mockInquirer.prompt.mockResolvedValue({ projectChoice: 'new' })

      const result = await (initCommand as any).handleProjectSelection()

      expect(result).toBe(123)
      expect(initCommand['createNewProject']).toHaveBeenCalledWith()
    })

    it('should use existing project when selected', async () => {
      mockInquirer.prompt.mockResolvedValue({ projectChoice: 'existing' })

      const result = await (initCommand as any).handleProjectSelection()

      expect(result).toBe(456)
      expect(initCommand['useExistingProject']).toHaveBeenCalledWith()
    })
  })

  describe('createNewProject', () => {
    beforeEach(() => {
      mockInquirer.prompt.mockResolvedValue({ projectName: 'Test Project' })
      vi.spyOn(
        initCommand['projectManager'],
        'createProject',
      ).mockResolvedValue({
        projectId: 123,
        versionUuid: 'test-uuid',
      })
      vi.spyOn(initCommand as any, 'setupProjectStructure').mockResolvedValue(
        'prompts',
      )
      // @ts-expect-error - mock
      vi.spyOn(initCommand as any, 'createLockFile').mockResolvedValue()
    })

    it('should create a new project successfully', async () => {
      const result = await (initCommand as any).createNewProject()

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'input',
          name: 'projectName',
          message: 'Enter name for your new Latitude project:',
        }),
      ])
      expect(result).toBe(123)
    })
  })

  describe('useExistingProject', () => {
    beforeEach(() => {
      mockInquirer.prompt.mockResolvedValue({ existingProjectId: '456' })
      initCommand['client'] = {
        versions: {
          get: vi.fn().mockResolvedValue({ uuid: 'version-uuid' }),
        },
      } as any
      vi.spyOn(initCommand as any, 'setupProjectStructure').mockResolvedValue(
        'prompts',
      )
      // @ts-expect-error - mock
      vi.spyOn(initCommand as any, 'pullPrompts').mockResolvedValue()
      // @ts-expect-error - mock
      vi.spyOn(initCommand as any, 'createLockFile').mockResolvedValue()
    })

    it('should use existing project successfully', async () => {
      const result = await (initCommand as any).useExistingProject()

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'input',
          name: 'existingProjectId',
          message: 'Enter your existing Latitude project ID:',
        }),
      ])
      expect(result).toBe(456)
    })
  })

  describe('setupProjectStructure', () => {
    beforeEach(() => {
      vi.spyOn(
        initCommand['promptManager'],
        'determineRootFolder',
      ).mockResolvedValue('prompts')
      vi.spyOn(
        initCommand['promptManager'],
        'createPromptDirectory',
      ).mockResolvedValue()
      mockFs.access.mockResolvedValue(undefined)
      mockFs.readdir.mockResolvedValue([])
    })

    it('should setup project structure with empty directory', async () => {
      mockInquirer.prompt.mockResolvedValue({ userPromptsRoot: 'prompts' })

      const result = await (initCommand as any).setupProjectStructure()

      expect(result).toBe('prompts')
      expect(
        initCommand['promptManager'].createPromptDirectory,
      ).toHaveBeenCalledWith(initCommand['projectPath'], 'prompts')
    })

    it('should handle non-empty directory with user confirmation', async () => {
      mockFs.readdir.mockResolvedValue(['existing-file.txt'])
      mockInquirer.prompt
        .mockResolvedValueOnce({ userPromptsRoot: 'prompts' })
        .mockResolvedValueOnce({ confirmNonEmpty: true })

      const result = await (initCommand as any).setupProjectStructure()

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'confirmNonEmpty',
          message: expect.stringContaining('not empty'),
        }),
      ])
      expect(result).toBe('prompts')
    })
  })
})
