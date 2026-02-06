'use server'

import { z } from 'zod'

import { withAdmin } from '../../procedures'
import { drainQueue } from '@latitude-data/core/services/workers/manage'

export const drainQueueAction = withAdmin
  .inputSchema(
    z.object({
      queueName: z.string(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await drainQueue({
      queueName: parsedInput.queueName,
    })
    return result.unwrap()
  })
