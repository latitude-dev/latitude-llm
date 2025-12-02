import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import {
  DeploymentTest,
  DeploymentTestType,
} from '../../schema/models/types/DeploymentTest'
import { Result, type TypedResult } from '../../lib/Result'
import { BadRequestError } from '@latitude-data/constants/errors'

export type CreateDeploymentTestInput = {
  workspaceId: number
  projectId: number
  documentUuid: string
  baselineCommitId: number
  challengerCommitId: number
  testType: DeploymentTestType
  trafficPercentage?: number
  evaluationUuids?: string[]
  useCompositeEvaluation?: boolean
  name?: string
  description?: string
  createdByUserId?: string
}

/**
 * Creates a new deployment test for shadow or A/B testing
 */
export async function createDeploymentTest(
  input: CreateDeploymentTestInput,
  db = database,
): Promise<TypedResult<DeploymentTest>> {
  // Validate traffic percentage for A/B tests
  if (input.testType === 'ab') {
    const traffic = input.trafficPercentage ?? 50
    if (traffic < 0 || traffic > 100) {
      return Result.error(
        new BadRequestError('Traffic percentage must be between 0 and 100'),
      )
    }
  }

  // Validate that baseline and challenger are different commits
  if (input.baselineCommitId === input.challengerCommitId) {
    return Result.error(
      new BadRequestError('Baseline and challenger commits must be different'),
    )
  }

  const result = await db
    .insert(deploymentTests)
    .values({
      ...input,
      evaluationUuids: input.evaluationUuids
        ? JSON.stringify(input.evaluationUuids)
        : '{}',
      trafficPercentage: input.trafficPercentage ?? 50,
      status: 'pending',
    })
    .returning()

  return Result.ok(result[0]!)
}
