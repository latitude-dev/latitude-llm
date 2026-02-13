import { randomUUID } from 'crypto'
import {
  createCommit,
  createProject,
  createEvaluationResultV2,
  createEvaluationV2,
  createSpan,
  helpers,
} from '@latitude-data/core/factories'
import { Providers, SpanType } from '@latitude-data/constants'
import { forkCommit } from '@latitude-data/core/services/commits/fork'
import { database } from '@latitude-data/core/client'
import { documentVersions } from '@latitude-data/core/schema/models/documentVersions'
import { and, eq } from 'drizzle-orm'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as GET_RESULTS } from './route'
import { GET as GET_COUNT } from './count/route'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

function createRequest(url = 'http://localhost:3000/api/test') {
  return new NextRequest(new URL(url))
}

async function findDocumentInCommit(documentUuid: string, commitId: number) {
  const [doc] = await database
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.documentUuid, documentUuid),
        eq(documentVersions.commitId, commitId),
      ),
    )
    .limit(1)
  return doc as DocumentVersion
}

describe('GET handler for evaluation results', () => {
  let mockWorkspace: Workspace
  let mockUser: User
  let mockProject: Project
  let baseCommit: Commit
  let baseDocument: DocumentVersion

  beforeEach(async () => {
    const { user, workspace, documents, project, commit } =
      await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          foo: {
            content: helpers.createPrompt({
              provider: 'openai',
              content: 'foo',
            }),
          },
        },
      })

    mockUser = user
    mockWorkspace = workspace
    mockProject = project
    baseCommit = commit
    baseDocument = documents[0]!

    mocks.getSession.mockResolvedValue({
      user: mockUser,
      session: {
        userId: mockUser.id,
        currentWorkspaceId: mockWorkspace.id,
      },
    })
  })

  it('returns 401 if user is not authenticated', async () => {
    mocks.getSession.mockResolvedValue({
      user: null,
      session: null,
      workspace: mockWorkspace,
    } as any)

    const response = await GET_RESULTS(createRequest(), {
      params: {
        projectId: mockProject.id,
        commitUuid: baseCommit.uuid,
        documentUuid: baseDocument.documentUuid,
        evaluationUuid: randomUUID(),
      },
      workspace: mockWorkspace,
    } as any)

    expect(response.status).toBe(401)
  })

  describe('draft commits', () => {
    it('returns only results from the requested draft', async () => {
      const draftA = await forkCommit({
        commit: baseCommit,
        workspace: mockWorkspace,
        project: mockProject,
        user: mockUser,
        data: { title: 'Draft A' },
      }).then((r) => r.unwrap())

      const draftB = await forkCommit({
        commit: baseCommit,
        workspace: mockWorkspace,
        project: mockProject,
        user: mockUser,
        data: { title: 'Draft B' },
      }).then((r) => r.unwrap())

      const docInDraftA = await findDocumentInCommit(
        baseDocument.documentUuid,
        draftA.id,
      )
      const _docInDraftB = await findDocumentInCommit(
        baseDocument.documentUuid,
        draftB.id,
      )

      const evaluation = await createEvaluationV2({
        workspace: mockWorkspace,
        commit: draftA,
        document: docInDraftA,
      })

      const spanA = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: draftA.uuid,
        projectId: mockProject.id,
      })

      const spanB = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: draftB.uuid,
        projectId: mockProject.id,
      })

      const _resultA = await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: draftA,
        span: spanA,
      })

      const resultB = await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: draftB,
        span: spanB,
      })

      const response = await GET_RESULTS(createRequest(), {
        params: {
          projectId: mockProject.id,
          commitUuid: draftB.uuid,
          documentUuid: baseDocument.documentUuid,
          evaluationUuid: evaluation.uuid,
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const results = await response.json()
      expect(results.map((r: any) => r.uuid)).toEqual([resultB.uuid])
    })

    it('does not include results from merged commits when viewing a draft', async () => {
      const evaluation = await createEvaluationV2({
        workspace: mockWorkspace,
        commit: baseCommit,
        document: baseDocument,
      })

      const spanOnMerged = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: baseCommit.uuid,
        projectId: mockProject.id,
      })

      await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: baseCommit,
        span: spanOnMerged,
      })

      const draft = await forkCommit({
        commit: baseCommit,
        workspace: mockWorkspace,
        project: mockProject,
        user: mockUser,
        data: { title: 'Draft' },
      }).then((r) => r.unwrap())

      const spanOnDraft = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: draft.uuid,
        projectId: mockProject.id,
      })

      const draftResult = await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: draft,
        span: spanOnDraft,
      })

      const response = await GET_RESULTS(createRequest(), {
        params: {
          projectId: mockProject.id,
          commitUuid: draft.uuid,
          documentUuid: baseDocument.documentUuid,
          evaluationUuid: evaluation.uuid,
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const results = await response.json()
      expect(results).toHaveLength(1)
      expect(results[0].uuid).toBe(draftResult.uuid)
    })
  })

  describe('merged commits', () => {
    it('includes results from the current and all previously merged commits', async () => {
      const evaluation = await createEvaluationV2({
        workspace: mockWorkspace,
        commit: baseCommit,
        document: baseDocument,
      })

      const spanOnV1 = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: baseCommit.uuid,
        projectId: mockProject.id,
      })

      const resultOnV1 = await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: baseCommit,
        span: spanOnV1,
      })

      const mergedAt = new Date(baseCommit.mergedAt!.getTime() + 1000)
      const commitV2 = await createCommit({
        projectId: mockProject.id,
        user: mockUser,
        mergedAt,
        title: 'Version 2',
      })

      const spanOnV2 = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: commitV2.uuid,
        projectId: mockProject.id,
      })

      const resultOnV2 = await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: commitV2,
        span: spanOnV2,
      })

      const response = await GET_RESULTS(createRequest(), {
        params: {
          projectId: mockProject.id,
          commitUuid: commitV2.uuid,
          documentUuid: baseDocument.documentUuid,
          evaluationUuid: evaluation.uuid,
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const results = await response.json()
      const uuids = results.map((r: any) => r.uuid)
      expect(uuids).toContain(resultOnV1.uuid)
      expect(uuids).toContain(resultOnV2.uuid)
      expect(results).toHaveLength(2)
    })

    it('does not include results from commits merged after the current one', async () => {
      const evaluation = await createEvaluationV2({
        workspace: mockWorkspace,
        commit: baseCommit,
        document: baseDocument,
      })

      const spanOnV1 = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: baseCommit.uuid,
        projectId: mockProject.id,
      })

      const resultOnV1 = await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: baseCommit,
        span: spanOnV1,
      })

      const mergedAt = new Date(baseCommit.mergedAt!.getTime() + 1000)
      const futureCommit = await createCommit({
        projectId: mockProject.id,
        user: mockUser,
        mergedAt,
        title: 'Future version',
      })

      const spanOnFuture = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: futureCommit.uuid,
        projectId: mockProject.id,
      })

      await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: futureCommit,
        span: spanOnFuture,
      })

      const response = await GET_RESULTS(createRequest(), {
        params: {
          projectId: mockProject.id,
          commitUuid: baseCommit.uuid,
          documentUuid: baseDocument.documentUuid,
          evaluationUuid: evaluation.uuid,
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const results = await response.json()
      expect(results).toHaveLength(1)
      expect(results[0].uuid).toBe(resultOnV1.uuid)
    })
  })

  describe('explicit commit filters', () => {
    it('uses provided commitIds filter instead of resolving from URL', async () => {
      const evaluation = await createEvaluationV2({
        workspace: mockWorkspace,
        commit: baseCommit,
        document: baseDocument,
      })

      const spanOnV1 = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: baseCommit.uuid,
        projectId: mockProject.id,
      })

      await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: baseCommit,
        span: spanOnV1,
      })

      const mergedAt = new Date(baseCommit.mergedAt!.getTime() + 1000)
      const commitV2 = await createCommit({
        projectId: mockProject.id,
        user: mockUser,
        mergedAt,
        title: 'Version 2',
      })

      const spanOnV2 = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: commitV2.uuid,
        projectId: mockProject.id,
      })

      const resultOnV2 = await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: commitV2,
        span: spanOnV2,
      })

      const url = `http://localhost:3000/api/test?commitIds=${commitV2.id}`
      const response = await GET_RESULTS(createRequest(url), {
        params: {
          projectId: mockProject.id,
          commitUuid: commitV2.uuid,
          documentUuid: baseDocument.documentUuid,
          evaluationUuid: evaluation.uuid,
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const results = await response.json()
      expect(results).toHaveLength(1)
      expect(results[0].uuid).toBe(resultOnV2.uuid)
    })
  })

  describe('count endpoint', () => {
    it('returns correct count for merged commits including history', async () => {
      const evaluation = await createEvaluationV2({
        workspace: mockWorkspace,
        commit: baseCommit,
        document: baseDocument,
      })

      const spanOnV1 = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: baseCommit.uuid,
        projectId: mockProject.id,
      })

      await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: baseCommit,
        span: spanOnV1,
      })

      const mergedAt = new Date(baseCommit.mergedAt!.getTime() + 1000)
      const commitV2 = await createCommit({
        projectId: mockProject.id,
        user: mockUser,
        mergedAt,
        title: 'Version 2',
      })

      const spanOnV2 = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: commitV2.uuid,
        projectId: mockProject.id,
      })

      await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: commitV2,
        span: spanOnV2,
      })

      const countV2 = await GET_COUNT(createRequest(), {
        params: {
          projectId: mockProject.id,
          commitUuid: commitV2.uuid,
          documentUuid: baseDocument.documentUuid,
          evaluationUuid: evaluation.uuid,
        },
        workspace: mockWorkspace,
      } as any)

      expect(countV2.status).toBe(200)
      expect(await countV2.json()).toBe(2)

      const countV1 = await GET_COUNT(createRequest(), {
        params: {
          projectId: mockProject.id,
          commitUuid: baseCommit.uuid,
          documentUuid: baseDocument.documentUuid,
          evaluationUuid: evaluation.uuid,
        },
        workspace: mockWorkspace,
      } as any)

      expect(countV1.status).toBe(200)
      expect(await countV1.json()).toBe(1)
    })

    it('returns count scoped to draft only', async () => {
      const evaluation = await createEvaluationV2({
        workspace: mockWorkspace,
        commit: baseCommit,
        document: baseDocument,
      })

      const spanOnMerged = await createSpan({
        workspaceId: mockWorkspace.id,
        type: SpanType.Prompt,
        documentUuid: baseDocument.documentUuid,
        commitUuid: baseCommit.uuid,
        projectId: mockProject.id,
      })

      await createEvaluationResultV2({
        workspace: mockWorkspace,
        evaluation,
        commit: baseCommit,
        span: spanOnMerged,
      })

      const draft = await forkCommit({
        commit: baseCommit,
        workspace: mockWorkspace,
        project: mockProject,
        user: mockUser,
        data: { title: 'Draft' },
      }).then((r) => r.unwrap())

      const countDraft = await GET_COUNT(createRequest(), {
        params: {
          projectId: mockProject.id,
          commitUuid: draft.uuid,
          documentUuid: baseDocument.documentUuid,
          evaluationUuid: evaluation.uuid,
        },
        workspace: mockWorkspace,
      } as any)

      expect(countDraft.status).toBe(200)
      expect(await countDraft.json()).toBe(0)
    })
  })
})
