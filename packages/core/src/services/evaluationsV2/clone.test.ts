import { beforeEach, describe, expect, it } from 'vitest'
import {
  Commit,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  ProviderApiKey,
  Providers,
  Workspace,
} from '../../browser'
import * as factories from '../../tests/factories'
import { cloneEvaluationV2 } from './clone'
import { buildPrompt } from './llm/binary'

describe('clone', () => {
  let workspace: Workspace
  let provider: ProviderApiKey
  let commit: Commit
  let evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

  beforeEach(async () => {
    const {
      workspace: w,
      documents,
      commit: c,
      providers,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'test.md': 'test content',
      },
    })

    workspace = w
    commit = c
    provider = providers[0]!
    const document = documents[0]
    if (!document) {
      throw new Error('Document was not created')
    }

    evaluation = await factories.createEvaluationV2({
      document,
      commit,
      workspace,
      evaluateLiveLogs: false,
      name: 'Automatic LLm Evaluation',
      description: 'Description',
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        provider: 'openai',
        model: 'gpt-4',
        criteria: 'Evaluate the response',
        passDescription: 'Pass',
        failDescription: 'Fail',
      },
    })
  })

  it('clones an evaluation', async () => {
    const result = await cloneEvaluationV2({
      evaluation,
      commit,
      workspace,
    })
    expect(result.value!.evaluation).toEqual({
      id: expect.any(Number),
      versionId: expect.any(Number),
      uuid: expect.any(String),
      evaluationUuid: expect.any(String),
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
      metric: LlmEvaluationMetric.Custom,
      type: EvaluationType.Llm,
      name: `${evaluation.name} (1)`,
      description: 'Description',
      evaluateLiveLogs: true,
      commitId: commit.id,
      deletedAt: null,
      documentUuid: evaluation.documentUuid,
      enableSuggestions: null,
      autoApplySuggestions: null,
      workspaceId: workspace.id,
      configuration: {
        model: 'gpt-4',
        minThreshold: 50,
        reverseScale: false,
        provider: 'openai',
        prompt: expect.stringContaining(
          buildPrompt({
            provider,
            model: 'gpt-4',
            criteria: 'Evaluate the response',
            passDescription: 'Pass',
            failDescription: 'Fail',
          }),
        ),
      },
    })
  })
})
