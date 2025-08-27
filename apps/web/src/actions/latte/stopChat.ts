'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { cancelJob } from '@latitude-data/core/services/bullmq/cancelJob'
import { documentsQueue } from '@latitude-data/core/queues'

export const stopChatLatteAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      jobId: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const { jobId } = input
    if (!jobId) return
    const job = await documentsQueue.getJob(jobId)
    if (!job) return
    await cancelJob(job)
  })
