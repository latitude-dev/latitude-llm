import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import { createProject, createDataset } from '@latitude-data/core/factories'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('GET /api/v3/datasets/:datasetId', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/datasets/1')

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, unknown>
    let datasetId: number

    beforeAll(async () => {
      const { workspace, user } = await createProject()
      const { dataset } = await createDataset({ workspace, author: user })
      datasetId = dataset.id

      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }
    })

    it('gets a dataset by id', async () => {
      const route = `/api/v3/datasets/${datasetId}`
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('id', datasetId)
      expect(data).toHaveProperty('name')
      expect(data).toHaveProperty('columns')
      expect(Array.isArray(data.columns)).toBe(true)
    })

    it('returns 404 for non-existent dataset', async () => {
      const route = '/api/v3/datasets/999999'
      const res = await app.request(route, headers)

      expect(res.status).toBe(404)
    })
  })
})
