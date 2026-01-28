import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import { createProject, createDataset } from '@latitude-data/core/factories'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('PUT /api/v3/datasets/:datasetId', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/datasets/1', {
        method: 'PUT',
        body: JSON.stringify({ columns: [] }),
      })

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
      }).then((r) => r.unwrap())

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
      }
    })

    it('updates dataset columns', async () => {
      const route = `/api/v3/datasets/${datasetId}`
      const body = {
        columns: [
          {
            identifier: 'new_col',
            name: 'New Column',
            role: 'parameter',
          },
        ],
      }

      const res = await app.request(route, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...headers,
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('id', datasetId)
      expect(data.columns).toHaveLength(1)
      expect(data.columns[0]).toHaveProperty('identifier', 'new_col')
    })

    it('fails without columns field', async () => {
      const route = `/api/v3/datasets/${datasetId}`
      const body = {}

      const res = await app.request(route, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent dataset', async () => {
      const route = '/api/v3/datasets/999999'
      const body = {
        columns: [],
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
