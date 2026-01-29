import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import { createProject, createDataset } from '@latitude-data/core/factories'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('POST /api/v3/dataset-rows', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/dataset-rows', {
        method: 'POST',
        body: JSON.stringify({
          datasetId: 1,
          rowData: {},
        }),
      })

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, unknown>
    let datasetId: number
    let workspaceId: number

    beforeAll(async () => {
      const { workspace, user } = await createProject()
      const { dataset } = await createDataset({ workspace, author: user })
      datasetId = dataset.id
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

    it('creates a new dataset row', async () => {
      const route = '/api/v3/dataset-rows'
      const body = {
        datasetId,
        rowData: {
          id: '123',
          name: 'Test Row',
          email: 'test@example.com',
          age: '25',
        },
      }

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })
      const data = await res.json()

      expect(res.status).toBe(201)
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('datasetId', datasetId)
      expect(data).toHaveProperty('workspaceId', workspaceId)
      expect(data).toHaveProperty('rowData')
      expect(data.rowData).toMatchObject(body.rowData)
    })

    it('fails without required fields', async () => {
      const route = '/api/v3/dataset-rows'
      const body = {
        datasetId,
      }

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(400)
    })

    it('fails for non-existent dataset', async () => {
      const route = '/api/v3/dataset-rows'
      const body = {
        datasetId: 999999,
        rowData: { test: 'data' },
      }

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(404)
    })
  })
})
