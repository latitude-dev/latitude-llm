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

    // Create date range from 7 days ago (start of day) to now (end of day)
    const now = new Date()
    const to = new Date(now)
    to.setHours(23, 59, 59, 999) // End of today

    const from = new Date(now)
    from.setDate(from.getDate() - 7)
    from.setHours(0, 0, 0, 0) // Start of 7 days ago

    const { notificationsQueue } = await queues()
    await notificationsQueue.add(
      'sendWeeklyEmailJob',
      {
        workspaceId,
        emails: emailList,
        dateRange: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
      },
      {
        jobId: `weekly-email-manual-${workspaceId}-${Date.now()}`,
      },
    )

    return { success: true }
  })
