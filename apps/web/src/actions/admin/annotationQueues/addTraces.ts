'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { addTracesToQueue } from '@latitude-data/core/services/annotationQueues/clickhouse/addTraces'
import { unsafelyFindAnnotationQueueById } from '@latitude-data/core/queries/annotationQueues/unsafelyFindById'

export const addTracesToQueueAction = withAdmin
  .inputSchema(
    z.object({
      queueId: z.number(),
      traceIds: z
        .string()
        .min(1, { error: 'At least one trace ID is required' })
        .transform((val) =>
          val
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
        ),
    }),
  )
  .action(async ({ parsedInput }) => {
    const queue = await unsafelyFindAnnotationQueueById({
      id: parsedInput.queueId,
    })

    const result = await addTracesToQueue({
      queue,
      traceIds: parsedInput.traceIds,
    })

    return result.unwrap()
  })
