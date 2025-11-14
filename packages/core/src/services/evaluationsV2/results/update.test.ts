import { Providers, SpanType, SpanWithDetails } from '@latitude-data/constants'
import { desc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { database } from '../../../client'
import {
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  RuleEvaluationMetric,
} from '../../../constants'
import { publisher } from '../../../events/publisher'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import { updateEvaluationResultV2 } from './update'

describe('updateEvaluationResultV2', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >
  let result: EvaluationResultV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >
  let span: SpanWithDetails<SpanType.Prompt>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
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
    commit = c
    document = documents[0]!

    evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
    })

    span = (await factories.createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      apiKeyId: apiKeys[0]!.id,
    })) as SpanWithDetails<SpanType.Prompt>

    result = await factories.createEvaluationResultV2({
      evaluation: evaluation,
      span: span,
      commit: commit,
      workspace: workspace,
    })

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  it('succeeds when updating a result', async () => {
    mocks.publisher.mockClear()

    const { result: updatedResult } = await updateEvaluationResultV2({
      result: result,
      commit: commit,
      value: {
        score: 0,
        normalizedScore: 0,
      },
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(updatedResult).toEqual(
      expect.objectContaining({
        ...result,
        score: 0,
        normalizedScore: 0,
        updatedAt: expect.any(Date),
      }),
    )
    expect(
      await database
        .select()
        .from(evaluationResultsV2)
        .where(eq(evaluationResultsV2.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationResultsV2.updatedAt)),
    ).toEqual([
      expect.objectContaining({
        id: result.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        score: updatedResult.score,
        normalizedScore: updatedResult.normalizedScore,
        updatedAt: expect.any(Date),
      }),
    ])
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationResultV2Updated',
      data: {
        result: updatedResult,
        workspaceId: workspace.id,
      },
    })
  })
})
