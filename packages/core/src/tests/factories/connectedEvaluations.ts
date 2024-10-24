import { faker } from '@faker-js/faker'

import {
  ConnectedEvaluation,
  EvaluationMetadataType,
  EvaluationResultableType,
  User,
  Workspace,
} from '../../browser'
import {
  connectEvaluations,
  createEvaluation,
} from '../../services/evaluations'

export async function createConnectedEvaluation({
  workspace,
  evaluationUuid,
  user,
  documentUuid,
}: {
  workspace: Workspace
  user: User
  evaluationUuid?: string
  documentUuid: string
}): Promise<ConnectedEvaluation> {
  if (!evaluationUuid) {
    const evaluation = await createEvaluation({
      user,
      workspace,
      name: faker.company.name(),
      description: faker.lorem.sentence(),
      type: EvaluationMetadataType.LlmAsJudgeLegacy,
      configuration: {
        type: EvaluationResultableType.Boolean,
      },
      metadata: {
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
        prompt: faker.lorem.sentence(),
      },
    }).then((r) => r.unwrap())

    evaluationUuid = evaluation.uuid
  }

  const connectedEvaluations = await connectEvaluations({
    workspace,
    user,
    documentUuid,
    evaluationUuids: [evaluationUuid],
  }).then((r) => r.unwrap())
  const connectedEvaluation = connectedEvaluations[0]

  if (!connectedEvaluation) {
    throw new Error('Failed to create connected evaluation')
  }

  return connectedEvaluation
}
