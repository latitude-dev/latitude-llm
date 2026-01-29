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

describe('GET /api/v3/provider-api-keys', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/provider-api-keys')

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, unknown>
    let workspaceId: number

    beforeAll(async () => {
      const { workspace, user } = await createProject()
      workspaceId = workspace.id

      await createProviderApiKey({
        workspace,
        user,
        type: Providers.OpenAI,
        name: 'Test Provider',
      })

      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId,
      }).then((r) => r.unwrap())

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }
    })

    it('gets all provider API keys for a workspace', async () => {
      const route = '/api/v3/provider-api-keys'
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
      expect(data[0]).toHaveProperty('id')
      expect(data[0]).toHaveProperty('name')
      expect(data[0]).toHaveProperty('provider')
      expect(data[0]).toHaveProperty('workspaceId', workspaceId)
      expect(data[0]).toHaveProperty('token')
      expect(data[0].token).toMatch(/^.{3}\*{8}.{4}$/)
    })
  })
})
