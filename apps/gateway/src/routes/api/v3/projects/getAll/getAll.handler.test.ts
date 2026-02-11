import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import { createProject } from '@latitude-data/core/factories'
import { findAllActiveProjects } from '@latitude-data/core/queries/projects/findAllActive'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Project } from '@latitude-data/core/schema/models/types/Project'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('GET /projects', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/projects')

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, unknown>
    let projects: Project[]

    beforeAll(async () => {
      const { workspace } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }

      const projectsResult = await findAllActiveProjects({ workspaceId: workspace.id })
      projects = projectsResult.unwrap()
    })

    it('gets all projects for a workspace', async () => {
      const route = '/api/v3/projects'
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(res.status).toBe(200)

      // Convert dates to string format for comparison
      const expectedProjects = projects.map((project) => ({
        ...project,
        createdAt:
          project.createdAt instanceof Date
            ? project.createdAt.toISOString()
            : project.createdAt,
        updatedAt:
          project.updatedAt instanceof Date
            ? project.updatedAt.toISOString()
            : project.updatedAt,
        lastEditedAt:
          project.lastEditedAt instanceof Date
            ? project.lastEditedAt.toISOString()
            : project.lastEditedAt,
      }))

      expect(data).toEqual(expectedProjects)
    })
  })
})
