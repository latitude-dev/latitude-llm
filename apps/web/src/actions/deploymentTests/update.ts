'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { updateDeploymentTest } from '@latitude-data/core/services/deploymentTests/update'
import { DeploymentTestsRepository } from '@latitude-data/core/repositories/deploymentTestsRepository'

export const updateDeploymentTestAction = authProcedure
  .inputSchema(
    z.object({
      testUuid: z.string(),
      trafficPercentage: z.number().min(0).max(100),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { testUuid, trafficPercentage } = parsedInput

    // Fetch the test by UUID
    const repo = new DeploymentTestsRepository(ctx.workspace.id)
    const testResult = await repo.findByUuid(testUuid)
    const test = testResult.unwrap()

    const result = await updateDeploymentTest({
      test,
      trafficPercentage,
    })

    return result.unwrap()
  })
