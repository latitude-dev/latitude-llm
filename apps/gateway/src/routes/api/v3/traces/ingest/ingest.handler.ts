import { AppRouteHandler } from '$/openApi/types'
import { TRACING_JOBS_MAX_ATTEMPTS } from '@latitude-data/core/browser'
import { tracingQueue } from '@latitude-data/core/queues'
import { IngestRoute } from './ingest.route'

export const ingestHandler: AppRouteHandler<IngestRoute> = async (ctx) => {
  const workspace = ctx.get('workspace')
  const apiKey = ctx.get('apiKey')
  const request = ctx.req.valid('json')

  await tracingQueue.add(
    'ingestSpansJob',
    {
      spans: request.resourceSpans,
      apiKeyId: apiKey.id,
      workspaceId: workspace.id,
    },
    { attempts: TRACING_JOBS_MAX_ATTEMPTS },
  )

  return ctx.body(null, 200)
}
