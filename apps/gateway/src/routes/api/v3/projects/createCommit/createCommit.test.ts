import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import { createProject } from '@latitude-data/core/factories'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the createCommit service
const mocks = vi.hoisted(() => ({
  createCommit: vi.fn(),
  findFirstUserInWorkspace: vi.fn(),
}))

vi.mock('@latitude-data/core/services/commits/create', () => ({
  createCommit: mocks.createCommit,
}))

vi.mock('@latitude-data/core/data-access', async () => {
  const actual = await vi.importActual('@latitude-data/core/data-access')
  return {
    ...actual,
    findFirstUserInWorkspace: mocks.findFirstUserInWorkspace,
  }
})

describe('POST /projects/:projectId/commits', () => {
  describe('when unauthorized', () => {
    it('fails', async () => {
      const response = await app.request('/api/v3/projects/1/commits', {
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

      // Mock findFirstUserInWorkspace to return our test user
      mocks.findFirstUserInWorkspace.mockResolvedValue(user)

      // Mock createCommit to return a successful result
      mocks.createCommit.mockImplementation(({ project, user, data }) => {
        return Promise.resolve({
          unwrap: () => ({
            id: 123,
            projectId: project.id,
            userId: user.id,
            title: data.title,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        })
      })

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
        `/api/v3/projects/${projectId}/commits`,
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

      expect(commit).toEqual({
        id: expect.any(Number),
        projectId: projectId,
        userId: user.id,
        title: commitName,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })

      // Verify service was called with correct parameters
      expect(mocks.createCommit).toHaveBeenCalledWith({
        project: expect.objectContaining({ id: projectId }),
        user: expect.objectContaining({ id: user.id }),
        data: {
          title: commitName,
        },
      })
    })

    it('fails when project ID is invalid', async () => {
      // Mock ProjectsRepository.getProjectById to throw for invalid project
      vi.spyOn(
        ProjectsRepository.prototype,
        'getProjectById',
        // @ts-expect-error: mocking
      ).mockImplementationOnce(() => {
        return Promise.resolve({
          unwrap: () => {
            throw new Error('Project not found')
          },
        })
      })

      const response = await app.request(`/api/v3/projects/999999/commits`, {
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
        `/api/v3/projects/${projectId}/commits`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      )

      expect(response.status).toBe(400)
    })

    it('fails when no user is found in workspace', async () => {
      // Mock findFirstUserInWorkspace to return null
      mocks.findFirstUserInWorkspace.mockResolvedValueOnce(null)

      const response = await app.request(
        `/api/v3/projects/${projectId}/commits`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: 'Test Commit',
          }),
        },
      )

      expect(response.status).toBe(404)
      const errorBody = await response.json()
      expect(errorBody.message).toContain('User not found')
    })
  })
})
