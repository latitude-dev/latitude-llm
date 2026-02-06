'use server'

import { z } from 'zod'

import { withAdmin } from '../../procedures'
import { removeWorkspaceJobs } from '@latitude-data/core/services/workers/manage'

export const removeWorkspaceJobsAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      queueName: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await removeWorkspaceJobs({
      workspaceId: parsedInput.workspaceId,
      queueName: parsedInput.queueName,
    })
    return result.unwrap()
  })
