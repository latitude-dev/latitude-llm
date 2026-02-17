import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import { createProject, createDataset } from '@latitude-data/core/factories'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('GET /api/v3/dataset-rows', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/dataset-rows?datasetId=1')

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

    it('gets all rows for a dataset', async () => {
      const route = `/api/v3/dataset-rows?datasetId=${datasetId}`
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
      expect(data[0]).toHaveProperty('id')
      expect(data[0]).toHaveProperty('datasetId', datasetId)
      expect(data[0]).toHaveProperty('rowData')
    })

    it('supports pagination', async () => {
      const route = `/api/v3/dataset-rows?datasetId=${datasetId}&page=1&pageSize=2`
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeLessThanOrEqual(2)
    })

    it('fails without datasetId', async () => {
      const route = '/api/v3/dataset-rows'
      const res = await app.request(route, headers)

      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent dataset', async () => {
      const route = '/api/v3/dataset-rows?datasetId=999999'
      const res = await app.request(route, headers)

      expect(res.status).toBe(404)
    })
  })
})
