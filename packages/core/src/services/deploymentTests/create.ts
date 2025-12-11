import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import {
  DeploymentTest,
  DeploymentTestType,
} from '../../schema/models/types/DeploymentTest'
import { Result, type TypedResult } from '../../lib/Result'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { checkActiveAbTest } from './checkActiveAbTest'
import { checkActiveShadowTest } from './checkActiveShadowTest'
import { CommitsRepository } from '../../repositories'
import Transaction from '../../lib/Transaction'
import { publisher } from '../../events/publisher'
import { findUser } from '../users/data-access/find'

export type CreateDeploymentTestInput = {
  workspaceId: number
  projectId: number
  challengerCommitId: number
  testType: DeploymentTestType
  trafficPercentage?: number
  createdByUserId?: string
}

/**
 * Creates a new deployment test for shadow or A/B testing
 * The baseline commit is always the head commit at the time of creation
 */
export async function createDeploymentTest(
  input: CreateDeploymentTestInput,
  transaction = new Transaction(),
): Promise<TypedResult<DeploymentTest>> {
  return await transaction.call(
    async (tx) => {
      await validateBaselineCommit(
        input.workspaceId,
        input.projectId,
        input.challengerCommitId,
        tx,
      ).then((r) => r.unwrap())
      await testTypeValidators[input.testType](input, tx).then((r) =>
        r.unwrap(),
      )

      const result = await tx
        .insert(deploymentTests)
        .values({
          ...input,
          trafficPercentage:
            input.trafficPercentage ?? (input.testType === 'shadow' ? 100 : 50),
          status: 'pending',
        })
        .returning()

      return Result.ok(result[0]!)
    },
    async (deploymentTest) => {
      let userEmail: string | null = null
      if (input.createdByUserId) {
        const user = await findUser(input.createdByUserId)
        userEmail = user?.email ?? null
      }

      await publisher.publishLater({
        type: 'deploymentTestCreated',
        data: {
          deploymentTestId: deploymentTest.id,
          workspaceId: input.workspaceId,
          userEmail,
        },
      })
    },
  )
}

async function validateBaselineCommit(
  workspaceId: number,
  projectId: number,
  challengerCommitId: number,
  db = database,
): Promise<TypedResult<number>> {
  const commitsRepo = new CommitsRepository(workspaceId, db)
  const headCommit = await commitsRepo.getHeadCommit(projectId)

  if (!headCommit) {
    return Result.error(
      new NotFoundError(
        'Head commit not found. Cannot create deployment test without a baseline.',
      ),
    )
  }

  if (headCommit.id === challengerCommitId) {
    return Result.error(
      new BadRequestError(
        'Challenger commit must be different from the head commit (baseline)',
      ),
    )
  }

  return Result.ok(headCommit.id)
}

async function validateAbTest(
  input: CreateDeploymentTestInput,
  db = database,
): Promise<TypedResult<void>> {
  const traffic = input.trafficPercentage ?? 50
  if (traffic < 0 || traffic > 100) {
    return Result.error(
      new BadRequestError('Traffic percentage must be between 0 and 100'),
    )
  }

  const checkResult = await checkActiveAbTest(
    { projectId: input.projectId },
    db,
  )

  if (!checkResult.ok) {
    return Result.error(checkResult.error!)
  }

  return Result.ok(undefined)
}

async function validateShadowTest(
  input: CreateDeploymentTestInput,
  db = database,
): Promise<TypedResult<void>> {
  const traffic = input.trafficPercentage ?? 100
  if (traffic < 0 || traffic > 100) {
    return Result.error(
      new BadRequestError('Traffic percentage must be between 0 and 100'),
    )
  }

  const checkResult = await checkActiveShadowTest(
    { projectId: input.projectId },
    db,
  )

  if (!checkResult.ok) {
    return Result.error(checkResult.error!)
  }

  return Result.ok(undefined)
}

const testTypeValidators: Record<
  DeploymentTestType,
  (
    input: CreateDeploymentTestInput,
    db?: typeof database,
  ) => Promise<TypedResult<void>>
> = {
  ab: validateAbTest,
  shadow: validateShadowTest,
}
