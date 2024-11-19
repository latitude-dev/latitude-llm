import {
  DocumentVersion,
  Providers,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import { createProject, helpers } from '@latitude-data/core/factories'
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

describe('GET handler for documents/[projectId]/for-import', () => {
  let mockRequest: NextRequest
  let mockParams: { projectId: string }
  let mockWorkspace: Workspace
  let mockDocuments: DocumentVersion[]
  let mockUser: User

  beforeEach(async () => {
    mockRequest = new NextRequest('http://localhost:3000')
    const { workspace, documents, project, user } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        foo: {
          content: helpers.createPrompt({ provider: 'openai', content: 'foo' }),
        },
      },
    })
    mockParams = { projectId: String(project.id) }

    mockUser = user
    mockWorkspace = workspace
    mockDocuments = documents
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
      mocks.getSession.mockReturnValue({ user: mockUser })
    })

    it('should return 400 if projectId is missing', async () => {
      const response = await GET(mockRequest, {
        params: {},
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        message: 'Project ID is required',
        details: {},
      })
    })

    it('should return documents for import when valid params are provided', async () => {
      const response = await GET(mockRequest, {
        params: mockParams,
        workspace: mockWorkspace,
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual([
        {
          documentUuid: mockDocuments[0]!.documentUuid,
          path: mockDocuments[0]!.path,
        },
      ])
    })
  })
})
