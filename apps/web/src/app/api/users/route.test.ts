import { User, WorkspaceDto } from '@latitude-data/core/browser'
import { createWorkspace } from '@latitude-data/core/factories'
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

type Response = NextResponse<User[]>
const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('GET handler for users', () => {
  let mockRequest: NextRequest
  let mockResponse: Response = {} as Response
  let mockWorkspace: WorkspaceDto
  let mockUser: User

  beforeEach(async () => {
    mockRequest = new NextRequest('http://localhost:3000')
    const { workspace, userData } = await createWorkspace({
      name: 'test',
    })
    mockUser = userData
    mockWorkspace = workspace
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      const response = await GET(mockRequest, mockResponse, {
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        details: {},
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockReturnValue({ user: mockUser })
    })

    it('should return all users when authenticated', async () => {
      const response = await GET(mockRequest, mockResponse, {
        params: {},
        workspace: mockWorkspace,
        user: mockUser,
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toEqual(1)
      expect(data[0]).toHaveProperty('id')
      expect(data[0]).toHaveProperty('email')
    })
  })
})
