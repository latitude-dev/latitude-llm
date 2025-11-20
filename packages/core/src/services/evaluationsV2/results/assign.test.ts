import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers, SpanType } from '@latitude-data/constants'
import {
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  RuleEvaluationMetric,
} from '../../../constants'
import type { Commit } from '../../../schema/models/types/Commit'
import type { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import type { Workspace } from '../../../schema/models/types/Workspace'
import type { Project } from '../../../schema/models/types/Project'
import * as factories from '../../../tests/factories'
import { assignEvaluationResultV2ToIssue } from './assign'
import { BadRequestError, UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import * as reassignModule from './reassignFromIssue'
import { IssueHistogram } from '../../../schema/models/types/IssueHistogram'
import { Issue } from '../../../schema/models/types/Issue'

describe('assignEvaluationResultV2ToIssue', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >
  let evaluationResult: EvaluationResultV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >

  const mockQueue = {
    add: vi.fn(async () => Promise.resolve({ id: 'job-123' })),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    mockQueue.add.mockClear()

    const {
      workspace: w,
      project: p,
      documents,
      commit: c,
      apiKeys,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    workspace = w
    project = p
    commit = c
    document = documents[0]!

    evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
    })

    const span = await factories.createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      apiKeyId: apiKeys[0]!.id,
      type: SpanType.Prompt,
    })

    // Create a failed evaluation result (required for issues)
    evaluationResult = await factories.createEvaluationResultV2({
      workspace,
      evaluation,
      commit,
      span,
      score: 0,
      normalizedScore: 0,
      hasPassed: false,
    })
  })

  describe('validation', () => {
    it('fails when no issue is provided and no create params', async () => {
      const result = await assignEvaluationResultV2ToIssue({
        result: evaluationResult,
        evaluation,
        workspace,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error?.message).toBe('No issue was provided')
    })

    it('creates a new issue when create params are provided', async () => {
      // Mock reassignResultFromIssue to avoid the row-level locking timeout
      const mockReassign = vi
        .spyOn(reassignModule, 'reassignResultFromIssue')
        .mockResolvedValue(
          Result.ok({
            result: evaluationResult,
            histogram: {} as IssueHistogram,
            issue: { id: 999 } as Issue,
          }),
        )

      const result = await assignEvaluationResultV2ToIssue({
        result: evaluationResult,
        evaluation,
        workspace,
        create: {
          title: 'New Test Issue',
          description: 'Issue created from test',
          document,
          project,
        },
      })

      expect(result.ok).toBe(true)
      // Verify that reassignResultFromIssue was called with the newly created issue
      expect(mockReassign).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace,
          result: evaluationResult,
          evaluation,
          targetIssue: expect.objectContaining({
            title: 'New Test Issue',
            description: 'Issue created from test',
            projectId: project.id,
            documentUuid: document.documentUuid,
          }),
        }),
        expect.anything(),
      )

      mockReassign.mockRestore()
    })

    it('fails when result has passed', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        traceId: 'test-trace-passed',
        type: SpanType.Prompt,
      })

      const passedResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 1,
        normalizedScore: 100,
        hasPassed: true,
      })

      const issue = (
        await factories.createIssue({
          workspace,
          project,
          document,
        })
      ).issue

      const result = await assignEvaluationResultV2ToIssue({
        result: passedResult,
        evaluation,
        issue,
        workspace,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe('Cannot use a result that has passed')
    })

    it('fails when result has an error', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        traceId: 'test-trace-error',
        type: SpanType.Prompt,
      })

      const errorResult = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        error: { message: 'Some error occurred' },
      })

      const issue = (
        await factories.createIssue({
          workspace,
          project,
          document,
        })
      ).issue

      const result = await assignEvaluationResultV2ToIssue({
        result: errorResult,
        evaluation,
        issue,
        workspace,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(UnprocessableEntityError)
      expect(result.error?.message).toBe('Cannot use a result that has errored')
    })
  })
})
