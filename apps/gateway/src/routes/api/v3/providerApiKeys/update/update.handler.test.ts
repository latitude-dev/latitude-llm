import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import {
  createProviderApiKey,
  createProject,
} from '@latitude-data/core/factories'
import { Providers } from '@latitude-data/constants'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('PUT /api/v3/provider-api-keys/:providerApiKeyId', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/provider-api-keys/1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      })

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
        name: 'Original Name',
      })
      providerApiKeyId = providerApiKey.id

      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
      }
    })

    it('updates provider API key name', async () => {
      const route = `/api/v3/provider-api-keys/${providerApiKeyId}`
      const body = {
        name: 'Updated Provider Name',
      }

      const res = await app.request(route, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...headers,
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('id', providerApiKeyId)
      expect(data).toHaveProperty('name', body.name)
    })

    it('fails without name field', async () => {
      const route = `/api/v3/provider-api-keys/${providerApiKeyId}`
      const body = {}

      const res = await app.request(route, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent provider API key', async () => {
      const route = '/api/v3/provider-api-keys/999999'
      const body = {
        name: 'Updated Name',
      }

      const res = await app.request(route, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(404)
    })
  })
})
