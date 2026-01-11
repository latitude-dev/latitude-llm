import http from '$/common/http'
import { AppRouteHandler } from '$/openApi/types'
import { Otlp } from '@latitude-data/constants'
import { enqueueSpans } from '@latitude-data/core/services/tracing/spans/ingestion/enqueue'
import { IngestRoute } from './ingest.route'
import { parseProtobufRequest } from './parseProtobuf'

export const ingestHandler: AppRouteHandler<IngestRoute> = async (ctx) => {
  const workspace = ctx.get('workspace')
  const apiKey = ctx.get('apiKey')
  const contentType = ctx.req.header('content-type') ?? ''

  let request: Otlp.ServiceRequest
  if (contentType.includes(http.MediaTypes.PROTOBUF)) {
    const buffer = await ctx.req.arrayBuffer()
    request = parseProtobufRequest(new Uint8Array(buffer))
  } else {
    request = ctx.req.valid('json') as Otlp.ServiceRequest
  }

  await enqueueSpans({
    spans: request.resourceSpans,
    apiKey: apiKey,
    workspace: workspace,
  }).then((r) => r.unwrap())

  return ctx.body(null, 200)
}
