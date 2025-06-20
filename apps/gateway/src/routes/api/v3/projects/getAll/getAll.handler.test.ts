import app from '$/routes/app'
import { Project } from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import { createProject } from '@latitude-data/core/factories'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { beforeAll, describe, expect, it, vi } from 'vitest'

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

      // Get the existing projects for this workspace
      const projectsRepository = new ProjectsRepository(workspace.id)
      const projectsResult = await projectsRepository.findAllActive()
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
