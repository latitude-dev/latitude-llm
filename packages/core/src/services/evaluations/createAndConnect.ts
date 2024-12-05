import { EvaluationDto } from '../../browser'
import { PromisedResult, Result } from '../../lib'
import { connectEvaluations } from './connect'
import { createEvaluation } from './create'

type CreateAndConnectInput = Parameters<typeof createEvaluation>[0] & {
  documentUuid?: string
}

export async function createAndConnect({
  workspace,
  user,
  documentUuid,
  ...createInput
}: CreateAndConnectInput): PromisedResult<EvaluationDto, Error> {
  const result = await createEvaluation({
    workspace,
    user,
    ...createInput,
  })

  if (result.error) {
    return result
  }

  const evaluation = result.unwrap()

  if (documentUuid) {
    const connectResult = await connectEvaluations({
      workspace,
      documentUuid,
      evaluationUuids: [evaluation.uuid],
      user,
    })

    if (connectResult.error) {
      return Result.error(connectResult.error)
    }
  }

  return Result.ok(evaluation)
}
