import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import {
  createProviderApiKey,
  createProject,
} from '@latitude-data/core/factories'
import { Providers } from '@latitude-data/constants'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('GET /api/v3/provider-api-keys/:providerApiKeyId', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/provider-api-keys/1')

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, unknown>
    let providerApiKeyId: number

    beforeAll(async () => {
      const { workspace, user } = await createProject()

      const providerApiKey = await createProviderApiKey({
        workspace,
        user,
        type: Providers.OpenAI,
        name: 'Test Provider',
      })
      providerApiKeyId = providerApiKey.id

      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }
    })

    it('gets a provider API key by id', async () => {
      const route = `/api/v3/provider-api-keys/${providerApiKeyId}`
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('id', providerApiKeyId)
      expect(data).toHaveProperty('name')
      expect(data).toHaveProperty('provider')
      expect(data).toHaveProperty('token')
      expect(data.token).toMatch(/^.{3}\*{8}.{4}$/)
    })

    it('returns 404 for non-existent provider API key', async () => {
      const route = '/api/v3/provider-api-keys/999999'
      const res = await app.request(route, headers)

      expect(res.status).toBe(404)
    })
  })
})
