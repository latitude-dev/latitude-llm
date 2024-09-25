import { faker } from '@faker-js/faker'

import {
  ConnectedEvaluation,
  EvaluationMetadataType,
  EvaluationResultableType,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { connectedEvaluations } from '../../schema'
import { createEvaluation } from '../../services/evaluations'

export async function createConnectedEvaluation({
  workspace,
  evaluationId,
  documentUuid,
  live = false,
}: {
  workspace: Workspace
  evaluationId?: number
  documentUuid: string
  live?: boolean
}): Promise<ConnectedEvaluation> {
  if (!evaluationId) {
    const evaluation = await createEvaluation({
      workspace,
      name: faker.company.name(),
      description: faker.lorem.sentence(),
      type: EvaluationMetadataType.LlmAsJudge,
      configuration: {
        type: EvaluationResultableType.Boolean,
      },
      metadata: {
        type: EvaluationMetadataType.LlmAsJudge,
        prompt: faker.lorem.sentence(),
      },
    }).then((r) => r.unwrap())

    evaluationId = evaluation.id
  }

  const [connectedEvaluation] = await database
    .insert(connectedEvaluations)
    .values({
      evaluationId,
      documentUuid,
      live,
    })
    .returning()

  if (!connectedEvaluation) {
    throw new Error('Failed to create connected evaluation')
  }

  return connectedEvaluation
}
