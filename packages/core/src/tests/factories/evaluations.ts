import { faker } from '@faker-js/faker'

import {
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultConfiguration,
  User,
  Workspace,
} from '../../browser'
import { createEvaluation as createEvaluationService } from '../../services/evaluations'

export type IEvaluationData = {
  workspace: Workspace
  user: User
  name?: string
  description?: string
  prompt?: string
  configuration?: EvaluationResultConfiguration
}

export async function createLlmAsJudgeEvaluation({
  workspace,
  user,
  name,
  description,
  prompt,
  configuration = {
    type: EvaluationResultableType.Text,
  },
}: IEvaluationData) {
  const evaluationResult = await createEvaluationService({
    workspace,
    user,
    metadata: { prompt: prompt ?? faker.lorem.sentence() },
    type: EvaluationMetadataType.LlmAsJudge,
    name: name ?? faker.company.catchPhrase(),
    description: description ?? faker.lorem.sentence(),
    configuration,
  })

  return evaluationResult.unwrap()
}
