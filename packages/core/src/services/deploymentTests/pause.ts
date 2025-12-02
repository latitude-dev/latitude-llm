import { eq } from 'drizzle-orm'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import {
  DeploymentTest,
  DeploymentTestStatus,
} from '../../schema/models/types/DeploymentTest'
import { Result, type TypedResult } from '../../lib/Result'
import { BadRequestError } from '@latitude-data/constants/errors'

export type PauseDeploymentTestInput = {
  workspaceId: number
  testId: number
}

/**
 * Pauses a deployment test (changes status from running to paused)
 */
export async function pauseDeploymentTest(
  input: PauseDeploymentTestInput,
  db = database,
): Promise<TypedResult<DeploymentTest>> {
  const result = await db
    .update(deploymentTests)
    .set({
      status: 'paused' as DeploymentTestStatus,
      updatedAt: new Date(),
    })
    .where(eq(deploymentTests.id, input.testId))
    .returning()

  if (!result[0]) {
    return Result.error(
      new BadRequestError(`Deployment test with id ${input.testId} not found`),
    )
  }

  return Result.ok(result[0]!)
}
