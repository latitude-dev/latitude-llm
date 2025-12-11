import { eq } from 'drizzle-orm'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import {
  DeploymentTest,
  DeploymentTestStatus,
} from '../../schema/models/types/DeploymentTest'
import { Result, type TypedResult } from '../../lib/Result'
import { BadRequestError } from '@latitude-data/constants/errors'
import { checkActiveAbTest } from './checkActiveAbTest'

export type StartDeploymentTestInput = {
  test: DeploymentTest
}

/**
 * Starts a deployment test (changes status from pending/paused to running)
 */
export async function startDeploymentTest(
  input: StartDeploymentTestInput,
  db = database,
): Promise<TypedResult<DeploymentTest>> {
  const test = input.test

  // If it's an A/B test, check for other active A/B tests in the same project
  if (test.testType === 'ab') {
    const abCheckResult = await checkActiveAbTest(
      {
        projectId: test.projectId,
        testId: test.id,
      },
      db,
    )

    if (!abCheckResult.ok) {
      return Result.error(abCheckResult.error!)
    }
  }

  const result = await db
    .update(deploymentTests)
    .set({
      status: 'running' as DeploymentTestStatus,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deploymentTests.id, test.id))
    .returning()

  if (!result[0]) {
    return Result.error(
      new BadRequestError(`Deployment test with id ${test.id} not found`),
    )
  }

  return Result.ok(result[0]!)
}
