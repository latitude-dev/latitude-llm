'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { cancelJob } from '@latitude-data/core/services/bullmq/cancelJob'
import { documentsQueue } from '@latitude-data/core/queues'

export const abortChatLatteAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      BullMQjobId: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const { BullMQjobId } = input

    if (!BullMQjobId) {
      console.log('❗ No job ID provided to abort')
      return
    }

    const job = await documentsQueue.getJob(BullMQjobId)
    if (!job) {
      console.log(`❓ Job ${BullMQjobId} not found`)
      return
    }

    const state = await job.getState()

    if (state === 'waiting' || state === 'delayed') {
      console.log(`🗑 Removing job ${BullMQjobId} before it runs`)
      await job.remove()
    } else if (state === 'active') {
      console.log(`🚨 Cancelling active job ${BullMQjobId}`)
      await cancelJob(BullMQjobId)
    }
  })
