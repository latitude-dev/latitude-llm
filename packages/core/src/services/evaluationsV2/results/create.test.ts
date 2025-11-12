import { Providers, SpanType, SpanWithDetails } from '@latitude-data/constants'
import { desc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { database } from '../../../client'
import {
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  RuleEvaluationMetric,
} from '../../../constants'
import { publisher } from '../../../events/publisher'
import { UnprocessableEntityError } from '../../../lib/errors'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import { createEvaluationResultV2 } from './create'

describe('createEvaluationResultV2', () => {
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
  let span: SpanWithDetails<SpanType.Prompt>
  let value: EvaluationResultValue<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >

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

    value = {
      score: 1,
      normalizedScore: 100,
      metadata: {
        configuration: evaluation.configuration,
        actualOutput: 'actualOutput',
        expectedOutput: 'expectedOutput',
        datasetLabel: 'datasetLabel',
      },
      hasPassed: true,
      error: null,
    }

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  it('fails when result creation fails', async () => {
    mocks.publisher.mockClear()

    await expect(
      createEvaluationResultV2({
        uuid: 'uuid',
        evaluation: evaluation,
        span,
        commit: commit,
        value: value,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'invalid input syntax for type uuid: "uuid"',
        {
          details: 'invalid input syntax for type uuid: "uuid"',
        },
      ),
    )

    expect(
      await database
        .select()
        .from(evaluationResultsV2)
        .where(eq(evaluationResultsV2.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationResultsV2.createdAt)),
    ).toEqual([])
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('succeeds when creating a result in non-dry mode', async () => {
    mocks.publisher.mockClear()

    const { result } = await createEvaluationResultV2({
      evaluation: evaluation,
      span,
      commit: commit,
      value: value,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
      }),
    )
    expect(
      await database
        .select()
        .from(evaluationResultsV2)
        .where(eq(evaluationResultsV2.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationResultsV2.createdAt)),
    ).toEqual([
      expect.objectContaining({
        id: result.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        createdAt: expect.any(Date),
      }),
    ])
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
  })

  it('succeeds when creating a result in dry mode', async () => {
    mocks.publisher.mockClear()

    const { result } = await createEvaluationResultV2({
      evaluation: evaluation,
      span,
      commit: commit,
      value: value,
      workspace: workspace,
      dry: true,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
      }),
    )
    expect(
      await database
        .select()
        .from(evaluationResultsV2)
        .where(eq(evaluationResultsV2.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationResultsV2.createdAt)),
    ).toEqual([])
    expect(mocks.publisher).not.toHaveBeenCalled()
  })
})
