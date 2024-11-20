import { Providers, User, Workspace } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
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

describe('GET handler for provider API keys', () => {
  let mockRequest: NextRequest
  let mockWorkspace: Workspace
  let mockUser: User

  beforeEach(async () => {
    mockRequest = new NextRequest('http://localhost:3000/api/providerApiKeys')
    const { workspace, userData } = await factories.createWorkspace({
      name: 'test',
    })
    mockUser = userData
    mockWorkspace = workspace
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      mocks.getSession.mockReturnValue(null)

      const response = await GET(mockRequest, {
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
      mocks.getSession.mockReturnValue({ user: mockUser })
    })

    it('should return empty array when no provider API keys exist', async () => {
      const response = await GET(mockRequest, {
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual([])
    })

    it('should return the provider API keys when they exist', async () => {
      await createProviderApiKey({
        provider: Providers.OpenAI,
        token: 'sk-1234567890abcdef1234567890abcdef',
        workspace: mockWorkspace,
        author: mockUser,
        name: 'foo',
      })

      const response = await GET(mockRequest, {
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toEqual(1)
      expect(data[0].token).toEqual('sk-********cdef')
    })
  })
})
