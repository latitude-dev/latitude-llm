import { Span } from '@latitude-data/constants'
import { ROUTES } from '$/services/routes'

export const TRACE_SPAN_SELECTION_PARAM_KEYS = {
  documentLogUuid: 'documentLogUuid',
  traceId: 'traceId',
  spanId: 'spanId',
} as const

export const TRACE_SPAN_SELECTION_PARAMS = Object.values(
  TRACE_SPAN_SELECTION_PARAM_KEYS,
)

type SpanForUrl = Pick<Span, 'id' | 'documentLogUuid' | 'traceId'>

export function buildTraceUrlWithParams({
  routePath,
  span,
}: {
  routePath: string
  span: SpanForUrl
}): string {
  const params = new URLSearchParams()
  params.set(TRACE_SPAN_SELECTION_PARAM_KEYS.spanId, span.id)
  params.set(TRACE_SPAN_SELECTION_PARAM_KEYS.traceId, span.traceId)
  if (span.documentLogUuid) {
    params.set(
      TRACE_SPAN_SELECTION_PARAM_KEYS.documentLogUuid,
      span.documentLogUuid,
    )
  }
  return `${routePath}?${params.toString()}`
}

export function buildTraceUrl({
  projectId,
  commitUuid,
  documentUuid,
  span,
}: {
  projectId: number
  commitUuid: string
  documentUuid: string
  span: SpanForUrl
}) {
  return buildTraceUrlWithParams({
    routePath: ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).traces.root,
    span,
  })
}
