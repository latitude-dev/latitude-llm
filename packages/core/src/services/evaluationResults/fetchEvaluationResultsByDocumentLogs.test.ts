import { beforeEach, describe, expect, it } from 'vitest'

import { fetchEvaluationResultsByDocumentLogs } from '.'
import {
  Commit,
  DocumentLog,
  DocumentVersion,
  EvaluationConfigurationBoolean,
  EvaluationConfigurationNumerical,
  EvaluationConfigurationText,
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeAdvanced,
  EvaluationMetadataManual,
  EvaluationMetadataType,
  EvaluationResultableType,
  ProviderLog,
  User,
  Workspace,
} from '../../browser'
import { Providers } from '../../constants'
import {
  EvaluationResultsRepository,
  EvaluationsRepository,
} from '../../repositories'
import * as factories from '../../tests/factories'
import { connectEvaluations } from '../evaluations/connect'

describe('fetchEvaluationResultsByDocumentLogs', () => {
  let user: User
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let evaluations: EvaluationDto[]
  let documentLogs: (DocumentLog & { providerLog: ProviderLog })[]

  function parseResult(
    result: Awaited<
      ReturnType<typeof factories.createEvaluationResult>
    >['evaluationResult'],
  ) {
    // The type of the factory EvaluationResult makes the result potentially
    // undefined but in this case the fetch filters them out (tested too)
    const parsed = EvaluationResultsRepository.parseResult(
      result as Parameters<typeof EvaluationResultsRepository.parseResult>[0],
    )
    // @ts-expect-error - providerLogId is not in the type
    const { providerLogId: _pl, ...rest } = parsed
    return {
      ...rest,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    }
  }

  beforeEach(async () => {
    const {
      workspace: w,
      user: u,
      documents: ds,
      commit: c,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'test.md': factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4',
        }),
      },
    })

    user = u
    workspace = w
    commit = c
    document = ds[0]!

    const evaluationsRepository = new EvaluationsRepository(workspace.id)
    evaluations = [
      await evaluationsRepository
        .findByUuid(
          await factories
            .createEvaluation({
              workspace: workspace,
              user: user,
              name: 'judge-1',
              metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
              metadata: <EvaluationMetadataLlmAsJudgeAdvanced>{},
              resultType: EvaluationResultableType.Boolean,
              resultConfiguration: <EvaluationConfigurationBoolean>{},
            })
            .then((e) => e.uuid),
        )
        .then((r) => r.unwrap()),
      await evaluationsRepository
        .findByUuid(
          await factories
            .createEvaluation({
              workspace: workspace,
              user: user,
              name: 'manual-1',
              metadataType: EvaluationMetadataType.Manual,
              metadata: <EvaluationMetadataManual>{},
              resultType: EvaluationResultableType.Number,
              resultConfiguration: <EvaluationConfigurationNumerical>{
                minValue: 0,
                maxValue: 5,
              },
            })
            .then((e) => e.uuid),
        )
        .then((r) => r.unwrap()),
      await evaluationsRepository
        .findByUuid(
          await factories
            .createEvaluation({
              workspace: workspace,
              user: user,
              name: 'judge-2',
              metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
              metadata: <EvaluationMetadataLlmAsJudgeAdvanced>{},
              resultType: EvaluationResultableType.Text,
              resultConfiguration: <EvaluationConfigurationText>{},
            })
            .then((e) => e.uuid),
        )
        .then((r) => r.unwrap()),
      await evaluationsRepository
        .findByUuid(
          await factories
            .createEvaluation({
              workspace: workspace,
              user: user,
              name: 'manual-2',
              metadataType: EvaluationMetadataType.Manual,
              metadata: <EvaluationMetadataManual>{},
              resultType: EvaluationResultableType.Boolean,
              resultConfiguration: <EvaluationConfigurationBoolean>{},
            })
            .then((e) => e.uuid),
        )
        .then((r) => r.unwrap()),
    ]

    await connectEvaluations({
      workspace: workspace,
      user: user,
      documentUuid: document.documentUuid,
      evaluationUuids: evaluations.map((e) => e.uuid),
    })

    documentLogs = []
    for (let i = 0; i < 4; i++) {
      const { documentLog, providerLogs } = await factories.createDocumentLog({
        document: document,
        commit: commit,
      })
      documentLogs.push({ ...documentLog, providerLog: providerLogs[0]! })
    }
  })

  it('returns no results when no document logs are provided', async () => {
    const result = await fetchEvaluationResultsByDocumentLogs({
      workspaceId: workspace.id,
      documentLogIds: [],
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toEqual({})
  })

  it('returns results grouped by document log', async () => {
    const { evaluationResult: result1 } =
      await factories.createEvaluationResult({
        evaluation: evaluations[0]!,
        documentLog: documentLogs[1]!,
        evaluatedProviderLog: documentLogs[1]!.providerLog,
        result: 'true',
      })
    const { evaluationResult: result2 } =
      await factories.createEvaluationResult({
        evaluation: evaluations[1]!,
        documentLog: documentLogs[1]!,
        evaluatedProviderLog: documentLogs[1]!.providerLog,
        result: '3',
      })
    const { evaluationResult: result3 } =
      await factories.createEvaluationResult({
        evaluation: evaluations[2]!,
        documentLog: documentLogs[1]!,
        evaluatedProviderLog: documentLogs[1]!.providerLog,
        result: 'Not even close',
      })

    const { evaluationResult: result4 } =
      await factories.createEvaluationResult({
        evaluation: evaluations[3]!,
        documentLog: documentLogs[2]!,
        evaluatedProviderLog: documentLogs[2]!.providerLog,
        result: 'false',
      })

    const { evaluationResult: result5 } =
      await factories.createEvaluationResult({
        evaluation: evaluations[3]!,
        documentLog: documentLogs[3]!,
        evaluatedProviderLog: documentLogs[3]!.providerLog,
        result: 'false',
      })

    await factories.createEvaluationResult({
      evaluation: evaluations[0]!,
      documentLog: documentLogs[3]!,
      evaluatedProviderLog: documentLogs[3]!.providerLog,
      skipEvaluationResultCreation: true,
    })

    const result = await fetchEvaluationResultsByDocumentLogs({
      workspaceId: workspace.id,
      documentLogIds: documentLogs.map((d) => d.id),
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toEqual({
      [documentLogs[0]!.id]: [],
      [documentLogs[1]!.id]: [
        {
          result: parseResult(result3),
          evaluation: evaluations[2]!,
        },
        {
          result: parseResult(result2),
          evaluation: evaluations[1]!,
        },
        {
          result: parseResult(result1),
          evaluation: evaluations[0]!,
        },
      ],
      [documentLogs[2]!.id]: [
        {
          result: parseResult(result4),
          evaluation: evaluations[3]!,
        },
      ],
      [documentLogs[3]!.id]: [
        {
          result: parseResult(result5),
          evaluation: evaluations[3]!,
        },
      ],
    })
  })
})
