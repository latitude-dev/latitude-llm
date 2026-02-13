'use server'

import { z } from 'zod'
import { withAdmin } from '$/actions/procedures'
import { triggerMaintenanceJob } from '@latitude-data/core/services/maintenance/trigger'

export const triggerMaintenanceJobAction = withAdmin
  .inputSchema(
    z.object({
      jobName: z.string(),
      params: z.record(z.string(), z.unknown()).optional().default({}),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await triggerMaintenanceJob({
      jobName: parsedInput.jobName,
      params: parsedInput.params,
    })
    return result.unwrap()
  })
