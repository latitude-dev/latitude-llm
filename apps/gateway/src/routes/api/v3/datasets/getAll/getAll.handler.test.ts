import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import { createProject, createDataset } from '@latitude-data/core/factories'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('GET /api/v3/datasets', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/datasets')

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, unknown>
    let workspaceId: number

    beforeAll(async () => {
      const { workspace, user } = await createProject()
      workspaceId = workspace.id

      await createDataset({ workspace, author: user })

      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId,
      }).then((r) => r.unwrap())

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }
    })

    it('gets all datasets for a workspace', async () => {
      const route = '/api/v3/datasets'
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
      expect(data[0]).toHaveProperty('id')
      expect(data[0]).toHaveProperty('name')
      expect(data[0]).toHaveProperty('columns')
      expect(data[0]).toHaveProperty('workspaceId', workspaceId)
    })

    it('supports pagination', async () => {
      const route = '/api/v3/datasets?page=1&pageSize=1'
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeLessThanOrEqual(1)
    })
  })
})
