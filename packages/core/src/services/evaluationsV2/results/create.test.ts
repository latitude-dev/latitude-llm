import { desc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  Commit,
  DocumentVersion,
  EvaluationV2,
  ProviderLogDto,
  Workspace,
} from '../../../schema/types'
import { EvaluationResultValue } from '../../../constants'
import { Providers } from '@latitude-data/constants'
import { EvaluationType, RuleEvaluationMetric } from '../../../constants'
import { database } from '../../../client'
import { publisher } from '../../../events/publisher'
import { UnprocessableEntityError } from '../../../lib/errors'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import * as factories from '../../../tests/factories'
import serializeProviderLog from '../../providerLogs/serialize'
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
  let providerLog: ProviderLogDto
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

    const { providerLogs: providerLogs } = await factories.createDocumentLog({
      document: document,
      commit: commit,
    })
    providerLog = serializeProviderLog(providerLogs.at(-1)!)

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
        providerLog: providerLog,
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

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('succeeds when creating a result', async () => {
    mocks.publisher.mockClear()

    const { result } = await createEvaluationResultV2({
      evaluation: evaluation,
      providerLog: providerLog,
      commit: commit,
      value: value,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedLogId: providerLog.id,
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
        providerLog: providerLog,
        workspaceId: workspace.id,
      },
    })
  })
})
