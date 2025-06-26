import { Workspace } from '@latitude-data/core/workspace'
import { User } from '@latitude-data/core/user'
import { ApiKey } from '@latitude-data/core/apiKey'
import { ApiKeysRepository } from '@latitude-data/core/repositories/apiKeysRepository'
import { Result } from '@latitude-data/core'
import { updateApiKeyAction } from './update'

jest.mock('@latitude-data/core/services/apiKeys/update', () => ({
  updateApiKey: jest.fn(),
}))
import { updateApiKey } from '@latitude-data/core/services/apiKeys/update'

describe('updateApiKeyAction', () => {
  const mockWorkspace = new Workspace({ id: 1, name: 'Test Workspace' })
  const mockUser = new User({ id: 'user-1', email: 'test@example.com' })
  const mockApiKey = new ApiKey({
    id: 1,
    name: 'Test API Key',
    token: 'test-token',
    workspaceId: mockWorkspace.id,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should call updateApiKey with correct parameters and return the updated API key', async () => {
    const updatedName = 'Updated API Key'
    const updatedApiKey = new ApiKey({ ...mockApiKey.data, name: updatedName })
    ;(updateApiKey as jest.Mock).mockResolvedValue(Result.ok(updatedApiKey))

    const action = updateApiKeyAction.build({
      ctx: { user: mockUser, workspace: mockWorkspace },
      input: { id: mockApiKey.id, name: updatedName },
      meta: {},
    })

    const result = await action()

    expect(updateApiKey).toHaveBeenCalledWith({
      id: mockApiKey.id,
      name: updatedName,
      workspaceId: mockWorkspace.id,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.name).toBe(updatedName)
    }
  })

  it('should return an error if updateApiKey fails', async () => {
    const errorMessage = 'Failed to update API key'
    ;(updateApiKey as jest.Mock).mockResolvedValue(Result.err(new Error(errorMessage)))

    const action = updateApiKeyAction.build({
      ctx: { user: mockUser, workspace: mockWorkspace },
      input: { id: mockApiKey.id, name: 'Updated API Key' },
      meta: {},
    })

    const result = await action()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(errorMessage)
    }
  })
})
