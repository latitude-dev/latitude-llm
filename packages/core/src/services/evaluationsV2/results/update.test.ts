import { desc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import {
  type Commit,
  type DocumentVersion,
  type EvaluationResultV2,
  type EvaluationType,
  type EvaluationV2,
  Providers,
  type RuleEvaluationMetric,
  type Workspace,
} from '../../../browser'
import { database } from '../../../client'
import { publisher } from '../../../events/publisher'
import { evaluationResultsV2 } from '../../../schema'
import * as factories from '../../../tests/factories'
import serializeProviderLog from '../../providerLogs/serialize'
import { updateEvaluationResultV2 } from './update'

describe('updateEvaluationResultV2', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>
  let result: EvaluationResultV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      documents,
      commit: c,
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

    const { providerLogs } = await factories.createDocumentLog({
      document: document,
      commit: commit,
    })
    const providerLog = serializeProviderLog(providerLogs.at(-1)!)

    result = await factories.createEvaluationResultV2({
      evaluation: evaluation,
      providerLog: providerLog,
      commit: commit,
      workspace: workspace,
    })

    mocks = {
      publisher: vi.spyOn(publisher, 'publishLater').mockImplementation(async () => {}),
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
