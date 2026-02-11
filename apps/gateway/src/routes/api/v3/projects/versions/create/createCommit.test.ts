import app from '$/routes/app'
import { NotFoundError } from '@latitude-data/constants/errors'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import { createProject } from '@latitude-data/core/factories'
import * as findProjectByIdModule from '@latitude-data/core/queries/projects/findById'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('POST /projects/:projectId/versions', () => {
  describe('when unauthorized', () => {
    it('fails', async () => {
      const response = await app.request('/api/v3/projects/1/versions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test Commit',
        }),
      })

      expect(response.status).toBe(401)
    })
  })

  describe('when authorized', () => {
    let headers: Record<string, string>
    let projectId: number
    let workspace: any
    let user: any

    beforeEach(async () => {
      vi.clearAllMocks()

      // Create a project and user for testing
      const result = await createProject()
      workspace = result.workspace
      projectId = result.project.id
      user = result.user

      // Set up auth headers
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      headers = {
        Authorization: `Bearer ${apiKey.token}`,
        'Content-Type': 'application/json',
      }
    })

    it('succeeds when creating a new commit', async () => {
      const commitName = `Test Commit ${Date.now()}`
      const response = await app.request(
        `/api/v3/projects/${projectId}/versions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: commitName,
          }),
        },
      )

      expect(response.status).toBe(200)
      const commit = await response.json()

      expect(commit).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          projectId: projectId,
          userId: user.id,
          title: commitName,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      )
    })

    it('fails when project ID is invalid', async () => {
      vi.spyOn(findProjectByIdModule, 'findProjectById').mockResolvedValueOnce({
        ok: false,
        error: new NotFoundError('Project not found'),
        value: undefined,
        unwrap: () => { throw new NotFoundError('Project not found') },
      } as any)

      const response = await app.request(`/api/v3/projects/999999/versions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Test Commit',
        }),
      })

      expect(response.status).toBe(404)
    })

    it('fails when commit name is missing', async () => {
      const response = await app.request(
        `/api/v3/projects/${projectId}/versions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      )

      expect(response.status).toBe(400)
    })
  })
})
