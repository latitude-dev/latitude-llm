'use server'

import { withProject, withProjectSchema } from '../procedures'
import { createDeploymentTest } from '@latitude-data/core/services/deploymentTests/create'
import { startDeploymentTest } from '@latitude-data/core/services/deploymentTests/start'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

export const createDeploymentTestAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      challengerCommitUuid: z.string(),
      testType: z.enum(['shadow', 'ab']),
      trafficPercentage: z.number().min(0).max(100).optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { challengerCommitUuid, testType, trafficPercentage } = parsedInput

    // Fetch challenger commit
    const commitsRepo = new CommitsRepository(ctx.workspace.id)
    const challengerCommitResult = await commitsRepo.getCommitByUuid({
      uuid: challengerCommitUuid,
      projectId: ctx.project.id,
    })
    const challengerCommit = challengerCommitResult.unwrap()

    // Create the deployment test (baseline is always the head commit)
    const deploymentTestResult = await createDeploymentTest({
      workspaceId: ctx.workspace.id,
      projectId: ctx.project.id,
      challengerCommitId: challengerCommit.id,
      testType,
      trafficPercentage:
        testType === 'ab'
          ? (trafficPercentage ?? 50)
          : (trafficPercentage ?? 100),
      createdByUserId: ctx.user.id,
    })
    const deploymentTest = deploymentTestResult.unwrap()

    // Start the test
    const startResult = await startDeploymentTest({
      test: deploymentTest,
    })
    startResult.unwrap()

    return deploymentTest
  })
