'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { stopDeploymentTest } from '@latitude-data/core/services/deploymentTests/stop'
import { DeploymentTestsRepository } from '@latitude-data/core/repositories/deploymentTestsRepository'

export const stopDeploymentTestAction = authProcedure
  .inputSchema(
    z.object({
      testUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { testUuid } = parsedInput

    // Fetch the test by UUID to get its ID
    const repo = new DeploymentTestsRepository(ctx.workspace.id)
    const testResult = await repo.findByUuid(testUuid)
    const test = testResult.unwrap()

    const result = await stopDeploymentTest({
      test,
    })

    return result.unwrap()
  })
