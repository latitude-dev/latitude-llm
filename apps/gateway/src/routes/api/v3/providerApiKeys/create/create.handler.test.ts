import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import { createProject } from '@latitude-data/core/factories'
import { Providers } from '@latitude-data/constants'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('POST /api/v3/provider-api-keys', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/provider-api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Provider',
          provider: Providers.OpenAI,
          token: 'sk-test123',
        }),
      })

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, unknown>
    let workspaceId: number

    beforeAll(async () => {
      const { workspace } = await createProject()
      workspaceId = workspace.id

      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId,
      }).then((r) => r.unwrap())

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
      }
    })

    it('creates a new provider API key', async () => {
      const route = '/api/v3/provider-api-keys'
      const body = {
        name: `New OpenAI Provider ${Date.now()}`,
        provider: Providers.OpenAI,
        token: `sk-test-new-key-${Date.now()}`,
        defaultModel: 'gpt-4',
      }

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })
      const data = await res.json()

      if (res.status !== 201) {
        console.error('Unexpected status:', res.status)
        console.error('Response data:', data)
      }

      expect(res.status).toBe(201)
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('name')
      expect(data.name).toContain('New OpenAI Provider')
      expect(data).toHaveProperty('provider', body.provider)
      expect(data).toHaveProperty('defaultModel', body.defaultModel)
      expect(data).toHaveProperty('workspaceId', workspaceId)
      expect(data).toHaveProperty('token')
    })

    it('creates a custom provider with URL', async () => {
      const route = '/api/v3/provider-api-keys'
      const body = {
        name: `Custom Provider ${Date.now()}`,
        provider: Providers.Custom,
        token: `custom-token-${Date.now()}`,
        url: 'https://api.custom.com',
      }

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })
      const data = await res.json()

      expect(res.status).toBe(201)
      expect(data).toHaveProperty('url', body.url)
    })

    it('fails without required fields', async () => {
      const route = '/api/v3/provider-api-keys'
      const body = {
        name: 'Incomplete Provider',
      }

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(400)
    })

    it('fails with invalid provider', async () => {
      const route = '/api/v3/provider-api-keys'
      const body = {
        name: 'Invalid Provider',
        provider: 'InvalidProvider',
        token: 'test-token',
      }

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(400)
    })

    it('fails when custom provider missing URL', async () => {
      const route = '/api/v3/provider-api-keys'
      const body = {
        name: 'Custom Without URL',
        provider: Providers.Custom,
        token: 'test-token',
      }

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(400)
    })
  })
})
