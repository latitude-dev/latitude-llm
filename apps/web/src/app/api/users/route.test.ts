import { createWorkspace } from '@latitude-data/core/factories'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { workspacePermissionsForRole } from '@latitude-data/core/permissions/workspace'
const mocks = vi.hoisted(() => {
  return {
    getDataFromSession: vi.fn(),
  }
})
vi.mock('$/data-access', () => ({
  getDataFromSession: mocks.getDataFromSession,
}))

describe('GET handler for users', () => {
  let mockRequest: NextRequest
  let mockWorkspace: Workspace
  let mockUser: User
  let mockMembership: any

  beforeEach(async () => {
    mockRequest = new NextRequest('http://localhost:3000')
    const { workspace, userData } = await createWorkspace({
      name: 'test',
    })
    mockUser = userData
    mockWorkspace = workspace
    mockMembership = {
      id: 1,
      role: 'admin' as const,
      userId: mockUser.id,
      workspaceId: mockWorkspace.id,
      confirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: null,
        workspace: null,
        membership: null,
        workspacePermissions: [],
      })

      const response = await GET(mockRequest, {
        params: Promise.resolve({}),
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: mockWorkspace,
        membership: mockMembership,
        workspacePermissions: workspacePermissionsForRole('admin'),
      })
    })

    it('should return all users when authenticated', async () => {
      const response = await GET(mockRequest, {
        params: Promise.resolve({}),
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toEqual(1)
      expect(data[0]).toHaveProperty('id')
      expect(data[0]).toHaveProperty('email')
    })
  })
})
