import { AppRouteHandler } from '$/openApi/types'
import { GetRoute } from './get.route'
import { findLastMainSpanByDocumentLogUuid } from '@latitude-data/core/queries/spans/findMainSpanByDocumentLogUuid'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { assembleTraceWithMessages } from '@latitude-data/core/services/tracing/traces/assemble'
import { adaptCompletionSpanMessagesToLegacy } from '@latitude-data/core/services/tracing/spans/fetching/findCompletionSpanFromTrace'

// @ts-expect-error: Hono/Zod OpenAPI type inference limitation
export const getHandler: AppRouteHandler<GetRoute> = async (context) => {
  const { conversationUuid } = context.req.valid('param')
  const workspace = context.get('workspace')

  const mainSpan = await findLastMainSpanByDocumentLogUuid({
    workspaceId: workspace.id,
    documentLogUuid: conversationUuid,
  })

  if (!mainSpan) {
    throw new NotFoundError('Conversation not found')
  }

  const assembledResult = await assembleTraceWithMessages({
    traceId: mainSpan.traceId,
    workspace,
    spanId: mainSpan.id,
  })

  const messages = assembledResult.ok
    ? adaptCompletionSpanMessagesToLegacy(assembledResult.value?.completionSpan)
    : []

  return context.json(
    {
      uuid: conversationUuid,
      conversation: messages,
      source: {
        documentUuid: mainSpan.documentUuid,
        commitUuid: mainSpan.commitUuid,
      },
    },
    200,
  )
}
