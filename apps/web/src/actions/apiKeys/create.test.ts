import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApiKeyAction } from './create'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('createApiKeyAction', () => {
  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)

      const { serverError } = await createApiKeyAction({
        name: 'Test API Key',
      })

      expect(serverError).toEqual('Unauthorized')
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      const { workspace: ws, userData } = await factories.createWorkspace()

      mocks.getSession.mockResolvedValue({
        user: userData,
        session: { userId: userData.id, currentWorkspaceId: ws.id },
      })
    })

    it('successfully creates an API key', async () => {
      const { data, serverError, validationErrors } = await createApiKeyAction({
        name: 'Test API Key',
      })

      expect(serverError).toBeUndefined()
      expect(validationErrors).toBeUndefined()
      expect(data).toBeDefined()
      expect(data!.name).toEqual('Test API Key')
      expect(data!.id).toBeDefined()
      expect(data!.token).toBeDefined()
    })
  })
})
