import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import { createProject as createProjectFactory } from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queues: {
    defaultQueue: {
      jobs: {},
    },
  },
}))

vi.mock('$/jobs', () => ({
  queues: mocks.queues,
}))

describe('POST /projects', () => {
  describe('when unauthorized', () => {
    it('fails', async () => {
      const response = await app.request('/api/v3/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test Project',
        }),
      })

      expect(response.status).toBe(401)
    })
  })

  describe('when authorized', () => {
    let headers: Record<string, string>

    beforeEach(async () => {
      vi.clearAllMocks()

      const { workspace } = await createProjectFactory()

      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      headers = {
        Authorization: `Bearer ${apiKey.token}`,
        'Content-Type': 'application/json',
      }
    })

    it('succeeds when creating a new project', async () => {
      const projectName = `Test Project ${Date.now()}`
      const response = await app.request('/api/v3/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: projectName,
        }),
      })

      const responseBody = await response.json()

      expect(response.status).toBe(201)
      const { project } = responseBody

      expect(project).toEqual({
        id: expect.any(Number),
        name: projectName,
        workspaceId: expect.any(Number),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        lastEditedAt: expect.any(String),
        deletedAt: null,
      })

      // Cleanup is done automatically in tests
    })

    it('fails when project name is missing', async () => {
      const response = await app.request('/api/v3/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(400)
    })
  })
})
