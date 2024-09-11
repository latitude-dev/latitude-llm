import { faker } from '@faker-js/faker'

import { EvaluationMetadataType, Workspace } from '../../browser'
import { createEvaluation as createEvaluationService } from '../../services/evaluations'

export type IEvaluationData = {
  workspace: Workspace
  name?: string
  description?: string
  prompt?: string
}

export async function createLlmAsJudgeEvaluation({
  workspace,
  name,
  description,
  prompt,
}: IEvaluationData) {
  const evaluationResult = await createEvaluationService({
    workspace,
    metadata: { prompt },
    type: EvaluationMetadataType.LlmAsJudge,
    name: name ?? faker.company.catchPhrase(),
    description: description ?? faker.lorem.sentence(),
  })

  return evaluationResult.unwrap()
}
