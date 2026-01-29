import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import { createProject, createDataset } from '@latitude-data/core/factories'
import { DatasetRowsRepository } from '@latitude-data/core/repositories'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('DELETE /api/v3/dataset-rows/:rowId', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/dataset-rows/1', {
        method: 'DELETE',
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
      }).then((r) => r.unwrap())

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }

      const rowsRepo = new DatasetRowsRepository(workspace.id)
      const rows = await rowsRepo.findAllByDataset(datasetId)
      rowId = rows[0]!.id
    })

    it('deletes a dataset row', async () => {
      const route = `/api/v3/dataset-rows/${rowId}`
      const res = await app.request(route, {
        method: 'DELETE',
        ...headers,
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('id', rowId)
      expect(data).toHaveProperty('datasetId', datasetId)

      // Verify row is deleted
      const rowsRepo = new DatasetRowsRepository(
        (
          await unsafelyGetFirstApiKeyByWorkspaceId({
            workspaceId: data.workspaceId,
          })
        ).unwrap()!.workspaceId,
      )
      const rowResult = await rowsRepo.find(rowId)
      expect(rowResult.error).toBeDefined()
    })

    it('returns 404 for non-existent row', async () => {
      const route = '/api/v3/dataset-rows/999999'
      const res = await app.request(route, {
        method: 'DELETE',
        ...headers,
      })

      expect(res.status).toBe(404)
    })
  })
})
