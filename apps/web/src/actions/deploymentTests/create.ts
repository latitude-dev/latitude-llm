'use server'

import { withProject, withProjectSchema } from '../procedures'
import { createDeploymentTest } from '@latitude-data/core/services/deploymentTests/create'
import { startDeploymentTest } from '@latitude-data/core/services/deploymentTests/start'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

export const createDeploymentTestAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      baselineCommitUuid: z.string(),
      challengerCommitUuid: z.string(),
      testType: z.enum(['shadow', 'ab']),
      name: z.string().min(1),
      description: z.string().optional(),
      trafficPercentage: z.number().min(0).max(100).optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const {
      baselineCommitUuid,
      challengerCommitUuid,
      testType,
      name,
      description,
      trafficPercentage,
    } = parsedInput

    // Fetch baseline and challenger commits
    const commitsRepo = new CommitsRepository(ctx.workspace.id)
    const baselineCommitResult = await commitsRepo.getCommitByUuid({
      uuid: baselineCommitUuid,
      projectId: ctx.project.id,
    })
    const baselineCommit = baselineCommitResult.unwrap()

    const challengerCommitResult = await commitsRepo.getCommitByUuid({
      uuid: challengerCommitUuid,
      projectId: ctx.project.id,
    })
    const challengerCommit = challengerCommitResult.unwrap()

    // Create the deployment test
    const deploymentTestResult = await createDeploymentTest({
      workspaceId: ctx.workspace.id,
      projectId: ctx.project.id,
      baselineCommitId: baselineCommit.id,
      challengerCommitId: challengerCommit.id,
      testType,
      name,
      description,
      trafficPercentage:
        testType === 'ab' ? (trafficPercentage ?? 50) : undefined,
      createdByUserId: ctx.user.id,
    })
    const deploymentTest = deploymentTestResult.unwrap()

    // Start the test
    const startResult = await startDeploymentTest({
      workspaceId: ctx.workspace.id,
      testId: deploymentTest.id,
    })
    startResult.unwrap()

    return deploymentTest
  })
