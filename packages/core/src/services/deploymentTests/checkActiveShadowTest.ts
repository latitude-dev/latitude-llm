import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import { Result, type TypedResult } from '../../lib/Result'
import { BadRequestError } from '@latitude-data/constants/errors'

export type CheckActiveShadowTestInput = {
  projectId: number
  testId?: number
}

/**
 * Checks if there's already an active shadow test in the project
 * Returns error if an active shadow test exists (excluding the provided testId if specified)
 */
export async function checkActiveShadowTest(
  input: CheckActiveShadowTestInput,
  db = database,
): Promise<TypedResult<void>> {
  const query = and(
    eq(deploymentTests.projectId, input.projectId),
    eq(deploymentTests.testType, 'shadow'),
    isNull(deploymentTests.deletedAt),
    inArray(deploymentTests.status, ['pending', 'running', 'paused']),
  )

  const whereCondition = input.testId
    ? and(query, ne(deploymentTests.id, input.testId))
    : query

  const existingShadowTests = await db
    .select()
    .from(deploymentTests)
    .where(whereCondition)
    .limit(1)

  if (existingShadowTests.length > 0) {
    return Result.error(
      new BadRequestError(
        'Only one active shadow test is allowed per project. Please stop the existing test before creating or starting a new one.',
      ),
    )
  }

  return Result.ok(undefined)
}
