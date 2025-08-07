import { CommitStatus, type User, type Workspace } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('GET handler for commits', () => {
  let mockRequest: NextRequest
  let mockWorkspace: Workspace
  let mockUser: User

  beforeEach(async () => {
    mockRequest = new NextRequest('http://localhost:3000/api/projects/1/commits?status=draft')
    const { workspace, userData } = await factories.createWorkspace({
      name: 'test',
    })
    mockUser = userData
    mockWorkspace = workspace
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)

      const response = await GET(mockRequest, {
        params: { projectId: '1', status: CommitStatus.Draft },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(() => {
      mocks.getSession.mockResolvedValue({
        user: mockUser,
        session: { userId: mockUser.id, currentWorkspaceId: mockWorkspace.id },
      })
    })

    it('should return 404 when project is not found', async () => {
      const response = await GET(mockRequest, {
        params: { projectId: '999', status: CommitStatus.Draft },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual(
        expect.objectContaining({
          message: 'Project not found',
        }),
      )
    })

    it('should return 404 when project belongs to other workspace', async () => {
      const { workspace: otherWorkspace } = await factories.createWorkspace({
        name: 'other',
      })
      const { project } = await factories.createProject({
        workspace: otherWorkspace,
      })

      const response = await GET(mockRequest, {
        params: {
          projectId: project.id.toString(),
          status: CommitStatus.Draft,
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual(
        expect.objectContaining({
          message: 'Project not found',
        }),
      )
    })

    it('should return all draft commits for a project', async () => {
      const { project } = await factories.createProject({
        workspace: mockWorkspace,
      })
      await factories.createDraft({
        project,
        user: mockUser,
      })

      const response = await GET(mockRequest, {
        params: {
          projectId: project.id.toString(),
          status: CommitStatus.Draft,
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toEqual(1)
      expect(data[0]).toHaveProperty('id')
      expect(data[0].mergedAt).toBeNull()
    })
  })
})
