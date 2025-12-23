import { AppRouteHandler } from '$/openApi/types'
import { enqueueSpans } from '@latitude-data/core/services/tracing/spans/ingestion/enqueue'
import { IngestRoute } from './ingest.route'

export const ingestHandler: AppRouteHandler<IngestRoute> = async (ctx) => {
  const workspace = ctx.get('workspace')
  const apiKey = ctx.get('apiKey')
  const request = ctx.req.valid('json')

  await enqueueSpans({
    spans: request.resourceSpans,
    apiKey: apiKey,
    workspace: workspace,
  }).then((r) => r.unwrap())

  return ctx.body(null, 200)
}
