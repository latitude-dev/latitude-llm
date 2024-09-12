import { faker } from '@faker-js/faker'

import {
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultConfiguration,
  Workspace,
} from '../../browser'
import { createEvaluation as createEvaluationService } from '../../services/evaluations'

export type IEvaluationData = {
  workspace: Workspace
  name?: string
  description?: string
  prompt?: string
  configuration?: EvaluationResultConfiguration
}

export async function createLlmAsJudgeEvaluation({
  workspace,
  name,
  description,
  prompt,
  configuration = {
    type: EvaluationResultableType.Text,
  },
}: IEvaluationData) {
  const evaluationResult = await createEvaluationService({
    workspace,
    metadata: { prompt: prompt ?? faker.lorem.sentence() },
    type: EvaluationMetadataType.LlmAsJudge,
    name: name ?? faker.company.catchPhrase(),
    description: description ?? faker.lorem.sentence(),
    configuration,
  })

  return evaluationResult.unwrap()
}
