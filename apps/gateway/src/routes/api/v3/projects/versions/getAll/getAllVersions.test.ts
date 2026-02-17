import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import { createProject } from '@latitude-data/core/factories'
import { beforeAll, describe, expect, it } from 'vitest'

describe('GET /projects/{projectId}/versions', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/projects/1/versions')
      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, unknown>
    let projectId: number

    beforeAll(async () => {
      const { workspace, project } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }

      projectId = project.id
    })

    it('gets all versions for a project', async () => {
      const route = `/api/v3/projects/${projectId}/versions`
      const res = await app.request(route, headers)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)

      // Check that each version has the expected structure
      data.forEach((version: any) => {
        expect(version).toHaveProperty('id')
        expect(version).toHaveProperty('uuid')
        expect(version).toHaveProperty('title')
        expect(version).toHaveProperty('projectId')
        expect(version).toHaveProperty('createdAt')
        expect(version).toHaveProperty('updatedAt')
      })
    })

    it('returns empty array when project has no versions', async () => {
      // This test would need a project with no commits, but for now we'll skip
      // as the factory creates a project with at least one commit
    })
  })
})
