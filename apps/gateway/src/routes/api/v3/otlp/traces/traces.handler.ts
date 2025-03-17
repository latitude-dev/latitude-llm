import { chunk } from 'lodash-es'

import { setupQueues } from '@latitude-data/core/jobs'
import { AppRouteHandler } from '$/openApi/types'
import { CreateTracesRoute } from './traces.route'

const BATCH_SIZE = 50 // Adjust based on your needs

// @ts-expect-error: types are not perfect
export const tracesHandler: AppRouteHandler<CreateTracesRoute> = async (c) => {
  const body = c.req.valid('json')
  const workspace = c.get('workspace')

  // Flatten the spans array and include resource attributes
  const allSpans = body.resourceSpans.flatMap((resourceSpan) =>
    resourceSpan.scopeSpans.flatMap((scopeSpan) =>
      scopeSpan.spans.map((span) => ({
        span,
        resourceAttributes: resourceSpan.resource.attributes,
      })),
    ),
  )

  // Process spans in batches
  const batches = chunk(allSpans, BATCH_SIZE)
  const queues = await setupQueues()

  await Promise.all(
    batches.map((batch) =>
      queues.defaultQueue.jobs.enqueueProcessOtlpTracesJob({
        spans: batch,
        workspace,
      }),
    ),
  )

  return c.json({ status: 'ok' })
}
