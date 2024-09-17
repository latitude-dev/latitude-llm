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
      mocks.getSession.mockReturnValue(null)

      const [_, error] = await createApiKeyAction({
        name: 'Test API Key',
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      const { userData } = await factories.createWorkspace()

      mocks.getSession.mockReturnValue({
        user: userData,
      })
    })

    it('successfully creates an API key', async () => {
      const [data, error] = await createApiKeyAction({
        name: 'Test API Key',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.name).toEqual('Test API Key')
      expect(data!.id).toBeDefined()
      expect(data!.token).toBeDefined()
    })
  })
})
