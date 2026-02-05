import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { subWeeks } from 'date-fns'
import { createProject, createSpan } from '@latitude-data/core/factories'
import { SpanType } from '@latitude-data/constants'
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

describe('GET handler for spans/limited', () => {
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
      `http://localhost:3000/api/spans/limited?${searchParams.toString()}`,
    )
  }

  describe('unauthorized', () => {
    it('returns 401 if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)
      const request = buildRequest({
        projectId: project.id.toString(),
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        types: SpanType.Prompt,
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

    it('falls back to all-time on first page when default window returns no spans (document-level)', async () => {
      const oldTraceId = 'old-trace'
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
        traceId: oldTraceId,
        startedAt: subWeeks(new Date(), 9),
      })

      const request = buildRequest({
        projectId: project.id.toString(),
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        types: SpanType.Prompt,
        limit: '50',
      })

      const response = await GET(request, { workspace } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(1)
      expect(data.items[0].traceId).toBe(oldTraceId)
    })

    it('does not include older spans when default window returns some spans (document-level)', async () => {
      const oldTraceId = 'old-trace-2'
      const recentTraceId = 'recent-trace-2'

      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
        traceId: oldTraceId,
        startedAt: subWeeks(new Date(), 9),
      })
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
        traceId: recentTraceId,
        startedAt: subWeeks(new Date(), 1),
      })

      const request = buildRequest({
        projectId: project.id.toString(),
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        types: SpanType.Prompt,
        limit: '50',
      })

      const response = await GET(request, { workspace } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(1)
      expect(data.items[0].traceId).toBe(recentTraceId)
      expect(data.items.some((s: any) => s.traceId === oldTraceId)).toBe(false)
    })

    it('does not fall back to all-time when createdAt is explicitly provided', async () => {
      const oldTraceId = 'old-trace-3'
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
        traceId: oldTraceId,
        startedAt: subWeeks(new Date(), 9),
      })

      const filters = JSON.stringify({
        createdAt: {
          from: subWeeks(new Date(), 8).toISOString(),
        },
      })

      const request = buildRequest({
        projectId: project.id.toString(),
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        types: SpanType.Prompt,
        limit: '50',
        filters,
      })

      const response = await GET(request, { workspace } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(0)
    })

    it('treats empty createdAt filter as not provided and can fall back to all-time', async () => {
      const oldTraceId = 'old-trace-4'
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        type: SpanType.Prompt,
        traceId: oldTraceId,
        startedAt: subWeeks(new Date(), 9),
      })

      const filters = JSON.stringify({
        createdAt: {},
      })

      const request = buildRequest({
        projectId: project.id.toString(),
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        types: SpanType.Prompt,
        limit: '50',
        filters,
      })

      const response = await GET(request, { workspace } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(1)
      expect(data.items[0].traceId).toBe(oldTraceId)
    })

    it('falls back to all-time on first page when default window returns no spans (project-level)', async () => {
      const oldTraceId = 'old-trace-project'
      await createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        projectId: project.id,
        type: SpanType.Prompt,
        traceId: oldTraceId,
        startedAt: subWeeks(new Date(), 9),
      })

      const request = buildRequest({
        projectId: project.id.toString(),
        types: SpanType.Prompt,
        limit: '50',
      })

      const response = await GET(request, { workspace } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(1)
      expect(data.items[0].traceId).toBe(oldTraceId)
    })
  })
})

