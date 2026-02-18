import { Span } from '@latitude-data/constants'
import { ROUTES } from '$/services/routes'

export const TRACE_SPAN_SELECTION_PARAM_KEYS = {
  documentLogUuid: 'documentLogUuid',
  spanId: 'spanId',
  activeRunUuid: 'activeRunUuid',
  expandedDocumentLogUuid: 'expandedDocumentLogUuid',
} as const

export const TRACE_SPAN_SELECTION_PARAMS = Object.values(
  TRACE_SPAN_SELECTION_PARAM_KEYS,
)

export function buildTraceUrl({
  projectId,
  commitUuid,
  documentUuid,
  span,
  expandedDocumentLogUuid,
}: {
  projectId: number
  commitUuid: string
  documentUuid: string
  span: Pick<Span, 'id' | 'documentLogUuid'>
  expandedDocumentLogUuid?: string
}) {
  const params = new URLSearchParams()
  params.set(TRACE_SPAN_SELECTION_PARAM_KEYS.spanId, span.id)
  if (span.documentLogUuid) {
    params.set(
      TRACE_SPAN_SELECTION_PARAM_KEYS.documentLogUuid,
      span.documentLogUuid,
    )
  }
  const expandedUuid = expandedDocumentLogUuid ?? span.documentLogUuid
  if (expandedUuid) {
    params.set(
      TRACE_SPAN_SELECTION_PARAM_KEYS.expandedDocumentLogUuid,
      expandedUuid,
    )
  }
  return (
    ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).traces.root +
    `?${params.toString()}`
  )
}
