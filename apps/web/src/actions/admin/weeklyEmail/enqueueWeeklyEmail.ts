'use server'

import { withAdmin } from '../../procedures'
import { z } from 'zod'
import { queues } from '@latitude-data/core/queues'

export const enqueueWeeklyEmailAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      emails: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { workspaceId, emails } = parsedInput

    // Parse comma-separated emails if provided
    const emailList = emails
      ? emails
          .split(',')
          .map((e) => e.trim())
          .filter((e) => e.length > 0)
      : undefined

    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'sendWeeklyEmailJob',
      {
        workspaceId,
        emails: emailList,
      },
      {
        jobId: `weekly-email-manual-${workspaceId}-${Date.now()}`,
      },
    )

    return { success: true }
  })
