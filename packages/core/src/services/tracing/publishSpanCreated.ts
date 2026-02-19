import { SpanType } from '../../constants'
import { publisher } from '../../events/publisher'

export type PublishSpanCreatedParams = {
  spanId: string
  traceId: string
  apiKeyId: number
  workspaceId: number
  documentUuid: string | undefined
  spanType: SpanType
  parentId?: string | null
  projectId?: number | null
}

export function publishSpanCreated({
  spanId,
  traceId,
  apiKeyId,
  workspaceId,
  documentUuid,
  spanType,
  parentId,
  projectId,
}: PublishSpanCreatedParams) {
  return publisher.publishLater({
    type: 'spanCreated',
    data: {
      spanId,
      traceId,
      apiKeyId,
      workspaceId,
      documentUuid,
      spanType,
      isConversationRoot: spanType === SpanType.Prompt && !parentId,
      projectId,
    },
  })
}
