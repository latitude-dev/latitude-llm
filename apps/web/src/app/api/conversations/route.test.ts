import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createProject,
  createPromptWithCompletion,
  createWorkspace,
} from '@latitude-data/core/factories'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { GET } from './route'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    captureException: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))
vi.mock('$/helpers/captureException', () => ({
  captureException: mocks.captureException,
}))

describe('GET /api/conversations', () => {
  let user: User
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion

  beforeEach(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    user = setup.user
    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!
  })

  function buildRequest(
    params: Record<string, string>,
    filters?: Record<string, unknown>,
  ) {
    const searchParams = new URLSearchParams(params)
    if (filters) {
      searchParams.set('filters', JSON.stringify(filters))
    }
    return new NextRequest(
      `http://localhost:3000/api/conversations?${searchParams.toString()}`,
    )
  }

  describe('authentication', () => {
    it('returns 401 if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)
      const request = buildRequest({
        projectId: project.id.toString(),
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      const response = await GET(request, { workspace } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(() => {
      mocks.getSession.mockResolvedValue({
        user,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })
    })

    describe('tenancy', () => {
      it('does not return conversations from another workspace', async () => {
        const { workspace: otherWorkspace } = await createWorkspace({
          name: 'other-workspace',
        })

        const documentLogUuid = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: otherWorkspace.id,
          traceId: 'other-workspace-trace',
          documentLogUuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(0)
      })

      it('only returns conversations from the authenticated workspace', async () => {
        const documentLogUuid = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'own-workspace-trace',
          documentLogUuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
      })

      it('does not return conversations from other workspace even with same document uuid', async () => {
        const { workspace: otherWorkspace } = await createWorkspace({
          name: 'another-workspace',
        })

        const documentLogUuid1 = generateUUIDIdentifier()
        const documentLogUuid2 = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: otherWorkspace.id,
          traceId: 'cross-workspace-attempt',
          documentLogUuid: documentLogUuid1,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'valid-workspace-trace',
          documentLogUuid: documentLogUuid2,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].documentLogUuid).toBe(documentLogUuid2)
      })
    })

    describe('path: without documentLogUuid filter (list conversations)', () => {
      it('returns empty items when no conversations exist', async () => {
        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(0)
        expect(data.next).toBeNull()
      })

      it('returns multiple conversations', async () => {
        const documentLogUuid1 = generateUUIDIdentifier()
        const documentLogUuid2 = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-1',
          documentLogUuid: documentLogUuid1,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-2',
          documentLogUuid: documentLogUuid2,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          startedAt: new Date(Date.now() + 5000),
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(2)
      })

      it('respects pagination limit', async () => {
        for (let i = 0; i < 5; i++) {
          const documentLogUuid = generateUUIDIdentifier()
          await createPromptWithCompletion({
            workspaceId: workspace.id,
            traceId: `trace-${i}`,
            documentLogUuid,
            documentUuid: document.documentUuid,
            commitUuid: commit.uuid,
            startedAt: new Date(Date.now() - i * 1000),
          })
        }

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          limit: '2',
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(2)
        expect(data.next).not.toBeNull()
      })

      it('returns next cursor for pagination', async () => {
        for (let i = 0; i < 3; i++) {
          const documentLogUuid = generateUUIDIdentifier()
          await createPromptWithCompletion({
            workspaceId: workspace.id,
            traceId: `trace-${i}`,
            documentLogUuid,
            documentUuid: document.documentUuid,
            commitUuid: commit.uuid,
            startedAt: new Date(Date.now() - i * 10000),
          })
        }

        const request1 = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          limit: '2',
        })

        const response1 = await GET(request1, { workspace } as any)
        const data1 = await response1.json()
        expect(data1.items).toHaveLength(2)
        expect(data1.next).not.toBeNull()

        const request2 = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          limit: '2',
          from: data1.next,
        })

        const response2 = await GET(request2, { workspace } as any)
        const data2 = await response2.json()
        expect(data2.items).toHaveLength(1)
        expect(data2.next).toBeNull()
      })

      it('filters by experimentUuids', async () => {
        const experimentUuid = generateUUIDIdentifier()
        const documentLogUuid1 = generateUUIDIdentifier()
        const documentLogUuid2 = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-with-experiment',
          documentLogUuid: documentLogUuid1,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          experimentUuid,
        })

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-without-experiment',
          documentLogUuid: documentLogUuid2,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        const request = buildRequest(
          {
            projectId: project.id.toString(),
            commitUuid: commit.uuid,
            documentUuid: document.documentUuid,
          },
          { experimentUuids: [experimentUuid] },
        )

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].documentLogUuid).toBe(documentLogUuid1)
      })

      it('filters by createdAt date range', async () => {
        const documentLogUuid1 = generateUUIDIdentifier()
        const documentLogUuid2 = generateUUIDIdentifier()

        const oldDate = new Date('2024-01-01')
        const newDate = new Date('2024-06-01')

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-old',
          documentLogUuid: documentLogUuid1,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          startedAt: oldDate,
        })

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-new',
          documentLogUuid: documentLogUuid2,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          startedAt: newDate,
        })

        const request = buildRequest(
          {
            projectId: project.id.toString(),
            commitUuid: commit.uuid,
            documentUuid: document.documentUuid,
          },
          {
            createdAt: {
              from: '2024-03-01',
              to: '2024-12-01',
            },
          },
        )

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].documentLogUuid).toBe(documentLogUuid2)
      })
    })

    describe('path: with documentLogUuid filter (single conversation)', () => {
      it('returns single conversation when documentLogUuid matches', async () => {
        const documentLogUuid = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-1',
          documentLogUuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        const request = buildRequest(
          {
            projectId: project.id.toString(),
            commitUuid: commit.uuid,
            documentUuid: document.documentUuid,
          },
          { documentLogUuid },
        )

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].documentLogUuid).toBe(documentLogUuid)
        expect(data.next).toBeNull()
      })

      it('returns empty items when documentLogUuid does not match', async () => {
        const documentLogUuid = generateUUIDIdentifier()
        const nonExistentUuid = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-1',
          documentLogUuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        const request = buildRequest(
          {
            projectId: project.id.toString(),
            commitUuid: commit.uuid,
            documentUuid: document.documentUuid,
          },
          { documentLogUuid: nonExistentUuid },
        )

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(0)
        expect(data.next).toBeNull()
      })

      it('returns empty items when documentLogUuid exists in different workspace', async () => {
        const { workspace: otherWorkspace } = await createWorkspace({
          name: 'other-workspace',
        })

        const documentLogUuid = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: otherWorkspace.id,
          traceId: 'trace-1',
          documentLogUuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        const request = buildRequest(
          {
            projectId: project.id.toString(),
            commitUuid: commit.uuid,
            documentUuid: document.documentUuid,
          },
          { documentLogUuid },
        )

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(0)
      })

      it('returns empty items when documentLogUuid exists but for different document', async () => {
        const documentLogUuid = generateUUIDIdentifier()
        const otherDocumentUuid = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-1',
          documentLogUuid,
          documentUuid: otherDocumentUuid,
          commitUuid: commit.uuid,
        })

        const request = buildRequest(
          {
            projectId: project.id.toString(),
            commitUuid: commit.uuid,
            documentUuid: document.documentUuid,
          },
          { documentLogUuid },
        )

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(0)
      })

      it('ignores other filters when documentLogUuid is provided', async () => {
        const documentLogUuid = generateUUIDIdentifier()
        const experimentUuid = generateUUIDIdentifier()

        await createPromptWithCompletion({
          workspaceId: workspace.id,
          traceId: 'trace-1',
          documentLogUuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        })

        const request = buildRequest(
          {
            projectId: project.id.toString(),
            commitUuid: commit.uuid,
            documentUuid: document.documentUuid,
          },
          {
            documentLogUuid,
            experimentUuids: [experimentUuid],
          },
        )

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].documentLogUuid).toBe(documentLogUuid)
      })
    })

    describe('commit validation', () => {
      it('returns 404 for non-existent commit', async () => {
        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: '00000000-0000-0000-0000-000000000000',
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(404)
        const data = await response.json()
        expect(data.message).toBe('Commit not found')
      })

      it('returns 404 for commit from another workspace', async () => {
        const { project: otherProject, commit: otherCommit } =
          await createProject({
            documents: {
              'other-doc': 'Other content',
            },
          })

        const request = buildRequest({
          projectId: otherProject.id.toString(),
          commitUuid: otherCommit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(404)
      })
    })

    describe('parameter validation', () => {
      it('returns error for missing projectId', async () => {
        const request = buildRequest({
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(500)
      })

      it('returns error for missing commitUuid', async () => {
        const request = buildRequest({
          projectId: project.id.toString(),
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(500)
      })

      it('returns error for missing documentUuid', async () => {
        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(500)
      })

      it('respects max limit of 100', async () => {
        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          limit: '200',
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(500)
      })
    })
  })
})
