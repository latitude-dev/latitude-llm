import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import { createProject, createDataset } from '@latitude-data/core/factories'
import { DatasetRowsRepository } from '@latitude-data/core/repositories'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('PUT /api/v3/dataset-rows/:rowId', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/dataset-rows/1', {
        method: 'PUT',
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
    let rowId: number
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
          'Content-Type': 'application/json',
        },
      }

      const rowsRepo = new DatasetRowsRepository(workspace.id)
      const rows = await rowsRepo.findAllByDataset(datasetId)
      rowId = rows[0]!.id
    })

    it('updates a dataset row', async () => {
      const route = `/api/v3/dataset-rows/${rowId}`
      const body = {
        datasetId,
        rowData: {
          id: 'updated-123',
          name: 'Updated Name',
          email: 'updated@example.com',
          age: '30',
        },
      }

      const res = await app.request(route, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...headers,
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('id', rowId)
      expect(data).toHaveProperty('datasetId', datasetId)
      expect(data.rowData).toMatchObject(body.rowData)
    })

    it('fails without required fields', async () => {
      const route = `/api/v3/dataset-rows/${rowId}`
      const body = {
        datasetId,
      }

      const res = await app.request(route, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent row', async () => {
      const route = '/api/v3/dataset-rows/999999'
      const body = {
        datasetId,
        rowData: { test: 'data' },
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
