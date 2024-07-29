import { createProviderApiKey } from '@latitude-data/core'
import { Providers } from '@latitude-data/core/browser'
import { getSession } from '$/services/auth/getSession'
import { createWorkspace } from '$core/tests/factories/workspaces'
import useTestDatabase from '$core/tests/useTestDatabase'
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest'

import { getProviderApiKeyAction } from './fetch'

vi.mock('$/services/auth/getSession', () => ({
  getSession: vi.fn(),
}))

let session

describe('getProviderApiKeyAction', async () => {
  useTestDatabase()

  describe('unauthorized', () => {
    beforeEach(() => {
      ;(getSession as Mock).mockReturnValue(null)
    })

    it('errors when the user is not authenticated', async () => {
      const [_, error] = await getProviderApiKeyAction()

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      session = await createWorkspace()
      ;(getSession as Mock).mockReturnValue({
        user: session.userData,
      })
    })

    it('returns empty array when none', async () => {
      const [data, error] = await getProviderApiKeyAction()

      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it('returns the provider api keys when they exist', async () => {
      createProviderApiKey({
        provider: Providers.OpenAI,
        // openai example apikey token
        token: 'sk-1234567890abcdef1234567890abcdef',
        workspace: session!.workspace,
        name: 'foo',
        authorId: session!.userData.id,
      })

      const [data, error] = await getProviderApiKeyAction()

      expect(error).toBeNull()
      expect(data!.length).toEqual(1)
      expect(data![0]!.token).toEqual('sk-********cdef')
    })
  })
})
