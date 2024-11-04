import { readMetadata } from '@latitude-data/compiler'
import { beforeEach, describe, expect, it } from 'vitest'

import { getEvaluationPrompt } from '.'
import { ProviderApiKey, User } from '../../../browser'
import {
  EvaluationMetadataType,
  EvaluationResultableType,
  Providers,
  SERIALIZED_DOCUMENT_LOG_FIELDS,
} from '../../../constants'
import * as factories from '../../../tests/factories'
import { createEvaluation } from '../create'

describe('getEvaluationPrompt', () => {
  let workspace: any
  let user: User
  let provider: ProviderApiKey

  beforeEach(async () => {
    const {
      workspace: _workspace,
      user: _user,
      providers,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
    })
    workspace = _workspace
    user = _user
    provider = providers[0]!
  })

  it('returns the plain prompt with advanced evaluations', async () => {
    const prompt = factories.helpers.createPrompt({ provider })

    const evaluation = await createEvaluation({
      workspace,
      user,
      name: 'Test evaluation',
      description: 'Test description',
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      metadata: {
        prompt,
        templateId: null,
      },
      resultType: EvaluationResultableType.Number,
      resultConfiguration: {
        minValue: 0,
        minValueDescription: null,
        maxValue: 10,
        maxValueDescription: null,
      },
    }).then((r) => r.unwrap())

    const obtainedPrompt = await getEvaluationPrompt({
      workspace,
      evaluation,
    }).then((r) => r.unwrap())

    expect(obtainedPrompt).toBe(prompt)
  })

  it('Creates a compilable prompt for a simple evaluation', async () => {
    const model = 'custom-model'

    const evaluation = await createEvaluation({
      workspace,
      user,
      name: 'Test evaluation',
      description: 'Test description',
      metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
      metadata: {
        providerApiKeyId: provider.id,
        model,
        objective: `This is the evaluation's objective`,
        additionalInstructions: `These are the evaluation's additional instructions`,
      },
      resultType: EvaluationResultableType.Number,
      resultConfiguration: {
        minValue: 0,
        minValueDescription: 'The minimum value',
        maxValue: 10,
        maxValueDescription: 'The maximum value',
      },
    }).then((r) => r.unwrap())

    const evaluationPrompt = await getEvaluationPrompt({
      workspace,
      evaluation,
    }).then((r) => r.unwrap())

    const metadata = await readMetadata({
      prompt: evaluationPrompt,
      withParameters: SERIALIZED_DOCUMENT_LOG_FIELDS,
    })
    expect(metadata).toBeDefined()
    expect(metadata.errors.length).toBe(0)
    expect(metadata.config.model).toBe(model)
  })
})
