import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createProject,
  createSpan,
  createWorkspace,
} from '@latitude-data/core/factories'
import { LogSources, SpanType } from '@latitude-data/constants'
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

describe('GET handler for traces/count-by-document', () => {
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

  function buildRequest(params: Record<string, string>) {
    const searchParams = new URLSearchParams(params)
    return new NextRequest(
      `http://localhost:3000/api/traces/count-by-document?${searchParams.toString()}`,
    )
  }

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
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
      it('should not count spans from another workspace', async () => {
        const { workspace: otherWorkspace } = await createWorkspace({
          name: 'other-workspace',
        })

        await createSpan({
          workspaceId: otherWorkspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'other-workspace-trace',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(0)
      })

      it('should only count spans from the authenticated workspace', async () => {
        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'own-workspace-trace',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(1)
      })

      it('should not count spans from other workspace even with same document uuid', async () => {
        const { workspace: otherWorkspace } = await createWorkspace({
          name: 'another-workspace',
        })

        await createSpan({
          workspaceId: otherWorkspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'cross-workspace-attempt',
        })

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'valid-workspace-trace',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(1)
      })
    })

    describe('trace counting', () => {
      it('should count distinct traces', async () => {
        const traceId = 'shared-trace-id'

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId,
        })

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Completion,
          traceId,
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(1)
      })

      it('should count multiple different traces', async () => {
        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'trace-1',
        })

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'trace-2',
        })

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'trace-3',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(3)
      })

      it('should return zero when no spans exist', async () => {
        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(0)
      })
    })

    describe('log sources filtering', () => {
      it('should filter by single log source', async () => {
        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'api-trace',
          source: LogSources.API,
        })

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'playground-trace',
          source: LogSources.Playground,
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          logSources: LogSources.API,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(1)
      })

      it('should filter by multiple log sources', async () => {
        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'api-trace',
          source: LogSources.API,
        })

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'playground-trace',
          source: LogSources.Playground,
        })

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'evaluation-trace',
          source: LogSources.Evaluation,
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          logSources: `${LogSources.API},${LogSources.Playground}`,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(2)
      })

      it('should return all traces when no log source filter is provided', async () => {
        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'api-trace',
          source: LogSources.API,
        })

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'playground-trace',
          source: LogSources.Playground,
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(2)
      })
    })

    describe('document scoping', () => {
      it('should only count traces for the specified document', async () => {
        const { documents: otherDocuments, commit: otherCommit } =
          await createProject({
            workspace,
            documents: {
              'other-doc': 'Other content',
            },
          })
        const otherDocument = otherDocuments[0]!

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Prompt,
          traceId: 'correct-doc-trace',
        })

        await createSpan({
          workspaceId: workspace.id,
          commitUuid: otherCommit.uuid,
          documentUuid: otherDocument.documentUuid,
          type: SpanType.Prompt,
          traceId: 'other-doc-trace',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.count).toBe(1)
      })
    })

    describe('project and commit scoping', () => {
      it('should return 404 for non-existent commit', async () => {
        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: '00000000-0000-0000-0000-000000000000',
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(404)
      })

      it('should return 404 for commit from another workspace', async () => {
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
      it('should return error for missing projectId', async () => {
        const request = buildRequest({
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(500)
      })

      it('should return error for invalid logSources', async () => {
        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          logSources: 'invalid-source',
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(500)
      })
    })
  })
})
