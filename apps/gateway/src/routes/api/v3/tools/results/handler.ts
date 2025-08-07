import type { AppRouteHandler } from '$/openApi/types'
import type { ClientToolResultRoute } from './route'
import { publisher } from '@latitude-data/core/events/publisher'

// @ts-expect-error: streamSSE has type issues with zod-openapi
export const clientToolResultHandler: AppRouteHandler<ClientToolResultRoute> = async (c) => {
  const { toolCallId, result, isError } = await c.req.json()

  publisher.publish('clientToolResultReceived', {
    toolCallId,
    result,
    isError,
  })

  return c.json({ success: true }, 200)
}
