import {
  EvaluationType,
  Providers,
  RuleEvaluationMetric,
  SpanType,
} from '@latitude-data/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as factories from '../../tests/factories'
import { handleEvaluationResultV2Updated } from './handleEvaluationResultV2Updated'
import { assignEvaluationResultV2ToIssue } from '../../services/evaluationsV2/results/assign'
import { unassignEvaluationResultV2FromIssue } from '../../services/evaluationsV2/results/unassign'
import { queues } from '../../jobs/queues'

vi.mock('../../services/evaluationsV2/results/assign')
vi.mock('../../services/evaluationsV2/results/unassign')
vi.mock('../../jobs/queues')

describe('handleEvaluationResultV2Updated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(queues).mockResolvedValue({
      issuesQueue: {
        add: vi.fn(),
      },
    } as any)
  })

  describe('when result changes from failing to passing', () => {
    it('unassigns the result from its issue', async () => {
      const { workspace, documents, commit, apiKeys } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            prompt: factories.helpers.createPrompt({
              provider: 'openai',
              model: 'gpt-4o',
            }),
          },
        })

      const document = documents[0]!
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Rule,
        metric: RuleEvaluationMetric.ExactMatch,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        apiKeyId: apiKeys[0]!.id,
        type: SpanType.Prompt,
      })

      // Create an issue
      const { issue } = await factories.createIssue({
        workspace,
        document,
      })

      // Create a failing result assigned to the issue
      const result = await factories.createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        hasPassed: false,
      })

      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: result,
      })

      vi.mocked(unassignEvaluationResultV2FromIssue).mockImplementation(
        async () =>
          ({
            ok: true,
            value: { result, issue },
            error: null,
            unwrap: () => ({ result, issue }),
          }) as any,
      )

      await handleEvaluationResultV2Updated({
        data: {
          type: 'evaluationResultV2Updated',
          data: {
            workspaceId: workspace.id,
            result: { ...result, hasPassed: true },
            previousHasPassed: false,
            evaluation,
          },
        },
      })

      expect(unassignEvaluationResultV2FromIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace,
          evaluation,
          issue: expect.objectContaining({ id: issue.id }),
        }),
      )
    })

    it('does nothing if result was not assigned to any issue', async () => {
      const { workspace, documents, commit, apiKeys } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            prompt: factories.helpers.createPrompt({
              provider: 'openai',
              model: 'gpt-4o',
            }),
          },
        })

      const document = documents[0]!
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        apiKeyId: apiKeys[0]!.id,
        type: SpanType.Prompt,
      })

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        hasPassed: false,
      })

      await handleEvaluationResultV2Updated({
        data: {
          type: 'evaluationResultV2Updated',
          data: {
            workspaceId: workspace.id,
            result: { ...result, hasPassed: true },
            previousHasPassed: false,
            evaluation,
          },
        },
      })

      expect(unassignEvaluationResultV2FromIssue).not.toHaveBeenCalled()
    })
  })

  describe('when result changes from passing to failing', () => {
    it('queues a job to discover an issue when evaluation has no issueId', async () => {
      const { workspace, documents, commit, apiKeys } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            prompt: factories.helpers.createPrompt({
              provider: 'openai',
              model: 'gpt-4o',
            }),
          },
        })

      const document = documents[0]!
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        apiKeyId: apiKeys[0]!.id,
        type: SpanType.Prompt,
      })

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        hasPassed: true,
      })

      const mockAdd = vi.fn()
      vi.mocked(queues).mockResolvedValue({
        issuesQueue: { add: mockAdd },
      } as any)

      await handleEvaluationResultV2Updated({
        data: {
          type: 'evaluationResultV2Updated',
          data: {
            workspaceId: workspace.id,
            result: { ...result, hasPassed: false },
            previousHasPassed: true,
            evaluation,
          },
        },
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'discoverResultIssueJob',
        expect.objectContaining({
          workspaceId: workspace.id,
          resultId: result.id,
        }),
        expect.any(Object),
      )
    })
  })

  describe('when hasPassed status does not change', () => {
    it('does nothing', async () => {
      const { workspace, documents, commit, apiKeys } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            prompt: factories.helpers.createPrompt({
              provider: 'openai',
              model: 'gpt-4o',
            }),
          },
        })

      const document = documents[0]!
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        apiKeyId: apiKeys[0]!.id,
        type: SpanType.Prompt,
      })

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        hasPassed: true,
      })

      await handleEvaluationResultV2Updated({
        data: {
          type: 'evaluationResultV2Updated',
          data: {
            workspaceId: workspace.id,
            result: { ...result, hasPassed: true },
            previousHasPassed: true,
            evaluation,
          },
        },
      })

      expect(assignEvaluationResultV2ToIssue).not.toHaveBeenCalled()
      expect(unassignEvaluationResultV2FromIssue).not.toHaveBeenCalled()
    })
  })
})
