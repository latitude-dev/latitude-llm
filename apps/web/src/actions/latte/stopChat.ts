'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { cancelJob } from '@latitude-data/core/services/bullmq/cancelJob'
import { queues } from '@latitude-data/core/queues'
import { NotFoundError } from '@latitude-data/constants/errors'

export const stopChatLatteAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      jobId: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    const { latteQueue } = await queues()
    const { jobId } = input
    const job = await latteQueue.getJob(jobId)
    if (!job) {
      throw new NotFoundError('No job found to stop Latte chat')
    }
    await cancelJob(job)
  })
