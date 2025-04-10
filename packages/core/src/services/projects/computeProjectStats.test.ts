import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentVersion,
  Project,
  ProviderApiKey,
  User,
} from '../../browser'
import { database } from '../../client'
import {
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  Providers,
} from '../../constants'
import { evaluationVersions } from '../../schema'
import * as factories from '../../tests/factories'
import { computeProjectStats } from './computeProjectStats'

describe('computeProjectStats', () => {
  let user: User
  let project: Project
  let workspace: any
  let document: DocumentVersion
  let commit: Commit
  let provider: ProviderApiKey

  beforeEach(async () => {
    const setup = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        'doc1.md': factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    user = setup.user
    provider = setup.providers[0]!
    project = setup.project
    workspace = setup.workspace
    document = setup.documents[0]!
    commit = setup.commit
  })

  it('returns zero stats for empty project', async () => {
    const result = await computeProjectStats({ project })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats).toEqual({
      totalTokens: 0,
      totalRuns: 0,
      totalDocuments: 1,
      runsPerModel: {},
      costPerModel: {},
      rollingDocumentLogs: [],
      totalEvaluations: 0,
      totalEvaluationResults: 0,
      costPerEvaluation: {},
    })
  })

  it('computes correct stats for project with documents and logs', async () => {
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    const providerLog = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
    })

    const result = await computeProjectStats({ project })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats).toEqual({
      totalTokens: providerLog.tokens,
      totalRuns: 1,
      totalDocuments: 1,
      runsPerModel: {
        'gpt-4': 1,
      },
      costPerModel: {
        'gpt-4': 500,
      },
      rollingDocumentLogs: [
        {
          count: 1,
          date: documentLog.createdAt.toISOString().split('T')[0],
        },
      ],
      totalEvaluations: 0,
      totalEvaluationResults: 0,
      costPerEvaluation: {},
    })
    expect(stats.rollingDocumentLogs).toHaveLength(1)
  })

  it('computes correct stats for project with evaluations and results', async () => {
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    const providerLog = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
    })

    const evaluationV1 = await factories.createEvaluation({
      workspace: workspace,
      user: user,
      name: 'Evaluation V1',
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })

    await factories.createConnectedEvaluation({
      workspace: workspace,
      user: user,
      evaluationUuid: evaluationV1.uuid,
      documentUuid: document.documentUuid,
    })

    await factories.createEvaluationResult({
      evaluation: evaluationV1,
      documentLog: documentLog,
      evaluatedProviderLog: providerLog,
      result: '31',
      stepCosts: [
        {
          promptTokens: 100,
          completionTokens: 100,
          costInMillicents: 666,
        },
      ],
    })

    // TODO: Use factory when LLM evaluations V2 are implemented
    const evaluationV2 = (await database
      .insert(evaluationVersions)
      .values({
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        name: 'Evaluation V2',
        description: 'A V2 LLM evaluation',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: {
          reverseScale: false,
          provider: 'openai',
          model: 'gpt-4',
          instructions: 'Evaluate the response',
          passDescription: 'Pass',
          failDescription: 'Fail',
        },
      })
      .returning()
      .then((r) => ({
        ...r[0]!,
        uuid: r[0]!.evaluationUuid,
        versionId: r[0]!.id,
      }))) as EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

    const evaluationLogV2 = await factories.createProviderLog({
      workspace,
      documentLogUuid: 'eb649bc2-237f-4b33-b759-bde4974ac7b2',
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
      duration: 1000,
    })

    await factories.createEvaluationResultV2({
      evaluation: evaluationV2,
      providerLog: providerLog,
      commit: commit,
      workspace: workspace,
      score: 1,
      normalizedScore: 100,
      metadata: {
        configuration: evaluationV2.configuration,
        actualOutput: 'actual output',
        evaluationLogId: evaluationLogV2.id,
        reason: 'reason',
        tokens: 100,
        cost: 500,
        duration: 1000,
      },
      hasPassed: true,
    })

    const result = await computeProjectStats({ project })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats).toEqual({
      totalTokens: providerLog.tokens,
      totalRuns: 1,
      totalDocuments: 1,
      runsPerModel: {
        'gpt-4': 1,
      },
      costPerModel: {
        'gpt-4': 500,
      },
      rollingDocumentLogs: [
        {
          count: 1,
          date: documentLog.createdAt.toISOString().split('T')[0],
        },
      ],
      totalEvaluations: 2,
      totalEvaluationResults: 2,
      costPerEvaluation: {
        'Evaluation V1': 666,
        'Evaluation V2': 500,
      },
    })
    expect(stats.rollingDocumentLogs).toHaveLength(1)
  })
})
