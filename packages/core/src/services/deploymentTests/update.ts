import { eq } from 'drizzle-orm'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import { Result, type TypedResult } from '../../lib/Result'
import { BadRequestError } from '@latitude-data/constants/errors'

export type UpdateDeploymentTestInput = {
  test: DeploymentTest
  trafficPercentage: number
}

/**
 * Updates the traffic percentage for a deployment test
 */
export async function updateDeploymentTest(
  input: UpdateDeploymentTestInput,
  db = database,
): Promise<TypedResult<DeploymentTest>> {
  if (input.trafficPercentage < 0 || input.trafficPercentage > 100) {
    return Result.error(
      new BadRequestError(
        'Traffic percentage must be between 0 and 100',
      ),
    )
  }

  const result = await db
    .update(deploymentTests)
    .set({
      trafficPercentage: input.trafficPercentage,
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
