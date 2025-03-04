import { faker } from '@faker-js/faker'

import {
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultConfiguration,
  User,
  Workspace,
} from '../../browser'
import {
  createAdvancedEvaluation,
  createEvaluation as createEvaluationService,
} from '../../services/evaluations'

export type IEvaluationData = {
  workspace: Workspace
  user: User
  name?: string
  description?: string
  prompt?: string
  configuration?: EvaluationResultConfiguration
  metadataType?: EvaluationMetadataType
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
  const resultConfiguration =
    configuration.type === EvaluationResultableType.Number
      ? {
          minValue: configuration.detail!.range.from,
          maxValue: configuration.detail!.range.to,
        }
      : undefined

  const evaluationResult = await createAdvancedEvaluation({
    workspace,
    user,
    metadata: { prompt: prompt ?? faker.lorem.sentence() },
    name: name ?? faker.company.catchPhrase(),
    description: description ?? faker.lorem.sentence(),
    resultType: configuration.type,
    resultConfiguration: resultConfiguration ?? {},
  })

  return evaluationResult.unwrap()
}

export async function createEvaluation({
  workspace,
  user,
  name = faker.company.catchPhrase(),
  description = faker.lorem.sentence(),
  metadataType = EvaluationMetadataType.LlmAsJudgeAdvanced,
  metadata = {},
  resultType = EvaluationResultableType.Text,
  resultConfiguration = {},
}: {
  workspace: Workspace
  user: User
  name?: string
  description?: string
  metadataType?: EvaluationMetadataType
  metadata?: Record<string, unknown>
  resultType?: EvaluationResultableType
  resultConfiguration?: Record<string, unknown>
}): Promise<EvaluationDto> {
  return createEvaluationService({
    workspace,
    user,
    name,
    description,
    metadataType,
    metadata,
    resultType,
    resultConfiguration,
  }).then((r) => r.unwrap())
}
