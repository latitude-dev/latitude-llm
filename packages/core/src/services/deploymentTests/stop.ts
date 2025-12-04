import { eq } from 'drizzle-orm'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import {
  DeploymentTest,
  DeploymentTestStatus,
} from '../../schema/models/types/DeploymentTest'
import { Result, type TypedResult } from '../../lib/Result'
import { BadRequestError } from '@latitude-data/constants/errors'

export type StopDeploymentTestInput = {
  test: DeploymentTest
}

/**
 * Stops/completes a deployment test
 */
export async function stopDeploymentTest(
  input: StopDeploymentTestInput,
  db = database,
): Promise<TypedResult<DeploymentTest>> {
  const result = await db
    .update(deploymentTests)
    .set({
      status: 'completed' as DeploymentTestStatus,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deploymentTests.id, input.test.id))
    .returning()

  if (!result[0]) {
    return Result.error(
      new BadRequestError(`Deployment test with id ${input.test.id} not found`),
    )
  }

  return Result.ok(result[0]!)
}
