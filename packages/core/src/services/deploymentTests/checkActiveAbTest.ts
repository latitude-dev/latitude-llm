import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import { Result, type TypedResult } from '../../lib/Result'
import { BadRequestError } from '@latitude-data/constants/errors'

export type CheckActiveAbTestInput = {
  projectId: number
  testId?: number
}

/**
 * Checks if there's already an active A/B test in the project
 * Returns error if an active A/B test exists (excluding the provided testId if specified)
 */
export async function checkActiveAbTest(
  input: CheckActiveAbTestInput,
  db = database,
): Promise<TypedResult<void>> {
  const query = and(
    eq(deploymentTests.projectId, input.projectId),
    eq(deploymentTests.testType, 'ab'),
    isNull(deploymentTests.deletedAt),
    inArray(deploymentTests.status, ['pending', 'running', 'paused']),
  )

  const whereCondition = input.testId
    ? and(query, ne(deploymentTests.id, input.testId))
    : query

  const existingAbTests = await db
    .select()
    .from(deploymentTests)
    .where(whereCondition)
    .limit(1)

  if (existingAbTests.length > 0) {
    return Result.error(
      new BadRequestError(
        'Only one active A/B test is allowed per project. Please stop the existing test before creating or starting a new one.',
      ),
    )
  }

  return Result.ok(undefined)
}
