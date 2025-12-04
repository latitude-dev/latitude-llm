'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { startDeploymentTest } from '@latitude-data/core/services/deploymentTests/start'
import { DeploymentTestsRepository } from '@latitude-data/core/repositories/deploymentTestsRepository'

export const resumeDeploymentTestAction = authProcedure
  .inputSchema(
    z.object({
      testUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { testUuid } = parsedInput

    // Fetch the test by UUID
    const repo = new DeploymentTestsRepository(ctx.workspace.id)
    const testResult = await repo.findByUuid(testUuid)
    const test = testResult.unwrap()

    const result = await startDeploymentTest({
      test,
    })

    return result.unwrap()
  })
