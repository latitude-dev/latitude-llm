import {
  DocumentVersion,
  Providers,
  User,
  WorkspaceDto,
} from '@latitude-data/core/browser'
import { createProject, helpers } from '@latitude-data/core/factories'
import { NextRequest } from 'next/server'
import { SubscriptionPlan } from 'node_modules/@latitude-data/core/src/plans'
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
  let mockWorkspace: WorkspaceDto
  let mockDocuments: DocumentVersion[]
  let user: User

  beforeEach(async () => {
    mockRequest = new NextRequest('http://localhost:3000')
    const {
      workspace,
      documents,
      project,
      user: usr,
    } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        foo: {
          content: helpers.createPrompt({ provider: 'openai', content: 'foo' }),
        },
      },
    })
    mockParams = { projectId: String(project.id) }

    user = usr
    mockWorkspace = {
      ...workspace,
      currentSubscription: {
        id: 1,
        workspaceId: workspace.id,
        plan: SubscriptionPlan.HobbyV1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }
    mockDocuments = documents
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      const response = await GET(mockRequest, {
        params: mockParams,
        workspace: mockWorkspace,
        user: {
          id: 'bla',
          name: 'bla',
          admin: false,
          email: 'nonexisting@example.com',
          createdAt: new Date(),
          confirmedAt: null,
          updatedAt: new Date(),
        },
      })

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        details: {},
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockReturnValue({ user })
    })

    it('should return 400 if projectId is missing', async () => {
      const response = await GET(mockRequest, {
        params: {},
        workspace: mockWorkspace,
        user,
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        message: 'Project ID is required',
        details: {},
      })
    })

    it('should return documents for import when valid params are provided', async () => {
      const response = await GET(mockRequest, {
        params: mockParams,
        user,
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
