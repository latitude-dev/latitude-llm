import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { MINIMUM_MONTLY_ANNOTATIONS } from '@latitude-data/constants/issues'
import { EvaluationType, HumanEvaluationMetric } from '../../constants'
import { database } from '../../client'
import { workspaces } from '../../schema/models/workspaces'
import {
  createProject,
  createEvaluationV2,
  createSpan,
} from '../../tests/factories'
import { mergeCommit } from '../../services/commits'
import { createDraft } from '../../tests/factories/commits'
import { createNewDocument } from '../../services/documents'
import { EvaluationV2AnnotatedEvent } from '../events'
import { unlockIssuesDashboardOnAnnotation } from './unlockIssuesDashboardOnAnnotation'
import * as toggleIssuesUnlockedModule from '../../services/workspaces/toggleIssuesUnlocked'
import * as getAnnotationsProgressModule from '../../data-access/issues/getAnnotationsProgress'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { Project } from '../../schema/models/types/Project'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { User } from '../../schema/models/types/User'
import type { Commit } from '../../schema/models/types/Commit'
import type { EvaluationV2 } from '../../constants'

vi.mock('../../services/workspaces/toggleIssuesUnlocked', () => ({
  toggleIssuesUnlocked: vi.fn().mockResolvedValue({ ok: true, value: {} }),
}))

vi.mock('../../data-access/issues/getAnnotationsProgress', () => ({
  getAnnotationsProgressCount: vi.fn(),
}))

describe('unlockIssuesDashboardOnAnnotation', () => {
  let workspace: Workspace
  let project: Project
  let document: DocumentVersion
  let user: User
  let commit: Commit
  let evaluation: EvaluationV2

  const mockToggleIssuesUnlocked = vi.mocked(
    toggleIssuesUnlockedModule.toggleIssuesUnlocked,
  )
  const mockGetAnnotationsProgressCount = vi.mocked(
    getAnnotationsProgressModule.getAnnotationsProgressCount,
  )

  beforeAll(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Hello world',
      },
    })
    workspace = setup.workspace
    project = setup.project
    document = setup.documents[0]!
    user = setup.user
    commit = setup.commit

    evaluation = await createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Human,
      metric: HumanEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        criteria: 'Test criteria',
        actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
      },
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: below threshold
    mockGetAnnotationsProgressCount.mockResolvedValue(
      MINIMUM_MONTLY_ANNOTATIONS - 1,
    )
  })

  describe('when workspace already has issues unlocked', () => {
    it('should early return and not call toggleIssuesUnlocked', async () => {
      // Set workspace as already unlocked
      await database
        .update(workspaces)
        .set({ issuesUnlocked: true })
        .where(eq(workspaces.id, workspace.id))

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const event: EvaluationV2AnnotatedEvent = {
        type: 'evaluationV2Annotated',
        data: {
          workspaceId: workspace.id,
          isNew: true,
          evaluation,
          result: {
            id: 1,
            uuid: 'test-uuid',
            evaluationUuid: evaluation.uuid,
            commitId: commit.id,
            evaluatedSpanId: span.id,
            evaluatedTraceId: span.traceId,
            score: 1,
            normalizedScore: 100,
            metadata: {},
            hasPassed: true,
            error: null,
            
            workspaceId: workspace.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          commit,
          spanId: span.id,
          traceId: span.traceId,
          userEmail: user.email,
        },
      }

      await unlockIssuesDashboardOnAnnotation({ data: event })

      expect(mockGetAnnotationsProgressCount).not.toHaveBeenCalled()
      expect(mockToggleIssuesUnlocked).not.toHaveBeenCalled()

      // Reset workspace state
      await database
        .update(workspaces)
        .set({ issuesUnlocked: false })
        .where(eq(workspaces.id, workspace.id))
    })
  })

  describe('when annotations count is below threshold', () => {
    it('should not call toggleIssuesUnlocked', async () => {
      mockGetAnnotationsProgressCount.mockResolvedValue(
        MINIMUM_MONTLY_ANNOTATIONS - 1,
      )

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const event: EvaluationV2AnnotatedEvent = {
        type: 'evaluationV2Annotated',
        data: {
          workspaceId: workspace.id,
          isNew: true,
          evaluation,
          result: {
            id: 1,
            uuid: 'test-uuid',
            evaluationUuid: evaluation.uuid,
            commitId: commit.id,
            evaluatedSpanId: span.id,
            evaluatedTraceId: span.traceId,
            score: 1,
            normalizedScore: 100,
            metadata: {},
            hasPassed: true,
            error: null,
            
            workspaceId: workspace.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          commit,
          spanId: span.id,
          traceId: span.traceId,
          userEmail: user.email,
        },
      }

      await unlockIssuesDashboardOnAnnotation({ data: event })

      expect(mockGetAnnotationsProgressCount).toHaveBeenCalled()
      expect(mockToggleIssuesUnlocked).not.toHaveBeenCalled()
    })
  })

  describe('when annotations count meets threshold', () => {
    it('should call toggleIssuesUnlocked with correct arguments', async () => {
      mockGetAnnotationsProgressCount.mockResolvedValue(
        MINIMUM_MONTLY_ANNOTATIONS,
      )

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const event: EvaluationV2AnnotatedEvent = {
        type: 'evaluationV2Annotated',
        data: {
          workspaceId: workspace.id,
          isNew: true,
          evaluation,
          result: {
            id: 1,
            uuid: 'test-uuid',
            evaluationUuid: evaluation.uuid,
            commitId: commit.id,
            evaluatedSpanId: span.id,
            evaluatedTraceId: span.traceId,
            score: 1,
            normalizedScore: 100,
            metadata: {},
            hasPassed: true,
            error: null,
            
            workspaceId: workspace.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          commit,
          spanId: span.id,
          traceId: span.traceId,
          userEmail: user.email,
        },
      }

      await unlockIssuesDashboardOnAnnotation({ data: event })

      expect(mockToggleIssuesUnlocked).toHaveBeenCalledWith({
        workspace: expect.objectContaining({ id: workspace.id }),
        enabled: true,
        currentUserEmail: user.email,
        source: 'annotation',
        projectId: commit.projectId,
      })
    })

    it('should pass null for userEmail when not provided', async () => {
      mockGetAnnotationsProgressCount.mockResolvedValue(
        MINIMUM_MONTLY_ANNOTATIONS,
      )

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
      })

      const event: EvaluationV2AnnotatedEvent = {
        type: 'evaluationV2Annotated',
        data: {
          workspaceId: workspace.id,
          isNew: true,
          evaluation,
          result: {
            id: 1,
            uuid: 'test-uuid',
            evaluationUuid: evaluation.uuid,
            commitId: commit.id,
            evaluatedSpanId: span.id,
            evaluatedTraceId: span.traceId,
            score: 1,
            normalizedScore: 100,
            metadata: {},
            hasPassed: true,
            error: null,
            
            workspaceId: workspace.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          commit,
          spanId: span.id,
          traceId: span.traceId,
          userEmail: null,
        },
      }

      await unlockIssuesDashboardOnAnnotation({ data: event })

      expect(mockToggleIssuesUnlocked).toHaveBeenCalledWith(
        expect.objectContaining({
          currentUserEmail: null,
        }),
      )
    })
  })

  describe('commit history handling', () => {
    it('should pass correct commitIds from commit history to getAnnotationsProgressCount', async () => {
      // Create a second merged commit to have a commit history
      const { commit: draftCommit } = await createDraft({ project, user })

      // Add a new document to the draft so we can merge it
      await createNewDocument({
        workspace,
        user,
        commit: draftCommit,
        path: 'new-doc-for-test',
      }).then((r) => r.unwrap())

      const secondCommit = await mergeCommit(draftCommit).then((r) =>
        r.unwrap(),
      )

      mockGetAnnotationsProgressCount.mockResolvedValue(
        MINIMUM_MONTLY_ANNOTATIONS,
      )

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: secondCommit.uuid,
        projectId: project.id,
      })

      const event: EvaluationV2AnnotatedEvent = {
        type: 'evaluationV2Annotated',
        data: {
          workspaceId: workspace.id,
          isNew: true,
          evaluation,
          result: {
            id: 1,
            uuid: 'test-uuid',
            evaluationUuid: evaluation.uuid,
            commitId: secondCommit.id,
            evaluatedSpanId: span.id,
            evaluatedTraceId: span.traceId,
            score: 1,
            normalizedScore: 100,
            metadata: {},
            hasPassed: true,
            error: null,
            
            workspaceId: workspace.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          commit: secondCommit,
          spanId: span.id,
          traceId: span.traceId,
          userEmail: user.email,
        },
      }

      await unlockIssuesDashboardOnAnnotation({ data: event })

      // Verify getAnnotationsProgressCount was called with commitIds array
      // that includes both the original commit and the second commit
      expect(mockGetAnnotationsProgressCount).toHaveBeenCalledWith({
        workspace: expect.objectContaining({ id: workspace.id }),
        commitIds: expect.arrayContaining([commit.id, secondCommit.id]),
      })

      // Verify the commitIds array has at least 2 commits (original + second)
      const callArgs = mockGetAnnotationsProgressCount.mock.calls[0]![0]
      expect(callArgs.commitIds.length).toBeGreaterThanOrEqual(2)
    })
  })
})
