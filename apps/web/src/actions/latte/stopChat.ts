'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { cancelJob } from '@latitude-data/core/services/bullmq/cancelJob'
import { queues } from '@latitude-data/core/queues'

export const stopChatLatteAction = authProcedure
  .inputSchema(
    z.object({
      jobId: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { documentsQueue } = await queues()
    const { jobId } = parsedInput
    if (!jobId) return
    const job = await documentsQueue.getJob(jobId)
    if (!job) return
    await cancelJob(job)
  })
