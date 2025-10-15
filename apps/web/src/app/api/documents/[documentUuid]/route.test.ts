import { createProject, helpers } from '@latitude-data/core/factories'
import { User } from '@latitude-data/core/schema/models/types/User'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'
import { Providers } from '@latitude-data/constants'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('GET handler for documents/[documentUuid]', () => {
  let mockRequest: NextRequest
  let mockParams: { commitUuid: string; documentUuid: string }
  let mockWorkspace: any
  let mockUser: User

  beforeEach(async () => {
    mockRequest = new NextRequest('http://localhost:3000')
    const { user, workspace, documents } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        foo: {
          content: helpers.createPrompt({ provider: 'openai', content: 'foo' }),
        },
      },
    })

    mockUser = user
    mockParams = {
      commitUuid: documents[0]!.commitId.toString(),
      documentUuid: documents[0]!.documentUuid,
    }
    mockWorkspace = workspace
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      const response = await GET(mockRequest, {
        params: mockParams,
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
      mocks.getSession.mockResolvedValue({
        user: mockUser,
        session: { userId: mockUser.id, currentWorkspaceId: mockWorkspace.id },
      })
    })

    it('should return 400 if required params are missing', async () => {
      const response = await GET(mockRequest, {
        params: {},
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        details: {},
        message: 'Document UUID is required',
      })
    })

    it('should return document version when valid params are provided', async () => {
      const response = await GET(mockRequest, {
        params: mockParams,
        workspace: mockWorkspace,
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toMatchObject({
        documentUuid: mockParams.documentUuid,
      })
    })
  })
})
