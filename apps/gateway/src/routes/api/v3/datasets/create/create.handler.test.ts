import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import { createProject } from '@latitude-data/core/factories'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('POST /api/v3/datasets', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/datasets', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Dataset',
          columns: [],
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
      })

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
      }
    })

    it('creates a new dataset', async () => {
      const route = '/api/v3/datasets'
      const body = {
        name: `Test Dataset ${Date.now()}`,
        columns: [
          {
            identifier: 'col1',
            name: 'Column 1',
            role: 'parameter',
          },
          {
            identifier: 'col2',
            name: 'Column 2',
            role: 'label',
          },
        ],
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
      expect(data.name).toContain('Test Dataset')
      expect(data).toHaveProperty('workspaceId', workspaceId)
      expect(data.columns).toHaveLength(2)
      expect(data.columns[0]).toHaveProperty('identifier', 'col1')
    })

    it('fails without required fields', async () => {
      const route = '/api/v3/datasets'
      const body = {
        name: 'Test Dataset',
      }

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(400)
    })

    it('fails with duplicate name', async () => {
      const route = '/api/v3/datasets'
      const body = {
        name: 'Duplicate Dataset',
        columns: [],
      }

      await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify(body),
        ...headers,
      })

      expect(res.status).toBe(400)
    })
  })
})
