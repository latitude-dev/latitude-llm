import { randomUUID } from 'crypto'
import {
  createProject,
  helpers,
  createDraft,
  createDocumentVersion,
} from '@latitude-data/core/factories'
import { User } from '@latitude-data/core/schema/models/types/User'
import { mergeCommit } from '@latitude-data/core/services/commits/merge'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'
import { Providers } from '@latitude-data/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

function createRequest(params: { projectId?: number; commitUuid?: string }) {
  const url = new URL('http://localhost:3000/api/documents/test-uuid')

  if (params.projectId !== undefined) {
    url.searchParams.set('projectId', String(params.projectId))
  }

  if (params.commitUuid !== undefined) {
    url.searchParams.set('commitUuid', params.commitUuid)
  }

  return new NextRequest(url)
}

describe('GET handler for documents/[documentUuid]', () => {
  let mockWorkspace: Workspace
  let mockUser: User
  let mockProject: Project
  let mockCommit: Commit
  let mockDocument: DocumentVersion

  beforeEach(async () => {
    const { user, workspace, documents, project, commit } = await createProject(
      {
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          foo: {
            content: helpers.createPrompt({
              provider: 'openai',
              content: 'foo',
            }),
          },
        },
      },
    )

    mockUser = user
    mockWorkspace = workspace
    mockProject = project
    mockCommit = commit
    mockDocument = documents[0]!
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      const request = createRequest({
        projectId: mockProject.id,
        commitUuid: mockCommit.uuid,
      })

      const response = await GET(request, {
        params: { documentUuid: mockDocument.documentUuid },
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

    describe('parameter validation', () => {
      it('should return 404 when documentUuid param is missing', async () => {
        const request = createRequest({
          projectId: mockProject.id,
          commitUuid: mockCommit.uuid,
        })

        const response = await GET(request, {
          params: {},
          workspace: mockWorkspace,
        } as any)

        expect(response.status).toBe(404)
        const data = await response.json()
        expect(data.message).toContain('Document not found')
      })

      it('should return 422 when projectId query param is missing', async () => {
        const request = createRequest({
          commitUuid: mockCommit.uuid,
        })

        const response = await GET(request, {
          params: { documentUuid: mockDocument.documentUuid },
          workspace: mockWorkspace,
        } as any)

        expect(response.status).toBe(422)
        const data = await response.json()
        expect(data.message).toBe('Invalid query parameters')
        expect(data.details).toHaveProperty('projectId')
      })

      it('should return 422 when commitUuid query param is missing', async () => {
        const request = createRequest({
          projectId: mockProject.id,
        })

        const response = await GET(request, {
          params: { documentUuid: mockDocument.documentUuid },
          workspace: mockWorkspace,
        } as any)

        expect(response.status).toBe(422)
        const data = await response.json()
        expect(data.message).toBe('Invalid query parameters')
        expect(data.details).toHaveProperty('commitUuid')
      })

      it('should return 422 when projectId is not a valid positive integer', async () => {
        const request = createRequest({
          projectId: -1,
          commitUuid: mockCommit.uuid,
        })

        const response = await GET(request, {
          params: { documentUuid: mockDocument.documentUuid },
          workspace: mockWorkspace,
        } as any)

        expect(response.status).toBe(422)
        const data = await response.json()
        expect(data.message).toBe('Invalid query parameters')
        expect(data.details).toHaveProperty('projectId')
      })
    })

    describe('document retrieval', () => {
      it('should return document that exists directly in the specified commit', async () => {
        const request = createRequest({
          projectId: mockProject.id,
          commitUuid: mockCommit.uuid,
        })

        const response = await GET(request, {
          params: { documentUuid: mockDocument.documentUuid },
          workspace: mockWorkspace,
        })

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toMatchObject({
          documentUuid: mockDocument.documentUuid,
          projectId: mockProject.id,
          commitUuid: mockCommit.uuid,
        })
      })

      it('should return document inherited from a previous merged commit', async () => {
        const { commit: draft } = await createDraft({
          project: mockProject,
          user: mockUser,
        })
        await createDocumentVersion({
          workspace: mockWorkspace,
          user: mockUser,
          commit: draft,
          path: 'bar',
          content: helpers.createPrompt({
            provider: 'openai',
            content: 'bar',
          }),
        })
        const newMergedCommit = await mergeCommit(draft).then((r) => r.unwrap())

        const request = createRequest({
          projectId: mockProject.id,
          commitUuid: newMergedCommit.uuid,
        })

        const response = await GET(request, {
          params: { documentUuid: mockDocument.documentUuid },
          workspace: mockWorkspace,
        })

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toMatchObject({
          documentUuid: mockDocument.documentUuid,
          projectId: mockProject.id,
          commitUuid: newMergedCommit.uuid,
        })
        expect(data.content).toContain('foo')
      })

      it('should return 404 when commit does not exist', async () => {
        const nonExistentCommitUuid = randomUUID()
        const request = createRequest({
          projectId: mockProject.id,
          commitUuid: nonExistentCommitUuid,
        })

        const response = await GET(request, {
          params: { documentUuid: mockDocument.documentUuid },
          workspace: mockWorkspace,
        })

        expect(response.status).toBe(404)
        const data = await response.json()
        expect(data.message).toContain('not found')
      })

      it('should return 404 when document does not exist in the commit', async () => {
        const nonExistentDocumentUuid = randomUUID()
        const request = createRequest({
          projectId: mockProject.id,
          commitUuid: mockCommit.uuid,
        })

        const response = await GET(request, {
          params: { documentUuid: nonExistentDocumentUuid },
          workspace: mockWorkspace,
        })

        expect(response.status).toBe(404)
        const data = await response.json()
        expect(data.message).toContain('Document not found')
      })
    })
  })
})
