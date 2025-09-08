import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import inquirer from 'inquirer'
import { LoginCommand } from './login'

vi.mock('inquirer')

describe('LoginCommand', () => {
  let loginCommand: LoginCommand
  let mockInquirer: any
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    loginCommand = new LoginCommand()
    mockInquirer = vi.mocked(inquirer)

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // Reset env
    process.env = { ...ORIGINAL_ENV }
    delete process.env.LATITUDE_API_KEY
  })

  afterEach(() => {
    vi.clearAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  it('should prompt and save API key when none configured', async () => {
    vi.spyOn(loginCommand['configManager'], 'getApiKey').mockRejectedValue(
      new Error('No key'),
    )
    vi.spyOn(loginCommand['configManager'], 'setApiKey').mockResolvedValue()

    mockInquirer.prompt.mockResolvedValue({ apiKey: 'new-api-key' })

    await loginCommand.execute({})

    expect(mockInquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'password',
        name: 'apiKey',
      }),
    ])
    expect(loginCommand['configManager'].setApiKey).toHaveBeenCalledWith(
      'new-api-key',
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('API key saved to system keychain'),
    )
  })

  it('should accept --api-key flag and not prompt for key', async () => {
    vi.spyOn(loginCommand['configManager'], 'getApiKey').mockRejectedValue(
      new Error('No key'),
    )
    vi.spyOn(loginCommand['configManager'], 'setApiKey').mockResolvedValue()

    await loginCommand.execute({ apiKey: 'flag-key' })

    // Should not prompt for apiKey
    expect(mockInquirer.prompt).not.toHaveBeenCalled()
    expect(loginCommand['configManager'].setApiKey).toHaveBeenCalledWith(
      'flag-key',
    )
  })

  it('should warn when LATITUDE_API_KEY is set', async () => {
    process.env.LATITUDE_API_KEY = 'env-key'
    vi.spyOn(loginCommand['configManager'], 'getApiKey').mockRejectedValue(
      new Error('No key'),
    )
    vi.spyOn(loginCommand['configManager'], 'setApiKey').mockResolvedValue()
    mockInquirer.prompt.mockResolvedValue({ apiKey: 'new-api-key' })

    await loginCommand.execute({})

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('LATITUDE_API_KEY environment variable is set'),
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('unset it to use the stored key'),
    )
  })

  it('should confirm override if an API key exists and cancel when declined', async () => {
    vi.spyOn(loginCommand['configManager'], 'getApiKey').mockResolvedValue(
      'existing-key',
    )
    vi.spyOn(loginCommand['configManager'], 'setApiKey').mockResolvedValue()

    // First prompt is confirmation, user declines
    mockInquirer.prompt.mockResolvedValue({ confirm: false })

    await loginCommand.execute({})

    expect(mockInquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'confirm',
        name: 'confirm',
      }),
    ])
    expect(loginCommand['configManager'].setApiKey).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Login cancelled'),
    )
  })

  it('should force override without confirmation when --force is provided', async () => {
    vi.spyOn(loginCommand['configManager'], 'getApiKey').mockResolvedValue(
      'existing-key',
    )
    vi.spyOn(loginCommand['configManager'], 'setApiKey').mockResolvedValue()

    await loginCommand.execute({ force: true, apiKey: 'forced-key' })

    // No prompts at all
    expect(mockInquirer.prompt).not.toHaveBeenCalled()
    expect(loginCommand['configManager'].setApiKey).toHaveBeenCalledWith(
      'forced-key',
    )
  })

  it('should prompt to confirm and then override when confirmed', async () => {
    vi.spyOn(loginCommand['configManager'], 'getApiKey').mockResolvedValue(
      'existing-key',
    )
    vi.spyOn(loginCommand['configManager'], 'setApiKey').mockResolvedValue()

    // First prompt confirmation -> true, second prompt apiKey
    mockInquirer.prompt
      .mockResolvedValueOnce({ confirm: true })
      .mockResolvedValueOnce({ apiKey: 'new-key' })

    await loginCommand.execute({})

    expect(loginCommand['configManager'].setApiKey).toHaveBeenCalledWith(
      'new-key',
    )
  })

  it('should handle errors and call handleError', async () => {
    const error = new Error('set failed')
    vi.spyOn(loginCommand['configManager'], 'getApiKey').mockRejectedValue(
      new Error('No key'),
    )
    vi.spyOn(loginCommand['configManager'], 'setApiKey').mockRejectedValue(
      error,
    )
    vi.spyOn(loginCommand as any, 'handleError').mockImplementation(() => {})

    mockInquirer.prompt.mockResolvedValue({ apiKey: 'x' })

    await loginCommand.execute({})

    expect((loginCommand as any).handleError).toHaveBeenCalledWith(
      error,
      'Login',
    )
  })
})
