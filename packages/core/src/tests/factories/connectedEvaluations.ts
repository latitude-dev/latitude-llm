import { faker } from '@faker-js/faker'

import {
  ConnectedEvaluation,
  EvaluationResultableType,
  User,
  Workspace,
} from '../../browser'
import { updateConnectedEvaluation } from '../../services/connectedEvaluations'
import {
  connectEvaluations,
  createAdvancedEvaluation,
} from '../../services/evaluations'

export async function createConnectedEvaluation({
  workspace,
  evaluationUuid,
  user,
  documentUuid,
  live = false,
}: {
  workspace: Workspace
  user: User
  evaluationUuid?: string
  documentUuid: string
  live?: boolean
}): Promise<ConnectedEvaluation> {
  if (!evaluationUuid) {
    const evaluation = await createAdvancedEvaluation({
      user,
      workspace,
      name: faker.company.name(),
      description: faker.lorem.sentence(),
      resultType: EvaluationResultableType.Boolean,
      resultConfiguration: {},
      metadata: {
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
    live,
  }).then((r) => r.unwrap())
  const connectedEvaluation = connectedEvaluations[0]

  if (!connectedEvaluation) {
    throw new Error('Failed to create connected evaluation')
  }

  return connectedEvaluation
}

export async function modifyConnectedEvaluation({
  evaluation,
  ...rest
}: {
  evaluation: ConnectedEvaluation
  live: boolean
}) {
  return await updateConnectedEvaluation({
    connectedEvaluation: evaluation,
    data: rest,
  }).then((r) => r.unwrap())
}
